using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;
using AnalisisComercial.Domain;

namespace AnalisisComercial.Infrastructure.Chess;

// Lo que se lee de Chess, ya traducido. Todo lo propio de Chess muere acá.

public record VendedorChess(int IdPersonal, string Nombre);

public record ClienteRutaChess(int IdCliente, string? RazonSocial, int? OrdenVisita);

/// <summary>Un período del cliente en una ruta (eClifuerza): sirve para reconstruir la cartera de meses pasados.</summary>
public record FuerzaChess(int IdRuta, DateOnly Desde, DateOnly Hasta, bool Anulado);

public record RutaChess(int IdRuta, string Nombre, int? IdPersonal, string DiasVisita, bool Anulado, DateOnly FechaDesde,
    DateOnly FechaHasta, IReadOnlyList<ClienteRutaChess> Clientes)
{
    /// <summary>Vigente = sin fecha de fin (9999-12-31) y no anulada. Con eso coinciden las 46 rutas del Excel.</summary>
    public bool Vigente => !Anulado && FechaHasta == ParserChess.SinFin;
}

public record ClienteChess(int IdCliente, string RazonSocial, string? Localidad, string? Calle, int? Altura, decimal? Lat,
    decimal? Lng, bool Anulado, DateOnly? FechaBaja, IReadOnlyList<FuerzaChess> Fuerzas);

public record ArticuloChess(int IdArticulo, string Descripcion, bool Anulado, string? AgrupacionesJson, decimal? UnidadesBulto = null);

/// <summary>Un lote de un endpoint paginado: las filas y, si Chess lo dice, cuántos lotes hay.</summary>
public record Lote<T>(IReadOnlyList<T> Filas, int? TotalLotes);

/// <summary>
/// Traduce las respuestas de Chess. Reglas (CONTEXTO_BACKEND §3.2): "" → null; números en-US (invariante);
/// booleanos como true/false o "SI"/"NO"; fechas yyyy-MM-dd con 9999-12-31 = sin fin; los errores vienen con HTTP 200
/// en un nodo <c>error</c>.
/// </summary>
public static partial class ParserChess
{
    public static readonly DateOnly SinFin = new(9999, 12, 31);

    // ---- errores y lotes

    /// <summary>Los mensajes del nodo <c>error</c> (vacío si no hay).</summary>
    public static IReadOnlyList<string> Errores(JsonElement raiz)
    {
        if (raiz.ValueKind != JsonValueKind.Object || !raiz.TryGetProperty("error", out var error))
            return [];
        var items = error.ValueKind == JsonValueKind.Array ? error.EnumerateArray().ToList() : [error];
        return items.Select(e => e.ValueKind == JsonValueKind.Object ? Texto(e, "mensaje") ?? e.ToString() : e.ToString())
            .Where(m => !string.IsNullOrWhiteSpace(m)).ToList();
    }

    /// <summary>«No se encontro informacion con los filtros ingresados»: no es una falla, es que no hay datos.</summary>
    public static bool EsSinDatos(string mensaje)
        => Sin(mensaje).Contains("NO SE ENCONTRO INFORMACION", StringComparison.Ordinal);

    /// <summary>"Numero de lote obtenido: 1/14. Cantidad de clientes totales: 1305" → 14.</summary>
    public static int? TotalLotes(string? texto)
    {
        if (string.IsNullOrWhiteSpace(texto))
            return null;
        var m = RegexLote().Match(texto);
        return m.Success && int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture) is > 0 and var n ? n : null;
    }

    [GeneratedRegex(@"lote\s+obtenido:\s*\d+\s*/\s*(\d+)", RegexOptions.IgnoreCase)]
    private static partial Regex RegexLote();

    // ---- endpoints

    public static IReadOnlyList<VendedorChess> Vendedores(JsonElement raiz)
        => Lista(raiz, "PersonalComercial", "ePersCom")
            .Select(e => new VendedorChess(Entero(e, "idPersonal") ?? 0, Texto(e, "desPersonal") ?? ""))
            .Where(v => v.IdPersonal > 0)
            .ToList();

    public static IReadOnlyList<RutaChess> Rutas(JsonElement raiz)
        => Lista(raiz, "RutasVenta", "eRutasVenta")
            .Select(e => new RutaChess(
                Entero(e, "idRuta") ?? 0,
                Texto(e, "desRuta") ?? "",
                Entero(e, "idPersonal") is > 0 and var p ? p : null,
                DiasSemana.Normalizar(Texto(e, "diasVisita")),
                Booleano(e, "anulado"),
                Fecha(e, "fechaDesde") ?? DateOnly.MinValue,
                Fecha(e, "fechaHasta") ?? SinFin,
                Arreglo(e, "eClientesRutas")
                    .Select(c => new ClienteRutaChess(Entero(c, "idCliente") ?? 0, Texto(c, "razonSocial"),
                        Entero(c, "intercalacionVisita")))
                    .Where(c => c.IdCliente > 0)
                    .ToList()))
            .Where(r => r.IdRuta > 0)
            .ToList();

    public static Lote<ClienteChess> Clientes(JsonElement raiz)
    {
        var filas = Lista(raiz, "Clientes", "eClientes").Select(e =>
        {
            var alias = Arreglo(e, "eClialias").FirstOrDefault();
            var nombre = alias.ValueKind == JsonValueKind.Object
                ? Texto(alias, "razonSocial") ?? Texto(alias, "fantasiaSocial")
                : null;
            var baja = Fecha(e, "fechaBaja");
            return new ClienteChess(
                Entero(e, "idCliente") ?? 0,
                nombre ?? $"Cliente {Entero(e, "idCliente")}",
                Texto(e, "desLocalidad"),
                Texto(e, "calle"),
                Entero(e, "altura") is > 0 and var a ? a : null,
                Coordenada(e, "latitudGeo", 90) ?? Coordenada(e, "latitudGeoEntrega", 90),
                Coordenada(e, "longitudGeo", 180) ?? Coordenada(e, "longitudGeoEntrega", 180),
                Booleano(e, "anulado"),
                baja == SinFin ? null : baja,
                Arreglo(e, "eClifuerza")
                    .Select(f => new FuerzaChess(Entero(f, "idRuta") ?? 0, Fecha(f, "fechaInicioFuerza") ?? DateOnly.MinValue,
                        Fecha(f, "fechaFinFuerza") ?? SinFin, Booleano(f, "anulado")))
                    .Where(f => f.IdRuta > 0)
                    .ToList());
        }).Where(c => c.IdCliente > 0).ToList();
        return new Lote<ClienteChess>(filas, TotalLotes(TextoRaiz(raiz, "cantClientes")));
    }

    public static IReadOnlyList<ArticuloChess> Articulos(JsonElement raiz)
        => Lista(raiz, "Articulos", "eArticulos")
            .Select(e => new ArticuloChess(
                Entero(e, "idArticulo") ?? 0,
                Texto(e, "desArticulo") ?? "",
                Booleano(e, "anulado"),
                e.TryGetProperty("eAgrupaciones", out var ag) && ag.ValueKind is JsonValueKind.Array or JsonValueKind.Object
                    ? ag.GetRawText()
                    : null,
                Numero(e, "unidadesBulto")))
            .Where(a => a.IdArticulo > 0)
            .ToList();

    /// <summary>ventas/ con detallado=true: una fila por línea de comprobante.</summary>
    public static Lote<VentaLinea> Ventas(JsonElement raiz)
    {
        var filas = Lista(raiz, "dsReporteComprobantesApi", "VentasResumen").Select(e => new VentaLinea
        {
            IdEmpresa = Entero(e, "idEmpresa") ?? 0,
            IdDocumento = Texto(e, "idDocumento") ?? "",
            Letra = Texto(e, "letra") ?? "",
            Serie = Entero(e, "serie") ?? 0,
            NroDoc = Largo(e, "nrodoc") ?? 0,
            IdLinea = Entero(e, "idLinea") ?? 0,
            Fecha = Fecha(e, "fechaComprobate") ?? DateOnly.MinValue,   // sic: así viene de Chess
            FechaEntrega = Fecha(e, "fechaEntrega"),
            IdCliente = Entero(e, "idCliente") ?? 0,
            IdArticulo = Entero(e, "idArticulo") ?? 0,
            IdVendedor = Entero(e, "idVendedor") ?? 0,
            TipoDocumento = Texto(e, "dsDocumento") ?? "",
            Anulado = Booleano(e, "anulado"),
            CantidadTotal = Numero(e, "cantidadesTotal") ?? 0,
            CantidadRechazo = Numero(e, "cantidadesRechazo") ?? 0,
            CantidadSinCargo = Numero(e, "cantidadesSinCargo") ?? 0,
            Kilos = Numero(e, "pesoTotal") ?? 0,
            Neto = Numero(e, "subtotalNeto") ?? 0,
            Final = Numero(e, "subtotalFinal") ?? 0,
        }).ToList();
        return new Lote<VentaLinea>(filas, TotalLotes(TextoRaiz(raiz, "cantComprobantesVentas")));
    }

    /// <summary>La clave única de una línea de venta.</summary>
    public static (int, string, string, int, long, int) Clave(VentaLinea l)
        => (l.IdEmpresa, l.IdDocumento, l.Letra, l.Serie, l.NroDoc, l.IdLinea);

    // ---- lectura de campos

    private static IEnumerable<JsonElement> Lista(JsonElement raiz, string nodo, string arreglo)
        => raiz.ValueKind == JsonValueKind.Object && raiz.TryGetProperty(nodo, out var n) ? Arreglo(n, arreglo) : [];

    private static IEnumerable<JsonElement> Arreglo(JsonElement e, string propiedad)
        => e.ValueKind == JsonValueKind.Object && e.TryGetProperty(propiedad, out var a) && a.ValueKind == JsonValueKind.Array
            ? a.EnumerateArray()
            : [];

    private static string? TextoRaiz(JsonElement raiz, string propiedad)
        => raiz.ValueKind == JsonValueKind.Object ? Texto(raiz, propiedad) : null;

    internal static string? Texto(JsonElement e, string propiedad)
    {
        if (!e.TryGetProperty(propiedad, out var v))
            return null;
        var s = v.ValueKind switch
        {
            JsonValueKind.String => v.GetString(),
            JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False => v.GetRawText(),
            _ => null,
        };
        s = s?.Trim();
        return string.IsNullOrEmpty(s) ? null : s;
    }

    internal static decimal? Numero(JsonElement e, string propiedad)
    {
        if (!e.TryGetProperty(propiedad, out var v))
            return null;
        if (v.ValueKind == JsonValueKind.Number)
            return v.TryGetDecimal(out var d) ? d : (decimal)v.GetDouble();
        var s = Texto(e, propiedad);
        return s is not null && decimal.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var r) ? r : null;
    }

    internal static int? Entero(JsonElement e, string propiedad)
        => Numero(e, propiedad) is { } d && d == decimal.Truncate(d) && d is >= int.MinValue and <= int.MaxValue ? (int)d : null;

    internal static long? Largo(JsonElement e, string propiedad)
        => Numero(e, propiedad) is { } d && d == decimal.Truncate(d) ? (long)d : null;

    /// <summary>true/false, "SI"/"NO", "S"/"N", 1/0. Sin dato → false.</summary>
    internal static bool Booleano(JsonElement e, string propiedad)
    {
        if (!e.TryGetProperty(propiedad, out var v))
            return false;
        return v.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.Number => v.TryGetInt32(out var n) && n != 0,
            JsonValueKind.String => Sin(v.GetString()) is "SI" or "S" or "TRUE" or "1",
            _ => false,
        };
    }

    internal static DateOnly? Fecha(JsonElement e, string propiedad)
    {
        var s = Texto(e, propiedad);
        return s is { Length: >= 10 } && DateOnly.TryParseExact(s[..10], "yyyy-MM-dd", CultureInfo.InvariantCulture,
            DateTimeStyles.None, out var f) ? f : null;
    }

    /// <summary>"0" o vacío → null. Si viene sin punto decimal ("-6518363") se corre la coma hasta que entra en rango.</summary>
    internal static decimal? Coordenada(JsonElement e, string propiedad, decimal maximo)
    {
        if (Numero(e, propiedad) is not { } v || v == 0)
            return null;
        while (Math.Abs(v) > maximo)
            v /= 10;
        return Math.Round(v, 6);
    }

    private static string Sin(string? s)
        => ReglaCompra.NormalizarTipo(s);
}
