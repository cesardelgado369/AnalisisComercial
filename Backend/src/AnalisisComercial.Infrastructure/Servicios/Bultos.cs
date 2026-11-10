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
        await lectura.ExigirBultosAsync(ct);
        var elegida = Lectura.Comparativa(f.Comparacion);
        var mirada = await lectura.MiradaAsync(f.Vendedor, "volumen", ct);
        var c = await lectura.ComparacionAsync(f.Mes, ct, elegida);
        var a = await lectura.AlcanceAsync(ct);
        var grupo = await lectura.FiltroAbcAsync(f.Abc, c.Mes, ct);

        var carteras = await lectura.CarterasAsync(mirada, [c.Mes], f.Dia, ct);
        if (grupo is not null)
            await lectura.RecortarAbcAsync(carteras, grupo, ct);
        var cartera = carteras[c.Mes];
        var ids = cartera.Keys.ToList();
        var articulos = await lectura.ArticulosAsync(f.Unidad, f.Foco, ct);
        var (actual, enBase) = await lectura.BultosComparadosAsync(c, ids, articulos, ct);
        // Gobernanza: la base de un cliente cuenta solo si en el mes base era de la cartera de quien mira.
        IReadOnlySet<int>? conBase = a.EsAdmin
            ? null
            : (await lectura.PropiosAsync(ids, ct)).Where(x => x.Mes == c.MesBase).Select(x => x.IdCliente).ToHashSet();
        var sumaActual = actual.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));
        // Los íconos de lo que compró cada uno (Cesar, 10/11/2026), como en Devoluciones.
        var datos = await Detalle.ArticulosAsync(db, actual.Select(b => b.IdArticulo), ct);
        var porCliente = actual.ToLookup(b => b.IdCliente);
        var sumaBase = enBase.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));

        var nombres = await Detalle.NombresAsync(db, ids, ct);
        var rutas = await db.Rutas.AsNoTracking().ToDictionaryAsync(r => r.IdRuta, r => r.Nombre, ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        var abc = await lectura.AbcAsync(c.Mes, ct);
        var filas = cartera.Values.Select(k =>
        {
            var act = Volumen.Redondear(sumaActual.GetValueOrDefault(k.IdCliente));
            decimal? bas = conBase is null || conBase.Contains(k.IdCliente) ? Volumen.Redondear(sumaBase.GetValueOrDefault(k.IdCliente)) : null;
            var dto = new ClienteVolumenDto(k.IdCliente, nombres.GetValueOrDefault(k.IdCliente) ?? $"Cliente {k.IdCliente}",
                rutas.GetValueOrDefault(k.IdRuta), k.IdPersonal is { } p ? vendedores.GetValueOrDefault(p)?.Nombre : null,
                k.IdPersonal, act, bas, Volumen.Porcentaje(act, bas),
                Detalle.Iconos(porCliente[k.IdCliente].Select(b => (b.IdArticulo, b.Netos)), datos),
                abc is null ? null : GrupoAbc.De(abc, k.IdCliente));
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

        // Cobertura por grupo ABC (solo el Admin): sobre toda la cartera con los filtros, sin la búsqueda ni el chip.
        List<GrupoAbcDto>? grupos = null;
        if (abc is not null)
        {
            var compras = await lectura.ComprasAsync([c.Mes], articulos, ct);
            grupos = GrupoAbc.Grupos.Select(g =>
            {
                var delGrupo = filas.Where(x => x.Dto.Abc == g).ToList();
                var conCompra = delGrupo.Count(x => compras.Contains((x.Dto.IdCliente, c.Mes)));
                return new GrupoAbcDto(g, delGrupo.Count, conCompra, Cobertura.Porcentaje(conCompra, delGrupo.Count));
            }).ToList();
        }

        var lista = filas.Where(x => f.Chip == ChipVolumen.Todos || x.Chip == f.Chip).Select(x => x.Dto);
        if (Texto.Normalizar(f.Busqueda) is { Length: > 0 } b)
            lista = lista.Where(x => x.IdCliente.ToString(CultureInfo.InvariantCulture) == b || Texto.Normalizar(x.RazonSocial).Contains(b));

        await lectura.RegistrarAsync("volumen",
            $"vendedor={f.Vendedor};dia={f.Dia};unidad={f.Unidad};foco={f.Foco};abc={f.Abc};comparacion={f.Comparacion};chip={f.Chip};mes={c.Mes:yyyy-MM-dd}", ct);
        return new VolumenDto(mirada.Titulo, c, total, chips, Detalle.PorRazonSocial(lista, x => x.RazonSocial, x => x.IdCliente), grupos);
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
        await lectura.ExigirBultosAsync(ct);
        if (f.Dia is { } d && !DiasSemana.EsValido(d))
            throw new ValidacionException("dia", "Día inválido (2 lunes … 7 sábado).");
        var meses = await lectura.MesesAsync(f.MesDesde, f.MesHasta, ct);
        var mirada = await lectura.MiradaAsync(f.Vendedor, "devoluciones", ct);
        var grupo = await lectura.FiltroAbcAsync(f.Abc, meses[^1], ct);
        var carteras = await lectura.CarterasAsync(mirada, meses, f.Dia, ct);
        if (grupo is not null)
            await lectura.RecortarAbcAsync(carteras, grupo, ct);
        var ids = carteras.Values.SelectMany(x => x.Keys).Distinct().ToList();
        var filtro = await lectura.ArticulosAsync(f.Unidad, f.Foco, ct);
        var bultos = (await lectura.BultosAsync(meses[0], Calendario.FinDeMes(meses[^1]), ids, filtro, ct))
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
        var datos = await Detalle.ArticulosAsync(db, delMes.Select(b => b.IdArticulo), ct);
        var abc = await lectura.AbcAsync(mes, ct);
        // Los íconos debajo del devuelto (Cesar, 10/11/2026): las unidades que devolvió, de la que más a la que menos.
        IReadOnlyList<string> Unidades(int idCliente) => delMes.Where(b => b.IdCliente == idCliente && b.Devuelto > 0)
            .GroupBy(b => datos.GetValueOrDefault(b.IdArticulo)?.UnidadNegocio)
            .Where(g => g.Key is not null)
            .OrderByDescending(g => g.Sum(b => b.Devuelto)).ThenBy(g => g.Key, StringComparer.Ordinal)
            .Select(g => g.Key!)
            .ToList();
        // Cesar, 10/11: mejor el ícono de cada producto que el rubro. Empates: por descripción.
        IReadOnlyList<ArticuloIconoDto> Devueltos(int idCliente)
            => Detalle.Iconos(delMes.Where(b => b.IdCliente == idCliente).Select(b => (b.IdArticulo, b.Devuelto)), datos);
        var clientes = delMes.GroupBy(b => b.IdCliente)
            .Select(g => (Id: g.Key, Vendidos: Volumen.Redondear(g.Sum(b => b.Netos)), Devueltos: Volumen.Redondear(g.Sum(b => b.Devuelto))))
            .Where(x => x.Devueltos > 0)
            .Select(x =>
            {
                var k = cartera[x.Id];
                return new ClienteDevolucionDto(x.Id, nombres.GetValueOrDefault(x.Id) ?? $"Cliente {x.Id}",
                    rutas.GetValueOrDefault(k.IdRuta), k.IdPersonal is { } p ? vendedores.GetValueOrDefault(p)?.Nombre : null,
                    k.IdPersonal, x.Vendidos, x.Devueltos, Volumen.PorcentajeDevolucion(x.Vendidos, x.Devueltos), Unidades(x.Id), Devueltos(x.Id),
                    abc is null ? null : GrupoAbc.De(abc, x.Id));
            })
            .OrderByDescending(x => x.Porcentaje ?? decimal.MaxValue).ThenByDescending(x => x.BultosDevueltos).ThenBy(x => x.IdCliente)
            .ToList();
        var articulos = Detalle.Devueltos(delMes, datos);
        // Gobernanza (Cesar, 30/10): el operario ve los totales y los artículos solo en porcentaje; los bultos, por cliente.
        if ((await lectura.AlcanceAsync(ct)).Rol == RolApp.Operario)
        {
            kpis = kpis.Select(k => k with { BultosVendidos = null, BultosDevueltos = null }).ToList();
            articulos = articulos.Select(x => x with { BultosVendidos = null, BultosDevueltos = null }).ToList();
        }

        await lectura.RegistrarAsync("devoluciones",
            $"vendedor={f.Vendedor};dia={f.Dia};unidad={f.Unidad};foco={f.Foco};abc={f.Abc};desde={f.MesDesde};hasta={f.MesHasta}", ct);
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

    /// <summary>Los artículos con cantidad &gt; 0 (sumada por artículo), de más a menos; empates, por descripción.</summary>
    public static IReadOnlyList<ArticuloIconoDto> Iconos(IEnumerable<(int IdArticulo, decimal Cantidad)> filas, Dictionary<int, Articulo> datos)
        => filas.GroupBy(x => x.IdArticulo)
            .Select(g => (Dto: new ArticuloIconoDto(g.Key, Descripcion(datos, g.Key), datos.GetValueOrDefault(g.Key)?.UnidadNegocio),
                Cantidad: g.Sum(x => x.Cantidad)))
            .Where(x => x.Cantidad > 0)
            .OrderByDescending(x => x.Cantidad).ThenBy(x => x.Dto.Descripcion, StringComparer.Ordinal)
            .Select(x => x.Dto)
            .ToList();

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
