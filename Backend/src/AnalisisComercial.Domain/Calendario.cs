namespace AnalisisComercial.Domain;

/// <summary>Fechas de negocio en hora de Argentina, sin depender del reloj del servidor.</summary>
public static class Calendario
{
    public static readonly TimeZoneInfo Argentina = BuscarZona();

    private static TimeZoneInfo BuscarZona()
    {
        foreach (var id in new[] { "America/Argentina/Buenos_Aires", "Argentina Standard Time" })
            if (TimeZoneInfo.TryFindSystemTimeZoneById(id, out var zona))
                return zona;
        return TimeZoneInfo.CreateCustomTimeZone("ART", TimeSpan.FromHours(-3), "Argentina", "Argentina");
    }

    public static DateTimeOffset AhoraArgentina(TimeProvider reloj) => TimeZoneInfo.ConvertTime(reloj.GetUtcNow(), Argentina);

    public static DateOnly HoyArgentina(TimeProvider reloj) => DateOnly.FromDateTime(AhoraArgentina(reloj).DateTime);

    /// <summary>Día 1 del mes de la fecha.</summary>
    public static DateOnly Mes(DateOnly fecha) => new(fecha.Year, fecha.Month, 1);

    public static DateOnly FinDeMes(DateOnly mes) => Mes(mes).AddMonths(1).AddDays(-1);

    /// <summary>Los meses (día 1) de desde a hasta, inclusive. Vacío si desde &gt; hasta.</summary>
    public static IReadOnlyList<DateOnly> Meses(DateOnly desde, DateOnly hasta)
    {
        var lista = new List<DateOnly>();
        for (var m = Mes(desde); m <= Mes(hasta); m = m.AddMonths(1))
            lista.Add(m);
        return lista;
    }
}
