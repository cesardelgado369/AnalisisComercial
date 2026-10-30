namespace AnalisisComercial.Domain;

/// <summary>
/// Cobertura: de la cartera de cada mes, quiénes compraron. Cada mes se mide con SU cartera (la foto de ese mes).
/// Acá no hay base: el servicio arma los hechos (en cartera, compró) y esto aplica las reglas.
/// </summary>
public static class Cobertura
{
    /// <summary>Los estados de un cliente en cada mes, más la marca «Dejó de comprar».</summary>
    /// <param name="meses">Los meses a mostrar (día 1, en orden).</param>
    /// <param name="mesEnCurso">El mes de hoy.</param>
    /// <param name="primerMesConDatos">Antes de este mes no hay ventas: no se sabe si compró.</param>
    /// <param name="enCartera">Si el cliente estaba ese mes en la cartera mirada.</param>
    /// <param name="compro">Si compró ese mes (según <see cref="ReglaCompra"/> y la unidad filtrada).</param>
    public static (IReadOnlyList<EstadoMes> Estados, bool DejoDeComprar) Estados(
        IReadOnlyList<DateOnly> meses, DateOnly mesEnCurso, DateOnly primerMesConDatos,
        Func<DateOnly, bool> enCartera, Func<DateOnly, bool> compro)
    {
        var estados = new EstadoMes[meses.Count];
        for (var i = 0; i < meses.Count; i++)
        {
            var mes = meses[i];
            var anterior = mes.AddMonths(-1);
            bool? comproAntes = anterior < primerMesConDatos ? null : compro(anterior);
            estados[i] = ReglasEstado.Calcular(enCartera(mes), compro(mes), mes >= mesEnCurso, comproAntes);
        }
        return (estados, ReglasEstado.DejoDeComprar(estados, meses, mesEnCurso));
    }

    /// <summary>Porcentaje de 0 a 100 con un decimal. Cartera vacía → 0.</summary>
    public static decimal Porcentaje(int conCompra, int cartera)
        => cartera == 0 ? 0 : Math.Round(100m * conCompra / cartera, 1, MidpointRounding.AwayFromZero);
}
