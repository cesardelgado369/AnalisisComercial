using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using AnalisisComercial.API;
using AnalisisComercial.Application;
using AnalisisComercial.Infrastructure;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

// ---- Composition root
builder.Services.AddInfraestructura(builder.Configuration);
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUsuarioActual, UsuarioActual>();
builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
        o.JsonSerializerOptions.Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping;
    })
    .ConfigureApiBehaviorOptions(o => o.InvalidModelStateResponseFactory = ErroresDeBinding.Respuesta);

// ---- El token es el del login central (Vignoli.Plataforma), firmado con ES256. Se verifica con su clave PÚBLICA
// (Jwt:ClavePublica, base64 del DER o PEM): esta API no puede fabricar sesiones aunque alguien lea su configuración.
var desarrollo = builder.Environment.IsDevelopment()
                 && builder.Configuration.GetValue("Autenticacion:Desarrollo:Habilitado", false);   // TODO testing
var textoClave = builder.Configuration["Jwt:ClavePublica"];
var ecdsa = ECDsa.Create(ECCurve.NamedCurves.nistP256);
if (!string.IsNullOrWhiteSpace(textoClave))
    ecdsa.ImportSubjectPublicKeyInfo(Convert.FromBase64String(string.Concat(textoClave.Replace("\\n", "\n").Split('\n')
        .Select(l => l.Trim()).Where(l => l.Length > 0 && !l.StartsWith("-----")))), out _);
else if (!desarrollo)
    throw new InvalidOperationException("Falta Jwt:ClavePublica (la clave pública del login central).");
// (En desarrollo sin clave queda un par al azar: ningún token pasa y se entra solo sin Authorization.)

const string Seleccion = "Seleccion";
var autenticacion = builder.Services
    .AddAuthentication(Seleccion)
    .AddPolicyScheme(Seleccion, null, o => o.ForwardDefaultSelector = ctx =>
        desarrollo && !ctx.Request.Headers.ContainsKey("Authorization")
            ? AutenticacionDesarrollo.Esquema
            : JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(o =>
    {
        o.MapInboundClaims = false;   // conservar sub, email, tenant_id, role, perm, mod tal cual
        o.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true, ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "Vignoli.Plataforma",
            ValidateAudience = true, ValidAudience = builder.Configuration["Jwt:Audience"] ?? "Vignoli.Modulos",
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new ECDsaSecurityKey(ecdsa),
            ValidAlgorithms = [SecurityAlgorithms.EcdsaSha256],
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            RoleClaimType = "role",
            NameClaimType = "email",
        };
    });
if (desarrollo)
    autenticacion.AddScheme<AuthenticationSchemeOptions, AutenticacionDesarrollo>(AutenticacionDesarrollo.Esquema, null);

// Todo exige sesión y que la empresa tenga la app contratada (claim `mod`); cada controller pide además su permiso.
// El rol en la app (admin / supervisor / operario) y el alcance los resuelve IAlcanceUsuario en cada request.
// La DefaultPolicy es igual a la Fallback: un [Authorize] suelto tampoco se saltea el módulo ni la empresa.
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PoliticaPorPermiso>();
builder.Services.AddSingleton<IAuthorizationMiddlewareResultHandler, RegistroDeRechazos>();
var idEmpresa = builder.Configuration.GetValue("Comercial:IdEmpresa", new OpcionesComercial().IdEmpresa);
builder.Services.AddAuthorization(o => o.FallbackPolicy = o.DefaultPolicy = Politicas.Base(idEmpresa).Build());

// Freno de pedidos por persona y canal (CHATBOT.md, regla 5): cada lectura escribe en AccesoLog y algunas calculan
// toda la cartera, así que un bot o un script no puede pedir sin parar. Sin sesión, por IP (el login lo frena Nginx).
var pedidosPorMinuto = builder.Configuration.GetValue("Freno:PedidosPorMinuto", 240);
builder.Services.AddRateLimiter(o =>
{
    o.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.User.FindFirst("sub")?.Value is { } sub
            ? $"{sub}|{ctx.User.FindFirst(Politicas.ClaimCanal)?.Value}"
            : $"ip|{ctx.Connection.RemoteIpAddress}",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = pedidosPorMinuto, Window = TimeSpan.FromMinutes(1) }));
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.OnRejected = (c, ct) =>
    {
        c.HttpContext.Response.ContentType = "application/json";
        return new ValueTask(c.HttpContext.Response.WriteAsync(JsonSerializer.Serialize(new
        {
            status = 429, title = "Demasiados pedidos seguidos: esperá un minuto.", traceId = c.HttpContext.TraceIdentifier,
        }), ct));
    };
});

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

// La base se crea o actualiza sola al arrancar (migraciones de EF).
if (app.Configuration.GetValue("Base:MigrarAlIniciar", true))
{
    using var scope = app.Services.CreateScope();
    await scope.ServiceProvider.GetRequiredService<ComercialDbContext>().Database.MigrateAsync();
}
if (desarrollo)
    app.Logger.LogWarning("Autenticación de desarrollo ACTIVA: los requests sin token entran como usuario de prueba.");

app.UseForwardedHeaders();
app.UseMiddleware<ManejoDeErrores>();
app.UseAuthentication();
app.UseRateLimiter();
app.UseMiddleware<CanalChatbot>();   // con el token del chatbot, solo lectura
app.UseAuthorization();
app.MapControllers();

app.Run();

/// <summary>Visible para las pruebas de integración (WebApplicationFactory).</summary>
public partial class Program;
