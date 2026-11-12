namespace AnalisisComercial.Domain;

/// <summary>Contra qué se compara el volumen de un mes (decisión de Cesar, 29/10/2026). Es parte del contrato.</summary>
public enum TipoComparacion
{
    /// <summary>El mes anterior entero, como meta (el operario; y todos cuando el mes ya cerró).</summary>
    MesAnteriorCompleto,
    /// <summary>El mes anterior hasta el mismo día hábil (admin y supervisor).</summary>
    MismoDiaHabil,
}

/// <summary>Los chips de /volumen. Cada cliente cae en uno solo (salvo Todos).</summary>
public enum ChipVolumen
{
    Todos,
    SinCompraAun,
    Nuevos,
    Bajaron,
    Subieron,
}

/// <param name="CorteAl">El último día completo con ventas dentro del mes; null si todavía no hay ninguno.</param>
/// <param name="DiaHabil">Días hábiles del 1 a <paramref name="CorteAl"/>.</param>
/// <param name="BaseHasta">Hasta qué día del mes base suma la base; null si no hay nada que comparar todavía.</param>
public sealed record Comparacion(TipoComparacion Tipo, DateOnly Mes, DateOnly MesBase, DateOnly? CorteAl, int DiaHabil,
    int DiasHabilesMes, DateOnly? BaseHasta);

/// <summary>
/// Volumen en bultos: la comparación de un mes contra su base, el ritmo esperado y los chips. Los bultos los arma el
/// servicio (netos: facturas menos notas de crédito, la regla de <see cref="ReglaCompra"/>).
/// </summary>
public static class Volumen
{
    /// <param name="mes">El mes que se mira (día 1).</param>
    /// <param name="tipo">La comparación del rol. Si el mes ya cerró, es siempre <see cref="TipoComparacion.MesAnteriorCompleto"/>.</param>
    /// <param name="ultimoDiaCompleto">El último día con las ventas completas (sin el de hoy); null si no hay ventas.</param>
    public static Comparacion Comparar(DateOnly mes, TipoComparacion tipo, DateOnly? ultimoDiaCompleto, IReadOnlySet<DateOnly> feriados)
    {
        mes = Calendario.Mes(mes);
        var fin = Calendario.FinDeMes(mes);
        var mesBase = mes.AddMonths(-1);
        DateOnly? corte = ultimoDiaCompleto is not { } u || u < mes ? null : u > fin ? fin : u;
        if (corte == fin)
            tipo = TipoComparacion.MesAnteriorCompleto;
        var diaHabil = corte is { } c ? DiasHabiles.Contar(mes, c, feriados) : 0;
        DateOnly? baseHasta = tipo == TipoComparacion.MesAnteriorCompleto ? Calendario.FinDeMes(mesBase)
            : diaHabil == 0 ? null
            : DiasHabiles.Enesimo(mesBase, diaHabil, feriados);
        return new Comparacion(tipo, mes, mesBase, corte, diaHabil, DiasHabiles.Contar(mes, fin, feriados), baseHasta);
    }

    /// <summary>Lo que debería llevar a esta altura: la base al mismo día hábil, o el ritmo del mes anterior entero.</summary>
    public static decimal? Esperado(Comparacion c, decimal? bultosBase)
    {
        if (bultosBase is not { } b)
            return null;
        if (c.Tipo == TipoComparacion.MismoDiaHabil || c.DiasHabilesMes == 0)
            return b;
        return Math.Round(b * c.DiaHabil / c.DiasHabilesMes, 2, MidpointRounding.AwayFromZero);
    }

    /// <summary>actual / base × 100, un decimal. null sin base o con base ≤ 0.</summary>
    public static decimal? Porcentaje(decimal actual, decimal? bultosBase)
        => bultosBase is { } b && b > 0 ? Math.Round(100m * actual / b, 1, MidpointRounding.AwayFromZero) : null;

    public static ChipVolumen Chip(decimal actual, decimal? bultosBase, decimal? esperado)
        => actual <= 0 ? ChipVolumen.SinCompraAun
            : bultosBase is null ? ChipVolumen.Nuevos
            : actual < esperado ? ChipVolumen.Bajaron
            : ChipVolumen.Subieron;

    /// <summary>
    /// Qué es devolución (12/11/2026, cruzado con el Pivot de octubre del dueño, que da igual al bulto): los
    /// <b>cambios</b>, las líneas con cantidad negativa dentro de las facturas (la mercadería que el vendedor le cambia
    /// al cliente). Las notas de crédito <b>no</b> son devolución: son mercadería que vuelve a la fábrica sin entregarse
    /// (Chess las marca como rechazo); restan de los netos, pero van aparte. Si no <paramref name="negativasSonDevolucion"/>,
    /// las líneas negativas solo restan de lo entregado. Los netos (entregado − devuelto − rechazado) dan lo mismo
    /// siempre.
    /// </summary>
    /// <param name="positivas">Las cantidades positivas de las facturas.</param>
    /// <param name="negativas">Las negativas de las facturas, en valor absoluto.</param>
    /// <param name="acreditado">Las de las notas de crédito, en valor absoluto.</param>
    public static (decimal Entregado, decimal Devuelto, decimal Rechazado) Repartir(decimal positivas, decimal negativas,
        decimal acreditado, bool negativasSonDevolucion)
        => negativasSonDevolucion ? (positivas, negativas, acreditado) : (positivas - negativas, 0, acreditado);

    /// <summary>
    /// El porcentaje de devolución como lo mira el dueño (su Pivot, 12/11/2026): cambios / bultos netos × 100, un
    /// decimal. null si no hay bultos netos.
    /// </summary>
    public static decimal? PorcentajeDevolucion(decimal vendidos, decimal devueltos)
        => vendidos > 0 ? Math.Round(100m * devueltos / vendidos, 1, MidpointRounding.AwayFromZero) : null;

    public static decimal Redondear(decimal bultos) => Math.Round(bultos, 2, MidpointRounding.AwayFromZero);
}
