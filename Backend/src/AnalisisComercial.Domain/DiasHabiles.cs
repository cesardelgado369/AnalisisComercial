namespace AnalisisComercial.Domain;

/// <summary>
/// Días hábiles para comparar volumen (29/10/2026): lunes a sábado, porque las rutas visitan de lunes a sábado, sin los
/// feriados. La lista se configura (Comercial:Feriados); <see cref="FeriadosPorDefecto"/> trae los nacionales de 2026 y
/// 2027 (los trasladables movidos según la ley 27.399) y el 24/9, Batalla de Tucumán (feriado provincial: las rutas son
/// de Tucumán). Los «días no laborables» con fines turísticos no son feriados: cuentan como hábiles.
/// </summary>
public static class DiasHabiles
{
    public static readonly IReadOnlySet<DateOnly> FeriadosPorDefecto = new HashSet<DateOnly>
    {
        new(2026, 1, 1), new(2026, 2, 16), new(2026, 2, 17), new(2026, 3, 24), new(2026, 4, 2), new(2026, 4, 3),
        new(2026, 5, 1), new(2026, 5, 25), new(2026, 6, 15), new(2026, 6, 20), new(2026, 7, 9), new(2026, 8, 17),
        new(2026, 9, 24), new(2026, 10, 12), new(2026, 11, 23), new(2026, 12, 8), new(2026, 12, 25),
        // 2027: los trasladables calculados con la ley; confirmar con el calendario oficial cuando salga.
        new(2027, 1, 1), new(2027, 2, 8), new(2027, 2, 9), new(2027, 3, 24), new(2027, 3, 26), new(2027, 4, 2),
        new(2027, 5, 1), new(2027, 5, 25), new(2027, 6, 20), new(2027, 6, 21), new(2027, 7, 9), new(2027, 8, 16),
        new(2027, 9, 24), new(2027, 10, 11), new(2027, 11, 20), new(2027, 12, 8), new(2027, 12, 25),
    };

    public static bool EsHabil(DateOnly dia, IReadOnlySet<DateOnly> feriados)
        => dia.DayOfWeek != DayOfWeek.Sunday && !feriados.Contains(dia);

    /// <summary>Los días hábiles de desde a hasta, inclusive. 0 si desde &gt; hasta.</summary>
    public static int Contar(DateOnly desde, DateOnly hasta, IReadOnlySet<DateOnly> feriados)
    {
        var n = 0;
        for (var d = desde; d <= hasta; d = d.AddDays(1))
            if (EsHabil(d, feriados))
                n++;
        return n;
    }

    /// <summary>El día hábil número <paramref name="n"/> del mes (1 = el primero). Si el mes tiene menos, su último día.</summary>
    public static DateOnly Enesimo(DateOnly mes, int n, IReadOnlySet<DateOnly> feriados)
    {
        var fin = Calendario.FinDeMes(mes);
        var cuenta = 0;
        for (var d = Calendario.Mes(mes); d <= fin; d = d.AddDays(1))
            if (EsHabil(d, feriados) && ++cuenta == n)
                return d;
        return fin;
    }
}
