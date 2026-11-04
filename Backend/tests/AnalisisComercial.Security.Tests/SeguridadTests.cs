using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using AnalisisComercial.Application;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

internal static class Http
{
    public static async Task<JsonNode> JsonAsync(this HttpClient c, string url, HttpStatusCode esperado = HttpStatusCode.OK)
    {
        var r = await c.GetAsync(url);
        var cuerpo = await r.Content.ReadAsStringAsync();
        Assert.True(r.StatusCode == esperado, $"{url}: esperaba {(int)esperado} y vino {(int)r.StatusCode}: {cuerpo}");
        return cuerpo.Length == 0 ? new JsonObject() : JsonNode.Parse(cuerpo)!;
    }

    public static async Task EstadoAsync(this HttpClient c, string url, HttpStatusCode esperado)
        => Assert.Equal(esperado, (await c.GetAsync(url)).StatusCode);

    public static IEnumerable<int> Ids(this JsonNode? lista, string campo = "idCliente")
        => lista!.AsArray().Select(x => x![campo]!.GetValue<int>()).Order();
}

/// <summary>
/// Las pruebas obligatorias (CONTEXTO_BACKEND §7): un operario no ve clientes de otra ruta, ni pidiendo su id; sin
/// vínculo no ve nada; un supervisor ve solo a sus vendedores; Deposito (la casa) solo el Admin. Más la sesión.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class SeguridadTests(Entorno e)
{
    // ---- sesión del login central

    [Fact]
    public async Task Sin_token_401() => await e.SinToken().EstadoAsync("/api/cobertura", HttpStatusCode.Unauthorized);

    [Fact]
    public async Task Token_firmado_con_otra_clave_401()
        => await e.Como("operario@madomi", firmadoCon: ECDsa.Create(ECCurve.NamedCurves.nistP256))
            .EstadoAsync("/api/cobertura", HttpStatusCode.Unauthorized);

    [Fact]
    public async Task Empresa_sin_la_app_contratada_403()
        => await e.Como("operario@madomi", conModulo: false).EstadoAsync("/api/cobertura", HttpStatusCode.Forbidden);

    [Fact]
    public async Task Sin_el_permiso_ver_403()
        => await e.Como("operario@madomi", permisos: []).EstadoAsync("/api/sesion", HttpStatusCode.Forbidden);

    [Fact]
    public async Task Otra_empresa_403_aunque_sea_admin()
        => await e.Como("alguien@otra", [Permisos.Ver, Permisos.Admin], empresa: Guid.NewGuid())
            .EstadoAsync("/api/cobertura", HttpStatusCode.Forbidden);

    // ---- operario

    [Fact]
    public async Task Operario_ve_solo_los_clientes_de_su_ruta()
    {
        var c = await e.Operario().JsonAsync("/api/cobertura");
        Assert.Equal([101, 102], c["clientes"].Ids());
        Assert.Equal("VENDEDOR UNO", (string?)c["titulo"]);
    }

    [Fact]
    public async Task Operario_que_pide_otro_vendedor_403_y_queda_registrado()
    {
        var antes = await e.ConBaseAsync(db => db.AccesoLogs.CountAsync(l => l.Denegado && l.Email == "operario@madomi"));
        await e.Operario().EstadoAsync("/api/cobertura?vendedor=2", HttpStatusCode.Forbidden);
        await e.Operario().EstadoAsync("/api/cobertura?vendedor=6", HttpStatusCode.Forbidden);
        await e.Operario().EstadoAsync("/api/ruta-hoy?vendedor=2", HttpStatusCode.Forbidden);
        var despues = await e.ConBaseAsync(db => db.AccesoLogs.CountAsync(l => l.Denegado && l.Email == "operario@madomi"));
        Assert.Equal(antes + 3, despues);
    }

    [Fact]
    public async Task Operario_no_ve_la_ficha_de_un_cliente_ajeno_ni_pidiendo_el_id()
    {
        await e.Operario().JsonAsync("/api/clientes/101");
        await e.Operario().JsonAsync("/api/clientes/201", HttpStatusCode.NotFound);   // de DOS
        await e.Operario().JsonAsync("/api/clientes/301", HttpStatusCode.NotFound);   // de la casa
        await e.Operario().JsonAsync("/api/clientes/401", HttpStatusCode.NotFound);   // sin vendedor
        await e.Operario().JsonAsync("/api/clientes/999999", HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task Operario_sin_resumen_ni_administracion()
    {
        await e.Operario().EstadoAsync("/api/resumen", HttpStatusCode.Forbidden);
        await e.Operario().EstadoAsync("/api/admin/usuarios", HttpStatusCode.Forbidden);
        await e.Operario().EstadoAsync("/api/admin/sincronizaciones", HttpStatusCode.Forbidden);
        var r = await e.Operario().PostAsync("/api/admin/sincronizaciones", null);
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
    }

    [Fact]
    public async Task Sesion_del_operario()
    {
        var s = await e.Operario().JsonAsync("/api/sesion");
        Assert.Equal("operario", (string?)s["rol"]);
        Assert.Equal(1, (int?)s["vendedor"]!["idPersonal"]);
        Assert.Equal([1], s["vendedores"].Ids("id"));
        Assert.Equal("2026-10-26", (string?)s["hoy"]);
        Assert.Equal("2026-10-01", (string?)s["mesEnCurso"]);
    }

    // ---- sin vínculo

    [Fact]
    public async Task Sin_acceso_cargado_403_con_mensaje_legible_en_todo()
    {
        var sinAcceso = e.Como("nadie@madomi");
        var r = await sinAcceso.JsonAsync("/api/sesion", HttpStatusCode.Forbidden);
        Assert.Equal(AccesoDenegadoException.SinAcceso, (string?)r["title"]);
        await sinAcceso.EstadoAsync("/api/cobertura", HttpStatusCode.Forbidden);
        await sinAcceso.EstadoAsync("/api/clientes/101", HttpStatusCode.Forbidden);
        await sinAcceso.EstadoAsync("/api/ruta-hoy", HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task Un_acceso_pendiente_no_se_hereda_poniendose_su_email()
    {
        // Revisión de seguridad del 04/11/2026: la plataforma deja cambiar el email propio sin verificarlo. Quien se pone
        // el email de un acceso pendiente no lo hereda: el acceso se enlaza cuando el Admin lo guarda, no al entrar.
        await e.Como("nuevo@madomi", idUsuario: Guid.NewGuid()).EstadoAsync("/api/sesion", HttpStatusCode.Forbidden);
        Assert.Null(await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == "nuevo@madomi").Select(a => a.IdUsuario).SingleAsync()));

        // Y la cuenta enlazada sigue entrando aunque cambie su email en la plataforma.
        await e.Como("otro.email@madomi", idUsuario: Entorno.IdDe("operario@madomi")).JsonAsync("/api/sesion");
    }

    [Fact]
    public async Task El_admin_enlaza_el_acceso_a_la_cuenta_al_guardarlo()
    {
        var admin = e.Admin();
        var r = await admin.PostAsJsonAsync("/api/admin/usuarios", new { email = "pendiente@madomi", rol = "operario", idsPersonal = new[] { 1 } });
        var creado = (await r.Content.ReadFromJsonAsync<JsonNode>())!;
        await e.Como("pendiente@madomi").EstadoAsync("/api/sesion", HttpStatusCode.Forbidden);   // todavía sin cuenta

        // Le crean la cuenta en la plataforma; al volver a guardar el acceso, el Admin lo enlaza a esa cuenta.
        var cuenta = e.Plataforma.Agregar("pendiente@madomi");
        var ok = await admin.PutAsJsonAsync($"/api/admin/usuarios/{creado["idAcceso"]}",
            new { email = "pendiente@madomi", rol = "operario", idsPersonal = new[] { 1 }, version = (string?)creado["version"] });
        Assert.Equal(HttpStatusCode.OK, ok.StatusCode);
        Assert.False((bool)(await ok.Content.ReadFromJsonAsync<JsonNode>())!["entro"]!);
        Assert.Equal(cuenta, await e.ConBaseAsync(db => db.Accesos.Where(a => a.Email == "pendiente@madomi").Select(a => a.IdUsuario).SingleAsync()));
        await e.Como("pendiente@madomi").JsonAsync("/api/sesion");
        await e.Como("pendiente@madomi", idUsuario: Guid.NewGuid()).EstadoAsync("/api/sesion", HttpStatusCode.Forbidden);
    }

    // ---- supervisor

    [Fact]
    public async Task Supervisor_ve_solo_a_sus_vendedores()
    {
        var c = await e.Supervisor().JsonAsync("/api/cobertura");
        Assert.Equal([201], c["clientes"].Ids());
        Assert.Equal([2], (await e.Supervisor().JsonAsync("/api/cobertura/vendedores")).Ids("id"));
        await e.Supervisor().EstadoAsync("/api/cobertura?vendedor=1", HttpStatusCode.Forbidden);
        await e.Supervisor().JsonAsync("/api/clientes/101", HttpStatusCode.NotFound);
        var resumen = await e.Supervisor().JsonAsync("/api/resumen");
        Assert.Equal([2], resumen.Ids("idPersonal"));
    }

    // ---- la casa (Deposito)

    [Fact]
    public async Task La_casa_solo_la_ve_el_admin_y_no_entra_en_todos_los_vendedores()
    {
        await e.Supervisor().EstadoAsync("/api/cobertura?vendedor=6", HttpStatusCode.Forbidden);
        await e.Supervisor().JsonAsync("/api/clientes/301", HttpStatusCode.NotFound);

        var todos = await e.Admin().JsonAsync("/api/cobertura");
        Assert.Equal([101, 102, 201, 501], todos["clientes"].Ids());
        Assert.Equal("Todos los vendedores", (string?)todos["titulo"]);

        var casa = await e.Admin().JsonAsync("/api/cobertura?vendedor=6");
        Assert.Equal([301, 401], casa["clientes"].Ids());   // también las rutas sin vendedor
        var sinVendedor = casa["clientes"]!.AsArray().Single(x => (int)x!["idCliente"]! == 401)!;
        Assert.Null(sinVendedor["idPersonal"]);
        Assert.Null(sinVendedor["vendedor"]);
        Assert.Equal("Cuentas de la casa", (string?)casa["titulo"]);

        var opciones = (await e.Admin().JsonAsync("/api/sesion"))["vendedores"]!.AsArray();
        Assert.Equal([2, 1, 7, 6], opciones.Select(o => (int)o!["id"]!));   // por nombre (DOS, UNO, UNO BIS) y la casa al final
        Assert.True((bool)opciones[^1]!["esCasa"]!);
        Assert.Equal("Cuentas de la casa (Deposito)", (string?)opciones[^1]!["nombre"]);

        await e.Admin().JsonAsync("/api/clientes/401");
        Assert.Equal([1, 2, 6, 7], (await e.Admin().JsonAsync("/api/resumen")).Ids("idPersonal").Order());
    }

    // ---- operario con varios vendedores (Chess renombró a su vendedor)

    [Fact]
    public async Task Operario_con_varios_vendedores_ve_la_union_y_nada_mas()
    {
        var doble = e.Como("doble@madomi");
        var c = await doble.JsonAsync("/api/cobertura");
        Assert.Equal([101, 102, 501], c["clientes"].Ids());
        Assert.Equal("VENDEDOR UNO / VENDEDOR UNO BIS", (string?)c["titulo"]);

        var s = await doble.JsonAsync("/api/sesion");
        Assert.Equal("operario", (string?)s["rol"]);
        Assert.Null(s["vendedor"]);                                   // con varios, van todos en `vendedores`
        Assert.Equal([1, 7], s["vendedores"].Ids("id"));

        Assert.Equal([501], (await doble.JsonAsync("/api/cobertura?vendedor=7"))["clientes"].Ids());
        await doble.EstadoAsync("/api/cobertura?vendedor=2", HttpStatusCode.Forbidden);
        await doble.JsonAsync("/api/clientes/501");
        await doble.JsonAsync("/api/clientes/201", HttpStatusCode.NotFound);
        // El operario de un solo vendedor sigue trayendo `vendedor`.
        Assert.Equal(1, (int?)(await e.Operario().JsonAsync("/api/sesion"))["vendedor"]!["idPersonal"]);
    }

    [Fact]
    public async Task La_administracion_de_clientes_y_vendedores_es_solo_del_admin()
    {
        await e.Operario().EstadoAsync("/api/admin/vendedores", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/admin/clientes", HttpStatusCode.Forbidden);
        await e.Supervisor().EstadoAsync("/api/admin/clientes/resumen", HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task El_superadmin_es_admin_aunque_no_traiga_los_permisos()
    {
        var s = await e.Como("root@vignoli", permisos: [], superAdmin: true).JsonAsync("/api/sesion");
        Assert.Equal("admin", (string?)s["rol"]);
    }

    [Fact]
    public async Task Un_acceso_desactivado_deja_de_entrar_en_el_proximo_request()
    {
        var admin = e.Admin();
        e.Plataforma.Agregar("temporal@madomi");
        var creado = await (await admin.PostAsJsonAsync("/api/admin/usuarios",
            new { email = "temporal@madomi", rol = "operario", idsPersonal = new[] { 2 } })).Content.ReadFromJsonAsync<JsonNode>();
        var temporal = e.Como("temporal@madomi");
        Assert.Equal([201], (await temporal.JsonAsync("/api/cobertura"))["clientes"].Ids());

        // Entrar no cambia la versión: el Admin guarda con la que leyó al crearlo, sin 409 falso.
        var r = await admin.PutAsJsonAsync($"/api/admin/usuarios/{creado!["idAcceso"]}",
            new { email = "temporal@madomi", rol = "operario", idsPersonal = new[] { 2 }, activo = false, version = (string?)creado["version"] });
        Assert.Equal(HttpStatusCode.OK, r.StatusCode);
        await temporal.EstadoAsync("/api/cobertura", HttpStatusCode.Forbidden);
    }
}
