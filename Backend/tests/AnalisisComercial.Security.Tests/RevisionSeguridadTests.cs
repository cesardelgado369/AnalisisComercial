using System.Net;
using System.Net.Http.Json;
using System.Text.Json.Nodes;
using AnalisisComercial.API;
using AnalisisComercial.Application;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// Lo que pidió la revisión de seguridad del 04/11/2026 (CHATBOT.md): freno por canal, la empresa en la autorización,
/// la administración en la política, los rechazos registrados y la espera entre actualizaciones.
/// </summary>
[Collection(ColeccionEntorno.Nombre)]
public class RevisionSeguridadTests(Entorno e)
{
    private static readonly Guid OtraEmpresa = Guid.Parse("B2C3D4E5-0000-4000-8000-000000000002");

    [Fact]
    public async Task Por_el_chatbot_solo_se_lee()
    {
        var bot = e.Como("checho@madomi", [Permisos.Ver, Permisos.Admin], canal: "chatbot");
        await bot.JsonAsync("/api/sesion");
        await bot.JsonAsync("/api/admin/clientes/resumen");

        var r = await bot.PutAsync("/api/admin/clientes/101/vital", null);
        Assert.Equal(HttpStatusCode.Forbidden, r.StatusCode);
        Assert.Equal(CanalChatbot.Mensaje, (string?)JsonNode.Parse(await r.Content.ReadAsStringAsync())!["title"]);
        Assert.Equal(HttpStatusCode.Forbidden, (await bot.PostAsync("/api/admin/sincronizaciones", null)).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bot.DeleteAsync("/api/admin/exclusiones/101")).StatusCode);
        Assert.Equal(HttpStatusCode.Forbidden, (await bot.PutAsJsonAsync("/api/admin/usuarios/1", new { email = "x@madomi" })).StatusCode);
        Assert.False(await e.ConBaseAsync(db => db.Vitales.AnyAsync(v => v.IdCliente == 101 && v.MarcadoPor == "checho@madomi")));
    }

    [Fact]
    public async Task Otra_empresa_queda_afuera_en_la_autorizacion_y_se_registra()
    {
        // Ni siendo SuperAdmin: la política mira tenant_id antes de llegar a los servicios.
        var otra = e.Como("intruso@otra", [Permisos.Ver, Permisos.Admin], empresa: OtraEmpresa, superAdmin: true);
        var r = await otra.JsonAsync("/api/admin/usuarios", HttpStatusCode.Forbidden);
        Assert.Equal("Análisis Comercial no está disponible para esta empresa.", (string?)r["title"]);
        await otra.EstadoAsync("/api/cobertura", HttpStatusCode.Forbidden);
        Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l =>
            l.Email == "intruso@otra" && l.Denegado && l.IdEmpresa == OtraEmpresa && l.Pantalla.StartsWith("rechazo"))));

        // La empresa se compara como GUID: en minúsculas (como la manda la plataforma) entra igual.
        Assert.Equal("admin", (string?)(await e.Como("checho@madomi", [Permisos.Ver, Permisos.Admin],
            empresa: Guid.Parse(Entorno.Madomi.ToString().ToLowerInvariant())).JsonAsync("/api/sesion"))["rol"]);
    }

    [Fact]
    public async Task La_administracion_la_exige_la_politica()
    {
        var r = await e.Supervisor().JsonAsync("/api/admin/usuarios", HttpStatusCode.Forbidden);
        Assert.Equal("La administración es solo para administradores.", (string?)r["title"]);
        Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l =>
            l.Email == "supervisor@madomi" && l.Denegado && l.Pantalla == "rechazo GET /api/admin/usuarios")));

        // SuperAdmin entra sin el permiso, y el claim se lee igual en la política y en la app («True» también).
        var s = await e.Como("root@vignoli", permisos: [], superAdminTexto: "True").JsonAsync("/api/admin/clientes/resumen");
        Assert.NotNull(s);
    }

    [Fact]
    public async Task El_registro_guarda_el_canal()
    {
        await e.Como("operario@madomi", canal: "chatbot").JsonAsync("/api/cobertura");
        Assert.True(await e.ConBaseAsync(db => db.AccesoLogs.AnyAsync(l =>
            l.Email == "operario@madomi" && l.Canal == "chatbot" && l.IdEmpresa == Entorno.Madomi)));
    }

    [Fact]
    public async Task Actualizar_ahora_tiene_una_espera_entre_pedidos()
    {
        var admin = e.Admin();
        // Una pedida hace 5 minutos y ya tomada por el Sync: igual hay que esperar (10 minutos por defecto).
        await e.ConBaseAsync(async db =>
        {
            await db.SyncSolicitudes.Where(s => s.TomadoEn == null).ExecuteDeleteAsync();
            db.SyncSolicitudes.Add(new Domain.SyncSolicitud
            {
                SolicitadoPor = "checho@madomi", SolicitadoEn = new DateTimeOffset(2026, 10, 26, 9, 55, 0, TimeSpan.FromHours(-3)),
                TomadoEn = new DateTimeOffset(2026, 10, 26, 9, 56, 0, TimeSpan.FromHours(-3)),
            });
            return await db.SaveChangesAsync();
        });
        try
        {
            var r = await admin.PostAsync("/api/admin/sincronizaciones", null);
            Assert.Equal(HttpStatusCode.Conflict, r.StatusCode);
            Assert.Contains("10:05", (string?)JsonNode.Parse(await r.Content.ReadAsStringAsync())!["title"]);
        }
        finally
        {
            // Sin dejarla: la prueba de contrato pide una actualización y espera 202.
            await e.ConBaseAsync(db => db.SyncSolicitudes.Where(s => s.TomadoEn != null).ExecuteDeleteAsync());
        }
    }
}
