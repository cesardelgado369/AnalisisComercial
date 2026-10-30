using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Chess;
using AnalisisComercial.Infrastructure.Datos;
using AnalisisComercial.Infrastructure.Sincronizacion;
using AnalisisComercial.Pruebas;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Tests;

/// <summary>
/// El sincronizador contra una base temporal del SQL Server local (una por prueba) y un Chess falso.
/// Hoy: 26/10/2026. Primer mes: agosto.
/// </summary>
public sealed class SincronizadorTests : IAsyncLifetime
{
    private static readonly DateOnly Ago = new(2026, 8, 1), Sep = new(2026, 9, 1), Oct = new(2026, 10, 1);
    private readonly string _base = $"AC_Sync_{Guid.NewGuid():N}";
    private string Conexion => ServidorDePruebas.Conexion(_base);
    private readonly ChessFalso _chess = new();

    private sealed class RelojFijo : IReloj
    {
        public DateTimeOffset Ahora => new(2026, 10, 26, 5, 0, 0, TimeSpan.FromHours(-3));
        public DateOnly Hoy => new(2026, 10, 26);
    }

    /// <summary>Chess con datos fijos; las ventas se filtran por el rango pedido, como el de verdad.</summary>
    private sealed class ChessFalso : IChess
    {
        public List<VendedorChess> Vendedores = [new(1, "VENDEDOR UNO"), new(2, "VENDEDOR DOS"), new(6, "DEPOSITO")];
        public List<RutaChess> Rutas = [];
        public List<ClienteChess> Clientes = [];
        public List<VentaLinea> Ventas = [];
        public List<(DateOnly, DateOnly)> PedidosVentas = [];

        public Task<IReadOnlyList<VendedorChess>> VendedoresAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<VendedorChess>>(Vendedores);
        public Task<IReadOnlyList<RutaChess>> RutasAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<RutaChess>>(Rutas);
        public Task<IReadOnlyList<ClienteChess>> ClientesAsync(CancellationToken ct) => Task.FromResult<IReadOnlyList<ClienteChess>>(Clientes);
        public Task<IReadOnlyList<ArticuloChess>> ArticulosAsync(CancellationToken ct)
            => Task.FromResult<IReadOnlyList<ArticuloChess>>([new(101, "TALLARIN", false, null)]);

        public Task<IReadOnlyList<VentaLinea>> VentasAsync(DateOnly desde, DateOnly hasta, CancellationToken ct)
        {
            PedidosVentas.Add((desde, hasta));
            return Task.FromResult<IReadOnlyList<VentaLinea>>(Ventas.Where(v => v.Fecha >= desde && v.Fecha <= hasta)
                .Select(v => new VentaLinea
                {
                    IdEmpresa = v.IdEmpresa, IdDocumento = v.IdDocumento, Letra = v.Letra, Serie = v.Serie, NroDoc = v.NroDoc,
                    IdLinea = v.IdLinea, Fecha = v.Fecha, IdCliente = v.IdCliente, IdArticulo = v.IdArticulo, IdVendedor = v.IdVendedor,
                    TipoDocumento = v.TipoDocumento, Anulado = v.Anulado, CantidadTotal = v.CantidadTotal, Neto = v.Neto,
                }).ToList());
        }
    }

    private static readonly DateOnly SinFin = ParserChess.SinFin;

    public SincronizadorTests()
    {
        // Ruta 40: de DOS hasta el 17/09 y de UNO desde el 18/09. Ruta 300 de DOS. Ruta 1 de la casa. Ruta 250 sin vendedor.
        _chess.Rutas =
        [
            new(40, "BARRIO NORTE", 2, "3", false, new(2026, 5, 27), new(2026, 9, 17), [new(10, "KIOSCO A", 1)]),
            new(40, "BARRIO NORTE", 1, "2", false, new(2026, 9, 18), SinFin, [new(10, "KIOSCO A", 2), new(11, "DESPENSA B", 1)]),
            new(300, "SUPER ZONA ESTE", 2, "2,5", false, new(2026, 7, 2), SinFin, [new(12, "SUPER C", 1)]),
            new(1, "DEPOSITO", 6, "2,3,4,5,6,7", false, new(2026, 5, 27), SinFin, [new(13, "CASA D", 1)]),
            new(250, "SUR TUCUMAN", null, "", false, new(2026, 5, 27), SinFin, []),
        ];
        // 11 estuvo en la 300 hasta el 17/09 y pasó a la 40. El 13 está en una ruta pero no viene en clientes/.
        _chess.Clientes =
        [
            Cliente(10, new FuerzaChess(40, new(2026, 5, 27), SinFin, false)),
            Cliente(11, new FuerzaChess(300, new(2026, 6, 1), new(2026, 9, 17), false), new FuerzaChess(40, new(2026, 9, 18), SinFin, false)),
            Cliente(12, new FuerzaChess(300, new(2026, 7, 2), SinFin, false)),
        ];
        _chess.Ventas =
        [
            Linea(1, new(2026, 8, 10), 10, "FACTURA", 3),
            Linea(2, new(2026, 8, 12), 12, "NOTA DE CREDITO", 2),       // solo un crédito: no es compra
            Linea(3, new(2026, 9, 5), 11, "FACTURA", 1),
            Linea(4, new(2026, 9, 6), 12, "FACTURA", 5, anulado: true), // anulada: no es compra
            Linea(5, new(2026, 9, 29), 12, "FACTURA", 2),               // cae en los últimos días del mes anterior
            Linea(6, new(2026, 10, 20), 10, "FACTURA", 4),
            Linea(7, new(2026, 10, 21), 11, "FACTURA PRESUPUESTO", 1),   // no cuenta como compra
            Linea(9, new(2026, 10, 22), 12, "FACTURA", 4),
            Linea(10, new(2026, 10, 23), 12, "NOTA DE CREDITO", -4),     // devolvió todo: no compró en octubre
        ];
    }

    private static ClienteChess Cliente(int id, params FuerzaChess[] fuerzas)
        => new(id, $"CLIENTE {id}", "SMT", "CALLE", 100, -26.8m, -65.2m, false, null, fuerzas);

    private static VentaLinea Linea(int nro, DateOnly fecha, int cliente, string tipo, decimal cantidad, bool anulado = false) => new()
    {
        IdEmpresa = 1, IdDocumento = "FCVTA", Letra = "A", Serie = 1, NroDoc = nro, IdLinea = 1, Fecha = fecha, IdCliente = cliente,
        IdArticulo = 101, IdVendedor = 1, TipoDocumento = tipo, Anulado = anulado, CantidadTotal = cantidad, Neto = 100 * cantidad,
    };

    private ComercialDbContext Db() => new(new DbContextOptionsBuilder<ComercialDbContext>().UseSqlServer(Conexion).Options);

    private async Task<Sincronizador.Resultado> CorrerAsync(bool recalcular = false)
    {
        await using var db = Db();
        var op = Options.Create(new OpcionesComercial { PrimerMes = Ago });
        return await new Sincronizador(db, _chess, new RelojFijo(), op, NullLogger<Sincronizador>.Instance).CorrerAsync(recalcular, default);
    }

    public async Task InitializeAsync()
    {
        await using var db = Db();
        await db.Database.MigrateAsync();
    }

    public async Task DisposeAsync()
    {
        SqlConnection.ClearAllPools();
        await using var cn = new SqlConnection(ServidorDePruebas.Conexion("master"));
        await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = $"ALTER DATABASE [{_base}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_base}];";
        await cmd.ExecuteNonQueryAsync();
    }

    [Fact]
    public async Task Carga_inicial_maestros_ventas_compras_y_cartera()
    {
        var r = await CorrerAsync();
        Assert.True(r.Ok);
        await using var db = Db();

        // Maestros
        Assert.False((await db.Vendedores.FindAsync(6))!.EsPersona);
        var r40 = await db.Rutas.Include(x => x.Dias).SingleAsync(x => x.IdRuta == 40);
        Assert.Equal((1, "2", true), (r40.IdPersonal!.Value, r40.DiasVisita, r40.Vigente));   // la versión vigente
        Assert.Equal([2], r40.Dias.Select(d => d.DiaSemana));
        Assert.Null((await db.Rutas.FindAsync(250))!.IdPersonal);
        var c11 = await db.Clientes.FindAsync(11);
        Assert.Equal((40, 1), (c11!.IdRuta!.Value, c11.OrdenVisita!.Value));
        var c13 = await db.Clientes.FindAsync(13);   // no vino en clientes/ pero está en una ruta: se da de alta igual
        Assert.Equal(("CASA D", 1, false), (c13!.RazonSocial, c13.IdRuta!.Value, c13.EnChess));

        // Ventas: todas, en un pedido por mes desde el primer mes.
        Assert.Equal(9, await db.VentaLineas.CountAsync());
        Assert.Equal([(Ago, new DateOnly(2026, 8, 31)), (Sep, new DateOnly(2026, 9, 30)), (Oct, new DateOnly(2026, 10, 26))], _chess.PedidosVentas);

        // Compras: la NC sola y la factura anulada no son compra.
        var compras = await db.ComprasMes.ToListAsync();
        bool Compro(DateOnly mes, int cliente) => compras.Any(c => c.Mes == mes && c.IdCliente == cliente && c.Compro);
        Assert.True(Compro(Ago, 10));
        Assert.False(Compro(Ago, 12));
        Assert.Equal(-2, compras.Single(c => c.Mes == Ago && c.IdCliente == 12).Cantidad);
        Assert.True(Compro(Sep, 11));
        Assert.True(Compro(Sep, 12));      // la del 29/09
        Assert.False(Compro(Oct, 11));     // la factura presupuesto no cuenta
        Assert.False(Compro(Oct, 12));     // la nota de crédito anuló la compra
        Assert.Equal("SIN UNIDAD DE NEGOCIO", (await db.Articulos.FindAsync(101))!.UnidadNegocio);

        // Cartera: octubre con las rutas vigentes; agosto y septiembre reconstruidos con la historia.
        var cartera = await db.CarterasMes.ToListAsync();
        string? En(DateOnly mes, int cliente) => cartera.Where(c => c.Mes == mes && c.IdCliente == cliente)
            .Select(c => $"ruta {c.IdRuta}, vendedor {c.IdPersonal}").SingleOrDefault();
        Assert.Equal("ruta 40, vendedor 2", En(Ago, 10));    // la 40 era de DOS al 31/08
        Assert.Equal("ruta 300, vendedor 2", En(Ago, 11));
        Assert.Equal("ruta 40, vendedor 1", En(Sep, 10));    // al 30/09 ya era de UNO
        Assert.Equal("ruta 40, vendedor 1", En(Sep, 11));
        Assert.Equal("ruta 40, vendedor 1", En(Oct, 11));
        Assert.Equal("ruta 1, vendedor 6", En(Oct, 13));
        Assert.Null(En(Sep, 13));             // sin historia: no se inventa

        Assert.All(await db.SyncLogs.ToListAsync(), s => Assert.True(s.Ok, s.Endpoint + ": " + s.Error));
    }

    [Fact]
    public async Task Las_siguientes_corridas_leen_el_mes_en_curso_mas_los_ultimos_dias_y_no_tocan_las_fotos_cerradas()
    {
        await CorrerAsync();
        _chess.PedidosVentas.Clear();
        // En Chess: se borró la factura del 20/10, se corrigió la del 29/09 y la ruta 300 cambió de vendedor.
        _chess.Ventas.RemoveAll(v => v.NroDoc is 5 or 6);
        _chess.Ventas.Add(Linea(5, new(2026, 9, 29), 12, "FACTURA", 7));
        _chess.Ventas.Add(Linea(8, new(2026, 9, 2), 11, "FACTURA", 9));   // tardía de principio de mes: no se relee
        _chess.Rutas[2] = _chess.Rutas[2] with { IdPersonal = 1 };

        Assert.True((await CorrerAsync()).Ok);
        await using var db = Db();
        Assert.Equal([(new DateOnly(2026, 9, 28), new DateOnly(2026, 9, 30)), (Oct, new DateOnly(2026, 10, 26))], _chess.PedidosVentas);
        Assert.False(await db.VentaLineas.AnyAsync(v => v.NroDoc == 6));                         // la que ya no viene se va
        Assert.Equal(7, (await db.VentaLineas.SingleAsync(v => v.NroDoc == 5)).CantidadTotal);    // corregida
        Assert.False(await db.VentaLineas.AnyAsync(v => v.NroDoc == 8));
        Assert.True(await db.VentaLineas.AnyAsync(v => v.NroDoc == 3));                           // lo de antes del 28/09 queda
        Assert.False(await db.ComprasMes.AnyAsync(c => c.Mes == Oct && c.IdCliente == 10 && c.Compro));

        Assert.Equal(1, (await db.CarterasMes.SingleAsync(c => c.Mes == Oct && c.IdCliente == 12)).IdPersonal);  // octubre se reescribe
        Assert.Equal(2, (await db.CarterasMes.SingleAsync(c => c.Mes == Sep && c.IdCliente == 12)).IdPersonal);  // septiembre quedó congelado
    }

    [Fact]
    public async Task Una_lectura_cortada_de_clientes_no_da_de_baja_a_nadie()
    {
        await CorrerAsync();
        _chess.Clientes = [_chess.Clientes[0]];   // trae 1 de 4
        var r = await CorrerAsync();
        Assert.False(r.Ok);
        await using var db = Db();
        Assert.All(await db.Clientes.Where(c => c.IdCliente != 13).ToListAsync(), c => Assert.True(c.EnChess));
        var error = await db.SyncLogs.SingleAsync(s => !s.Ok);
        Assert.Equal("clientes/", error.Endpoint);
        Assert.Contains("lectura cortada", error.Error);
    }

    [Fact]
    public async Task Si_falla_un_mes_de_ventas_queda_lo_anterior_y_se_reintenta_en_la_proxima()
    {
        var chessQueFalla = new ChessQueFalla(_chess, Sep);
        await using (var db = Db())
        {
            var r = await new Sincronizador(db, chessQueFalla, new RelojFijo(), Options.Create(new OpcionesComercial { PrimerMes = Ago }),
                NullLogger<Sincronizador>.Instance).CorrerAsync(false, default);
            Assert.False(r.Ok);
            Assert.False(await db.VentaLineas.AnyAsync(v => v.Fecha.Month == 9));
            Assert.True(await db.VentaLineas.AnyAsync(v => v.Fecha.Month == 10));
        }
        _chess.PedidosVentas.Clear();
        Assert.True((await CorrerAsync()).Ok);
        Assert.Contains((Sep, new DateOnly(2026, 9, 30)), _chess.PedidosVentas);   // el mes vacío se vuelve a pedir entero
        await using var db2 = Db();
        Assert.True(await db2.ComprasMes.AnyAsync(c => c.Mes == Sep && c.IdCliente == 11 && c.Compro));
    }

    private sealed class ChessQueFalla(IChess chess, DateOnly mesQueFalla) : IChess
    {
        public Task<IReadOnlyList<VendedorChess>> VendedoresAsync(CancellationToken ct) => chess.VendedoresAsync(ct);
        public Task<IReadOnlyList<RutaChess>> RutasAsync(CancellationToken ct) => chess.RutasAsync(ct);
        public Task<IReadOnlyList<ClienteChess>> ClientesAsync(CancellationToken ct) => chess.ClientesAsync(ct);
        public Task<IReadOnlyList<ArticuloChess>> ArticulosAsync(CancellationToken ct) => chess.ArticulosAsync(ct);
        public Task<IReadOnlyList<VentaLinea>> VentasAsync(DateOnly desde, DateOnly hasta, CancellationToken ct)
            => Calendario.Mes(desde) == mesQueFalla ? throw new ChessException("Chess no respondió.") : chess.VentasAsync(desde, hasta, ct);
    }
}
