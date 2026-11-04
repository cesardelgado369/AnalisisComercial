using System.Net;
using System.Text.Json.Nodes;
using AnalisisComercial.Application;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Gobernanza (Cesar, 30/10/2026): operario y supervisor ven solo los últimos meses (en producción 4; acá 2: septiembre
/// y octubre). Un mesDesde más viejo se recorta; un mesHasta o un mes de volumen más viejo → 400. El admin, desde julio.
/// </summary>
[Collection(ColeccionEntornoVentana.Nombre)]
public class VentanaTests(EntornoVentana e)
{
    private static string[] Meses(JsonNode r) => r["meses"]!.AsArray().Select(x => (string)x!).ToArray();

    [Fact]
    public async Task Operario_y_supervisor_recortan_mesDesde_a_la_ventana()
    {
        string[] ventana = ["2026-09-01", "2026-10-01"];
        Assert.Equal(ventana, Meses(await e.Operario().JsonAsync("/api/cobertura?mesDesde=2026-07-01&mesHasta=2026-10-01")));
        Assert.Equal(ventana, Meses(await e.Supervisor().JsonAsync("/api/cobertura")));
        Assert.Equal(4, Meses(await e.Admin().JsonAsync("/api/cobertura?mesDesde=2026-07-01&mesHasta=2026-10-01")).Length);
    }

    [Fact]
    public async Task Antes_de_la_ventana_da_400()
    {
        var r = await e.Operario().JsonAsync("/api/cobertura?mesDesde=2026-07-01&mesHasta=2026-08-01", HttpStatusCode.BadRequest);
        Assert.NotNull(r["errors"]!["mesHasta"]);
        await e.Supervisor().JsonAsync("/api/devoluciones?mesHasta=2026-08-01", HttpStatusCode.BadRequest);
        await e.Operario().JsonAsync("/api/clientes/101?mesDesde=2026-07-01&mesHasta=2026-08-01", HttpStatusCode.BadRequest);
        var v = await e.Supervisor().JsonAsync("/api/volumen?mes=2026-08-01", HttpStatusCode.BadRequest);
        Assert.NotNull(v["errors"]!["mes"]);
        await e.Admin().JsonAsync("/api/volumen?mes=2026-08-01");
    }

    [Fact]
    public async Task El_operario_ve_solo_Cobertura_y_la_ficha()
    {
        var op = e.Operario();
        Assert.False((bool)(await op.JsonAsync("/api/sesion"))["veBultos"]!);
        await op.JsonAsync("/api/cobertura");
        await op.JsonAsync("/api/clientes/101");
        await op.EstadoAsync("/api/volumen", HttpStatusCode.Forbidden);
        await op.EstadoAsync("/api/devoluciones", HttpStatusCode.Forbidden);
        await op.EstadoAsync("/api/clientes/101/volumen", HttpStatusCode.Forbidden);
        await op.EstadoAsync("/api/clientes/101/devoluciones", HttpStatusCode.Forbidden);

        Assert.True((bool)(await e.Supervisor().JsonAsync("/api/sesion"))["veBultos"]!);
        await e.Supervisor().JsonAsync("/api/volumen");
        await e.Admin().JsonAsync("/api/devoluciones");
    }

    [Fact]
    public async Task Freno_de_pedidos_por_persona_y_canal()
    {
        var web = e.Como("apurado@madomi", permisos: [Permisos.Ver, Permisos.Admin]);
        // Ventana fija de un minuto: en 61 pedidos seguidos hay un 429 aunque cambie el minuto en el medio.
        HttpResponseMessage? frenado = null;
        for (var i = 0; i < 61 && frenado is null; i++)
            if (await web.GetAsync("/api/sesion") is { StatusCode: HttpStatusCode.TooManyRequests } r)
                frenado = r;
        Assert.NotNull(frenado);
        Assert.Equal(429, (int)JsonNode.Parse(await frenado.Content.ReadAsStringAsync())!["status"]!);
        // El mismo usuario por el chatbot tiene su propio contador, y otra persona no se frena.
        await e.Como("apurado@madomi", permisos: [Permisos.Ver, Permisos.Admin], canal: "chatbot").JsonAsync("/api/sesion");
        await e.Admin().JsonAsync("/api/sesion");
    }
}
