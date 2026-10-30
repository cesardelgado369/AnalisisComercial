using AnalisisComercial.Domain;

namespace AnalisisComercial.Domain.Tests;

public class VolumenTests
{
    private static readonly IReadOnlySet<DateOnly> Feriados = DiasHabiles.FeriadosPorDefecto;
    private static readonly DateOnly Oct = new(2026, 10, 1), Sep = new(2026, 9, 1);

    [Fact]
    public void Dias_habiles_de_lunes_a_sabado_sin_feriados()
    {
        Assert.False(DiasHabiles.EsHabil(new DateOnly(2026, 10, 25), Feriados));   // domingo
        Assert.True(DiasHabiles.EsHabil(new DateOnly(2026, 10, 24), Feriados));    // sábado
        Assert.False(DiasHabiles.EsHabil(new DateOnly(2026, 10, 12), Feriados));   // Diversidad Cultural
        Assert.False(DiasHabiles.EsHabil(new DateOnly(2026, 9, 24), Feriados));    // Batalla de Tucumán
        Assert.False(DiasHabiles.EsHabil(new DateOnly(2026, 11, 23), Feriados));   // Soberanía (trasladado del 20)
        Assert.Equal(26, DiasHabiles.Contar(Oct, new DateOnly(2026, 10, 31), Feriados));
        Assert.Equal(25, DiasHabiles.Contar(Sep, new DateOnly(2026, 9, 30), Feriados));
        Assert.Equal(new DateOnly(2026, 9, 23), DiasHabiles.Enesimo(Sep, 20, Feriados));
        Assert.Equal(new DateOnly(2026, 9, 30), DiasHabiles.Enesimo(Sep, 26, Feriados));   // septiembre tiene 25
    }

    [Fact]
    public void El_operario_compara_contra_el_mes_anterior_entero()
    {
        var c = Volumen.Comparar(Oct, TipoComparacion.MesAnteriorCompleto, new DateOnly(2026, 10, 25), Feriados);
        Assert.Equal((Sep, new DateOnly(2026, 10, 25), 20, 26, new DateOnly(2026, 9, 30)),
            (c.MesBase, c.CorteAl!.Value, c.DiaHabil, c.DiasHabilesMes, c.BaseHasta!.Value));
        Assert.Equal(76.92m, Volumen.Esperado(c, 100));   // el ritmo: 100 × 20 / 26
    }

    [Fact]
    public void El_admin_compara_contra_el_mismo_dia_habil()
    {
        var c = Volumen.Comparar(Oct, TipoComparacion.MismoDiaHabil, new DateOnly(2026, 10, 25), Feriados);
        Assert.Equal(new DateOnly(2026, 9, 23), c.BaseHasta);
        Assert.Equal(100m, Volumen.Esperado(c, 100));

        // Sin ningún día completo todavía: nada que comparar.
        var primero = Volumen.Comparar(Oct, TipoComparacion.MismoDiaHabil, new DateOnly(2026, 9, 30), Feriados);
        Assert.Equal((null, 0, null), (primero.CorteAl, primero.DiaHabil, primero.BaseHasta));
    }

    [Fact]
    public void Un_mes_cerrado_se_compara_entero()
    {
        var c = Volumen.Comparar(Sep, TipoComparacion.MismoDiaHabil, new DateOnly(2026, 10, 25), Feriados);
        Assert.Equal((TipoComparacion.MesAnteriorCompleto, new DateOnly(2026, 9, 30), new DateOnly(2026, 8, 31)),
            (c.Tipo, c.CorteAl!.Value, c.BaseHasta!.Value));
        Assert.Equal(c.DiasHabilesMes, c.DiaHabil);
    }

    [Theory]
    [InlineData(0.0, 10.0, 5.0, ChipVolumen.SinCompraAun)]
    [InlineData(3.0, 10.0, 5.0, ChipVolumen.Bajaron)]
    [InlineData(5.0, 10.0, 5.0, ChipVolumen.Subieron)]
    [InlineData(4.0, 0.0, 0.0, ChipVolumen.Subieron)]
    public void Cada_cliente_en_un_solo_chip(double actual, double bas, double esperado, ChipVolumen chip)
        => Assert.Equal(chip, Volumen.Chip((decimal)actual, (decimal)bas, (decimal)esperado));

    [Fact]
    public void Sin_base_es_nuevo_si_ya_compro()
    {
        Assert.Equal(ChipVolumen.Nuevos, Volumen.Chip(3, null, null));
        Assert.Equal(ChipVolumen.SinCompraAun, Volumen.Chip(0, null, null));
    }

    [Fact]
    public void Lo_que_se_retira_en_la_factura_es_devolucion()
    {
        // Entregó 10, retiró 2 en la misma factura y le hicieron una nota de crédito por 1.
        Assert.Equal((10m, 3m), Volumen.Repartir(10, 2, 1, negativasSonDevolucion: true));
        Assert.Equal((8m, 1m), Volumen.Repartir(10, 2, 1, negativasSonDevolucion: false));
        // Los netos no cambian: 7 de las dos maneras.
    }

    [Fact]
    public void Porcentajes()
    {
        Assert.Equal(82.0m, Volumen.Porcentaje(820, 1000));
        Assert.Null(Volumen.Porcentaje(5, 0));
        Assert.Null(Volumen.Porcentaje(5, null));
        Assert.Equal(20.0m, Volumen.PorcentajeDevolucion(4, 1));   // 1 / (4 + 1)
        Assert.Null(Volumen.PorcentajeDevolucion(0, 0));
    }
}
