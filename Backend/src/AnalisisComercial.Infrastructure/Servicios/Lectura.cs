using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Servicios;

/// <summary>Qué artículos cuentan: los de una unidad de negocio, los de un foco, o los dos a la vez. null = todos.</summary>
public record FiltroArticulos(string? Unidad, int? Foco, string? NombreFoco = null)
{
    public static FiltroArticulos? De(string? unidad) => string.IsNullOrWhiteSpace(unidad) ? null : new(unidad, null);
}

/// <summary>
/// Qué vendedores se están mirando, ya validados contra el alcance. <see cref="SinVendedor"/>: también las rutas sin
/// vendedor (van con la casa).
/// </summary>
public sealed record Mirada(IReadOnlySet<int> Vendedores, bool SinVendedor, string Titulo, int? Vendedor)
{
    public bool Incluye(int? idPersonal) => idPersonal is { } p ? Vendedores.Contains(p) : SinVendedor;
}

/// <summary>
/// Los bultos de un cliente × artículo × mes: lo entregado y lo devuelto (<see cref="Volumen.Repartir"/>). Netos = los
/// vendidos (facturas menos notas de crédito).
/// </summary>
public sealed record BultosMes(int IdCliente, int IdArticulo, DateOnly Mes, decimal Entregado, decimal Devuelto)
{
    public decimal Netos => Entregado - Devuelto;
}

/// <summary>
/// Lecturas compartidas por los servicios. TODA consulta de clientes o ventas pasa por una <see cref="Mirada"/> armada
/// desde el alcance: ningún servicio usa un vendedor del front sin validarlo acá.
/// </summary>
public class Lectura(ComercialDbContext db, IAlcanceUsuario alcance, IReloj reloj, IOptions<OpcionesComercial> opciones)
{
    public const string TodosLosVendedores = "Todos los vendedores";
    public const string CuentasDeLaCasa = "Cuentas de la casa";

    public OpcionesComercial Op => opciones.Value;
    public DateOnly Hoy => reloj.Hoy;
    public DateOnly MesEnCurso => Calendario.Mes(reloj.Hoy);

    public Task<Alcance> AlcanceAsync(CancellationToken ct) => alcance.ObtenerAsync(ct);

    public Task RegistrarAsync(string pantalla, string? parametros, CancellationToken ct, bool denegado = false)
        => alcance.RegistrarAsync(pantalla, parametros, denegado, ct);

    /// <summary>Los vendedores de Chess por id (incluye inactivos: pueden estar en meses pasados).</summary>
    public Task<Dictionary<int, Vendedor>> VendedoresAsync(CancellationToken ct)
        => db.Vendedores.AsNoTracking().ToDictionaryAsync(v => v.IdPersonal, ct);

    /// <summary>
    /// La mirada para un vendedor pedido (o todos). Sin vendedor: los visibles que son personas (el operario: los suyos,
    /// con sus nombres de título). La casa (vendedores que no son persona) se ve solo eligiéndola, y solo el Admin.
    /// Fuera del alcance → 403 y queda registrado.
    /// </summary>
    public async Task<Mirada> MiradaAsync(int? vendedor, string pantalla, CancellationToken ct)
    {
        var a = await AlcanceAsync(ct);
        var vendedores = await VendedoresAsync(ct);

        if (vendedor is { } v)
        {
            if (!a.Vendedores.Contains(v))
            {
                await RegistrarAsync(pantalla, $"vendedor={v}", ct, denegado: true);
                throw new AccesoDenegadoException("No tenés acceso a ese vendedor.");
            }
            var esCasa = vendedores.TryGetValue(v, out var x) && !x.EsPersona;
            return new Mirada(new HashSet<int> { v }, SinVendedor: esCasa && a.VeCasa,
                esCasa ? CuentasDeLaCasa : x?.Nombre ?? $"Vendedor {v}", v);
        }
        var personas = a.Vendedores.Where(id => !vendedores.TryGetValue(id, out var y) || y.EsPersona).ToHashSet();
        var titulo = a.Rol == RolApp.Operario
            ? string.Join(" / ", personas.Select(id => vendedores.GetValueOrDefault(id)?.Nombre ?? $"Vendedor {id}").Order())
            : TodosLosVendedores;
        return new Mirada(personas, SinVendedor: false, titulo, personas.Count == 1 ? personas.First() : null);
    }

    /// <summary>
    /// Valida el rango de meses. Por defecto, los últimos <see cref="OpcionesComercial.MesesPorDefecto"/> hasta el mes en
    /// curso. Se recorta a <paramref name="primero"/> (el primer mes con datos si no viene); más de
    /// <see cref="OpcionesComercial.MaxMeses"/> → 400.
    /// </summary>
    public IReadOnlyList<DateOnly> Meses(DateOnly? desde, DateOnly? hasta, DateOnly? primero = null)
    {
        var p = primero ?? Op.PrimerMes;
        var h = Calendario.Mes(hasta ?? MesEnCurso);
        if (h > MesEnCurso)
            throw new ValidacionException("mesHasta", "No puede ser posterior al mes en curso.");
        var d = Calendario.Mes(desde ?? h.AddMonths(-(Op.MesesPorDefecto - 1)));
        if (d > h)
            throw new ValidacionException("mesDesde", "Tiene que ser anterior o igual a mesHasta.");
        if (d < p)
            d = p;
        if (h < p)
            throw new ValidacionException("mesHasta", AntesDe(p));
        var meses = Calendario.Meses(d, h);
        if (meses.Count > Op.MaxMeses)
            throw new ValidacionException("mesDesde", $"Elegí como mucho {Op.MaxMeses} meses.");
        return meses;
    }

    /// <summary><see cref="Meses"/> con la ventana de quien entra (<see cref="PrimerMesVisibleAsync"/>).</summary>
    public async Task<IReadOnlyList<DateOnly>> MesesAsync(DateOnly? desde, DateOnly? hasta, CancellationToken ct)
        => Meses(desde, hasta, await PrimerMesVisibleAsync(ct));

    /// <summary>
    /// El filtro de artículos de un pedido. Los focos son solo del Admin (Cesar, 05/11/2026): para el resto, 403 y queda
    /// registrado (ignorarlo mostraría números que no son los del filtro). El foco tiene que existir (400 en
    /// <c>foco</c>); vale el de cualquier mes, sobre todos los meses de la ventana.
    /// </summary>
    public async Task<FiltroArticulos?> ArticulosAsync(string? unidad, int? foco, CancellationToken ct)
    {
        if (foco is null)
            return FiltroArticulos.De(unidad);
        await ExigirAdminFocosAsync($"foco={foco}", ct);
        var nombre = await db.Focos.AsNoTracking().Where(x => x.IdFoco == foco).Select(x => x.Nombre).FirstOrDefaultAsync(ct)
                     ?? throw new ValidacionException("foco", "No existe ese foco.");
        return new FiltroArticulos(string.IsNullOrWhiteSpace(unidad) ? null : unidad, foco, nombre);
    }

    /// <summary>Los focos (el filtro y su lista) son solo del Admin: 403 para operario y supervisor, y queda registrado.</summary>
    public async Task ExigirAdminFocosAsync(string? parametros, CancellationToken ct)
    {
        if ((await AlcanceAsync(ct)).EsAdmin)
            return;
        await RegistrarAsync("focos", parametros, ct, denegado: true);
        throw new AccesoDenegadoException("Los focos del mes son solo para administradores.");
    }

    /// <summary>Volumen y Devoluciones: 403 para el operario mientras vea solo Cobertura (<see cref="OpcionesComercial.OperarioSoloCobertura"/>).</summary>
    public async Task ExigirBultosAsync(CancellationToken ct)
    {
        if (Op.OperarioSoloCobertura && (await AlcanceAsync(ct)).Rol == RolApp.Operario)
            throw new AccesoDenegadoException("Por ahora el vendedor ve solo Cobertura.");
    }

    /// <summary>
    /// Gobernanza (Cesar, 30/10/2026): operario y supervisor ven los últimos <see cref="OpcionesComercial.MesesVisibles"/>
    /// meses (el en curso y los anteriores); el admin, desde el primer mes con datos.
    /// </summary>
    public async Task<DateOnly> PrimerMesVisibleAsync(CancellationToken ct)
    {
        var ventana = MesEnCurso.AddMonths(-(Op.MesesVisibles - 1));
        return (await AlcanceAsync(ct)).EsAdmin || ventana < Op.PrimerMes ? Op.PrimerMes : ventana;
    }

    string AntesDe(DateOnly primero) => primero == Op.PrimerMes
        ? $"No hay datos antes de {Op.PrimerMes:MM/yyyy}."
        : $"Se ven los últimos {Op.MesesVisibles} meses: desde {primero:MM/yyyy}.";

    /// <summary>
    /// La cartera de cada mes (la foto de ese mes) para la mirada, sin los excluidos y, si viene <paramref name="dia"/>,
    /// solo los de rutas que visitan ese día. Mes → cliente → su fila.
    /// </summary>
    public async Task<Dictionary<DateOnly, Dictionary<int, CarteraMes>>> CarterasAsync(Mirada mirada,
        IEnumerable<DateOnly> meses, int? dia, CancellationToken ct)
    {
        var lista = meses.Distinct().ToList();
        var vendedores = mirada.Vendedores.ToList();
        var sinVendedor = mirada.SinVendedor;
        var q = db.CarterasMes.AsNoTracking()
            .Where(c => lista.Contains(c.Mes))
            .Where(c => (c.IdPersonal != null && vendedores.Contains(c.IdPersonal.Value)) || (sinVendedor && c.IdPersonal == null))
            .Where(c => !db.Exclusiones.Any(e => e.IdCliente == c.IdCliente));
        if (dia is { } d)
            q = q.Where(c => db.RutaDias.Any(r => r.IdRuta == c.IdRuta && r.DiaSemana == d));
        var filas = await q.ToListAsync(ct);
        var porMes = lista.ToDictionary(m => m, _ => new Dictionary<int, CarteraMes>());
        foreach (var f in filas)
            porMes[f.Mes][f.IdCliente] = f;
        return porMes;
    }

    /// <summary>
    /// (cliente, mes) en que compró, para los meses dados (y el anterior a cada uno, por «dejó de comprar»). Para
    /// operario y supervisor, solo los meses en que el cliente era de su cartera (gobernanza): la compra de un mes que
    /// era de otro vendedor no existe, así que ese mes no puede dar «dejó de comprar».
    /// </summary>
    public async Task<HashSet<(int IdCliente, DateOnly Mes)>> ComprasAsync(IEnumerable<DateOnly> meses, FiltroArticulos? articulos,
        CancellationToken ct)
    {
        var alcance = await AlcanceAsync(ct);
        var lista = meses.SelectMany(m => new[] { m, m.AddMonths(-1) }).Distinct().ToList();
        var q = db.ComprasMes.AsNoTracking().Where(c => c.Compro && lista.Contains(c.Mes));
        if (articulos?.Unidad is { Length: > 0 } unidad)
            q = q.Where(c => db.Articulos.Any(a => a.IdArticulo == c.IdArticulo && a.UnidadNegocio == unidad));
        if (articulos?.Foco is { } foco)
            q = q.Where(c => db.FocoArticulos.Any(x => x.IdFoco == foco && x.IdArticulo == c.IdArticulo));
        if (!alcance.EsAdmin)
        {
            var vendedores = alcance.Vendedores.ToList();
            q = q.Where(c => db.CarterasMes.Any(k => k.Mes == c.Mes && k.IdCliente == c.IdCliente
                                                     && k.IdPersonal != null && vendedores.Contains(k.IdPersonal.Value)));
        }
        var filas = await q.Select(c => new { c.IdCliente, c.Mes }).Distinct().ToListAsync(ct);
        return filas.Select(f => (f.IdCliente, f.Mes)).ToHashSet();
    }

    /// <summary>
    /// La última compra (factura no anulada con cantidad) de cada cliente. Admin: de cualquier fecha. Operario y
    /// supervisor: solo de los meses en que era de su cartera.
    /// </summary>
    public async Task<Dictionary<int, DateOnly>> UltimasComprasAsync(IReadOnlyCollection<int> clientes, CancellationToken ct)
    {
        var a = await AlcanceAsync(ct);
        var tipos = Op.Regla().TiposFactura.ToList();
        var ids = clientes.ToList();
        var lineas = db.VentaLineas.AsNoTracking()
            .Where(l => ids.Contains(l.IdCliente) && !l.Anulado && l.CantidadTotal > 0 && tipos.Contains(l.TipoDocumento));
        if (a.EsAdmin)
            return await lineas.GroupBy(l => l.IdCliente)
                .Select(g => new { g.Key, Fecha = g.Max(l => l.Fecha) })
                .ToDictionaryAsync(x => x.Key, x => x.Fecha, ct);

        var porMes = await lineas.GroupBy(l => new { l.IdCliente, l.Fecha.Year, l.Fecha.Month })
            .Select(g => new { g.Key.IdCliente, g.Key.Year, g.Key.Month, Fecha = g.Max(l => l.Fecha) })
            .ToListAsync(ct);
        var propios = await PropiosAsync(ids, ct);
        return porMes.Where(x => propios.Contains((x.IdCliente, new DateOnly(x.Year, x.Month, 1))))
            .GroupBy(x => x.IdCliente)
            .ToDictionary(g => g.Key, g => g.Max(x => x.Fecha));
    }

    /// <summary>
    /// Gobernanza (Cesar, 29/10/2026): los (cliente, mes) en que el cliente estuvo en la cartera de uno de los
    /// vendedores del usuario. La exclusión no cambia de quién es cada mes. Se usa para operario y supervisor.
    /// </summary>
    public async Task<HashSet<(int IdCliente, DateOnly Mes)>> PropiosAsync(IReadOnlyCollection<int> clientes, CancellationToken ct)
    {
        var a = await AlcanceAsync(ct);
        var vendedores = a.Vendedores.ToList();
        var ids = clientes.ToList();
        var filas = await db.CarterasMes.AsNoTracking()
            .Where(k => ids.Contains(k.IdCliente) && k.IdPersonal != null && vendedores.Contains(k.IdPersonal.Value))
            .Select(k => new { k.IdCliente, k.Mes })
            .ToListAsync(ct);
        return filas.Select(f => (f.IdCliente, f.Mes)).ToHashSet();
    }

    /// <summary>
    /// El cliente de la ficha (y sus pestañas) y los meses que ve de él: null = todos (admin). Operario y supervisor lo
    /// ven si estuvo alguna vez en su cartera, solo en esos meses; si no, 404 y queda registrado.
    /// </summary>
    public async Task<(Cliente Cliente, IReadOnlySet<DateOnly>? Propios)> ClienteVisibleAsync(int idCliente, string pantalla,
        CancellationToken ct)
    {
        var a = await AlcanceAsync(ct);
        var cliente = await db.Clientes.AsNoTracking().FirstOrDefaultAsync(c => c.IdCliente == idCliente, ct);
        HashSet<DateOnly>? propios = null;
        if (cliente is not null && !a.EsAdmin)
            propios = (await PropiosAsync([idCliente], ct)).Select(x => x.Mes).ToHashSet();
        if (cliente is null || propios is { Count: 0 })
        {
            await RegistrarAsync(pantalla, $"cliente={idCliente}", ct, denegado: cliente is not null);
            throw new NoEncontradoException("No existe el cliente o no tenés acceso.");
        }
        return (cliente, propios);
    }

    /// <summary>
    /// Bultos por cliente × artículo × mes entre dos fechas (inclusive): lo entregado y lo devuelto, con los documentos
    /// de <see cref="ReglaCompra"/> y <see cref="Volumen.Repartir"/>. Sin <paramref name="clientes"/>, todos.
    /// </summary>
    public async Task<List<BultosMes>> BultosAsync(DateOnly desde, DateOnly hasta, IReadOnlyCollection<int>? clientes,
        FiltroArticulos? articulos, CancellationToken ct)
    {
        var regla = Op.Regla();
        var tipos = regla.TiposFactura.Concat(regla.TiposCredito).ToList();
        var q = db.VentaLineas.AsNoTracking()
            .Where(l => !l.Anulado && l.Fecha >= desde && l.Fecha <= hasta && tipos.Contains(l.TipoDocumento));
        if (clientes is not null)
        {
            var ids = clientes.ToList();
            q = q.Where(l => ids.Contains(l.IdCliente));
        }
        if (articulos?.Unidad is { Length: > 0 } unidad)
            q = q.Where(l => db.Articulos.Any(a => a.IdArticulo == l.IdArticulo && a.UnidadNegocio == unidad));
        if (articulos?.Foco is { } foco)
            q = q.Where(l => db.FocoArticulos.Any(x => x.IdFoco == foco && x.IdArticulo == l.IdArticulo));
        // Agrupado también por documento: clasificarlo dentro del SUM no se puede en SQL Server (es una subconsulta).
        var filas = await q
            .GroupBy(l => new { l.IdCliente, l.IdArticulo, l.Fecha.Year, l.Fecha.Month, l.TipoDocumento })
            .Select(g => new
            {
                g.Key.IdCliente, g.Key.IdArticulo, g.Key.Year, g.Key.Month, g.Key.TipoDocumento,
                Positivas = g.Sum(l => l.CantidadTotal > 0 ? l.CantidadTotal : 0m),
                Negativas = g.Sum(l => l.CantidadTotal < 0 ? -l.CantidadTotal : 0m),
            })
            .ToListAsync(ct);
        var negativasSonDevolucion = Op.NegativasSonDevolucion;
        return filas.GroupBy(f => (f.IdCliente, f.IdArticulo, Mes: new DateOnly(f.Year, f.Month, 1)))
            .Select(g =>
            {
                var facturas = g.Where(x => regla.EsFactura(x.TipoDocumento)).ToList();
                var (entregado, devuelto) = Volumen.Repartir(facturas.Sum(x => x.Positivas), facturas.Sum(x => x.Negativas),
                    g.Where(x => regla.EsCredito(x.TipoDocumento)).Sum(x => x.Positivas + x.Negativas), negativasSonDevolucion);
                return new BultosMes(g.Key.IdCliente, g.Key.IdArticulo, g.Key.Mes, entregado, devuelto);
            })
            .ToList();
    }

    /// <summary>
    /// El último día con las ventas completas: hasta dónde llegó la última lectura de ventas, sin el día en que se leyó
    /// (la sincronización corre a las 05:00 y ese día recién empieza).
    /// </summary>
    public async Task<DateOnly?> UltimoDiaCompletoAsync(CancellationToken ct)
    {
        var paso = await db.SyncLogs.AsNoTracking()
            .Where(s => s.Ok && s.Endpoint == "ventas/" && s.Hasta != null && s.Fin != null)
            .OrderByDescending(s => s.Hasta).ThenByDescending(s => s.Fin)
            .Select(s => new { s.Hasta, s.Fin })
            .FirstOrDefaultAsync(ct);
        if (paso is null)
            return null;
        var leido = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(paso.Fin!.Value, Calendario.Argentina).DateTime);
        return paso.Hasta!.Value < leido ? paso.Hasta.Value : leido.AddDays(-1);
    }

    /// <summary>
    /// La comparación de volumen del mes según el rol (Cesar, 29/10/2026): el operario contra el mes anterior entero;
    /// admin y supervisor contra el mismo día hábil. El primer mes con datos no tiene base → 400.
    /// </summary>
    public async Task<Comparacion> ComparacionAsync(DateOnly? mes, CancellationToken ct)
    {
        var a = await AlcanceAsync(ct);
        var m = Calendario.Mes(mes ?? MesEnCurso);
        if (m > MesEnCurso)
            throw new ValidacionException("mes", "No puede ser posterior al mes en curso.");
        if (m <= Op.PrimerMes)
            throw new ValidacionException("mes", $"No hay ventas antes de {Op.PrimerMes:MM/yyyy} para comparar: el primer mes es {Op.PrimerMes.AddMonths(1):MM/yyyy}.");
        if (await PrimerMesVisibleAsync(ct) is var p && m < p)
            throw new ValidacionException("mes", AntesDe(p));
        var tipo = a.Rol == RolApp.Operario ? TipoComparacion.MesAnteriorCompleto : TipoComparacion.MismoDiaHabil;
        return Volumen.Comparar(m, tipo, await UltimoDiaCompletoAsync(ct), Op.DiasFeriados());
    }

    /// <summary>Los bultos del mes (del 1 al corte) y los de la base (del 1 a BaseHasta) de una comparación.</summary>
    public async Task<(List<BultosMes> Actual, List<BultosMes> Base)> BultosComparadosAsync(Comparacion c,
        IReadOnlyCollection<int>? clientes, FiltroArticulos? articulos, CancellationToken ct)
    {
        var actual = c.CorteAl is { } corte ? await BultosAsync(c.Mes, corte, clientes, articulos, ct) : [];
        var enBase = c.BaseHasta is { } hasta ? await BultosAsync(c.MesBase, hasta, clientes, articulos, ct) : [];
        return (actual, enBase);
    }

    /// <summary>Hasta qué día hay ventas cargadas (el «al 22/10» del mes en curso).</summary>
    public async Task<DateOnly?> VentasHastaAsync(CancellationToken ct)
        => await db.SyncLogs.AsNoTracking().Where(s => s.Ok && s.Endpoint == "ventas/" && s.Hasta != null)
            .MaxAsync(s => s.Hasta, ct);

    /// <summary>Los KPI de cada mes para una cartera y sus compras.</summary>
    public IReadOnlyList<KpiMesDto> Kpis(IReadOnlyList<DateOnly> meses, Dictionary<DateOnly, Dictionary<int, CarteraMes>> carteras,
        HashSet<(int, DateOnly)> compras, DateOnly? ventasHasta)
        => meses.Select(m =>
        {
            var cartera = carteras[m];
            var conCompra = cartera.Keys.Count(id => compras.Contains((id, m)));
            var enCurso = m >= MesEnCurso;
            return new KpiMesDto(m, conCompra, cartera.Count, Cobertura.Porcentaje(conCompra, cartera.Count), enCurso,
                enCurso ? ventasHasta : null);
        }).ToList();

    /// <summary>Calle y altura, localidad.</summary>
    public static string? Direccion(Cliente c)
    {
        var calle = string.Join(' ', new[] { c.Calle, c.Altura?.ToString() }.Where(s => !string.IsNullOrWhiteSpace(s)));
        var partes = new[] { calle, c.Localidad }.Where(s => !string.IsNullOrWhiteSpace(s)).ToList();
        return partes.Count == 0 ? null : string.Join(", ", partes);
    }
}
