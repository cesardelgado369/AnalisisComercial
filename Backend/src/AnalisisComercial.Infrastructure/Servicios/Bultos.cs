using System.Globalization;
using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Infrastructure.Servicios;

/// <summary>
/// Volumen en bultos (fase 2, 29/10/2026): lo que lleva cada cliente del mes contra la base de su rol. La cartera es
/// la de la mirada (como Cobertura); la gobernanza deja la base en null si el cliente no era de quien mira.
/// </summary>
public class VolumenService(ComercialDbContext db, Lectura lectura) : IVolumenService
{
    public async Task<VolumenDto> ObtenerAsync(FiltroVolumen f, CancellationToken ct = default)
    {
        if (f.Dia is { } d && !DiasSemana.EsValido(d))
            throw new ValidacionException("dia", "Día inválido (2 lunes … 7 sábado).");
        var mirada = await lectura.MiradaAsync(f.Vendedor, "volumen", ct);
        var c = await lectura.ComparacionAsync(f.Mes, ct);
        var a = await lectura.AlcanceAsync(ct);

        var cartera = (await lectura.CarterasAsync(mirada, [c.Mes], f.Dia, ct))[c.Mes];
        var ids = cartera.Keys.ToList();
        var (actual, enBase) = await lectura.BultosComparadosAsync(c, ids, f.Unidad, ct);
        // Gobernanza: la base de un cliente cuenta solo si en el mes base era de la cartera de quien mira.
        IReadOnlySet<int>? conBase = a.EsAdmin
            ? null
            : (await lectura.PropiosAsync(ids, ct)).Where(x => x.Mes == c.MesBase).Select(x => x.IdCliente).ToHashSet();
        var sumaActual = actual.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));
        var sumaBase = enBase.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));

        var nombres = await Detalle.NombresAsync(db, ids, ct);
        var rutas = await db.Rutas.AsNoTracking().ToDictionaryAsync(r => r.IdRuta, r => r.Nombre, ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        var filas = cartera.Values.Select(k =>
        {
            var act = Volumen.Redondear(sumaActual.GetValueOrDefault(k.IdCliente));
            decimal? bas = conBase is null || conBase.Contains(k.IdCliente) ? Volumen.Redondear(sumaBase.GetValueOrDefault(k.IdCliente)) : null;
            var dto = new ClienteVolumenDto(k.IdCliente, nombres.GetValueOrDefault(k.IdCliente) ?? $"Cliente {k.IdCliente}",
                rutas.GetValueOrDefault(k.IdRuta), k.IdPersonal is { } p ? vendedores.GetValueOrDefault(p)?.Nombre : null,
                k.IdPersonal, act, bas, Volumen.Porcentaje(act, bas));
            return (Dto: dto, Chip: Volumen.Chip(act, bas, Volumen.Esperado(c, bas)));
        }).ToList();

        var totalActual = Volumen.Redondear(filas.Sum(x => x.Dto.BultosActual));
        var bases = filas.Where(x => x.Dto.BultosBase is not null).ToList();
        decimal? totalBase = bases.Count == 0 ? null : Volumen.Redondear(bases.Sum(x => x.Dto.BultosBase!.Value));
        // Gobernanza (Cesar, 30/10): el operario ve los totales solo en porcentaje; los bultos, por cliente.
        var total = a.Rol == RolApp.Operario
            ? new TotalVolumenDto(null, null, null, Volumen.Porcentaje(totalActual, totalBase))
            : new TotalVolumenDto(totalActual, totalBase, Volumen.Esperado(c, totalBase), Volumen.Porcentaje(totalActual, totalBase));
        int Cuantos(ChipVolumen chip) => filas.Count(x => x.Chip == chip);
        var chips = new ChipsVolumenDto(filas.Count, Cuantos(ChipVolumen.SinCompraAun), Cuantos(ChipVolumen.Nuevos),
            Cuantos(ChipVolumen.Bajaron), Cuantos(ChipVolumen.Subieron));

        var lista = filas.Where(x => f.Chip == ChipVolumen.Todos || x.Chip == f.Chip).Select(x => x.Dto);
        if (Texto.Normalizar(f.Busqueda) is { Length: > 0 } b)
            lista = lista.Where(x => x.IdCliente.ToString(CultureInfo.InvariantCulture) == b || Texto.Normalizar(x.RazonSocial).Contains(b));

        await lectura.RegistrarAsync("volumen",
            $"vendedor={f.Vendedor};dia={f.Dia};unidad={f.Unidad};chip={f.Chip};mes={c.Mes:yyyy-MM-dd}", ct);
        return new VolumenDto(mirada.Titulo, c, total, chips, Detalle.PorRazonSocial(lista, x => x.RazonSocial, x => x.IdCliente));
    }
}

/// <summary>
/// Devoluciones en bultos (fase 2): por mes con la cartera de cada mes, y el detalle de clientes y artículos de mesHasta.
/// Solo cuentan los (cliente, mes) de la cartera mirada: para operario y supervisor, eso ya es la gobernanza.
/// </summary>
public class DevolucionesService(ComercialDbContext db, Lectura lectura) : IDevolucionesService
{
    public async Task<DevolucionesDto> ObtenerAsync(FiltroDevoluciones f, CancellationToken ct = default)
    {
        if (f.Dia is { } d && !DiasSemana.EsValido(d))
            throw new ValidacionException("dia", "Día inválido (2 lunes … 7 sábado).");
        var meses = await lectura.MesesAsync(f.MesDesde, f.MesHasta, ct);
        var mirada = await lectura.MiradaAsync(f.Vendedor, "devoluciones", ct);
        var carteras = await lectura.CarterasAsync(mirada, meses, f.Dia, ct);
        var ids = carteras.Values.SelectMany(x => x.Keys).Distinct().ToList();
        var bultos = (await lectura.BultosAsync(meses[0], Calendario.FinDeMes(meses[^1]), ids, f.Unidad, ct))
            .Where(b => carteras[b.Mes].ContainsKey(b.IdCliente))
            .ToList();
        var ventasHasta = await lectura.VentasHastaAsync(ct);
        var kpis = meses.Select(m => Detalle.Kpi(m, bultos.Where(b => b.Mes == m), lectura.MesEnCurso, ventasHasta)).ToList();

        var mes = meses[^1];
        var cartera = carteras[mes];
        var delMes = bultos.Where(b => b.Mes == mes).ToList();
        var nombres = await Detalle.NombresAsync(db, delMes.Select(b => b.IdCliente).Distinct().ToList(), ct);
        var rutas = await db.Rutas.AsNoTracking().ToDictionaryAsync(r => r.IdRuta, r => r.Nombre, ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        var clientes = delMes.GroupBy(b => b.IdCliente)
            .Select(g => (Id: g.Key, Vendidos: Volumen.Redondear(g.Sum(b => b.Netos)), Devueltos: Volumen.Redondear(g.Sum(b => b.Devuelto))))
            .Where(x => x.Devueltos > 0)
            .Select(x =>
            {
                var k = cartera[x.Id];
                return new ClienteDevolucionDto(x.Id, nombres.GetValueOrDefault(x.Id) ?? $"Cliente {x.Id}",
                    rutas.GetValueOrDefault(k.IdRuta), k.IdPersonal is { } p ? vendedores.GetValueOrDefault(p)?.Nombre : null,
                    k.IdPersonal, x.Vendidos, x.Devueltos, Volumen.PorcentajeDevolucion(x.Vendidos, x.Devueltos));
            })
            .OrderByDescending(x => x.Porcentaje ?? decimal.MaxValue).ThenByDescending(x => x.BultosDevueltos).ThenBy(x => x.IdCliente)
            .ToList();
        var articulos = Detalle.Devueltos(delMes, await Detalle.ArticulosAsync(db, delMes.Select(b => b.IdArticulo), ct));
        // Gobernanza (Cesar, 30/10): el operario ve los totales y los artículos solo en porcentaje; los bultos, por cliente.
        if ((await lectura.AlcanceAsync(ct)).Rol == RolApp.Operario)
        {
            kpis = kpis.Select(k => k with { BultosVendidos = null, BultosDevueltos = null }).ToList();
            articulos = articulos.Select(x => x with { BultosVendidos = null, BultosDevueltos = null }).ToList();
        }

        await lectura.RegistrarAsync("devoluciones",
            $"vendedor={f.Vendedor};dia={f.Dia};unidad={f.Unidad};desde={f.MesDesde};hasta={f.MesHasta}", ct);
        return new DevolucionesDto(mirada.Titulo, meses, kpis, mes, clientes, articulos);
    }
}

/// <summary>Piezas compartidas por Volumen, Devoluciones y las pestañas de la ficha.</summary>
internal static class Detalle
{
    private static readonly StringComparer Orden = StringComparer.Create(CultureInfo.GetCultureInfo("es-AR"), true);

    public static async Task<Dictionary<int, Articulo>> ArticulosAsync(ComercialDbContext db, IEnumerable<int> ids, CancellationToken ct)
    {
        var lista = ids.Distinct().ToList();
        return await db.Articulos.AsNoTracking().Where(a => lista.Contains(a.IdArticulo)).ToDictionaryAsync(a => a.IdArticulo, ct);
    }

    public static string Descripcion(Dictionary<int, Articulo> datos, int id)
        => datos.GetValueOrDefault(id)?.Descripcion ?? $"Artículo {id}";

    public static Task<Dictionary<int, string>> NombresAsync(ComercialDbContext db, List<int> ids, CancellationToken ct)
        => db.Clientes.AsNoTracking().Where(c => ids.Contains(c.IdCliente)).ToDictionaryAsync(c => c.IdCliente, c => c.RazonSocial, ct);

    public static List<T> PorRazonSocial<T>(IEnumerable<T> filas, Func<T, string> razonSocial, Func<T, int> id)
        => filas.OrderBy(razonSocial, Orden).ThenBy(id).ToList();

    /// <summary>El KPI de devoluciones de un mes. Sin filas (null): fuera de la cartera de quien mira.</summary>
    public static KpiDevolucionDto Kpi(DateOnly mes, IEnumerable<BultosMes>? filas, DateOnly mesEnCurso, DateOnly? ventasHasta)
    {
        var enCurso = mes >= mesEnCurso;
        var corte = enCurso ? ventasHasta : null;
        if (filas is null)
            return new KpiDevolucionDto(mes, null, null, null, enCurso, corte);
        var lista = filas.ToList();
        var vendidos = Volumen.Redondear(lista.Sum(b => b.Netos));
        var devueltos = Volumen.Redondear(lista.Sum(b => b.Devuelto));
        return new KpiDevolucionDto(mes, vendidos, devueltos, Volumen.PorcentajeDevolucion(vendidos, devueltos), enCurso, corte);
    }

    /// <summary>Los artículos con devoluciones, de más a menos bultos devueltos.</summary>
    public static List<ArticuloDevolucionDto> Devueltos(IEnumerable<BultosMes> filas, Dictionary<int, Articulo> datos)
        => filas.GroupBy(b => b.IdArticulo)
            .Select(g => (Id: g.Key, Vendidos: Volumen.Redondear(g.Sum(b => b.Netos)), Devueltos: Volumen.Redondear(g.Sum(b => b.Devuelto))))
            .Where(x => x.Devueltos > 0)
            .Select(x => new ArticuloDevolucionDto(x.Id, Descripcion(datos, x.Id), datos.GetValueOrDefault(x.Id)?.UnidadNegocio,
                x.Vendidos, x.Devueltos, Volumen.PorcentajeDevolucion(x.Vendidos, x.Devueltos)))
            .OrderByDescending(x => x.BultosDevueltos).ThenBy(x => x.Descripcion, Orden)
            .ToList();
}
