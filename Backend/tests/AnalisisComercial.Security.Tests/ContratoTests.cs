using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace AnalisisComercial.Security.Tests;

/// <summary>Los cálculos y la forma JSON del contrato (CONTRATO_API.md) con los datos conocidos del Entorno.</summary>
[Collection(ColeccionEntorno.Nombre)]
public class ContratoTests(Entorno e)
{
    private static string[] Estados(JsonNode fila) => fila["meses"]!.AsArray().Select(x => (string)x!).ToArray();

    [Fact]
    public async Task Cobertura_del_operario_meses_estados_kpis_y_chips()
    {
        var c = await e.Operario().JsonAsync("/api/cobertura");
        Assert.Equal(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"], c["meses"]!.AsArray().Select(x => (string)x!));

        var filas = c["clientes"]!.AsArray().ToDictionary(x => (int)x!["idCliente"]!);
        Assert.Equal(["fueraDeCartera", "compro", "compro", "compro"], Estados(filas[101]!));
        // 102 era de DOS hasta septiembre: para UNO, fuera de cartera; en octubre todavía no compró.
        Assert.Equal(["fueraDeCartera", "fueraDeCartera", "fueraDeCartera", "sinCompraAun"], Estados(filas[102]!));
        Assert.Equal("RUTA UNO", (string?)filas[101]!["ruta"]);
        Assert.Equal("VENDEDOR UNO", (string?)filas[101]!["vendedor"]);
        Assert.Equal(1, (int?)filas[101]!["idPersonal"]);
        Assert.Equal(-26.8m, (decimal?)filas[101]!["lat"]);
        Assert.Equal(-65.2m, (decimal?)filas[101]!["lng"]);

        var oct = c["kpis"]!.AsArray()[^1]!;
        Assert.Equal(1, (int)oct["clientesConCompra"]!);
        Assert.Equal(2, (int)oct["clientesCartera"]!);
        Assert.Equal(50.0m, (decimal)oct["porcentaje"]!);
        Assert.True((bool)oct["mesEnCurso"]!);
        Assert.Equal("2026-10-25", (string?)oct["corteAl"]);
        Assert.Null(c["kpis"]!.AsArray()[2]!["corteAl"]);

        Assert.Equal(2, (int)c["chips"]!["todos"]!);
        Assert.Equal(1, (int)c["chips"]!["compraronMesActual"]!);
        Assert.Equal(1, (int)c["chips"]!["sinCompraMesActual"]!);
        Assert.Equal(0, (int)c["chips"]!["dejaronDeComprar"]!);
        Assert.Equal("2 clientes, todos los días, todas las unidades", (string?)c["subtitulo"]);
    }

    [Fact]
    public async Task Dejo_de_comprar_del_supervisor()
    {
        var c = await e.Supervisor().JsonAsync("/api/cobertura");
        var fila = c["clientes"]!.AsArray().Single()!;
        Assert.Equal(["fueraDeCartera", "compro", "dejoDeComprar", "sinCompraAun"], Estados(fila));
        Assert.True((bool)fila["dejoDeComprar"]!);
        Assert.Equal(1, (int)c["chips"]!["dejaronDeComprar"]!);
        // Septiembre de DOS: 102 (compró) y 201 (no) → 50 %.
        var sep = c["kpis"]!.AsArray()[2]!;
        Assert.Equal(2, (int)sep["clientesCartera"]!);
        Assert.Equal(1, (int)sep["clientesConCompra"]!);
    }

    [Fact]
    public async Task Chips_y_busqueda_filtran_la_lista_pero_no_los_totales()
    {
        var c = await e.Admin().JsonAsync("/api/cobertura?chip=dejaronDeComprar");
        Assert.Equal([201], c["clientes"].Ids());
        Assert.Equal(4, (int)c["chips"]!["todos"]!);

        Assert.Equal([102], (await e.Admin().JsonAsync("/api/cobertura?busqueda=despénsa"))["clientes"].Ids());   // sin tildes ni mayúsculas
        Assert.Equal([201], (await e.Admin().JsonAsync("/api/cobertura?busqueda=201"))["clientes"].Ids());
        Assert.Equal([101, 102], (await e.Admin().JsonAsync("/api/cobertura?chip=compraronMesActual&mesHasta=2026-09-01"))["clientes"].Ids());
    }

    [Fact]
    public async Task Filtro_por_dia_de_visita()
    {
        var lunes = await e.Admin().JsonAsync("/api/cobertura?dia=2");
        Assert.Equal([101, 102], lunes["clientes"].Ids());
        Assert.Equal("2 clientes, lunes, todas las unidades", (string?)lunes["subtitulo"]);
        await e.Admin().JsonAsync("/api/cobertura?dia=9", HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Rango_de_meses_validado()
    {
        Assert.Equal(2, (await e.Admin().JsonAsync("/api/cobertura?mesDesde=2026-09-01&mesHasta=2026-10-01"))["meses"]!.AsArray().Count);
        var r = await e.Admin().JsonAsync("/api/cobertura?mesDesde=2026-10-01&mesHasta=2026-09-01", HttpStatusCode.BadRequest);
        Assert.NotNull(r["errors"]!["mesDesde"]);
        await e.Admin().JsonAsync("/api/cobertura?mesHasta=2026-12-01", HttpStatusCode.BadRequest);
        await e.Admin().JsonAsync("/api/cobertura?mesDesde=no-es-fecha", HttpStatusCode.BadRequest);
        // Antes del primer mes con datos se recorta.
        Assert.Equal("2026-07-01", (string?)(await e.Admin().JsonAsync("/api/cobertura?mesDesde=2026-01-01"))["meses"]![0]);
    }

    [Fact]
    public async Task Ficha_del_cliente()
    {
        var f = await e.Operario().JsonAsync("/api/clientes/101");
        Assert.Equal("ALMACEN UNO", (string?)f["razonSocial"]);
        Assert.Equal("Lunes", (string?)f["diasVisita"]);
        Assert.Equal("CALLE 100, SAN MIGUEL DE TUCUMAN", (string?)f["direccion"]);
        Assert.Equal("2026-10-20", (string?)f["ultimaCompra"]);
        Assert.Equal(6, (int)f["diasSinComprar"]!);
        var art = f["articulos"]!.AsArray().Single()!;
        Assert.Equal("124 - PASTAS FRESCAS", (string?)art["unidadNegocio"]);
        Assert.Equal([false, true, true, true], art["meses"]!.AsArray().Select(x => (bool)x!));
        Assert.Equal(["fueraDeCartera", "compro", "compro", "compro"], f["estados"]!.AsArray().Select(x => (string)x!));
    }

    [Fact]
    public async Task Ruta_de_hoy_primero_lo_pendiente()
    {
        // 26/10/2026 es lunes: la ruta 10 de UNO.
        var r = (await e.Operario().JsonAsync("/api/ruta-hoy")).AsArray();
        Assert.Equal([102, 101], r.Select(x => (int)x!["idCliente"]!));
        Assert.Equal("sinCompraAun", (string?)r[0]!["estadoMesActual"]);
        Assert.Empty((await e.Operario().JsonAsync("/api/ruta-hoy?fecha=2026-10-27")).AsArray());   // martes: no visita
    }

    [Fact]
    public async Task Resumen_con_altas_y_bajas()
    {
        var dos = (await e.Admin().JsonAsync("/api/resumen")).AsArray().Single(x => (int)x!["idPersonal"]! == 2)!;
        Assert.Equal(1, (int)dos["dejaronDeComprar"]!);
        Assert.Equal(0, (int)dos["altas"]!);
        Assert.Equal(1, (int)dos["bajas"]!);   // 102 pasó a UNO en octubre
        var uno = (await e.Admin().JsonAsync("/api/resumen")).AsArray().Single(x => (int)x!["idPersonal"]! == 1)!;
        Assert.Equal(1, (int)uno["altas"]!);
    }

    [Fact]
    public async Task Estado_de_la_sincronizacion()
    {
        var s = await e.Operario().JsonAsync("/api/sincronizacion/estado");
        Assert.StartsWith("2026-10-26T05:03:00", (string?)s["ultimaOk"]);
        Assert.Equal("2026-10-25", (string?)s["ventasHasta"]);
    }

    [Fact]
    public async Task Excluir_un_cliente_lo_saca_de_la_cartera()
    {
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/exclusiones", new { idCliente = 102, motivo = "Cliente de prueba" });
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        try
        {
            Assert.Equal([101], (await e.Operario().JsonAsync("/api/cobertura"))["clientes"].Ids());
            var repetido = await admin.PostAsJsonAsync("/api/admin/exclusiones", new { idCliente = 102, motivo = "otra vez" });
            Assert.Equal(HttpStatusCode.BadRequest, repetido.StatusCode);
            Assert.Equal([102], (await admin.JsonAsync("/api/admin/exclusiones")).Ids());
        }
        finally
        {
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync("/api/admin/exclusiones/102")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync("/api/admin/exclusiones/102")).StatusCode);
        Assert.Equal([101, 102], (await e.Operario().JsonAsync("/api/cobertura"))["clientes"].Ids());
    }

    [Fact]
    public async Task Accesos_validaciones_y_concurrencia()
    {
        var admin = e.Admin();
        async Task<JsonNode> Error(object body, string campo)
        {
            var r = await admin.PostAsJsonAsync("/api/admin/usuarios", body);
            var j = (await r.Content.ReadFromJsonAsync<JsonNode>())!;
            Assert.True(r.StatusCode == HttpStatusCode.BadRequest, j.ToJsonString());
            Assert.NotNull(j["errors"]![campo]);
            return j;
        }
        await Error(new { email = "operario@madomi", rol = "operario", idsPersonal = new[] { 1 } }, "email");   // ya tiene acceso
        await Error(new { email = "x@madomi", rol = "operario" }, "idsPersonal");
        await Error(new { email = "x@madomi", rol = "operario", idsPersonal = new[] { 1, 6 } }, "idsPersonal");   // la casa no
        await Error(new { email = "x@madomi", rol = "supervisor", idsPersonal = Array.Empty<int>() }, "idsPersonal");
        await Error(new { email = "con espacio@madomi", rol = "operario", idsPersonal = new[] { 1 } }, "email");
        await Error(new { email = "x@madomi" }, "rol");

        // El operario puede tener varios vendedores (el mismo, renombrado en Chess).
        var operario = (await (await admin.PostAsJsonAsync("/api/admin/usuarios",
            new { email = "renombrado@madomi", rol = "operario", idsPersonal = new[] { 7, 1 } })).Content.ReadFromJsonAsync<JsonNode>())!;
        Assert.Equal([1, 7], operario["idsPersonal"]!.AsArray().Select(x => (int)x!));
        Assert.Null(operario["idPersonal"]);

        var creado = (await (await admin.PostAsJsonAsync("/api/admin/usuarios",
            new { email = "Super.Nuevo@madomi", nombre = "Super", rol = "supervisor", idsPersonal = new[] { 1, 2 } })).Content.ReadFromJsonAsync<JsonNode>())!;
        Assert.Equal("super.nuevo@madomi", (string?)creado["email"]);
        Assert.Equal([1, 2], creado["idsPersonal"]!.AsArray().Select(x => (int)x!));
        Assert.False((bool)creado["entro"]!);

        var url = $"/api/admin/usuarios/{creado["idAcceso"]}";
        var ok = await admin.PutAsJsonAsync(url, new { email = "super.nuevo@madomi", rol = "supervisor", idsPersonal = new[] { 2 }, version = (string?)creado["version"] });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        var viejo = await admin.PutAsJsonAsync(url, new { email = "super.nuevo@madomi", rol = "supervisor", idsPersonal = new[] { 1 }, version = (string?)creado["version"] });
        Assert.Equal(HttpStatusCode.Conflict, viejo.StatusCode);
        var sinVersion = await admin.PutAsJsonAsync(url, new { email = "super.nuevo@madomi", rol = "supervisor", idsPersonal = new[] { 1 } });
        Assert.Equal(HttpStatusCode.BadRequest, sinVersion.StatusCode);
    }

    [Fact]
    public async Task Vendedores_para_administracion()
    {
        var v = (await e.Admin().JsonAsync("/api/admin/vendedores")).AsArray();
        Assert.Equal([2, 1, 7, 6], v.Select(x => (int)x!["id"]!));   // personas por nombre, la casa al final
        Assert.True((bool)v[^1]!["esCasa"]!);
        Assert.True((bool)v[0]!["activo"]!);
    }

    [Fact]
    public async Task Base_de_clientes_agrupada_por_vendedor()
    {
        var admin = e.Admin();
        var grupos = (await admin.JsonAsync("/api/admin/clientes/resumen")).AsArray();
        // Por nombre (DOS, UNO, UNO BIS), la casa y al final «sin vendedor».
        Assert.Equal(["2:1", "1:2", "7:1", "6:1", "sin:1"],
            grupos.Select(g => $"{(g!["idPersonal"] is null ? "sin" : (string)g["idPersonal"]!.ToString())}:{(int)g["clientes"]!}"));
        Assert.True((bool)grupos[3]!["esCasa"]!);
        Assert.Null(grupos[4]!["vendedor"]);

        var uno = await admin.JsonAsync("/api/admin/clientes?vendedor=1");
        Assert.Equal(2, (int)uno["total"]!);
        var almacen = uno["filas"]!.AsArray()[0]!;
        Assert.Equal((101, "RUTA UNO", "VENDEDOR UNO", "2026-10-20", false),
            ((int)almacen["idCliente"]!, (string?)almacen["ruta"], (string?)almacen["vendedor"], (string?)almacen["ultimaCompra"], (bool)almacen["excluido"]!));
        Assert.Equal([401], (await admin.JsonAsync("/api/admin/clientes?vendedor=sin"))["filas"].Ids());
        Assert.Equal([102], (await admin.JsonAsync("/api/admin/clientes?texto=despensa"))["filas"].Ids());
        Assert.Equal([201], (await admin.JsonAsync("/api/admin/clientes?texto=201"))["filas"].Ids());

        // Paginado por razón social: ALMACEN BIS, ALMACEN UNO | CASA CUATRO, DESPENSA DOS | …
        var p2 = await admin.JsonAsync("/api/admin/clientes?tamano=2&pagina=2");
        Assert.Equal(6, (int)p2["total"]!);
        Assert.Equal([301, 102], p2["filas"]!.AsArray().Select(x => (int)x!["idCliente"]!));

        // Excluir uno lo marca en la lista y en el resumen.
        Assert.Equal(HttpStatusCode.Created, (await admin.PostAsJsonAsync("/api/admin/exclusiones", new { idCliente = 501, motivo = "Prueba" })).StatusCode);
        try
        {
            var solo = (await admin.JsonAsync("/api/admin/clientes?excluidos=solo"))["filas"]!.AsArray().Single()!;
            Assert.Equal((501, "Prueba", "checho@madomi"), ((int)solo["idCliente"]!, (string?)solo["motivo"], (string?)solo["excluidoPor"]));
            Assert.Equal(1, (int)(await admin.JsonAsync("/api/admin/clientes/resumen")).AsArray().Single(g => (int?)g!["idPersonal"] == 7)!["excluidos"]!);
            Assert.Equal(5, (int)(await admin.JsonAsync("/api/admin/clientes?excluidos=sin"))["total"]!);
        }
        finally
        {
            await admin.DeleteAsync("/api/admin/exclusiones/501");
        }

        await admin.JsonAsync("/api/admin/clientes?tamano=500", HttpStatusCode.BadRequest);
        await admin.JsonAsync("/api/admin/clientes?vendedor=abc", HttpStatusCode.BadRequest);
        await admin.JsonAsync("/api/admin/clientes?excluidos=x", HttpStatusCode.BadRequest);
    }

    [Fact]
    public async Task Estadistica_y_sugerencia_de_cada_cliente()
    {
        var admin = e.Admin();
        var todos = await admin.JsonAsync("/api/admin/clientes");
        Assert.Equal(["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"], todos["meses"]!.AsArray().Select(x => (string)x!));
        var filas = todos["filas"]!.AsArray().ToDictionary(x => (int)x!["idCliente"]!);

        var kiosco = filas[201]!;   // compró en agosto y no en septiembre
        Assert.Equal(["fueraDeCartera", "compro", "dejoDeComprar", "sinCompraAun"], kiosco["estados"]!.AsArray().Select(x => (string)x!));
        Assert.Equal((77, "revisar", "Dejó de comprar en septiembre"),
            ((int)kiosco["diasSinComprar"]!, (string?)kiosco["sugerencia"], (string?)kiosco["motivoSugerencia"]));

        var casa = filas[301]!;     // en la cartera desde julio, nunca compró
        Assert.Equal(("excluir", "Nunca compró desde julio"), ((string?)casa["sugerencia"], (string?)casa["motivoSugerencia"]));
        Assert.Null(casa["diasSinComprar"]);

        Assert.Null(filas[101]!["sugerencia"]);    // compró hace 6 días
        Assert.Null(filas[501]!["sugerencia"]);    // nuevo en la cartera (octubre): todavía no
        Assert.Equal(41, (int)filas[102]!["diasSinComprar"]!);

        Assert.Equal([301], (await admin.JsonAsync("/api/admin/clientes?sugerencia=excluir"))["filas"].Ids());
        Assert.Equal([201], (await admin.JsonAsync("/api/admin/clientes?sugerencia=revisar"))["filas"].Ids());
        Assert.Equal(1, (int)(await admin.JsonAsync("/api/admin/clientes?sugerencia=revisar"))["total"]!);
        await admin.JsonAsync("/api/admin/clientes?sugerencia=otra", HttpStatusCode.BadRequest);

        var grupos = (await admin.JsonAsync("/api/admin/clientes/resumen")).AsArray();
        Assert.Equal(1, (int)grupos.Single(g => (int?)g!["idPersonal"] == 6)!["sugeridos"]!);
        Assert.Equal(0, (int)grupos.Single(g => (int?)g!["idPersonal"] == 2)!["sugeridos"]!);

        // Un excluido no lleva sugerencia.
        await admin.PostAsJsonAsync("/api/admin/exclusiones", new { idCliente = 301, motivo = "Prueba" });
        try
        {
            Assert.Empty((await admin.JsonAsync("/api/admin/clientes?sugerencia=excluir"))["filas"]!.AsArray());
        }
        finally
        {
            await admin.DeleteAsync("/api/admin/exclusiones/301");
        }
    }

    [Fact]
    public async Task Pedir_una_sincronizacion_dos_veces_da_409()
    {
        var admin = e.Admin();
        var primera = await admin.PostAsync("/api/admin/sincronizaciones", null);
        Assert.Equal(HttpStatusCode.Accepted, primera.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, (await admin.PostAsync("/api/admin/sincronizaciones", null)).StatusCode);
        var s = await admin.JsonAsync("/api/admin/sincronizaciones");
        Assert.Equal("checho@madomi", (string?)s["pendiente"]!["solicitadoPor"]);
        Assert.Equal("ventas/", (string?)s["pasos"]![0]!["endpoint"]);
    }
}
