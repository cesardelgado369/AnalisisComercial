using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Chess;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Sincronizacion;

/// <summary>
/// Trae de Chess los maestros y las ventas, y recalcula CompraMes y CarteraMes (CONTEXTO_BACKEND §5).
/// Cada paso deja su fila en SyncLog. Si un paso falla no se borra nada de lo anterior: la app sigue mostrando la
/// última carga buena. Lo corre solo el proceso de sincronización (AnalisisComercial.Sync).
/// </summary>
public class Sincronizador(ComercialDbContext db, IChess chess, IReloj reloj, IOptions<OpcionesComercial> opciones,
    ILogger<Sincronizador> log)
{
    private readonly OpcionesComercial _op = opciones.Value;
    private Guid _corrida;

    // Lo que se leyó en esta corrida y usan los pasos siguientes.
    private IReadOnlyList<RutaChess>? _rutas;
    private IReadOnlyList<ClienteChess>? _clientes;

    public record Resultado(Guid IdCorrida, bool Ok);

    /// <param name="recalcularCompras">
    /// Recalcula CompraMes de todos los meses (hace falta cuando cambia la regla de «compró»). Si no, solo los meses
    /// cuyas ventas se leyeron en esta corrida o que no tienen compras calculadas.
    /// </param>
    /// <param name="recargarVentas">
    /// Vuelve a leer las ventas de todos los meses desde el primero (hace falta cuando se empieza a guardar un campo
    /// nuevo de las líneas). Si no, solo el mes en curso, la cola del anterior y los meses sin ventas.
    /// </param>
    public async Task<Resultado> CorrerAsync(bool recalcularCompras, CancellationToken ct, bool recargarVentas = false)
    {
        _corrida = Guid.NewGuid();
        var hoy = reloj.Hoy;
        var mesEnCurso = Calendario.Mes(hoy);
        log.LogInformation("Sincronización {Corrida}: empieza.", _corrida);

        var ok = true;
        ok &= await PasoAsync("personalComercial/", null, null, VendedoresAsync, ct);
        var rutasOk = await PasoAsync("rutasVenta/", null, null, RutasAsync, ct);
        ok &= rutasOk;
        var clientesOk = await PasoAsync("clientes/", null, null, ClientesAsync, ct);
        ok &= clientesOk;
        ok &= await PasoAsync("articulos/", null, null, ArticulosAsync, ct);

        var mesesConCompras = new List<DateOnly>();
        foreach (var (d, h) in await RangosDeVentasAsync(hoy, recargarVentas, ct))
        {
            if (await PasoAsync("ventas/", d, h, ct2 => VentasAsync(d, h, ct2), ct))
                mesesConCompras.Add(Calendario.Mes(d));
            else
                ok = false;
        }
        var conCompras = await db.ComprasMes.Select(c => c.Mes).Distinct().ToListAsync(ct);
        var conVentas = await db.VentaLineas.Select(l => new { l.Fecha.Year, l.Fecha.Month }).Distinct().ToListAsync(ct);
        foreach (var m in conVentas.Select(x => new DateOnly(x.Year, x.Month, 1)))
            if (recalcularCompras || !conCompras.Contains(m))
                mesesConCompras.Add(m);
        foreach (var mes in mesesConCompras.Distinct().Order())
            ok &= await PasoAsync("compras-mes", mes, Calendario.FinDeMes(mes), ct2 => ComprasMesAsync(mes, ct2), ct);

        if (rutasOk && clientesOk)
            ok &= await PasoAsync("cartera-mes", _op.PrimerMes, mesEnCurso, ct2 => CarterasAsync(mesEnCurso, ct2), ct);

        log.LogInformation("Sincronización {Corrida}: termina {Estado}.", _corrida, ok ? "OK" : "con errores");
        return new Resultado(_corrida, ok);
    }

    /// <summary>
    /// Qué ventas leer, partido por mes calendario (Chess da como mucho un mes por consulta): el mes en curso más los
    /// últimos días del anterior (correcciones tardías), y además todo mes cerrado desde el primero que no tenga ninguna
    /// venta (la carga inicial, o un mes que falló).
    /// </summary>
    private async Task<List<(DateOnly Desde, DateOnly Hasta)>> RangosDeVentasAsync(DateOnly hoy, bool todos, CancellationToken ct)
    {
        var mesEnCurso = Calendario.Mes(hoy);
        var conVentas = (await db.VentaLineas.Select(l => new { l.Fecha.Year, l.Fecha.Month }).Distinct().ToListAsync(ct))
            .Select(x => new DateOnly(x.Year, x.Month, 1)).ToHashSet();
        var rangos = new List<(DateOnly, DateOnly)>();
        var cola = Max(mesEnCurso.AddDays(-_op.DiasMesAnterior), _op.PrimerMes);
        foreach (var mes in Calendario.Meses(_op.PrimerMes, hoy))
        {
            var fin = Min(Calendario.FinDeMes(mes), hoy);
            if (todos || (mes < mesEnCurso && !conVentas.Contains(mes)))
                rangos.Add((mes, fin));
            else if (fin >= cola)
                rangos.Add((Max(mes, cola), fin));
        }
        return rangos;
    }

    // ---- pasos

    private async Task<int> VendedoresAsync(CancellationToken ct)
    {
        var leidos = await chess.VendedoresAsync(ct);
        if (leidos.Count == 0)
            throw new ChessException("personalComercial/ vino vacío.");
        var casa = _op.Casa();
        var existentes = await db.Vendedores.ToDictionaryAsync(v => v.IdPersonal, ct);
        foreach (var v in leidos)
        {
            if (!existentes.TryGetValue(v.IdPersonal, out var e))
                db.Vendedores.Add(e = new Vendedor { IdPersonal = v.IdPersonal });
            e.Nombre = v.Nombre;
            e.EsPersona = !casa.Contains(v.IdPersonal);
            e.Activo = true;
        }
        var ids = leidos.Select(v => v.IdPersonal).ToHashSet();
        foreach (var e in existentes.Values.Where(e => !ids.Contains(e.IdPersonal)))
            e.Activo = false;
        await db.SaveChangesAsync(ct);
        return leidos.Count;
    }

    private async Task<int> RutasAsync(CancellationToken ct)
    {
        var leidas = await chess.RutasAsync(ct);
        if (!leidas.Any(r => r.Vigente))
            throw new ChessException("rutasVenta/ no trajo ninguna ruta vigente.");
        _rutas = leidas;

        var existentes = await db.Rutas.Include(r => r.Dias).ToDictionaryAsync(r => r.IdRuta, ct);
        foreach (var grupo in leidas.GroupBy(r => r.IdRuta))
        {
            // Chess manda una versión por período: vale la vigente; si no hay, la última.
            var r = grupo.Where(x => x.Vigente).MaxBy(x => x.FechaDesde) ?? grupo.MaxBy(x => x.FechaHasta)!;
            if (!existentes.TryGetValue(r.IdRuta, out var e))
                db.Rutas.Add(e = new Ruta { IdRuta = r.IdRuta });
            e.Nombre = r.Nombre;
            e.IdPersonal = r.IdPersonal;
            e.DiasVisita = r.DiasVisita;
            e.Vigente = r.Vigente;
            e.FechaDesde = r.FechaDesde;
            e.FechaHasta = r.FechaHasta;
            var dias = DiasSemana.Parsear(r.DiasVisita);
            e.Dias.RemoveAll(d => !dias.Contains(d.DiaSemana));
            foreach (var d in dias.Where(d => e.Dias.All(x => x.DiaSemana != d)))
                e.Dias.Add(new RutaDia { IdRuta = r.IdRuta, DiaSemana = d });
        }
        foreach (var e in existentes.Values.Where(e => leidas.All(r => r.IdRuta != e.IdRuta)))
            e.Vigente = false;
        await db.SaveChangesAsync(ct);
        return leidas.Count(r => r.Vigente);
    }

    private async Task<int> ClientesAsync(CancellationToken ct)
    {
        var leidos = await chess.ClientesAsync(ct);
        var existentes = await db.Clientes.ToDictionaryAsync(c => c.IdCliente, ct);
        var enChess = existentes.Values.Count(c => c.EnChess);
        // Freno: una lectura cortada no puede dar de baja a media cartera.
        if (enChess > 0 && leidos.Count < enChess * 0.9)
            throw new ChessException($"clientes/ trajo {leidos.Count} clientes y había {enChess}: parece una lectura cortada, no se actualizó nada.");
        _clientes = leidos;

        // La ruta vigente de cada cliente sale de rutasVenta (la fuente principal), con su orden de visita.
        var cartera = (_rutas ?? []).Where(r => r.Vigente)
            .SelectMany(r => r.Clientes.Select(c => (r.IdRuta, c)))
            .GroupBy(x => x.c.IdCliente)
            .ToDictionary(g => g.Key, g => g.First());

        foreach (var c in leidos)
        {
            if (!existentes.TryGetValue(c.IdCliente, out var e))
                db.Clientes.Add(e = new Cliente { IdCliente = c.IdCliente });
            e.RazonSocial = c.RazonSocial;
            e.Localidad = c.Localidad;
            e.Calle = c.Calle;
            e.Altura = c.Altura;
            e.Lat = c.Lat;
            e.Lng = c.Lng;
            e.Anulado = c.Anulado;
            e.FechaBaja = c.FechaBaja;
            e.EnChess = true;
        }
        var ids = leidos.Select(c => c.IdCliente).ToHashSet();
        foreach (var e in existentes.Values.Where(e => !ids.Contains(e.IdCliente)))
            e.EnChess = false;

        // Clientes que están en una ruta pero no vinieron en clientes/ (pasa con uno o dos): se dan de alta con lo
        // que trae la ruta, así no se pierden de la cartera.
        foreach (var (id, (_, cr)) in cartera.Where(x => !ids.Contains(x.Key) && !existentes.ContainsKey(x.Key)))
            db.Clientes.Add(new Cliente { IdCliente = id, RazonSocial = cr.RazonSocial ?? $"Cliente {id}", EnChess = false });

        await db.SaveChangesAsync(ct);
        if (_rutas is null)
            return leidos.Count;   // rutasVenta/ falló en esta corrida: la ruta de cada cliente queda como estaba
        foreach (var e in db.Clientes.Local)
        {
            var tiene = cartera.TryGetValue(e.IdCliente, out var x);
            e.IdRuta = tiene ? x.IdRuta : null;
            e.OrdenVisita = tiene ? x.c.OrdenVisita : null;
        }
        await db.SaveChangesAsync(ct);
        return leidos.Count;
    }

    private async Task<int> ArticulosAsync(CancellationToken ct)
    {
        var leidos = await chess.ArticulosAsync(ct);
        var existentes = await db.Articulos.ToDictionaryAsync(a => a.IdArticulo, ct);
        foreach (var a in leidos)
        {
            if (!existentes.TryGetValue(a.IdArticulo, out var e))
                db.Articulos.Add(e = new Articulo { IdArticulo = a.IdArticulo });
            e.Descripcion = a.Descripcion;
            e.Anulado = a.Anulado;
            e.AgrupacionesJson = a.AgrupacionesJson;
            e.UnidadNegocio = UnidadNegocio.Desde(a.AgrupacionesJson);
            e.Division = UnidadNegocio.Division(a.AgrupacionesJson);
            e.UnidadesBulto = a.UnidadesBulto;
        }
        await db.SaveChangesAsync(ct);
        return leidos.Count;
    }

    /// <summary>
    /// Reemplaza las líneas del rango por lo que trajo Chess, en una transacción: si algo falla, queda lo anterior.
    /// Las que ya no vienen (comprobantes borrados o cambiados de fecha en Chess) se van.
    /// </summary>
    private async Task<int> VentasAsync(DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        var lineas = (await chess.VentasAsync(desde, hasta, ct))
            .Where(l => l.Fecha >= desde && l.Fecha <= hasta && l.IdCliente > 0 && l.IdArticulo > 0)
            .DistinctBy(ParserChess.Clave)
            .ToList();
        var antes = await db.VentaLineas.CountAsync(l => l.Fecha >= desde && l.Fecha <= hasta, ct);
        // Freno: si Chess trae mucho menos de lo que ya había, sospechar una lectura cortada.
        if (antes > 200 && lineas.Count < antes / 2)
            throw new ChessException($"ventas/ del {desde:dd/MM} al {hasta:dd/MM} trajo {lineas.Count} líneas y había {antes}: no se reemplazó.");

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.VentaLineas.Where(l => l.Fecha >= desde && l.Fecha <= hasta).ExecuteDeleteAsync(ct);
        db.ChangeTracker.AutoDetectChangesEnabled = false;
        try
        {
            foreach (var bloque in lineas.Chunk(5000))
            {
                db.VentaLineas.AddRange(bloque);
                await db.SaveChangesAsync(ct);
                db.ChangeTracker.Clear();
            }
        }
        finally
        {
            db.ChangeTracker.AutoDetectChangesEnabled = true;
        }
        await tx.CommitAsync(ct);
        return lineas.Count;
    }

    /// <summary>Recalcula CompraMes del mes desde VentaLinea con la regla vigente.</summary>
    private async Task<int> ComprasMesAsync(DateOnly mes, CancellationToken ct)
    {
        var fin = Calendario.FinDeMes(mes);
        var lineas = await db.VentaLineas.AsNoTracking()
            .Where(l => l.Fecha >= mes && l.Fecha <= fin)
            .ToListAsync(ct);
        var regla = _op.Regla();
        var filas = lineas
            .GroupBy(l => (l.IdCliente, l.IdArticulo))
            .Select(g => (g.Key, r: regla.Evaluar(g)))
            .Select(x => new CompraMes
            {
                Mes = mes, IdCliente = x.Key.IdCliente, IdArticulo = x.Key.IdArticulo,
                Compro = x.r.Compro, Cantidad = x.r.Cantidad, Neto = x.r.Neto,
            })
            .ToList();

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.ComprasMes.Where(c => c.Mes == mes).ExecuteDeleteAsync(ct);
        foreach (var bloque in filas.Chunk(5000))
        {
            db.ComprasMes.AddRange(bloque);
            await db.SaveChangesAsync(ct);
            db.ChangeTracker.Clear();
        }
        await tx.CommitAsync(ct);
        return filas.Count(f => f.Compro);
    }

    /// <summary>
    /// La foto de la cartera. El mes en curso se reescribe con las rutas vigentes. Un mes cerrado no se toca más,
    /// salvo que no tenga foto (la carga inicial, o un mes en que la sincronización no corrió): ahí se reconstruye con
    /// la historia de Chess (eClifuerza para la ruta del cliente, la versión de la ruta para el vendedor) al último día.
    /// </summary>
    private async Task<int> CarterasAsync(DateOnly mesEnCurso, CancellationToken ct)
    {
        var conFoto = await db.CarterasMes.Select(c => c.Mes).Distinct().ToListAsync(ct);
        var total = 0;
        foreach (var mes in Calendario.Meses(_op.PrimerMes, mesEnCurso))
        {
            List<CarteraMes> foto;
            if (mes == mesEnCurso)
                foto = FotoVigente(mes);
            else if (!conFoto.Contains(mes))
                foto = FotoHistorica(mes);
            else
                continue;

            await using var tx = await db.Database.BeginTransactionAsync(ct);
            await db.CarterasMes.Where(c => c.Mes == mes).ExecuteDeleteAsync(ct);
            db.CarterasMes.AddRange(foto);
            await db.SaveChangesAsync(ct);
            db.ChangeTracker.Clear();
            await tx.CommitAsync(ct);
            total += foto.Count;
        }
        return total;
    }

    private List<CarteraMes> FotoVigente(DateOnly mes)
        => _rutas!.Where(r => r.Vigente)
            .SelectMany(r => r.Clientes.Select(c => new CarteraMes { Mes = mes, IdCliente = c.IdCliente, IdRuta = r.IdRuta, IdPersonal = r.IdPersonal }))
            .DistinctBy(c => c.IdCliente)
            .ToList();

    private List<CarteraMes> FotoHistorica(DateOnly mes)
    {
        var dia = Calendario.FinDeMes(mes);
        var versiones = _rutas!.ToLookup(r => r.IdRuta);
        var foto = new List<CarteraMes>();
        foreach (var c in _clientes!)
        {
            var f = c.Fuerzas.Where(x => !x.Anulado && x.Desde <= dia && dia <= x.Hasta).MaxBy(x => x.Desde);
            if (f is null)
                continue;
            var version = versiones[f.IdRuta].Where(r => !r.Anulado && r.FechaDesde <= dia && dia <= r.FechaHasta).MaxBy(r => r.FechaDesde)
                          ?? versiones[f.IdRuta].MaxBy(r => r.FechaHasta);
            foto.Add(new CarteraMes { Mes = mes, IdCliente = c.IdCliente, IdRuta = f.IdRuta, IdPersonal = version?.IdPersonal });
        }
        return foto;
    }

    // ---- infraestructura de los pasos

    /// <summary>Corre un paso y lo anota en SyncLog. Devuelve si salió bien; un error no corta la corrida.</summary>
    private async Task<bool> PasoAsync(string endpoint, DateOnly? desde, DateOnly? hasta, Func<CancellationToken, Task<int>> paso,
        CancellationToken ct)
    {
        var fila = new SyncLog { IdCorrida = _corrida, Inicio = reloj.Ahora, Endpoint = endpoint, Desde = desde, Hasta = hasta };
        db.SyncLogs.Add(fila);
        await db.SaveChangesAsync(ct);
        db.Entry(fila).State = EntityState.Detached;
        try
        {
            fila.Registros = await paso(ct);
            fila.Ok = true;
        }
        catch (Exception ex) when (ex is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            log.LogError(ex, "Sincronización {Corrida}: falló {Endpoint}.", _corrida, endpoint);
            fila.Error = ex.Message.Length > 2000 ? ex.Message[..2000] : ex.Message;
            db.ChangeTracker.Clear();
        }
        fila.Fin = reloj.Ahora;
        db.SyncLogs.Attach(fila);
        db.Entry(fila).State = EntityState.Modified;
        await db.SaveChangesAsync(ct);
        db.Entry(fila).State = EntityState.Detached;
        return fila.Ok;
    }

    private static DateOnly Max(DateOnly a, DateOnly b) => a > b ? a : b;
    private static DateOnly Min(DateOnly a, DateOnly b) => a < b ? a : b;
}
