using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AnalisisComercial.Application;
using AnalisisComercial.Domain;
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
        Assert.False((bool)nuevo["accesoEnlazado"]!);
        Assert.True((bool)cuentas["supervisor@madomi"]!["accesoEnlazado"]!);
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

            // El acceso queda enlazado a la cuenta recién creada (nunca se enlaza al entrar).
            var acceso = await e.ConBaseAsync(db => db.Accesos.Include(a => a.Vendedores).SingleAsync(a => a.Email == usuario));
            Assert.Equal((Guid)c["idUsuario"]!, acceso.IdUsuario);
            Assert.True((bool)c["accesoEnlazado"]!);
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

    private static IEnumerable<int> Vendedores(JsonNode sesion) => sesion["vendedores"]!.AsArray().Select(v => (int)v!["id"]!).Order();

    [Fact]
    public async Task Supervisor_de_todos_los_vendedores()
    {
        // Checho, 19/11/2026: un supervisor que ve a todos los chicos, también a los que Chess sume después. La casa, no.
        const string usuario = "jefe.ventas@madomi";
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/cuentas",
            new { usuario, nombre = "Jefe de Ventas", password = "Clave1234", rol = "supervisor", todosLosVendedores = true });
        try
        {
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);
            var c = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
            Assert.True((bool)c["todosLosVendedores"]!);
            Assert.Empty(c["idsPersonal"]!.AsArray());

            var jefe = e.Como(usuario, idUsuario: (Guid)c["idUsuario"]!);
            var sesion = await jefe.JsonAsync("/api/sesion");
            Assert.Equal("supervisor", (string?)sesion["rol"]);
            Assert.Equal([1, 2, 7], Vendedores(sesion));
            await jefe.EstadoAsync("/api/admin/cuentas", HttpStatusCode.Forbidden);   // supervisor, no admin

            // Un vendedor que Chess da de alta después entra solo, sin tocar el acceso.
            await e.ConBaseAsync(async db =>
            {
                db.Vendedores.Add(new Vendedor { IdPersonal = 8, Nombre = "VENDEDOR OCHO", EsPersona = true, Activo = true });
                return await db.SaveChangesAsync();
            });
            Assert.Equal([1, 2, 7, 8], Vendedores(await jefe.JsonAsync("/api/sesion")));

            var acceso = (await admin.JsonAsync("/api/admin/usuarios")).AsArray().Single(a => (string?)a!["email"] == usuario)!;
            Assert.True((bool)acceso["todosLosVendedores"]!);

            // Pasa a un equipo fijo: ve solo ese.
            var put = await admin.PutAsJsonAsync($"/api/admin/usuarios/{acceso["idAcceso"]}", new
            {
                email = usuario, rol = "supervisor", idsPersonal = new[] { 2 }, todosLosVendedores = false,
                version = (string?)acceso["version"],
            });
            Assert.Equal(HttpStatusCode.OK, put.StatusCode);
            Assert.Equal([2], Vendedores(await jefe.JsonAsync("/api/sesion")));

            // Todos es solo para supervisores.
            var op = await admin.PostAsJsonAsync("/api/admin/usuarios",
                new { email = "todos.op@madomi", rol = "operario", idsPersonal = new[] { 1 }, todosLosVendedores = true });
            Assert.Equal(HttpStatusCode.BadRequest, op.StatusCode);
            Assert.NotNull(JsonNode.Parse(await op.Content.ReadAsStringAsync())!["errors"]!["todosLosVendedores"]);
        }
        finally
        {
            await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == usuario || a.Email == "todos.op@madomi").ExecuteDeleteAsync());
            await e.ConBaseAsync(db => db.Vendedores.Where(v => v.IdPersonal == 8).ExecuteDeleteAsync());
            e.Plataforma.Quitar(usuario);
        }
    }

    [Fact]
    public async Task Borrar_una_cuenta()
    {
        // Checho, 19/11/2026. La plataforma la da de baja (no entra más) y acá se borra su acceso: sale de la lista.
        const string usuario = "se.va@madomi";
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/cuentas", Alta(usuario));
        try
        {
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);
            var id = (Guid)JsonNode.Parse(await r.Content.ReadAsStringAsync())!["idUsuario"]!;
            var fila = (await admin.JsonAsync("/api/admin/cuentas")).AsArray().Single(x => (string?)x!["usuario"] == usuario)!;
            Assert.True((bool)fila["seBorra"]!);
            var persona = e.Como(usuario, idUsuario: id);
            await persona.EstadoAsync("/api/sesion", HttpStatusCode.OK);

            var bajas = e.Plataforma.Bajas;
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/cuentas/{id}")).StatusCode);
            Assert.Equal(bajas + 1, e.Plataforma.Bajas);
            Assert.False(e.Plataforma.Cuenta(usuario)!.Activa);
            Assert.False(await e.ConBaseAsync(db => db.Accesos.AnyAsync(a => a.Email == usuario)));
            Assert.DoesNotContain(usuario, (await admin.JsonAsync("/api/admin/cuentas")).AsArray().Select(x => (string?)x!["usuario"]));
            // Aunque le quede un token vigente, ya no tiene acceso.
            await persona.EstadoAsync("/api/sesion", HttpStatusCode.Forbidden);
            Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l => l.Pantalla == "admin-cuentas" && l.Parametros == "baja=" + usuario)));

            // Repetirlo no hace daño ni vuelve a llamar a la plataforma.
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/cuentas/{id}")).StatusCode);
            Assert.Equal(bajas + 1, e.Plataforma.Bajas);
        }
        finally
        {
            await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == usuario).ExecuteDeleteAsync());
            e.Plataforma.Quitar(usuario);
        }
    }

    [Fact]
    public async Task Lo_que_no_se_borra_desde_aca()
    {
        var dueno = e.Plataforma.Agregar("dueno@madomi", new RolPlataforma(26, RolesPlataforma.Dueno));
        try
        {
            var admin = e.Admin();
            var cuentas = (await admin.JsonAsync("/api/admin/cuentas")).AsArray().ToDictionary(c => (string)c!["usuario"]!);
            Assert.Equal("admin", (string?)cuentas["dueno@madomi"]!["rol"]);   // el Dueño es admin acá, como el Administrador
            Assert.Equal((false, false, false, true, true),
                ((bool)cuentas["checho@madomi"]!["seBorra"]!, (bool)cuentas["dueno@madomi"]!["seBorra"]!,
                 (bool)cuentas["derutas@madomi"]!["seBorra"]!, (bool)cuentas["operario@madomi"]!["seBorra"]!,
                 (bool)cuentas["nuevo@madomi"]!["seBorra"]!));

            var bajas = e.Plataforma.Bajas;
            async Task Error(HttpClient c, Guid id, string mensaje)
            {
                var r = await c.DeleteAsync($"/api/admin/cuentas/{id}");
                var json = JsonNode.Parse(await r.Content.ReadAsStringAsync())!;
                Assert.True(r.StatusCode == HttpStatusCode.BadRequest, $"esperaba 400 y vino {(int)r.StatusCode}: {json}");
                Assert.Contains(mensaje, (string?)json["errors"]!["cuenta"]![0]);
            }
            await Error(admin, Entorno.IdDe("checho@madomi"), "propia");
            var vignoli = e.Como("cesar@vignoli", superAdmin: true);
            await Error(vignoli, Entorno.IdDe("checho@madomi"), "administrador");
            await Error(vignoli, dueno, "administrador");
            await Error(admin, Entorno.IdDe("derutas@madomi"), "De Ruta");
            Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/cuentas/{Guid.NewGuid()}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await e.Supervisor().DeleteAsync($"/api/admin/cuentas/{Entorno.IdDe("operario@madomi")}")).StatusCode);
            Assert.Equal(HttpStatusCode.Forbidden, (await e.Operario().DeleteAsync($"/api/admin/cuentas/{Entorno.IdDe("supervisor@madomi")}")).StatusCode);

            Assert.Equal(bajas, e.Plataforma.Bajas);
            Assert.True(await e.ConBaseAsync(db => db.Accesos.AnyAsync(a => a.Email == "operario@madomi")));
            Assert.True(e.Plataforma.Cuenta("operario@madomi")!.Activa);
        }
        finally
        {
            e.Plataforma.Quitar("dueno@madomi");
        }
    }

    [Fact]
    public async Task Borrar_un_acceso_sin_cuenta()
    {
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/usuarios", new { email = "pendiente@madomi", rol = "operario", idsPersonal = new[] { 1 } });
        try
        {
            Assert.Equal(HttpStatusCode.Created, r.StatusCode);
            var id = (int)JsonNode.Parse(await r.Content.ReadAsStringAsync())!["idAcceso"]!;
            Assert.Equal(HttpStatusCode.Forbidden, (await e.Supervisor().DeleteAsync($"/api/admin/usuarios/{id}")).StatusCode);
            Assert.Equal(HttpStatusCode.NoContent, (await admin.DeleteAsync($"/api/admin/usuarios/{id}")).StatusCode);
            Assert.False(await e.ConBaseAsync(db => db.Accesos.AnyAsync(a => a.Email == "pendiente@madomi")));
            Assert.Equal(HttpStatusCode.NotFound, (await admin.DeleteAsync($"/api/admin/usuarios/{id}")).StatusCode);
        }
        finally
        {
            await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == "pendiente@madomi").ExecuteDeleteAsync());
        }
    }
}
