using System.Text.Json;
using AnalisisComercial.Domain;

namespace AnalisisComercial.Infrastructure.Sincronizacion;

/// <summary>
/// La unidad de negocio de un artículo (PASTAS FRESCAS, TAPAS, ATM, COMIDAS CONGELADAS, PAN RALLADO1) es la
/// agrupación de forma «UNIDAD DE NEGOCIO» de eAgrupaciones (relevado con diag_ccc el 26/10/2026: 55 de 66 artículos la
/// tienen). Los que no la tienen (dulce de leche, quesos, salsas…) van a <see cref="SinAsociar"/>, como la web vieja.
/// Las agrupaciones se guardan crudas en Articulo.AgrupacionesJson y esto se vuelve a aplicar en cada sincronización.
/// </summary>
public static class UnidadNegocio
{
    public const string Forma = "UNIDAD DE NEGOCIO";
    public const string SinAsociar = "SIN UNIDAD DE NEGOCIO";

    public static string Desde(string? agrupacionesJson)
    {
        if (string.IsNullOrWhiteSpace(agrupacionesJson))
            return SinAsociar;
        try
        {
            using var doc = JsonDocument.Parse(agrupacionesJson);
            var items = doc.RootElement.ValueKind == JsonValueKind.Array ? doc.RootElement.EnumerateArray().ToList() : [doc.RootElement];
            foreach (var g in items.Where(g => g.ValueKind == JsonValueKind.Object))
            {
                var forma = Texto(g, "idFormaAgrupar") ?? Texto(g, "desFormaAgrupar");
                if (ReglaCompra.NormalizarTipo(forma) == Forma && Texto(g, "desAgrupacion") is { } unidad)
                    return unidad;
            }
        }
        catch (JsonException)
        {
        }
        return SinAsociar;
    }

    private static string? Texto(JsonElement e, string propiedad)
        => e.TryGetProperty(propiedad, out var v) && v.ValueKind == JsonValueKind.String && v.GetString()?.Trim() is { Length: > 0 } s
            ? s
            : null;
}
