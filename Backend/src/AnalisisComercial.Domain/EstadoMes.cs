namespace AnalisisComercial.Domain;

/// <summary>Estado de un cliente en un mes. Es parte del contrato con el front (vive acá porque lo calcula el dominio).</summary>
public enum EstadoMes
{
    /// <summary>Compró al menos un artículo (de la unidad filtrada, si hay filtro).</summary>
    Compro,
    /// <summary>Mes cerrado, no compró y tampoco había comprado el mes anterior.</summary>
    NoCompro,
    /// <summary>Mes en curso y todavía no compró. Neutral: no es alarma.</summary>
    SinCompraAun,
    /// <summary>Mes cerrado, no compró y sí había comprado el mes anterior.</summary>
    DejoDeComprar,
    /// <summary>Ese mes no estaba en la cartera mirada: celda vacía.</summary>
    FueraDeCartera,
}

public static class ReglasEstado
{
    /// <param name="enCartera">Si ese mes era cliente de la cartera que se mira.</param>
    /// <param name="compro">Si compró ese mes.</param>
    /// <param name="mesEnCurso">Si el mes todavía no cerró.</param>
    /// <param name="comproMesAnterior">Si compró el mes anterior; null = no hay datos de ese mes.</param>
    public static EstadoMes Calcular(bool enCartera, bool compro, bool mesEnCurso, bool? comproMesAnterior)
    {
        if (!enCartera)
            return EstadoMes.FueraDeCartera;
        if (compro)
            return EstadoMes.Compro;
        if (mesEnCurso)
            return EstadoMes.SinCompraAun;
        return comproMesAnterior == true ? EstadoMes.DejoDeComprar : EstadoMes.NoCompro;
    }

    /// <summary>
    /// La marca «Dejó de comprar» de un cliente: el último mes cerrado quedó en <see cref="EstadoMes.DejoDeComprar"/>
    /// y, si el mes en curso está en la lista, todavía no volvió a comprar. Nunca se marca por el mes en curso solo.
    /// </summary>
    /// <param name="estados">Los estados del cliente, en orden de mes.</param>
    /// <param name="meses">Los meses, en el mismo orden.</param>
    /// <param name="mesEnCurso">El mes de hoy (día 1).</param>
    public static bool DejoDeComprar(IReadOnlyList<EstadoMes> estados, IReadOnlyList<DateOnly> meses, DateOnly mesEnCurso)
    {
        if (estados.Count != meses.Count)
            throw new ArgumentException("Estados y meses tienen que tener el mismo largo.");
        var iCerrado = -1;
        for (var i = meses.Count - 1; i >= 0; i--)
            if (meses[i] < mesEnCurso)
            {
                iCerrado = i;
                break;
            }
        if (iCerrado < 0 || estados[iCerrado] != EstadoMes.DejoDeComprar)
            return false;
        var iCurso = IndiceDe(meses, mesEnCurso);
        return iCurso < 0 || estados[iCurso] != EstadoMes.Compro;
    }

    private static int IndiceDe(IReadOnlyList<DateOnly> meses, DateOnly mes)
    {
        for (var i = 0; i < meses.Count; i++)
            if (meses[i] == mes)
                return i;
        return -1;
    }
}
