using System.Globalization;
using System.Text;

namespace AnalisisComercial.Domain;

/// <summary>
/// Cuándo un cliente «compró» un artículo en un mes. Es el ÚNICO lugar donde vive la regla.
///
/// Regla vigente (26/10/2026, fijada con diag_ccc contra la Base CCC 20.10; a reconfirmar con la carga completa):
/// - Cuentan las líneas no anuladas de los documentos de <see cref="TiposFactura"/> (FACTURA y FACTURA CIERRE
///   CONSIG.). La FACTURA PRESUPUESTO no: la mitad de sus celdas no están en la Base CCC.
/// - Las notas de crédito (<see cref="TiposCredito"/>) del mismo mes restan cantidad: compró solo si la cantidad neta
///   queda &gt; 0. Neteando, el cruce celda por celda con la Base CCC da 99/99/98/95 % (jul–oct); sin netear, 95/94/92/87 %.
/// Chess manda la cantidad de un crédito en negativo; igual se resta el valor absoluto, por si cambia.
/// </summary>
public sealed class ReglaCompra
{
    public static readonly IReadOnlySet<string> FacturasPorDefecto = new HashSet<string>(StringComparer.Ordinal)
    {
        "FACTURA", "FACTURA CIERRE CONSIG.",
    };

    public static readonly IReadOnlySet<string> CreditosPorDefecto = new HashSet<string>(StringComparer.Ordinal)
    {
        "NOTA DE CREDITO",
    };

    public IReadOnlySet<string> TiposFactura { get; }
    public IReadOnlySet<string> TiposCredito { get; }
    public bool NetearCreditos { get; }

    public ReglaCompra(IEnumerable<string>? tiposFactura = null, bool netearCreditos = true, IEnumerable<string>? tiposCredito = null)
    {
        TiposFactura = tiposFactura is null ? FacturasPorDefecto : tiposFactura.Select(NormalizarTipo).ToHashSet(StringComparer.Ordinal);
        TiposCredito = tiposCredito is null ? CreditosPorDefecto : tiposCredito.Select(NormalizarTipo).ToHashSet(StringComparer.Ordinal);
        NetearCreditos = netearCreditos;
    }

    public static ReglaCompra PorDefecto { get; } = new();

    public bool EsFactura(string? tipoDocumento) => TiposFactura.Contains(NormalizarTipo(tipoDocumento));

    public bool EsCredito(string? tipoDocumento) => TiposCredito.Contains(NormalizarTipo(tipoDocumento));

    /// <summary>Evalúa las líneas de un mismo cliente × artículo × mes.</summary>
    public ResultadoCompra Evaluar(IEnumerable<VentaLinea> lineas)
    {
        decimal facturado = 0, acreditado = 0, neto = 0;
        var hayFactura = false;
        foreach (var l in lineas)
        {
            if (l.Anulado)
                continue;
            if (EsFactura(l.TipoDocumento))
            {
                facturado += l.CantidadTotal;
                neto += l.Neto;
                if (l.CantidadTotal > 0)
                    hayFactura = true;
            }
            else if (EsCredito(l.TipoDocumento))
            {
                acreditado += Math.Abs(l.CantidadTotal);
                neto -= Math.Abs(l.Neto);
            }
        }
        var cantidad = facturado - acreditado;
        var compro = NetearCreditos ? hayFactura && cantidad > 0 : hayFactura;
        return new ResultadoCompra(compro, cantidad, neto);
    }

    /// <summary>Mayúsculas, sin tildes ni espacios de más: "Nota de Crédito " → "NOTA DE CREDITO".</summary>
    public static string NormalizarTipo(string? tipo)
    {
        if (string.IsNullOrWhiteSpace(tipo))
            return "";
        var sb = new StringBuilder(tipo.Length);
        foreach (var c in tipo.Trim().Normalize(NormalizationForm.FormD))
            if (CharUnicodeInfo.GetUnicodeCategory(c) != UnicodeCategory.NonSpacingMark)
                sb.Append(c);
        return string.Join(' ', sb.ToString().ToUpperInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries));
    }
}

public readonly record struct ResultadoCompra(bool Compro, decimal Cantidad, decimal Neto);
