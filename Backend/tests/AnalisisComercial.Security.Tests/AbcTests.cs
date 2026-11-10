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
