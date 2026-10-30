using AnalisisComercial.Infrastructure.Sincronizacion;

namespace AnalisisComercial.Infrastructure.Tests;

public class UnidadNegocioTests
{
    // La forma de eAgrupaciones de Chess (relevada el 26/10/2026; idAgrupacion viene como texto).
    private const string Tapas = """
        [ { "idFormaAgrupar": "DIVISION", "desFormaAgrupar": "DIVISION", "idArticulo": 11, "idAgrupacion": "1009", "desAgrupacion": "PASCUALINAS" },
          { "idFormaAgrupar": "FUERZA DE VENTA", "desFormaAgrupar": "FUERZA DE VENTA", "idArticulo": 11, "idAgrupacion": "1002", "desAgrupacion": "ESQUEMA UNICO" },
          { "idFormaAgrupar": "LINPRODU", "desFormaAgrupar": "LINEA DE PRODUCTO", "idArticulo": 11, "idAgrupacion": "1004", "desAgrupacion": "LINEA" },
          { "idFormaAgrupar": "UNIDAD DE NEGOCIO", "desFormaAgrupar": "UNIDAD DE NEGOCIO", "idArticulo": 11, "idAgrupacion": "1007", "desAgrupacion": "TAPAS" } ]
        """;

    [Fact]
    public void Sale_de_la_agrupacion_unidad_de_negocio() => Assert.Equal("TAPAS", UnidadNegocio.Desde(Tapas));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("""[{ "idFormaAgrupar": "DIVISION", "desAgrupacion": "QUESOS" }]""")]
    [InlineData("no es json")]
    public void Sin_esa_agrupacion_va_a_sin_unidad(string? json) => Assert.Equal(UnidadNegocio.SinAsociar, UnidadNegocio.Desde(json));
}
