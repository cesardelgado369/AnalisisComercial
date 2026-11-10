using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AnalisisComercial.Domain;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Focos del mes (Checho, 03/11/2026; Cesar, 05/11: uno por mes y solo para el Admin): grupos de artículos con nombre que
/// filtran Cobertura, Volumen y Devoluciones. En el Entorno todas las compras son del 900 (TALLARIN); acá se agrega el
/// 950 (MANTECA), que no compró nadie. Hoy es 26/10/2026, con ventas hasta el 25/10.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class FocosTests(Entorno e)
{
    private static int Compraron(JsonNode cobertura) => (int)cobertura["kpis"]!.AsArray()[^1]!["clientesConCompra"]!;

    [Fact]
    public async Task Un_foco_filtra_lo_que_cuenta_como_compra_y_como_bulto()
    {
        var admin = e.Admin();
        await e.ConBaseAsync(db =>
        {
            db.Articulos.Add(new Articulo { IdArticulo = 950, Descripcion = "MANTECA MADOMI X200G", UnidadNegocio = "SIN UNIDAD DE NEGOCIO" });
            return db.SaveChangesAsync();
        });
        try
        {
            var tallarin = await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Tallarín", idsArticulo = new[] { 900 } });
            var manteca = await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Manteca", idsArticulo = new[] { 950 } });
            await CrearAsync(admin, new { mes = "2026-11-01", nombre = "Manteca", idsArticulo = new[] { 950 } });   // otro mes, otro foco
            Assert.Equal("MANTECA MADOMI X200G", (string?)manteca["articulos"]![0]!["descripcion"]);
            Assert.Equal("2026-10-01", (string?)manteca["mes"]);

            // El filtro: los del mes pedido (sin mes, el en curso), por nombre.
            Assert.Equal(["Manteca", "Tallarín"], Nombres(await admin.JsonAsync("/api/cobertura/focos")));
            Assert.Equal(["Manteca"], Nombres(await admin.JsonAsync("/api/cobertura/focos?mes=2026-11-01")));
            Assert.Empty(Nombres(await admin.JsonAsync("/api/cobertura/focos?mes=2026-09-01")));
            // La administración: todos, por mes descendente.
            Assert.Equal(["2026-11-01", "2026-10-01", "2026-10-01"],
                (await admin.JsonAsync("/api/admin/focos")).AsArray().Select(f => (string?)f!["mes"]));

            var todo = await admin.JsonAsync("/api/cobertura");
            var conTallarin = await admin.JsonAsync($"/api/cobertura?foco={tallarin["idFoco"]}");
            var conManteca = await admin.JsonAsync($"/api/cobertura?foco={manteca["idFoco"]}");
            Assert.Equal(Compraron(todo), Compraron(conTallarin));
            Assert.True(Compraron(todo) > 0);
            Assert.Equal(0, Compraron(conManteca));
            Assert.EndsWith("foco Manteca", (string?)conManteca["subtitulo"]);
            // La cartera no cambia: el foco filtra la compra, no los clientes.
            Assert.Equal(todo["clientes"]!.AsArray().Count, conManteca["clientes"]!.AsArray().Count);

            var volumen = await admin.JsonAsync($"/api/volumen?mes=2026-09-01&foco={manteca["idFoco"]}");
            Assert.Equal(0m, (decimal?)volumen["total"]!["bultosActual"] ?? 0m);
            Assert.Equal((decimal?)(await admin.JsonAsync("/api/volumen?mes=2026-09-01"))["total"]!["bultosActual"],
                (decimal?)(await admin.JsonAsync($"/api/volumen?mes=2026-09-01&foco={tallarin["idFoco"]}"))["total"]!["bultosActual"]);
            await admin.JsonAsync($"/api/devoluciones?foco={manteca["idFoco"]}");

            // Borrado: 204 y después 404; el filtro con ese foco da 400.
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/focos/{manteca["idFoco"]}")).StatusCode);
            Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/focos/{manteca["idFoco"]}")).StatusCode);
            var v = await admin.JsonAsync($"/api/cobertura?foco={manteca["idFoco"]}", HttpStatusCode.BadRequest);
            Assert.NotNull(v["errors"]!["foco"]);
        }
        finally
        {
            await e.ConBaseAsync(async db =>
            {
                await db.Focos.ExecuteDeleteAsync();
                return await db.Articulos.Where(a => a.IdArticulo == 950).ExecuteDeleteAsync();
            });
        }
    }

    [Fact]
    public async Task Los_focos_no_los_ven_vendedores_ni_supervisores()
    {
        var admin = e.Admin();
        try
        {
            var foco = await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Pastas", idsArticulo = new[] { 900 } });
            foreach (var quien in new[] { e.Operario(), e.Supervisor() })
            {
                await quien.EstadoAsync("/api/cobertura/focos", HttpStatusCode.Forbidden);
                // Un enlace con foco falla: ignorarlo mostraría números que no son los del filtro.
                await quien.EstadoAsync($"/api/cobertura?foco={foco["idFoco"]}", HttpStatusCode.Forbidden);
                await quien.EstadoAsync("/api/admin/focos", HttpStatusCode.Forbidden);
                await quien.EstadoAsync("/api/admin/focos/analisis", HttpStatusCode.Forbidden);
            }
            await e.Supervisor().EstadoAsync($"/api/volumen?foco={foco["idFoco"]}", HttpStatusCode.Forbidden);
            await e.Supervisor().EstadoAsync($"/api/devoluciones?foco={foco["idFoco"]}", HttpStatusCode.Forbidden);
            await e.Supervisor().JsonAsync("/api/cobertura");   // sin foco, igual que siempre
            Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l =>
                l.Email == "operario@madomi" && l.Denegado && l.Pantalla == "focos" && l.Parametros == $"foco={foco["idFoco"]}")));
        }
        finally
        {
            await e.ConBaseAsync(db => db.Focos.ExecuteDeleteAsync());
        }
    }

    [Fact]
    public async Task El_analisis_del_mes_por_vendedor()
    {
        var admin = e.Admin();
        try
        {
            await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Tallarín", idsArticulo = new[] { 900 } });
            await CrearAsync(admin, new { mes = "2026-09-01", nombre = "Tallarín", idsArticulo = new[] { 900 } });

            // Octubre, en curso: ventas al 25/10, contra septiembre al 25/09. Cartera de octubre (sin la casa ni las
            // rutas sin vendedor): 101 y 102 de UNO, 201 de DOS, 501 de UNO BIS; compró 101.
            var oct = await admin.JsonAsync("/api/admin/focos/analisis");
            Assert.Equal("2026-10-01", (string?)oct["mes"]);
            Assert.True((bool)oct["mesEnCurso"]!);
            Assert.Equal("2026-10-25", (string?)oct["corteAl"]);
            Assert.Equal("2026-09-01", (string?)oct["mesAnterior"]);
            Assert.Equal("2026-09-25", (string?)oct["anteriorAl"]);
            var f = oct["focos"]!.AsArray().Single()!;
            Assert.Equal("Tallarín", (string?)f["nombre"]);
            AssertCcc(f["total"]!, 1, 4, 25.0m, 50.0m);   // septiembre al 25: 101 (2 − 1 de la nota de crédito) y 102, de 4
            var vend = f["vendedores"]!.AsArray();
            Assert.Equal(["VENDEDOR DOS", "VENDEDOR UNO", "VENDEDOR UNO BIS"], vend.Select(x => (string?)x!["nombre"]));
            AssertCcc(vend[1]!, 1, 2, 50.0m, 50.0m);   // UNO en septiembre: 101 sí, 103 no
            AssertCcc(vend[0]!, 0, 1, 0m, 50.0m);      // DOS en septiembre: 102 sí, 201 no
            AssertCcc(vend[2]!, 0, 1, 0m, null);       // UNO BIS no tenía cartera en septiembre

            // Septiembre, cerrado: contra agosto completo, en el que compraron los 4.
            var sep = await admin.JsonAsync("/api/admin/focos/analisis?mes=2026-09-01");
            Assert.False((bool)sep["mesEnCurso"]!);
            Assert.Null(sep["corteAl"]);
            Assert.Null(sep["anteriorAl"]);
            AssertCcc(sep["focos"]![0]!["total"]!, 2, 4, 50.0m, 100.0m);

            Assert.NotNull((await admin.JsonAsync("/api/admin/focos/analisis?mes=2026-11-01", HttpStatusCode.BadRequest))["errors"]!["mes"]);

            // Un foco vol: los bultos de la cartera de octubre contra septiembre al mismo día hábil (antes del 28/09).
            // Octubre: 101 lleva 1 (2 − 1 retirado en la misma factura). Base: 101 lleva 1 (2 − 1 de la nota de
            // crédito) y 102, 2.
            await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Vol tallarín", idsArticulo = new[] { 900 }, medida = "vol", meta = 4 });
            oct = await admin.JsonAsync("/api/admin/focos/analisis");
            Assert.Equal("2026-10-25", (string?)oct["volumen"]!["corteAl"]);
            var vol = oct["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Vol tallarín")!;
            Assert.Equal("vol", (string?)vol["medida"]);
            Assert.Equal(4m, (decimal)vol["meta"]!);
            Assert.Equal(25.0m, (decimal)vol["total"]!["porcentajeMeta"]!);   // 1 de los 4 bultos objetivo
            Assert.Equal(1m, (decimal)vol["total"]!["bultosActual"]!);
            Assert.Equal(3m, (decimal)vol["total"]!["bultosBase"]!);
            Assert.Equal(33.3m, (decimal)vol["total"]!["porcentaje"]!);
            Assert.Null(vol["total"]!["porcentajeAnterior"]);
            var porNombre = vol["vendedores"]!.AsArray().ToDictionary(x => (string)x!["nombre"]!);
            Assert.Equal(33.3m, (decimal)porNombre["VENDEDOR UNO"]!["porcentaje"]!);
            Assert.False(porNombre["VENDEDOR UNO"]!.AsObject().ContainsKey("porcentajeMeta"));   // la meta es del foco entero
            Assert.Null(porNombre["VENDEDOR DOS"]!["porcentaje"]);   // base 0
            // El ccc sigue sin bultos.
            Assert.Equal("ccc", (string?)oct["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Tallarín")!["medida"]);
            Assert.Null(oct["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Tallarín")!["total"]!["bultosActual"]);
            Assert.Equal("mismoDiaHabil", (string?)oct["volumen"]!["tipo"]);

            // Acumulado: contra septiembre entero. El vol suma la factura del 28/09 (base 101 = 4, 102 = 2).
            var acum = await admin.JsonAsync("/api/admin/focos/analisis?comparacion=acumulado");
            Assert.Null(acum["anteriorAl"]);
            Assert.Equal("mesAnteriorCompleto", (string?)acum["volumen"]!["tipo"]);
            var volAcum = acum["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Vol tallarín")!["total"]!;
            Assert.Equal((6m, 16.7m), ((decimal)volAcum["bultosBase"]!, (decimal)volAcum["porcentaje"]!));
            AssertCcc(acum["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Tallarín")!["total"]!, 1, 4, 25.0m, 50.0m);

            // Clientes A: octubre 101 y 102 (de UNO); septiembre, con su categoría, 102, 103 y 201 (compró 102 al 25/09).
            var a = await admin.JsonAsync("/api/admin/focos/analisis?abc=A");
            var ccc = a["focos"]!.AsArray().Single(x => (string?)x!["nombre"] == "Tallarín")!;
            AssertCcc(ccc["total"]!, 1, 2, 50.0m, 33.3m);
            Assert.Equal(["VENDEDOR UNO"], ccc["vendedores"]!.AsArray().Select(x => (string?)x!["nombre"]));
            AssertCcc(ccc["vendedores"]![0]!, 1, 2, 50.0m, 0m);   // UNO en septiembre: solo 103 era A, y no compró

            Assert.NotNull((await admin.JsonAsync("/api/admin/focos/analisis?comparacion=semanal", HttpStatusCode.BadRequest))["errors"]!["comparacion"]);
            Assert.NotNull((await admin.JsonAsync("/api/admin/focos/analisis?abc=Z", HttpStatusCode.BadRequest))["errors"]!["abc"]);
        }
        finally
        {
            await e.ConBaseAsync(db => db.Focos.ExecuteDeleteAsync());
        }
    }

    [Fact]
    public async Task Validaciones_y_permisos()
    {
        var admin = e.Admin();
        try
        {
            await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Pastas", idsArticulo = new[] { 900 } });
            await CrearAsync(admin, new { mes = "2026-11-01", nombre = "Pastas", idsArticulo = new[] { 900 } });   // el que viene, para dejarlo armado
            await Error(admin, new { mes = "2026-10-01", nombre = "Pastas", idsArticulo = new[] { 900 } }, "nombre");
            await Error(admin, new { mes = "2026-10-01", nombre = " ", idsArticulo = new[] { 900 } }, "nombre");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = Array.Empty<int>() }, "idsArticulo");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 123456 } }, "idsArticulo");
            await Error(admin, new { nombre = "Otro", idsArticulo = new[] { 900 } }, "mes");
            await Error(admin, new { mes = "2026-10-15", nombre = "Otro", idsArticulo = new[] { 900 } }, "mes");
            await Error(admin, new { mes = "2026-12-01", nombre = "Otro", idsArticulo = new[] { 900 } }, "mes");
            await Error(admin, new { mes = "2026-06-01", nombre = "Otro", idsArticulo = new[] { 900 } }, "mes");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, medida = "preventa" }, "medida");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, meta = 0 }, "meta");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, medida = "ccc", meta = 101 }, "meta");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, medida = "vol" }, "meta");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, medida = "vol", meta = 1_000_001 }, "meta");
            await Error(admin, new { mes = "2026-10-01", nombre = "Otro", idsArticulo = new[] { 900 }, medida = "vol", meta = 2.25 }, "meta");
            var conMeta = await CrearAsync(admin, new { mes = "2026-10-01", nombre = "Tapas", idsArticulo = new[] { 900 }, medida = "vol", meta = 25000.5 });
            Assert.Equal("vol", (string?)conMeta["medida"]);
            Assert.Equal(25000.5m, (decimal)conMeta["meta"]!);
            var sinMedida = (await admin.JsonAsync("/api/admin/focos")).AsArray().First(x => (string?)x!["nombre"] == "Pastas")!;
            Assert.Equal("ccc", (string?)sinMedida["medida"]);   // por defecto
            Assert.Null(sinMedida["meta"]);
            Assert.Equal(HttpStatusCode.NotFound,
                (await admin.PutAsJsonAsync("/api/admin/focos/99999", new { mes = "2026-10-01", nombre = "X", idsArticulo = new[] { 900 } })).StatusCode);

            await e.Supervisor().EstadoAsync("/api/admin/articulos", HttpStatusCode.Forbidden);
            var r = await e.Supervisor().PostAsJsonAsync("/api/admin/focos", new { mes = "2026-10-01", nombre = "Y", idsArticulo = new[] { 900 } });
            Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);

            // Los artículos para elegir, con su unidad, su DIVISION y los clientes del mes pasado (septiembre).
            var tallarin = (await admin.JsonAsync("/api/admin/articulos")).AsArray().Single(a => (int)a!["idArticulo"]! == 900)!;
            Assert.Equal(2, (int)tallarin["clientesMesAnterior"]!);   // 101 y 102 compraron en septiembre
        }
        finally
        {
            await e.ConBaseAsync(db => db.Focos.ExecuteDeleteAsync());
        }
    }

    private static IEnumerable<string?> Nombres(JsonNode lista) => lista.AsArray().Select(f => (string?)f!["nombre"]);

    private static void AssertCcc(JsonNode n, int conCompra, int cartera, decimal porcentaje, decimal? anterior)
    {
        Assert.Equal(conCompra, (int)n["clientesConCompra"]!);
        Assert.Equal(cartera, (int)n["clientesCartera"]!);
        Assert.Equal(porcentaje, (decimal)n["porcentaje"]!);
        Assert.Equal(anterior, (decimal?)n["porcentajeAnterior"]);
    }

    private static async Task<JsonNode> CrearAsync(HttpClient admin, object body)
    {
        var r = await admin.PostAsJsonAsync("/api/admin/focos", body);
        Assert.Equal(HttpStatusCode.Created, r.StatusCode);
        return JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
    }

    private static async Task Error(HttpClient admin, object body, string campo)
    {
        var r = await admin.PostAsJsonAsync("/api/admin/focos", body);
        Assert.Equal(HttpStatusCode.BadRequest, r.StatusCode);
        Assert.NotNull(JsonNode.Parse(await r.Content.ReadAsStringAsync())!["errors"]![campo]);
    }
}
