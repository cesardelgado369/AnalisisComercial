using System.Globalization;
using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Infrastructure.Servicios;

public class SesionService(ComercialDbContext db, Lectura lectura) : ISesionService
{
    public async Task<SesionDto> ObtenerAsync(CancellationToken ct = default)
    {
        var a = await lectura.AlcanceAsync(ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        // El operario con un solo vendedor lo trae acá; con varios (un vendedor que Chess renombró), null y van todos
        // en `vendedores`.
        VendedorDto? propio = a.Rol == RolApp.Operario && a.Vendedores.Count == 1 && a.Vendedores.First() is var p
            ? new VendedorDto(p, vendedores.TryGetValue(p, out var v) ? v.Nombre : $"Vendedor {p}")
            : null;
        await lectura.RegistrarAsync("sesion", null, ct);
        return new SesionDto(a.Email, a.Rol, propio, Opciones(a, vendedores), lectura.Hoy, lectura.MesEnCurso);
    }

    public async Task<EstadoSincronizacionDto> EstadoSincronizacionAsync(CancellationToken ct = default)
    {
        await lectura.AlcanceAsync(ct);
        // Una corrida es OK si todos sus pasos terminaron bien (una en curso todavía no cuenta).
        var conProblemas = db.SyncLogs.Where(s => !s.Ok || s.Fin == null).Select(s => s.IdCorrida);
        var ultimaOk = await db.SyncLogs.AsNoTracking()
            .Where(s => !conProblemas.Contains(s.IdCorrida))
            .MaxAsync(s => s.Fin, ct);
        return new EstadoSincronizacionDto(ultimaOk, await lectura.VentasHastaAsync(ct));
    }

    /// <summary>Las opciones del filtro de vendedor: personas por nombre y, para el Admin, la casa al final.</summary>
    public static IReadOnlyList<OpcionVendedorDto> Opciones(Alcance a, Dictionary<int, Vendedor> vendedores)
    {
        var visibles = a.Vendedores.Select(id => vendedores.GetValueOrDefault(id)).OfType<Vendedor>().ToList();
        var personas = visibles.Where(v => v.EsPersona && (v.Activo || !a.EsAdmin))
            .OrderBy(v => v.Nombre)
            .Select(v => new OpcionVendedorDto(v.IdPersonal, v.Nombre, false));
        var casa = a.VeCasa
            ? visibles.Where(v => !v.EsPersona).OrderBy(v => v.IdPersonal)
                .Select(v => new OpcionVendedorDto(v.IdPersonal, $"{Lectura.CuentasDeLaCasa} ({Titulo(v.Nombre)})", true))
            : [];
        return personas.Concat(casa).ToList();
    }

    private static string Titulo(string s) => CultureInfo.GetCultureInfo("es-AR").TextInfo.ToTitleCase(s.ToLowerInvariant());
}

public class CoberturaService(ComercialDbContext db, Lectura lectura) : ICoberturaService
{
    public async Task<CoberturaDto> ObtenerAsync(FiltroCobertura f, CancellationToken ct = default)
    {
        if (f.Dia is { } d && !DiasSemana.EsValido(d))
            throw new ValidacionException("dia", "Día inválido (2 lunes … 7 sábado).");
        var meses = lectura.Meses(f.MesDesde, f.MesHasta);
        var mirada = await lectura.MiradaAsync(f.Vendedor, "cobertura", ct);
        var mesRef = meses[^1];
        var mesEnCurso = lectura.MesEnCurso;

        var carteras = await lectura.CarterasAsync(mirada, meses, f.Dia, ct);
        var compras = await lectura.ComprasAsync(meses, f.Unidad, ct);
        var ventasHasta = await lectura.VentasHastaAsync(ct);
        var rutas = await db.Rutas.AsNoTracking().ToDictionaryAsync(r => r.IdRuta, r => r.Nombre, ct);
        var vendedores = await lectura.VendedoresAsync(ct);

        var ids = carteras[mesRef].Keys.ToList();
        var clientes = await db.Clientes.AsNoTracking().Where(c => ids.Contains(c.IdCliente))
            .Select(c => new { c.IdCliente, c.RazonSocial, c.Lat, c.Lng })
            .ToDictionaryAsync(c => c.IdCliente, ct);

        var filas = carteras[mesRef].Values.Select(c =>
        {
            var (estados, dejo) = Cobertura.Estados(meses, mesEnCurso, lectura.Op.PrimerMes,
                m => carteras[m].ContainsKey(c.IdCliente), m => compras.Contains((c.IdCliente, m)));
            var cli = clientes.GetValueOrDefault(c.IdCliente);
            return new ClienteCoberturaDto(c.IdCliente, cli?.RazonSocial ?? $"Cliente {c.IdCliente}",
                rutas.GetValueOrDefault(c.IdRuta), c.IdPersonal is { } p ? vendedores.GetValueOrDefault(p)?.Nombre : null,
                c.IdPersonal, cli?.Lat, cli?.Lng, estados, dejo);
        }).ToList();

        var compraron = filas.Count(x => compras.Contains((x.IdCliente, mesRef)));
        var chips = new ChipsDto(filas.Count, compraron, filas.Count - compraron, filas.Count(x => x.DejoDeComprar));

        IEnumerable<ClienteCoberturaDto> lista = f.Chip switch
        {
            ChipCobertura.CompraronMesActual => filas.Where(x => compras.Contains((x.IdCliente, mesRef))),
            ChipCobertura.SinCompraMesActual => filas.Where(x => !compras.Contains((x.IdCliente, mesRef))),
            ChipCobertura.DejaronDeComprar => filas.Where(x => x.DejoDeComprar),
            _ => filas,
        };
        if (Texto.Normalizar(f.Busqueda) is { Length: > 0 } b)
            lista = lista.Where(x => x.IdCliente.ToString(CultureInfo.InvariantCulture) == b || Texto.Normalizar(x.RazonSocial).Contains(b));

        var subtitulo = string.Join(", ",
            $"{filas.Count} {(filas.Count == 1 ? "cliente" : "clientes")}",
            f.Dia is { } dia ? DiasSemana.Nombre(dia).ToLowerInvariant() : "todos los días",
            string.IsNullOrWhiteSpace(f.Unidad) ? "todas las unidades" : f.Unidad);

        await lectura.RegistrarAsync("cobertura", Parametros(f), ct);
        return new CoberturaDto(mirada.Titulo, subtitulo, meses, lectura.Kpis(meses, carteras, compras, ventasHasta), chips,
            lista.OrderBy(x => x.RazonSocial, StringComparer.Create(CultureInfo.GetCultureInfo("es-AR"), true)).ThenBy(x => x.IdCliente).ToList());
    }

    public async Task<IReadOnlyList<OpcionVendedorDto>> VendedoresAsync(CancellationToken ct = default)
        => SesionService.Opciones(await lectura.AlcanceAsync(ct), await lectura.VendedoresAsync(ct));

    public async Task<IReadOnlyList<string>> UnidadesAsync(CancellationToken ct = default)
    {
        await lectura.AlcanceAsync(ct);
        return await db.Articulos.AsNoTracking().Where(a => a.UnidadNegocio != null)
            .Select(a => a.UnidadNegocio!).Distinct().OrderBy(u => u).ToListAsync(ct);
    }

    private static string Parametros(FiltroCobertura f)
        => $"vendedor={f.Vendedor};dia={f.Dia};unidad={f.Unidad};chip={f.Chip};desde={f.MesDesde};hasta={f.MesHasta}";
}

public class ClienteService(ComercialDbContext db, Lectura lectura) : IClienteService
{
    public async Task<FichaClienteDto> FichaAsync(int idCliente, DateOnly? mesDesde, DateOnly? mesHasta, CancellationToken ct = default)
    {
        var meses = lectura.Meses(mesDesde, mesHasta);
        var (cliente, propios) = await lectura.ClienteVisibleAsync(idCliente, "ficha", ct);
        bool Ve(DateOnly m) => propios is null || propios.Contains(m);
        var a = await lectura.AlcanceAsync(ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        var mesEnCurso = lectura.MesEnCurso;

        var mirada = new Mirada(a.Vendedores, a.VeCasa, "", null);
        var carteras = await lectura.CarterasAsync(mirada, meses, null, ct);
        var compras = await lectura.ComprasAsync(meses, null, ct);
        var (estados, _) = Cobertura.Estados(meses, mesEnCurso, lectura.Op.PrimerMes,
            m => carteras[m].ContainsKey(idCliente), m => compras.Contains((idCliente, m)));

        // Gobernanza: de los meses que no eran suyos no viaja nada (ni bultos ni artículos).
        var desde = meses[0];
        var hasta = meses[^1];
        var bultos = (await lectura.BultosAsync(desde, Calendario.FinDeMes(hasta), [idCliente], null, ct))
            .Where(b => Ve(b.Mes)).ToList();
        var compro = (await db.ComprasMes.AsNoTracking()
                .Where(c => c.IdCliente == idCliente && c.Compro && c.Mes >= desde && c.Mes <= hasta)
                .Select(c => new { c.IdArticulo, c.Mes })
                .ToListAsync(ct))
            .Where(c => Ve(c.Mes)).Select(c => (c.IdArticulo, c.Mes)).ToHashSet();
        var datos = await Detalle.ArticulosAsync(db, compro.Select(c => c.IdArticulo), ct);
        decimal? Bultos(DateOnly m, int? articulo = null)
            => Ve(m) ? Volumen.Redondear(bultos.Where(b => b.Mes == m && (articulo is null || b.IdArticulo == articulo)).Sum(b => b.Netos)) : null;
        var articulos = compro.Select(c => c.IdArticulo).Distinct()
            .Select(id => new ArticuloMesDto(id, Detalle.Descripcion(datos, id), datos.GetValueOrDefault(id)?.UnidadNegocio,
                meses.Select(m => compro.Contains((id, m))).ToList(), meses.Select(m => Bultos(m, id)).ToList()))
            .OrderBy(x => x.UnidadNegocio ?? "￿").ThenBy(x => x.Descripcion)
            .ToList();

        // Ruta y vendedor: los de hoy para el admin; para operario y supervisor, los del último mes en que fue suyo
        // (nunca el vendedor de otro).
        var idRuta = cliente.IdRuta;
        int? idPersonal = null;
        bool enCartera;
        if (propios is null)
        {
            enCartera = await db.CarterasMes.AnyAsync(k => k.Mes == mesEnCurso && k.IdCliente == idCliente, ct);
        }
        else
        {
            var ultimoMes = propios.Max();
            var foto = await db.CarterasMes.AsNoTracking().FirstAsync(k => k.Mes == ultimoMes && k.IdCliente == idCliente, ct);
            idRuta = foto.IdRuta;
            idPersonal = foto.IdPersonal;
            enCartera = propios.Contains(mesEnCurso);
        }
        var ruta = idRuta is { } r ? await db.Rutas.AsNoTracking().FirstOrDefaultAsync(x => x.IdRuta == r, ct) : null;
        var vendedor = (propios is null ? ruta?.IdPersonal : idPersonal) is { } idp ? vendedores.GetValueOrDefault(idp)?.Nombre : null;

        var ultima = (await lectura.UltimasComprasAsync([idCliente], ct)).TryGetValue(idCliente, out var u) ? u : (DateOnly?)null;
        await lectura.RegistrarAsync("ficha", $"cliente={idCliente}", ct);
        return new FichaClienteDto(cliente.IdCliente, cliente.RazonSocial, enCartera, ruta?.Nombre, vendedor,
            DiasSemana.Describir(ruta?.DiasVisita), Lectura.Direccion(cliente), cliente.Lat, cliente.Lng,
            ultima, ultima is { } fu ? lectura.Hoy.DayNumber - fu.DayNumber : null, meses, estados,
            meses.Select(m => Bultos(m)).ToList(), articulos);
    }

    public async Task<VolumenClienteDto> VolumenAsync(int idCliente, DateOnly? mes, CancellationToken ct = default)
    {
        var (_, propios) = await lectura.ClienteVisibleAsync(idCliente, "ficha-volumen", ct);
        var c = await lectura.ComparacionAsync(mes, ct);
        var (actual, enBase) = await lectura.BultosComparadosAsync(c, [idCliente], null, ct);
        // Gobernanza: el mes o la base que no eran suyos van en null.
        var veActual = propios is null || propios.Contains(c.Mes);
        var veBase = propios is null || propios.Contains(c.MesBase);
        decimal? Suma(List<BultosMes> filas, bool ve, int? articulo = null)
            => ve ? Volumen.Redondear(filas.Where(b => articulo is null || b.IdArticulo == articulo).Sum(b => b.Netos)) : null;

        var ids = (veActual ? actual : []).Concat(veBase ? enBase : []).Select(b => b.IdArticulo).Distinct().ToList();
        var datos = await Detalle.ArticulosAsync(db, ids, ct);
        var articulos = ids.Select(id =>
            {
                var act = Suma(actual, veActual, id);
                var bas = Suma(enBase, veBase, id);
                return new ArticuloVolumenDto(id, Detalle.Descripcion(datos, id), datos.GetValueOrDefault(id)?.UnidadNegocio,
                    act, bas, act is { } x ? Volumen.Porcentaje(x, bas) : null);
            })
            .OrderBy(x => x.UnidadNegocio ?? "￿").ThenBy(x => x.Descripcion)
            .ToList();
        var totalActual = Suma(actual, veActual);
        var totalBase = Suma(enBase, veBase);
        await lectura.RegistrarAsync("ficha-volumen", $"cliente={idCliente};mes={c.Mes:yyyy-MM-dd}", ct);
        return new VolumenClienteDto(c, new TotalVolumenDto(totalActual, totalBase, Volumen.Esperado(c, totalBase),
            totalActual is { } t ? Volumen.Porcentaje(t, totalBase) : null), articulos);
    }

    public async Task<DevolucionesClienteDto> DevolucionesAsync(int idCliente, DateOnly? mesDesde, DateOnly? mesHasta,
        DateOnly? mes, CancellationToken ct = default)
    {
        var meses = lectura.Meses(mesDesde, mesHasta);
        var elegido = Calendario.Mes(mes ?? meses[^1]);
        if (!meses.Contains(elegido))
            throw new ValidacionException("mes", "Tiene que estar entre mesDesde y mesHasta.");
        var (_, propios) = await lectura.ClienteVisibleAsync(idCliente, "ficha-devoluciones", ct);
        bool Ve(DateOnly m) => propios is null || propios.Contains(m);

        var bultos = await lectura.BultosAsync(meses[0], Calendario.FinDeMes(meses[^1]), [idCliente], null, ct);
        var ventasHasta = await lectura.VentasHastaAsync(ct);
        var kpis = meses.Select(m => Detalle.Kpi(m, Ve(m) ? bultos.Where(b => b.Mes == m) : null, lectura.MesEnCurso, ventasHasta))
            .ToList();
        var delMes = Ve(elegido) ? bultos.Where(b => b.Mes == elegido).ToList() : [];
        var articulos = Detalle.Devueltos(delMes, await Detalle.ArticulosAsync(db, delMes.Select(b => b.IdArticulo), ct));
        await lectura.RegistrarAsync("ficha-devoluciones", $"cliente={idCliente};mes={elegido:yyyy-MM-dd}", ct);
        return new DevolucionesClienteDto(meses, kpis, elegido, articulos);
    }
}

public class RutaHoyService(ComercialDbContext db, Lectura lectura) : IRutaHoyService
{
    public async Task<IReadOnlyList<ClienteRutaHoyDto>> ClientesDelDiaAsync(int? vendedor, DateOnly? fecha, CancellationToken ct = default)
    {
        var dia = fecha ?? lectura.Hoy;
        var mirada = await lectura.MiradaAsync(vendedor, "ruta-hoy", ct);
        var mesEnCurso = lectura.MesEnCurso;
        DateOnly[] meses = [mesEnCurso.AddMonths(-1), mesEnCurso];
        var carteras = await lectura.CarterasAsync(mirada, meses.Where(m => m >= lectura.Op.PrimerMes), DiasSemana.DeFecha(dia), ct);
        if (!carteras.ContainsKey(meses[0]))
            carteras[meses[0]] = [];
        var hoy = carteras[mesEnCurso];
        var compras = await lectura.ComprasAsync(meses, null, ct);   // trae también el mes anterior a cada uno

        var ids = hoy.Keys.ToList();
        var clientes = await db.Clientes.AsNoTracking().Where(c => ids.Contains(c.IdCliente)).ToDictionaryAsync(c => c.IdCliente, ct);
        var rutas = await db.Rutas.AsNoTracking().ToDictionaryAsync(r => r.IdRuta, r => r.Nombre, ct);
        var ultimas = await lectura.UltimasComprasAsync(ids, ct);

        var filas = hoy.Values.Select(c =>
        {
            var (estados, dejo) = Cobertura.Estados(meses, mesEnCurso, lectura.Op.PrimerMes,
                m => carteras[m].ContainsKey(c.IdCliente), m => compras.Contains((c.IdCliente, m)));
            var cli = clientes.GetValueOrDefault(c.IdCliente);
            return (Orden: cli?.OrdenVisita ?? int.MaxValue, Dto: new ClienteRutaHoyDto(c.IdCliente,
                cli?.RazonSocial ?? $"Cliente {c.IdCliente}", rutas.GetValueOrDefault(c.IdRuta),
                cli is null ? null : Lectura.Direccion(cli), cli?.Lat, cli?.Lng, estados[^1], dejo,
                ultimas.TryGetValue(c.IdCliente, out var u) ? u : null));
        });

        await lectura.RegistrarAsync("ruta-hoy", $"vendedor={vendedor};fecha={dia:yyyy-MM-dd}", ct);
        return filas
            .OrderBy(x => x.Dto.DejoDeComprar ? 0 : x.Dto.EstadoMesActual == EstadoMes.SinCompraAun ? 1 : 2)
            .ThenBy(x => x.Orden).ThenBy(x => x.Dto.RazonSocial)
            .Select(x => x.Dto).ToList();
    }
}

public class ResumenService(Lectura lectura) : IResumenService
{
    public async Task<IReadOnlyList<ResumenVendedorDto>> PorVendedorAsync(DateOnly? mesDesde, DateOnly? mesHasta, CancellationToken ct = default)
    {
        var meses = lectura.Meses(mesDesde, mesHasta);
        var a = await lectura.AlcanceAsync(ct);
        if (a.Rol == RolApp.Operario)
        {
            await lectura.RegistrarAsync("resumen", null, ct, denegado: true);
            throw new AccesoDenegadoException("El resumen es para administradores y supervisores.");
        }
        var vendedores = await lectura.VendedoresAsync(ct);
        var mesRef = meses[^1];
        var mesAnterior = mesRef.AddMonths(-1);
        var todos = new Mirada(a.Vendedores, a.VeCasa, "", null);
        var carteras = await lectura.CarterasAsync(todos, meses.Append(mesAnterior), null, ct);
        var compras = await lectura.ComprasAsync(meses, null, ct);
        var ventasHasta = await lectura.VentasHastaAsync(ct);

        var resultado = new List<ResumenVendedorDto>();
        foreach (var op in SesionService.Opciones(a, vendedores))
        {
            // La casa junta a su vendedor y las rutas sin vendedor (como al elegirla en /cobertura).
            bool DeEste(CarteraMes c) => c.IdPersonal == op.Id || (op.EsCasa && c.IdPersonal is null);
            var suyas = carteras.ToDictionary(kv => kv.Key, kv => kv.Value.Values.Where(DeEste).ToDictionary(c => c.IdCliente));
            var dejaron = suyas[mesRef].Keys.Count(id => Cobertura.Estados(meses, lectura.MesEnCurso, lectura.Op.PrimerMes,
                m => suyas[m].ContainsKey(id), m => compras.Contains((id, m))).DejoDeComprar);
            var antes = suyas[mesAnterior].Keys.ToHashSet();
            var ahora = suyas[mesRef].Keys.ToHashSet();
            resultado.Add(new ResumenVendedorDto(op.Id, op.Nombre, op.EsCasa, lectura.Kpis(meses, suyas, compras, ventasHasta),
                dejaron, Altas: ahora.Count(id => !antes.Contains(id)), Bajas: antes.Count(id => !ahora.Contains(id))));
        }
        await lectura.RegistrarAsync("resumen", $"desde={mesDesde};hasta={mesHasta}", ct);
        return resultado;
    }
}

/// <summary>Comparar textos sin mayúsculas ni tildes.</summary>
public static class Texto
{
    public static string Normalizar(string? s) => ReglaCompra.NormalizarTipo(s);
}
