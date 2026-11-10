using System.Net;
using System.Text.Json.Nodes;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Clientes A, B y C (Cesar, 10/11/2026): solo los ve el Admin. En el Entorno la base de octubre es julio a septiembre:
/// netos 101 = 4 (2 − 1 de la nota de crédito + 3), 102 = 4, 103 = 2 y 201 = 2, de 12. 101, 102 y 103 empiezan antes
/// del 80 % (A); 201 empieza en el 83 % (B); el resto no compró (C).
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class AbcTests(Entorno e)
{
    private static string? Abc(JsonNode clientes, int id)
        => (string?)clientes.AsArray().Single(c => (int)c!["idCliente"]! == id)!["abc"];

    [Fact]
    public async Task El_admin_ve_el_grupo_de_cada_cliente_y_la_cobertura_por_grupo()
    {
        var admin = e.Admin();
        var cobertura = await admin.JsonAsync("/api/cobertura");
        Assert.Equal("A", Abc(cobertura["clientes"]!, 101));
        Assert.Equal("B", Abc(cobertura["clientes"]!, 201));
        Assert.Equal("B", (string?)(await admin.JsonAsync("/api/clientes/201"))["abc"]);

        // Volumen de octubre, todos los vendedores: 101 y 102 (A, compró 101), 201 (B) y 501 (C).
        var volumen = await admin.JsonAsync("/api/volumen");
        Assert.Equal("C", Abc(volumen["clientes"]!, 501));
        var grupos = volumen["abc"]!.AsArray();
        Assert.Equal(["A", "B", "C"], grupos.Select(g => (string?)g!["grupo"]));
        Assert.Equal((2, 1, 50.0m), ((int)grupos[0]!["clientes"]!, (int)grupos[0]!["conCompra"]!, (decimal)grupos[0]!["porcentaje"]!));
        Assert.Equal((1, 0), ((int)grupos[1]!["clientes"]!, (int)grupos[1]!["conCompra"]!));

        // Sin base (julio, el primer mes con datos): no viaja.
        var julio = await admin.JsonAsync("/api/cobertura?mesDesde=2026-07-01&mesHasta=2026-07-01");
        Assert.All(julio["clientes"]!.AsArray(), c => Assert.False(c!.AsObject().ContainsKey("abc")));
    }

    [Fact]
    public async Task El_filtro_recorta_la_cartera_de_cada_mes_con_su_categoria()
    {
        var admin = e.Admin();
        // Octubre: A = 101 y 102 (compró 101). Septiembre, con su propia base (julio y agosto): A = 102, 103 y 201 (compró 102).
        var cobertura = await admin.JsonAsync("/api/cobertura?abc=A");
        var kpis = cobertura["kpis"]!.AsArray().ToDictionary(k => (string)k!["mes"]!);
        Assert.Equal((1, 2), ((int)kpis["2026-10-01"]!["clientesConCompra"]!, (int)kpis["2026-10-01"]!["clientesCartera"]!));
        Assert.Equal((1, 3), ((int)kpis["2026-09-01"]!["clientesConCompra"]!, (int)kpis["2026-09-01"]!["clientesCartera"]!));
        Assert.Equal([101, 102], cobertura["clientes"]!.AsArray().Select(c => (int)c!["idCliente"]!).Order());
        Assert.EndsWith(", clientes A", (string?)cobertura["subtitulo"]);

        var volumen = await admin.JsonAsync("/api/volumen?abc=b");
        Assert.Equal([201], volumen["clientes"]!.AsArray().Select(c => (int)c!["idCliente"]!));
        Assert.Equal([0, 1, 0], volumen["abc"]!.AsArray().Select(g => (int)g!["clientes"]!));
        await admin.JsonAsync("/api/devoluciones?abc=C");

        Assert.NotNull((await admin.JsonAsync("/api/cobertura?abc=D", HttpStatusCode.BadRequest))["errors"]!["abc"]);
        Assert.NotNull((await admin.JsonAsync("/api/cobertura?mesDesde=2026-07-01&mesHasta=2026-07-01&abc=A",
            HttpStatusCode.BadRequest))["errors"]!["abc"]);

        await e.Operario().EstadoAsync("/api/cobertura?abc=A", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/volumen?abc=A", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/devoluciones?abc=A", HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Operario_y_supervisor_nunca_la_ven()
    {
        foreach (var quien in new[] { e.Operario(), e.Supervisor() })
        {
            var cobertura = await quien.JsonAsync("/api/cobertura");
            Assert.All(cobertura["clientes"]!.AsArray(), c => Assert.False(c!.AsObject().ContainsKey("abc")));
            var volumen = await quien.JsonAsync("/api/volumen");
            Assert.False(volumen.AsObject().ContainsKey("abc"));
            Assert.All(volumen["clientes"]!.AsArray(), c => Assert.False(c!.AsObject().ContainsKey("abc")));
        }
        Assert.False((await e.Operario().JsonAsync("/api/clientes/101")).AsObject().ContainsKey("abc"));
    }
}
