using System.Globalization;

namespace AnalisisComercial.Domain;

public enum SugerenciaCliente
{
    /// <summary>Hace mucho que no compra (o nunca compró): candidato a excluir de la cartera.</summary>
    Excluir,
    /// <summary>Dejó de comprar hace poco: conviene mirarlo antes de que pase a excluir.</summary>
    Revisar,
}

/// <summary>
/// La sugerencia de estado de un cliente para la pantalla de clientes excluidos (pedido del usuario, 29/10/2026). Solo
/// sugiere: excluir lo decide el Admin. Los umbrales van en la configuración (Comercial:DiasSugerirExcluir y
/// Comercial:DiasSugerirRevisar).
/// </summary>
public static class Sugerencias
{
    private static readonly CultureInfo Es = CultureInfo.GetCultureInfo("es-AR");

    /// <param name="excluido">Ya está excluido: no se sugiere nada.</param>
    /// <param name="ultimaCompra">La última compra de cualquier fecha; null = nunca compró (desde que hay datos).</param>
    /// <param name="enCarteraDesde">El primer mes en que estuvo en una cartera; null = nunca estuvo.</param>
    /// <param name="mesDejoDeComprar">El último mes cerrado, si quedó en «dejó de comprar» y no volvió a comprar.</param>
    public static (SugerenciaCliente? Sugerencia, string? Motivo) Calcular(bool excluido, DateOnly hoy, DateOnly? ultimaCompra,
        DateOnly? enCarteraDesde, DateOnly? mesDejoDeComprar, int diasExcluir, int diasRevisar)
    {
        if (excluido)
            return (null, null);

        if (ultimaCompra is null)
        {
            // Nunca compró. Si recién entró a la cartera, todavía no es para excluir.
            if (enCarteraDesde is { } desde && hoy.DayNumber - desde.DayNumber >= diasExcluir)
                return (SugerenciaCliente.Excluir, $"Nunca compró desde {Mes(desde)}");
            return (null, null);
        }

        var dias = hoy.DayNumber - ultimaCompra.Value.DayNumber;
        if (dias >= diasExcluir)
            return (SugerenciaCliente.Excluir, $"No compra hace {Meses(dias)}");
        if (mesDejoDeComprar is { } mes)
            return (SugerenciaCliente.Revisar, $"Dejó de comprar en {Mes(mes)}");
        if (dias >= diasRevisar)
            return (SugerenciaCliente.Revisar, $"No compra hace {dias} días");
        return (null, null);
    }

    private static string Mes(DateOnly mes) => mes.ToString("MMMM", Es);

    private static string Meses(int dias) => (dias / 30) is var m && m <= 1 ? "un mes" : $"{m} meses";
}
