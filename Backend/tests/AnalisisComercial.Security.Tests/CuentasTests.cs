using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// /api/admin/cuentas (30/10/2026): las cuentas de Madomi de la plataforma cruzadas con los accesos de la app, y el alta
/// de un vendedor en un paso (cuenta en la plataforma + acceso). La plataforma es <see cref="PlataformaFalsa"/>.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class CuentasTests(Entorno e)
{
    private static object Alta(string usuario, string password = "Clave1234", int vendedor = 2)
        => new { usuario, nombre = "Vendedor Nuevo", password, rol = "operario", idsPersonal = new[] { vendedor } };

    private async Task<JsonNode> ErrorAsync(object cuerpo, string campo)
    {
        var r = await e.Admin().PostAsJsonAsync("/api/admin/cuentas", cuerpo);
        var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
        Assert.True(r.StatusCode == HttpStatusCode.BadRequest, $"esperaba 400 y vino {(int)r.StatusCode}: {json}");
        Assert.NotNull(json["errors"]![campo]);
        return json;
    }

    [Fact]
    public async Task Las_cuentas_de_la_plataforma_con_su_acceso()
    {
        var cuentas = (await e.Admin().JsonAsync("/api/admin/cuentas")).AsArray().ToDictionary(c => (string)c!["usuario"]!);

        var checho = cuentas["checho@madomi"]!;
        Assert.Equal(("admin", true, "2026-10-26T10:00:00-03:00"),
            ((string?)checho["rol"], (bool)checho["cuentaActiva"]!, (string?)checho["ultimoIngreso"]));
        Assert.Null(checho["idAcceso"]);

        var uno = cuentas["operario@madomi"]!;
        Assert.Equal(("operario", "Vendedor Uno", true), ((string?)uno["rol"], (string?)uno["nombre"], (bool)uno["accesoActivo"]!));
        Assert.Equal([1], uno["idsPersonal"]!.AsArray().Select(x => (int)x!));
        Assert.NotNull(uno["idAcceso"]);
        Assert.NotNull(uno["version"]);
        Assert.Equal("supervisor", (string?)cuentas["supervisor@madomi"]!["rol"]);

        // Entra con De Ruta y no tiene acceso a esta app.
        Assert.Null(cuentas["derutas@madomi"]!["rol"]);
        Assert.True((bool)cuentas["derutas@madomi"]!["federada"]!);

        // Un acceso por email de alguien que todavía no tiene cuenta en la plataforma.
        var nuevo = cuentas["nuevo@madomi"]!;
        Assert.Null(nuevo["idUsuario"]);
        Assert.Equal(("operario", false), ((string?)nuevo["rol"], (bool)nuevo["cuentaActiva"]!));

        await e.Operario().EstadoAsync("/api/admin/cuentas", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/admin/cuentas", HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Alta_de_un_vendedor_en_un_paso()
    {
        const string usuario = "vendedor.nuevo@madomi";
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/cuentas", Alta("Vendedor.Nuevo@madomi"));
        try
        {
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);
            var c = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
            Assert.Equal(("operario", usuario, true), ((string?)c["rol"], (string?)c["usuario"], (bool)c["cuentaActiva"]!));
            Assert.NotNull(c["idUsuario"]);

            // El acceso queda por email y sin enlazar: se enlaza la primera vez que entra.
            var acceso = await e.ConBaseAsync(db => db.Accesos.Include(a => a.Vendedores).SingleAsync(a => a.Email == usuario));
            Assert.Null(acceso.IdUsuario);
            Assert.Equal([2], acceso.Vendedores.Select(v => v.IdPersonal));

            var fila = (await admin.JsonAsync("/api/admin/cuentas")).AsArray().Single(x => (string?)x!["usuario"] == usuario)!;
            Assert.Equal(acceso.IdAcceso, (int)fila["idAcceso"]!);
            Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l => l.Pantalla == "admin-cuentas" && l.Parametros!.Contains(usuario))));
        }
        finally
        {
            await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == usuario).ExecuteDeleteAsync());
            e.Plataforma.Quitar(usuario);
        }
    }

    [Fact]
    public async Task Si_algo_de_la_app_no_va_no_se_crea_la_cuenta()
    {
        var altas = e.Plataforma.Altas;
        await ErrorAsync(Alta("casa@madomi", vendedor: 6), "idsPersonal");         // la casa no se da a un vendedor
        await ErrorAsync(Alta("operario@madomi"), "usuario");                       // ya tiene acceso
        await ErrorAsync(new { usuario = "sinrol@madomi", nombre = "X", password = "Clave1234", idsPersonal = new[] { 2 } }, "rol");
        Assert.Equal(altas, e.Plataforma.Altas);

        // Lo que rechaza la plataforma vuelve con los campos de esta API, y no queda un acceso suelto.
        await ErrorAsync(Alta("derutas@madomi"), "usuario");                        // la cuenta ya existe
        await ErrorAsync(Alta("corta@madomi", password: "1234"), "password");
        Assert.False(await e.ConBaseAsync(db => db.Accesos.AnyAsync(a => a.Email == "derutas@madomi" || a.Email == "corta@madomi")));

        var r = await e.Operario().PostAsJsonAsync("/api/admin/cuentas", Alta("otro@madomi"));
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
    }
}
