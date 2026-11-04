using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AnalisisComercial.Domain;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Focos del mes (Checho, 03/11/2026): grupos de artículos con nombre que filtran Cobertura, Volumen y Devoluciones.
/// En el Entorno todas las compras son del 900 (TALLARIN); acá se agrega el 950 (MANTECA), que no compró nadie.
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
            var tallarin = await CrearAsync(admin, new { nombre = "Tallarín", idsArticulo = new[] { 900 } });
            var manteca = await CrearAsync(admin, new { nombre = "Manteca", idsArticulo = new[] { 950 } });
            Assert.Equal("MANTECA MADOMI X200G", (string?)manteca["articulos"]![0]!["descripcion"]);

            // El filtro lo ve cualquiera con acceso, también el vendedor.
            var lista = await e.Operario().JsonAsync("/api/cobertura/focos");
            Assert.Equal(["Manteca", "Tallarín"], lista.AsArray().Select(f => (string?)f!["nombre"]));

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

            // Apagado: sale del filtro, pero un enlace guardado con ese foco sigue andando.
            var r = await admin.PutAsJsonAsync($"/api/admin/focos/{manteca["idFoco"]}", new { nombre = "Manteca", idsArticulo = new[] { 950 }, activo = false });
            Assert.Equal(HttpStatusCode.OK, r.StatusCode);
            Assert.Equal(["Tallarín"], (await e.Operario().JsonAsync("/api/cobertura/focos")).AsArray().Select(f => (string?)f!["nombre"]));
            Assert.Equal(2, (await admin.JsonAsync("/api/admin/focos")).AsArray().Count);
            await admin.JsonAsync($"/api/cobertura?foco={manteca["idFoco"]}");

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
    public async Task Validaciones_y_permisos()
    {
        var admin = e.Admin();
        try
        {
            await CrearAsync(admin, new { nombre = "Pastas", idsArticulo = new[] { 900 } });
            await Error(admin, new { nombre = "Pastas", idsArticulo = new[] { 900 } }, "nombre");
            await Error(admin, new { nombre = " ", idsArticulo = new[] { 900 } }, "nombre");
            await Error(admin, new { nombre = "Otro", idsArticulo = Array.Empty<int>() }, "idsArticulo");
            await Error(admin, new { nombre = "Otro", idsArticulo = new[] { 123456 } }, "idsArticulo");
            Assert.Equal(HttpStatusCode.NotFound,
                (await admin.PutAsJsonAsync("/api/admin/focos/99999", new { nombre = "X", idsArticulo = new[] { 900 } })).StatusCode);

            await e.Operario().EstadoAsync("/api/admin/focos", HttpStatusCode.Forbidden);
            await e.Supervisor().EstadoAsync("/api/admin/articulos", HttpStatusCode.Forbidden);
            var r = await e.Supervisor().PostAsJsonAsync("/api/admin/focos", new { nombre = "Y", idsArticulo = new[] { 900 } });
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
