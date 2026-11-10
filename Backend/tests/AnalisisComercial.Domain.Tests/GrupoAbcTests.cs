using AnalisisComercial.Domain;

namespace AnalisisComercial.Domain.Tests;

public class GrupoAbcTests
{
    [Fact]
    public void A_hasta_el_80_B_hasta_el_95_y_el_que_cruza_queda_donde_empieza()
    {
        // Total 100: 50 (0 % antes) y 25 (50 %) son A; 10 (75 %) cruza el 80 y queda en A; 8 (85 %) y 4 (93 %) son B;
        // 3 (97 %) es C, igual que el que no compró y el de neto negativo.
        var g = GrupoAbc.Clasificar(new Dictionary<int, decimal>
        {
            [1] = 50, [2] = 25, [3] = 10, [4] = 8, [5] = 4, [6] = 3, [7] = 0, [8] = -2,
        });
        Assert.Equal(["A", "A", "A", "B", "B", "C", "C", "C"], Enumerable.Range(1, 8).Select(id => GrupoAbc.De(g, id)));
        Assert.Equal("C", GrupoAbc.De(g, 99));
    }

    [Fact]
    public void Los_empates_se_ordenan_por_cliente_y_sin_compras_no_hay_A()
    {
        var g = GrupoAbc.Clasificar(new Dictionary<int, decimal> { [20] = 1, [10] = 1, [30] = 1, [40] = 1, [50] = 1 });
        // 0, 20, 40, 60 % antes → A; 80 % antes → B.
        Assert.Equal(["A", "A", "A", "A", "B"], new[] { 10, 20, 30, 40, 50 }.Select(id => GrupoAbc.De(g, id)));
        Assert.Empty(GrupoAbc.Clasificar(new Dictionary<int, decimal> { [1] = 0 }));
    }

    [Fact]
    public void La_base_son_los_tres_meses_cerrados_anteriores_desde_el_primero_con_datos()
    {
        var julio = new DateOnly(2026, 7, 1);
        Assert.Equal([new(2026, 8, 1), new(2026, 9, 1), new(2026, 10, 1)], GrupoAbc.Base(new DateOnly(2026, 11, 15), julio));
        Assert.Equal([julio], GrupoAbc.Base(new DateOnly(2026, 8, 1), julio));
        Assert.Empty(GrupoAbc.Base(julio, julio));
    }
}
