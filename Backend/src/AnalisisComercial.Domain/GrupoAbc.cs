namespace AnalisisComercial.Domain;

/// <summary>
/// La clasificación ABC de los clientes (Cesar, 10/11/2026; como el Grupo ABC de De Ruta): los bultos netos de cada
/// cliente en los <see cref="MesesBase"/> meses cerrados anteriores al que se mira, de mayor a menor, acumulando el
/// porcentaje del total de Madomi. A hasta el 80 %, B hasta el 95 %, C el resto y los que no compraron. El que cruza un
/// corte queda en el grupo donde empieza. Es del cliente, no del vendedor: la misma para toda la base.
/// </summary>
public static class GrupoAbc
{
    public const string A = "A";
    public const string B = "B";
    public const string C = "C";
    public static readonly IReadOnlyList<string> Grupos = [A, B, C];

    public const int MesesBase = 3;
    public const decimal CorteA = 0.80m;
    public const decimal CorteB = 0.95m;

    /// <summary>Los meses de la base de <paramref name="mes"/>, recortados a <paramref name="primerMes"/>. Vacío = sin base.</summary>
    public static IReadOnlyList<DateOnly> Base(DateOnly mes, DateOnly primerMes)
    {
        mes = Calendario.Mes(mes);
        var desde = mes.AddMonths(-MesesBase) is var d && d < primerMes ? primerMes : d;
        return desde >= mes ? [] : Calendario.Meses(desde, mes.AddMonths(-1));
    }

    /// <summary>
    /// El grupo de los clientes A y B (los demás son C). Empates: por id de cliente, para que el resultado no dependa del
    /// orden en que vienen.
    /// </summary>
    public static Dictionary<int, string> Clasificar(IReadOnlyDictionary<int, decimal> netosPorCliente)
    {
        var positivos = netosPorCliente.Where(x => x.Value > 0).OrderByDescending(x => x.Value).ThenBy(x => x.Key).ToList();
        var total = positivos.Sum(x => x.Value);
        var grupos = new Dictionary<int, string>();
        decimal acumulado = 0;
        foreach (var (cliente, netos) in positivos)
        {
            var antes = acumulado / total;
            if (antes >= CorteB)
                break;
            grupos[cliente] = antes < CorteA ? A : B;
            acumulado += netos;
        }
        return grupos;
    }

    public static string De(IReadOnlyDictionary<int, string> grupos, int idCliente) => grupos.GetValueOrDefault(idCliente, C);
}
