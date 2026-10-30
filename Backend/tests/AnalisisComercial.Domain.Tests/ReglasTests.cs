using AnalisisComercial.Domain;

namespace AnalisisComercial.Domain.Tests;

public class DiasSemanaTests
{
    [Theory]
    [InlineData("2,5", "2,5")]
    [InlineData("5,2,2", "2,5")]
    [InlineData(" 3 , 6 ", "3,6")]
    [InlineData("", "")]
    [InlineData(null, "")]
    [InlineData("2,9,x,0", "2")]
    public void Normaliza_los_dias_de_Chess(string? entrada, string esperado)
        => Assert.Equal(esperado, DiasSemana.Normalizar(entrada));

    [Theory]
    [InlineData("2", "Lunes")]
    [InlineData("2,5", "Lunes y jueves")]
    [InlineData("3,4,6", "Martes, miércoles y viernes")]
    [InlineData("2,3,4,5,6,7", "Lunes a sábado")]
    [InlineData("", "Sin día de visita")]
    public void Describe_los_dias(string dias, string esperado) => Assert.Equal(esperado, DiasSemana.Describir(dias));

    [Fact]
    public void El_codigo_de_una_fecha_es_el_de_Chess()
    {
        Assert.Equal(2, DiasSemana.DeFecha(new DateOnly(2026, 10, 26)));   // lunes
        Assert.Equal(7, DiasSemana.DeFecha(new DateOnly(2026, 10, 31)));   // sábado
        Assert.Equal(1, DiasSemana.DeFecha(new DateOnly(2026, 11, 1)));    // domingo
    }
}

public class ReglaCompraTests
{
    private static VentaLinea Linea(string tipo, decimal cantidad, decimal neto = 100, bool anulado = false)
        => new() { TipoDocumento = tipo, CantidadTotal = cantidad, Neto = neto, Anulado = anulado };

    [Theory]
    [InlineData("FACTURA")]
    [InlineData("FACTURA CIERRE CONSIG.")]
    [InlineData("  factura ")]
    public void Una_factura_con_cantidad_es_compra(string tipo)
        => Assert.True(ReglaCompra.PorDefecto.Evaluar([Linea(tipo, 3)]).Compro);

    [Fact]
    public void La_factura_presupuesto_no_cuenta_por_defecto_pero_se_puede_sumar()
    {
        Assert.False(ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA PRESUPUESTO", 3)]).Compro);
        Assert.True(new ReglaCompra(["FACTURA", "FACTURA PRESUPUESTO"]).Evaluar([Linea("FACTURA PRESUPUESTO", 3)]).Compro);
    }

    [Fact]
    public void Anulada_o_sin_cantidad_no_es_compra()
    {
        Assert.False(ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA", 3, anulado: true)]).Compro);
        Assert.False(ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA", 0)]).Compro);
    }

    [Fact]
    public void Una_nota_de_credito_sola_no_es_compra()
        => Assert.False(ReglaCompra.PorDefecto.Evaluar([Linea("NOTA DE CREDITO", -5)]).Compro);

    [Fact]
    public void La_nota_de_credito_resta_y_si_devuelve_todo_no_compro()
    {
        // Chess manda la cantidad del crédito en negativo; se resta igual con cualquier signo.
        var total = ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA", 2, 200), Linea("Nota de Crédito", -2, -200)]);
        Assert.False(total.Compro);
        Assert.Equal(0, total.Cantidad);
        Assert.Equal(0, total.Neto);
        Assert.True(ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA", 3), Linea("NOTA DE CREDITO", 1)]).Compro);
    }

    [Fact]
    public void La_devolucion_de_un_presupuesto_no_resta_de_las_facturas()
        => Assert.True(ReglaCompra.PorDefecto.Evaluar([Linea("FACTURA", 2), Linea("DEVOLUCION PRESUPUESTO", -2)]).Compro);

    [Fact]
    public void Sin_netear_la_nota_de_credito_no_quita_la_compra()
    {
        var r = new ReglaCompra(netearCreditos: false).Evaluar([Linea("FACTURA", 2, 200), Linea("NOTA DE CREDITO", -2, -200)]);
        Assert.True(r.Compro);
        Assert.Equal(0, r.Cantidad);
    }
}

public class SugerenciasTests
{
    private static readonly DateOnly Hoy = new(2026, 10, 26);

    private static (SugerenciaCliente?, string?) Sugerir(DateOnly? ultima, DateOnly? desde = null, DateOnly? dejo = null, bool excluido = false)
        => Sugerencias.Calcular(excluido, Hoy, ultima, desde ?? new DateOnly(2026, 7, 1), dejo, diasExcluir: 90, diasRevisar: 60);

    [Fact]
    public void Hace_mas_de_90_dias_que_no_compra_sugiere_excluir()
        => Assert.Equal((SugerenciaCliente.Excluir, "No compra hace 4 meses"), Sugerir(new DateOnly(2026, 6, 20)));

    [Fact]
    public void Nunca_compro_con_antiguedad_sugiere_excluir()
        => Assert.Equal((SugerenciaCliente.Excluir, "Nunca compró desde julio"), Sugerir(null));

    [Fact]
    public void Nunca_compro_pero_es_nuevo_en_la_cartera_no_sugiere_nada()
        => Assert.Equal((null, null), Sugerir(null, desde: new DateOnly(2026, 10, 1)));

    [Fact]
    public void Dejo_de_comprar_sugiere_revisar()
        => Assert.Equal((SugerenciaCliente.Revisar, "Dejó de comprar en septiembre"), Sugerir(new DateOnly(2026, 8, 10), dejo: new DateOnly(2026, 9, 1)));

    [Fact]
    public void Entre_60_y_89_dias_sugiere_revisar()
        => Assert.Equal((SugerenciaCliente.Revisar, "No compra hace 70 días"), Sugerir(new DateOnly(2026, 8, 17)));

    [Fact]
    public void Compra_seguido_o_ya_excluido_no_sugiere_nada()
    {
        Assert.Equal((null, null), Sugerir(new DateOnly(2026, 10, 20)));
        Assert.Equal((null, null), Sugerir(null, excluido: true));
    }
}

public class EstadosTests
{
    private static readonly DateOnly Jul = new(2026, 7, 1), Ago = new(2026, 8, 1), Sep = new(2026, 9, 1), Oct = new(2026, 10, 1);
    private static readonly DateOnly[] Meses = [Jul, Ago, Sep, Oct];

    private static (IReadOnlyList<EstadoMes> Estados, bool Dejo) Calcular(DateOnly[] compras, DateOnly[]? cartera = null)
        => Cobertura.Estados(Meses, mesEnCurso: Oct, primerMesConDatos: Jul,
            enCartera: m => cartera is null || cartera.Contains(m), compro: compras.Contains);

    [Fact]
    public void Compro_todos_los_meses()
    {
        var (e, dejo) = Calcular([Jul, Ago, Sep, Oct]);
        Assert.Equal([EstadoMes.Compro, EstadoMes.Compro, EstadoMes.Compro, EstadoMes.Compro], e);
        Assert.False(dejo);
    }

    [Fact]
    public void El_mes_en_curso_sin_compra_es_neutral_nunca_dejo_de_comprar()
    {
        var (e, dejo) = Calcular([Jul, Ago, Sep]);
        Assert.Equal(EstadoMes.SinCompraAun, e[3]);
        Assert.False(dejo);
    }

    [Fact]
    public void Dejo_de_comprar_en_el_ultimo_mes_cerrado()
    {
        var (e, dejo) = Calcular([Jul, Ago]);
        Assert.Equal([EstadoMes.Compro, EstadoMes.Compro, EstadoMes.DejoDeComprar, EstadoMes.SinCompraAun], e);
        Assert.True(dejo);
    }

    [Fact]
    public void Si_volvio_a_comprar_en_el_mes_en_curso_no_lleva_la_marca()
    {
        var (e, dejo) = Calcular([Ago, Oct]);
        Assert.Equal(EstadoMes.DejoDeComprar, e[2]);
        Assert.False(dejo);
    }

    [Fact]
    public void No_compro_dos_meses_seguidos_es_no_compro()
    {
        var (e, dejo) = Calcular([Jul]);
        Assert.Equal([EstadoMes.Compro, EstadoMes.DejoDeComprar, EstadoMes.NoCompro, EstadoMes.SinCompraAun], e);
        Assert.False(dejo);
    }

    [Fact]
    public void El_primer_mes_con_datos_no_puede_ser_dejo_de_comprar()
    {
        var (e, _) = Calcular([]);
        Assert.Equal(EstadoMes.NoCompro, e[0]);
    }

    [Fact]
    public void Fuera_de_cartera_aunque_haya_comprado()
    {
        var (e, _) = Calcular([Jul, Ago, Sep, Oct], cartera: [Sep, Oct]);
        Assert.Equal([EstadoMes.FueraDeCartera, EstadoMes.FueraDeCartera, EstadoMes.Compro, EstadoMes.Compro], e);
    }

    [Fact]
    public void Dejo_de_comprar_mira_la_compra_del_mes_anterior_aunque_no_estuviera_en_la_cartera()
    {
        var (e, dejo) = Calcular([Ago], cartera: [Sep, Oct]);
        Assert.Equal(EstadoMes.DejoDeComprar, e[2]);
        Assert.True(dejo);
    }

    [Fact]
    public void Con_rango_de_meses_cerrados_la_marca_es_la_del_ultimo()
    {
        DateOnly[] meses = [Jul, Ago, Sep];
        var (_, dejo) = Cobertura.Estados(meses, Oct, Jul, _ => true, m => m == Ago);
        Assert.True(dejo);
    }

    [Theory]
    [InlineData(162, 246, 65.9)]
    [InlineData(0, 0, 0)]
    [InlineData(1, 3, 33.3)]
    [InlineData(2, 3, 66.7)]
    public void Porcentaje_con_un_decimal(int conCompra, int cartera, decimal esperado)
        => Assert.Equal(esperado, Cobertura.Porcentaje(conCompra, cartera));
}
