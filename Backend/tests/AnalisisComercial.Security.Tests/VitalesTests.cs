using System.Net;
using System.Text.Json.Nodes;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Clasificación de clientes (Cesar, 30/10/2026): el admin marca un cliente como Vital con un click. Por ahora es solo
/// una marca en la lista de clientes del admin.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class VitalesTests(Entorno e)
{
    private static JsonNode Fila(JsonNode r, int id) => r["filas"]!.AsArray().Single(x => (int)x!["idCliente"]! == id)!;

    [Fact]
    public async Task El_admin_marca_y_desmarca_un_vital()
    {
        var admin = e.Admin();
        try
        {
            var v = await JsonAsync(await admin.PutAsync("/api/admin/clientes/101/vital", null));
            Assert.Equal("checho@madomi", (string?)v["marcadoPor"]);
            var otra = await JsonAsync(await admin.PutAsync("/api/admin/clientes/101/vital", null));   // un segundo click no cambia nada
            Assert.Equal((string?)v["marcadoEn"], (string?)otra["marcadoEn"]);

            var lista = await admin.JsonAsync("/api/admin/clientes");
            Assert.True((bool)Fila(lista, 101)["vital"]!);
            Assert.Equal("checho@madomi", (string?)Fila(lista, 101)["vitalPor"]);
            Assert.False((bool)Fila(lista, 102)["vital"]!);
            Assert.Equal([101], (await admin.JsonAsync("/api/admin/clientes?vitales=solo"))["filas"].Ids());
            Assert.DoesNotContain(101, (await admin.JsonAsync("/api/admin/clientes?vitales=sin&tamano=200"))["filas"].Ids());
            var grupos = (await admin.JsonAsync("/api/admin/clientes/resumen")).AsArray();
            Assert.Equal(1, grupos.Sum(g => (int)g!["vitales"]!));
        }
        finally
        {
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync("/api/admin/clientes/101/vital")).StatusCode);
        }
        Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync("/api/admin/clientes/101/vital")).StatusCode);   // ya no era
        Assert.Empty((await admin.JsonAsync("/api/admin/clientes?vitales=solo"))["filas"]!.AsArray());
    }

    [Fact]
    public async Task Solo_el_admin_y_clientes_que_existen()
    {
        Assert.Equal(HttpStatusCode.NotFound, (await e.Admin().PutAsync("/api/admin/clientes/999999/vital", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await e.Operario().PutAsync("/api/admin/clientes/101/vital", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await e.Supervisor().DeleteAsync("/api/admin/clientes/101/vital")).StatusCode);
        await e.Admin().JsonAsync("/api/admin/clientes?vitales=quizas", HttpStatusCode.BadRequest);
    }

    private static async Task<JsonNode> JsonAsync(HttpResponseMessage r)
    {
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        return JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
    }
}
