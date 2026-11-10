using System.Net;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Fase 2 (29/10/2026): la gobernanza de datos (operario y supervisor ven un cliente solo en los meses en que fue de su
/// cartera), Volumen y Devoluciones en bultos, y las pestañas de la ficha. Datos del Entorno.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class FaseDosTests(Entorno e)
{
    private static string[] Textos(JsonNode? lista) => lista!.AsArray().Select(x => (string)x!).ToArray();
    private static decimal?[] Numeros(JsonNode? lista) => lista!.AsArray().Select(x => (decimal?)x).ToArray();
    private static JsonNode Fila(JsonNode r, int id) => r["clientes"]!.AsArray().Single(x => (int)x!["idCliente"]! == id)!;

    // ---- gobernanza

    [Fact]
    public async Task Un_mes_de_otro_vendedor_no_da_dejo_de_comprar()
    {
        // 103: en agosto era de DOS y compró; en septiembre pasó a UNO y no compró.
        var c = await e.Operario().JsonAsync("/api/cobertura?mesHasta=2026-09-01");
        Assert.Equal(["fueraDeCartera", "fueraDeCartera", "noCompro"], Textos(Fila(c, 103)["meses"]));
        Assert.False((bool)Fila(c, 103)["dejoDeComprar"]!);
        Assert.Equal(0, (int)c["chips"]!["dejaronDeComprar"]!);

        // El admin ve todo: para él sí dejó de comprar.
        var admin = await e.Admin().JsonAsync("/api/cobertura?vendedor=1&mesHasta=2026-09-01");
        Assert.Equal(["fueraDeCartera", "fueraDeCartera", "dejoDeComprar"], Textos(Fila(admin, 103)["meses"]));
        Assert.True((bool)Fila(admin, 103)["dejoDeComprar"]!);

        var f = await e.Operario().JsonAsync("/api/clientes/103?mesHasta=2026-09-01");
        Assert.Equal(["fueraDeCartera", "fueraDeCartera", "noCompro"], Textos(f["estados"]));
        Assert.Null(f["ultimaCompra"]);   // compró en agosto, cuando era de DOS
        Assert.Equal("2026-08-20", (string?)(await e.Admin().JsonAsync("/api/clientes/103"))["ultimaCompra"]);
    }

    [Fact]
    public async Task La_ficha_muestra_solo_los_meses_de_su_cartera()
    {
        // 102 fue de DOS hasta septiembre y es de UNO desde octubre.
        var uno = await e.Operario().JsonAsync("/api/clientes/102");
        Assert.Equal(["fueraDeCartera", "fueraDeCartera", "fueraDeCartera", "sinCompraAun"], Textos(uno["estados"]));
        Assert.Equal([null, null, null, 0m], Numeros(uno["bultos"]));
        Assert.Empty(uno["articulos"]!.AsArray());   // compró solo cuando era de DOS
        Assert.Null(uno["ultimaCompra"]);
        Assert.Null(uno["diasSinComprar"]);
        Assert.True((bool)uno["enCartera"]!);
        Assert.Equal(("RUTA UNO", "VENDEDOR UNO"), ((string?)uno["ruta"], (string?)uno["vendedor"]));

        // DOS la abre aunque hoy sea de UNO: ve sus meses, con su ruta y su nombre, nunca los de UNO.
        var dos = await e.Supervisor().JsonAsync("/api/clientes/102");
        Assert.Equal(["fueraDeCartera", "compro", "compro", "fueraDeCartera"], Textos(dos["estados"]));
        Assert.Equal([null, 2m, 2m, null], Numeros(dos["bultos"]));
        Assert.Equal("2026-09-15", (string?)dos["ultimaCompra"]);
        Assert.False((bool)dos["enCartera"]!);
        Assert.Equal(("RUTA DOS", "VENDEDOR DOS"), ((string?)dos["ruta"], (string?)dos["vendedor"]));
        var art = dos["articulos"]!.AsArray().Single()!;
        Assert.Equal([false, true, true, false], art["meses"]!.AsArray().Select(x => (bool)x!));
        Assert.Equal([null, 2m, 2m, null], Numeros(art["bultos"]));

        // 101 siempre fue de UNO: julio no estaba en ninguna cartera; septiembre neto de la nota de crédito y octubre
        // neto de lo que retiró en la misma factura.
        var f = await e.Operario().JsonAsync("/api/clientes/101");
        Assert.Equal([null, 0m, 4m, 1m], Numeros(f["bultos"]));
        Assert.Equal([null, 0m, 4m, 1m], Numeros(f["articulos"]![0]!["bultos"]));
    }

    [Fact]
    public async Task Ruta_de_hoy_sin_la_ultima_compra_de_otro_vendedor()
    {
        var r = (await e.Operario().JsonAsync("/api/ruta-hoy")).AsArray().ToDictionary(x => (int)x!["idCliente"]!);
        Assert.Null(r[102]!["ultimaCompra"]);
        Assert.Equal("2026-10-20", (string?)r[101]!["ultimaCompra"]);
    }

    [Fact]
    public async Task Las_pestanias_de_la_ficha_respetan_el_alcance()
    {
        await e.Operario().EstadoAsync("/api/clientes/201/volumen", HttpStatusCode.NotFound);         // de DOS
        await e.Operario().EstadoAsync("/api/clientes/301/devoluciones", HttpStatusCode.NotFound);    // de la casa
        await e.Supervisor().EstadoAsync("/api/clientes/101/volumen", HttpStatusCode.NotFound);       // siempre de UNO
        await e.Supervisor().EstadoAsync("/api/clientes/101/devoluciones", HttpStatusCode.NotFound);
        await e.Operario().EstadoAsync("/api/clientes/999999/volumen", HttpStatusCode.NotFound);
        await e.Operario().EstadoAsync("/api/volumen?vendedor=2", HttpStatusCode.Forbidden);
        await e.Operario().EstadoAsync("/api/devoluciones?vendedor=2", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/volumen?vendedor=6", HttpStatusCode.Forbidden);        // la casa
        await e.Admin().JsonAsync("/api/clientes/401/volumen");

        Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l => l.Pantalla == "ficha-volumen" && l.Denegado)));
    }

    // ---- volumen

    [Fact]
    public async Task Volumen_del_operario_contra_el_mes_anterior_entero()
    {
        var v = await e.Operario().JsonAsync("/api/volumen");
        var c = v["comparacion"]!;
        Assert.Equal(("mesAnteriorCompleto", "2026-10-01", "2026-09-01", "2026-10-25", "2026-09-30"),
            ((string?)c["tipo"], (string?)c["mes"], (string?)c["mesBase"], (string?)c["corteAl"], (string?)c["baseHasta"]));
        Assert.Equal((20, 26), ((int)c["diaHabil"]!, (int)c["diasHabilesMes"]!));   // el 12/10 es feriado
        Assert.Equal("VENDEDOR UNO", (string?)v["titulo"]);

        Assert.Equal((1m, 4m, 25.0m), ((decimal)Fila(v, 101)["bultosActual"]!, (decimal)Fila(v, 101)["bultosBase"]!, (decimal)Fila(v, 101)["porcentaje"]!));
        Assert.Equal(0m, (decimal)Fila(v, 102)["bultosActual"]!);
        Assert.Null(Fila(v, 102)["bultosBase"]);   // en septiembre era de DOS: nuevo en su cartera
        Assert.Null(Fila(v, 102)["porcentaje"]);

        var t = v["total"]!;   // el operario: totales solo en porcentaje
        Assert.Equal(25.0m, (decimal)t["porcentaje"]!);
        Assert.Null(t["bultosActual"]);
        Assert.Null(t["bultosBase"]);
        Assert.Null(t["bultosEsperado"]);
        var chips = v["chips"]!;
        Assert.Equal((2, 1, 0, 1, 0), ((int)chips["todos"]!, (int)chips["sinCompraAun"]!, (int)chips["nuevos"]!, (int)chips["bajaron"]!, (int)chips["subieron"]!));

        Assert.Equal([101], (await e.Operario().JsonAsync("/api/volumen?chip=bajaron"))["clientes"].Ids());
        Assert.Equal([102], (await e.Operario().JsonAsync("/api/volumen?busqueda=despensa"))["clientes"].Ids());
    }

    [Fact]
    public async Task Volumen_del_admin_contra_el_mismo_dia_habil()
    {
        var v = await e.Admin().JsonAsync("/api/volumen?vendedor=1");
        Assert.Equal(("mismoDiaHabil", "2026-09-23"), ((string?)v["comparacion"]!["tipo"], (string?)v["comparacion"]!["baseHasta"]));
        // 101: al 23/9 llevaba 2 menos 1 de la nota de crédito; el 28/9 no entra.
        Assert.Equal((1m, 1m, 100.0m), ((decimal)Fila(v, 101)["bultosActual"]!, (decimal)Fila(v, 101)["bultosBase"]!, (decimal)Fila(v, 101)["porcentaje"]!));
        Assert.Equal(2m, (decimal)Fila(v, 102)["bultosBase"]!);   // el admin ve la base aunque fuera de DOS
        Assert.Equal((3m, 3m), ((decimal)v["total"]!["bultosBase"]!, (decimal)v["total"]!["bultosEsperado"]!));
        Assert.Equal((1, 1), ((int)v["chips"]!["sinCompraAun"]!, (int)v["chips"]!["subieron"]!));

        // Un mes cerrado: entero contra el anterior entero, para todos.
        var sep = await e.Admin().JsonAsync("/api/volumen?vendedor=1&mes=2026-09-01");
        Assert.Equal(("mesAnteriorCompleto", "2026-09-30", "2026-08-31"),
            ((string?)sep["comparacion"]!["tipo"], (string?)sep["comparacion"]!["corteAl"], (string?)sep["comparacion"]!["baseHasta"]));
        Assert.Equal((25, 25), ((int)sep["comparacion"]!["diaHabil"]!, (int)sep["comparacion"]!["diasHabilesMes"]!));   // sin el 24/9
        Assert.Equal(4m, (decimal)Fila(sep, 101)["bultosActual"]!);

        // El supervisor compara como el admin, con la base de su equipo.
        var dos = await e.Supervisor().JsonAsync("/api/volumen");
        Assert.Equal("mismoDiaHabil", (string?)dos["comparacion"]!["tipo"]);
        Assert.Equal([201], dos["clientes"].Ids());
    }

    [Fact]
    public async Task Volumen_valida_el_mes_y_el_dia()
    {
        var r = await e.Admin().JsonAsync("/api/volumen?mes=2026-07-01", HttpStatusCode.BadRequest);   // sin base
        Assert.NotNull(r["errors"]!["mes"]);
        await e.Admin().JsonAsync("/api/volumen?mes=2026-11-01", HttpStatusCode.BadRequest);
        await e.Admin().JsonAsync("/api/volumen?dia=9", HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Volumen_de_la_ficha_por_articulo()
    {
        var f = await e.Operario().JsonAsync("/api/clientes/101/volumen");
        Assert.Equal("mesAnteriorCompleto", (string?)f["comparacion"]!["tipo"]);
        Assert.Equal((1m, 4m, 3.08m, 25.0m), ((decimal)f["total"]!["bultosActual"]!, (decimal)f["total"]!["bultosBase"]!,
            (decimal)f["total"]!["bultosEsperado"]!, (decimal)f["total"]!["porcentaje"]!));
        var art = f["articulos"]!.AsArray().Single()!;
        Assert.Equal((900, 1m, 4m, 25.0m), ((int)art["idArticulo"]!, (decimal)art["bultosActual"]!, (decimal)art["bultosBase"]!, (decimal)art["porcentaje"]!));

        // Para UNO, septiembre de 102 era de DOS: sin base y sin artículos.
        var nuevo = await e.Operario().JsonAsync("/api/clientes/102/volumen");
        Assert.Null(nuevo["total"]!["bultosBase"]);
        Assert.Empty(nuevo["articulos"]!.AsArray());

        // Y para DOS, octubre de 102 ya no es suyo: solo su base.
        var dos = await e.Supervisor().JsonAsync("/api/clientes/102/volumen");
        Assert.Null(dos["total"]!["bultosActual"]);
        Assert.Equal(2m, (decimal)dos["total"]!["bultosBase"]!);
        Assert.Null(dos["articulos"]![0]!["bultosActual"]);
    }

    // ---- devoluciones

    [Fact]
    public async Task Devoluciones_por_mes_cliente_y_articulo()
    {
        var d = await e.Operario().JsonAsync("/api/devoluciones?mesHasta=2026-09-01");
        Assert.Equal("2026-09-01", (string?)d["mes"]);
        var sep = d["kpis"]!.AsArray()[^1]!;
        // 101 en septiembre: 5 facturados, 1 de nota de crédito → 1 / 5 = 20 %. El operario no recibe los bultos totales.
        Assert.Equal(20.0m, (decimal)sep["porcentaje"]!);
        Assert.Null(sep["bultosVendidos"]);
        Assert.Null(d["kpis"]!.AsArray()[0]!["porcentaje"]);   // julio: nada facturado
        var cli = d["clientes"]!.AsArray().Single()!;
        Assert.Equal((101, "VENDEDOR UNO", 20.0m), ((int)cli["idCliente"]!, (string?)cli["vendedor"], (decimal)cli["porcentaje"]!));
        Assert.Null(d["articulos"]!.AsArray().Single()!["bultosDevueltos"]);
        Assert.Equal(1m, (decimal)cli["bultosDevueltos"]!);   // por cliente, sí

        // Octubre: lo que retiró en la misma factura es devolución. Entregó 2, retiró 1 → 1 vendido, 1 / 2 = 50 %.
        var oct = (await e.Operario().JsonAsync("/api/devoluciones"))["clientes"]!.AsArray().Single()!;
        Assert.Equal((101, 1m, 1m, 50.0m), ((int)oct["idCliente"]!, (decimal)oct["bultosVendidos"]!, (decimal)oct["bultosDevueltos"]!, (decimal)oct["porcentaje"]!));

        // Toda la empresa (sin la casa) en septiembre: 101 y 102 → 6 vendidos, 1 devuelto.
        var admin = (await e.Admin().JsonAsync("/api/devoluciones?mesHasta=2026-09-01"))["kpis"]!.AsArray()[^1]!;
        Assert.Equal((6m, 1m, 14.3m), ((decimal)admin["bultosVendidos"]!, (decimal)admin["bultosDevueltos"]!, (decimal)admin["porcentaje"]!));

        // DOS en septiembre: 102 y 201, sin devoluciones.
        var dos = await e.Supervisor().JsonAsync("/api/devoluciones?mesHasta=2026-09-01");
        var dosSep = dos["kpis"]!.AsArray()[^1]!;
        Assert.Equal((2m, 0m), ((decimal)dosSep["bultosVendidos"]!, (decimal)dosSep["bultosDevueltos"]!));
        Assert.Empty(dos["clientes"]!.AsArray());
    }

    [Fact]
    public async Task Devoluciones_de_la_ficha()
    {
        var f = await e.Operario().JsonAsync("/api/clientes/101/devoluciones?mesHasta=2026-09-01");
        var kpis = f["kpis"]!.AsArray();
        Assert.Null(kpis[0]!["bultosVendidos"]);   // julio: 101 no estaba en su cartera
        Assert.Equal(0m, (decimal)kpis[1]!["bultosVendidos"]!);
        Assert.Equal(20.0m, (decimal)kpis[2]!["porcentaje"]!);
        Assert.Equal("2026-09-01", (string?)f["mes"]);
        Assert.Equal(900, (int)f["articulos"]!.AsArray().Single()!["idArticulo"]!);

        var oct = (await e.Operario().JsonAsync("/api/clientes/101/devoluciones?mes=2026-10-01"))["articulos"]!.AsArray().Single()!;
        Assert.Equal((1m, 50.0m), ((decimal)oct["bultosDevueltos"]!, (decimal)oct["porcentaje"]!));
        await e.Operario().JsonAsync("/api/clientes/101/devoluciones?mesHasta=2026-09-01&mes=2026-10-01", HttpStatusCode.BadRequest);
        Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l => l.Pantalla == "ficha-devoluciones" && !l.Denegado)));
    }

    [Fact]
    public async Task Volumen_con_comparativa_parcial_o_acumulada()
    {
        static string? Tipo(JsonNode v) => (string?)v["comparacion"]!["tipo"];
        static string? BaseHasta(JsonNode v) => (string?)v["comparacion"]!["baseHasta"];

        // Admin y supervisor: parcial por defecto; acumulado = septiembre entero, con el esperado al ritmo.
        var parcial = await e.Supervisor().JsonAsync("/api/volumen");
        Assert.Equal("mismoDiaHabil", Tipo(parcial));
        Assert.Equal("mismoDiaHabil", Tipo(await e.Admin().JsonAsync("/api/volumen?comparacion=parcial")));
        var acumulado = await e.Admin().JsonAsync("/api/volumen?comparacion=Acumulado");
        Assert.Equal(("mesAnteriorCompleto", "2026-09-30"), (Tipo(acumulado), BaseHasta(acumulado)));
        Assert.Equal("mesAnteriorCompleto", Tipo(await e.Supervisor().JsonAsync("/api/volumen?comparacion=acumulado")));

        // El operario, siempre contra el mes entero: el parámetro se ignora.
        Assert.Equal("mesAnteriorCompleto", Tipo(await e.Operario().JsonAsync("/api/volumen?comparacion=parcial")));

        Assert.NotNull((await e.Admin().JsonAsync("/api/volumen?comparacion=semanal", HttpStatusCode.BadRequest))["errors"]!["comparacion"]);
    }
}
