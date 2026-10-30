using System.Text.Json;
using AnalisisComercial.Infrastructure.Chess;
using static AnalisisComercial.Infrastructure.Tests.RespuestasChess;

namespace AnalisisComercial.Infrastructure.Tests;

public class ParserChessTests
{
    private static JsonElement Json(string s) => JsonDocument.Parse(s).RootElement.Clone();

    [Fact]
    public void Vendedores()
    {
        var v = ParserChess.Vendedores(Json(Personal));
        Assert.Equal([1, 2, 6], v.Select(x => x.IdPersonal));
        Assert.Equal("VENDEDOR UNO", v[0].Nombre);
    }

    [Fact]
    public void Rutas_con_versiones_dias_normalizados_y_sin_vendedor()
    {
        var r = ParserChess.Rutas(Json(Rutas));
        Assert.Equal(6, r.Count);

        var vigente40 = Assert.Single(r, x => x.IdRuta == 40 && x.Vigente);
        Assert.Equal(1, vigente40.IdPersonal);
        Assert.Equal("2", vigente40.DiasVisita);   // venía "2,2"
        Assert.Equal([11, 10], vigente40.Clientes.OrderBy(c => c.OrdenVisita).Select(c => c.IdCliente));
        Assert.Equal("DESPENSA B", vigente40.Clientes.Single(c => c.IdCliente == 11).RazonSocial);

        Assert.False(r.Single(x => x.IdRuta == 40 && x.FechaHasta.Year < 9999).Vigente);
        Assert.Equal("2,5", r.Single(x => x.IdRuta == 300).DiasVisita);

        var sinVendedor = r.Single(x => x.IdRuta == 250);
        Assert.Null(sinVendedor.IdPersonal);
        Assert.Empty(sinVendedor.Clientes);   // venía sin eClientesRutas
        Assert.Equal("", sinVendedor.DiasVisita);
    }

    [Fact]
    public void Clientes_nombre_coordenadas_baja_y_lotes()
    {
        var lote = ParserChess.Clientes(Json(Clientes(1, 14, 10, 11, 99)));
        Assert.Equal(14, lote.TotalLotes);

        var c10 = lote.Filas.Single(c => c.IdCliente == 10);
        Assert.Equal("CLIENTE 10", c10.RazonSocial);
        Assert.Equal(-26.787739m, c10.Lat);
        Assert.Equal(-65.18363m, c10.Lng);
        Assert.Equal(1500, c10.Altura);
        Assert.Null(c10.FechaBaja);   // 9999-12-31 = sin baja
        Assert.False(c10.Anulado);

        var c11 = lote.Filas.Single(c => c.IdCliente == 11);
        Assert.Equal("DESPENSA B", c11.RazonSocial);   // razonSocial vacía → fantasía
        Assert.Equal(-26.78773m, c11.Lat);             // "0" → se usa la de entrega, que venía sin punto decimal
        Assert.Equal(-65.18363m, c11.Lng);
        Assert.Null(c11.Altura);                        // 0 = sin altura
        Assert.Equal(3, c11.Fuerzas.Count);
        Assert.Equal(43, c11.Fuerzas.Single(f => f.Hasta == ParserChess.SinFin).IdRuta);

        var c99 = lote.Filas.Single(c => c.IdCliente == 99);
        Assert.True(c99.Anulado);
        Assert.Equal(new DateOnly(2026, 8, 31), c99.FechaBaja);
        Assert.Null(c99.Localidad);   // "" → null
    }

    [Fact]
    public void Articulos_guardan_las_agrupaciones_crudas()
    {
        var a = ParserChess.Articulos(Json(Articulos));
        Assert.Contains("PASTAS FRESCAS", a.Single(x => x.IdArticulo == 101).AgrupacionesJson);
        Assert.True(a.Single(x => x.IdArticulo == 102).Anulado);
        Assert.Null(a.Single(x => x.IdArticulo == 102).AgrupacionesJson);
        Assert.Equal(12m, a.Single(x => x.IdArticulo == 101).UnidadesBulto);
    }

    [Fact]
    public void Ventas_detallado()
    {
        var lote = ParserChess.Ventas(Json(Ventas(1, 3,
            Linea(99, 1),
            Linea(99, 2, documento: "NOTA DE CREDITO", anulado: "SI", cantidad: "\"2.5\""))));
        Assert.Equal(3, lote.TotalLotes);
        var l1 = lote.Filas[0];
        Assert.Equal((1, "FCVTA", "A", 17, 99L, 1), ParserChess.Clave(l1));
        Assert.Equal(new DateOnly(2026, 10, 1), l1.Fecha);
        Assert.Null(l1.FechaEntrega);   // ""
        Assert.Equal(3m, l1.CantidadTotal);
        Assert.Equal(1m, l1.CantidadSinCargo);
        Assert.Equal(18.5m, l1.Kilos);
        Assert.Equal(12345.67m, l1.Neto);
        Assert.Equal(14938.26m, l1.Final);
        Assert.False(l1.Anulado);

        var l2 = lote.Filas[1];
        Assert.True(l2.Anulado);                 // "SI"
        Assert.Equal(2.5m, l2.CantidadTotal);    // número como texto en-US
        Assert.Equal("NOTA DE CREDITO", l2.TipoDocumento);
    }

    [Fact]
    public void Errores_con_HTTP_200()
    {
        Assert.Empty(ParserChess.Errores(Json(Personal)));
        var sinDatos = ParserChess.Errores(Json(SinDatos));
        Assert.True(ParserChess.EsSinDatos(Assert.Single(sinDatos)));
        Assert.False(ParserChess.EsSinDatos(Assert.Single(ParserChess.Errores(Json(ErrorFecha)))));
    }

    [Theory]
    [InlineData("Numero de lote obtenido: 1/14. Cantidad de clientes totales: 1305", 14)]
    [InlineData("Numero de lote obtenido: 2/3. Cantidad de comprobantes totales: 2097", 3)]
    [InlineData("", null)]
    [InlineData("algo raro", null)]
    public void Total_de_lotes(string texto, int? esperado) => Assert.Equal(esperado, ParserChess.TotalLotes(texto));

    [Fact]
    public void Una_respuesta_vacia_no_rompe_los_parsers()
    {
        Assert.Empty(ParserChess.Vendedores(default));
        Assert.Empty(ParserChess.Clientes(default).Filas);
        Assert.Empty(ParserChess.Ventas(default).Filas);
    }
}
