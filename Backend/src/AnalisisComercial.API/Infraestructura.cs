using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AnalisisComercial.Application;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.ModelBinding;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.API;

/// <summary>El usuario del request, leído de los claims del token del login central.</summary>
public class UsuarioActual(IHttpContextAccessor http) : IUsuarioActual
{
    private HashSet<string>? _permisos;

    private ClaimsPrincipal Usuario => http.HttpContext?.User ?? throw new InvalidOperationException("No hay un request en curso.");

    public Guid IdUsuario => Guid.TryParse(Usuario.FindFirst("sub")?.Value, out var id)
        ? id
        : throw new AccesoDenegadoException("La sesión no tiene usuario.");

    public Guid IdEmpresa => Guid.TryParse(Usuario.FindFirst("tenant_id")?.Value, out var id)
        ? id
        : throw new AccesoDenegadoException("La sesión no tiene empresa.");

    public string Email => Usuario.FindFirst("email")?.Value ?? "";

    public bool EsSuperAdmin => string.Equals(Usuario.FindFirst("is_superadmin")?.Value, "true", StringComparison.OrdinalIgnoreCase);

    public bool Tiene(string permiso) => (_permisos ??= Usuario.FindAll("perm").Select(c => c.Value).ToHashSet()).Contains(permiso);
}

/// <summary>
/// Cada política con punto en el nombre es un código de permiso (<c>[Authorize(Policy = "analisis-comercial.ver")]</c>):
/// pide sesión, el módulo contratado (claim <c>mod=analisis-comercial</c>) y el permiso (claim <c>perm</c>), o SuperAdmin.
/// No hay que registrar nada.
/// </summary>
public class PoliticaPorPermiso(IOptions<AuthorizationOptions> options) : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
        => policyName.Contains('.')
            ? new AuthorizationPolicyBuilder().RequireAuthenticatedUser().RequireClaim("mod", Permisos.Modulo)
                .RequireAssertion(c => c.User.HasClaim("perm", policyName) || c.User.HasClaim("is_superadmin", "true"))
                .Build()
            : await base.GetPolicyAsync(policyName);
}

/// <summary>
/// TODO testing — Solo en Development y con <c>Autenticacion:Desarrollo:Habilitado</c>: un request sin
/// <c>Authorization</c> entra como un usuario de prueba de Madomi (por defecto Admin; el email, la cuenta y los
/// permisos se cambian en <c>Autenticacion:Desarrollo</c> para probar un operario o un supervisor). Hace falta porque
/// la plataforma no corre en esta PC. Con token se valida como en producción. Fuera de Development no existe.
/// </summary>
public class AutenticacionDesarrollo(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
    UrlEncoder encoder, IConfiguration configuration) : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
{
    public const string Esquema = "Desarrollo";

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var seccion = configuration.GetSection("Autenticacion:Desarrollo");
        var permisos = seccion.GetSection("Permisos").Get<string[]>() is { Length: > 0 } p ? p : [Permisos.Ver, Permisos.Admin];
        var claims = new List<Claim>
        {
            new("sub", seccion["IdUsuario"] ?? "00000000-0000-4000-8000-0000000ac0de"),
            new("email", seccion["Email"] ?? "desarrollo@analisis.local"),
            new("tenant_id", configuration["Comercial:IdEmpresa"] ?? "A1B2C3D4-0000-4000-8000-000000000001"),
            new("is_superadmin", "false"), new("role", "Desarrollo"), new("mod", Permisos.Modulo),
        };
        claims.AddRange(permisos.Select(x => new Claim("perm", x)));
        var identidad = new ClaimsIdentity(claims, Esquema, "email", "role");
        return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(identidad), Esquema)));
    }
}

/// <summary>
/// Los 400 de binding (JSON mal formado, una fecha inválida, un texto donde va un número) con el formato del sistema:
/// <c>errors</c> por campo, sin el prefijo <c>$.</c> ni la entrada del parámetro del body.
/// </summary>
public static class ErroresDeBinding
{
    public static IActionResult Respuesta(ActionContext ctx)
    {
        var body = ctx.ActionDescriptor.Parameters
            .Where(p => p.BindingInfo?.BindingSource == BindingSource.Body).Select(p => p.Name).ToHashSet();
        var errores = new Dictionary<string, string[]>();
        foreach (var (clave, entrada) in ctx.ModelState)
        {
            if (entrada.Errors.Count == 0 || body.Contains(clave) || clave is "$" or "")
                continue;
            var campo = Campo(clave);
            if (campo.Length == 0)
                continue;
            errores[campo] = [campo.StartsWith("mes", StringComparison.Ordinal) || campo == "fecha"
                ? "Fecha inválida (AAAA-MM-DD)."
                : "Valor inválido."];
        }
        return new BadRequestObjectResult(new
        {
            status = 400,
            title = errores.Count > 0 ? "Revisá los datos." : "El pedido no es válido.",
            errors = errores.Count > 0 ? errores : null,
            traceId = ctx.HttpContext.TraceIdentifier,
        }) { ContentTypes = { "application/json" } };
    }

    private static string Campo(string clave)
    {
        var c = clave.StartsWith("$.") ? clave[2..] : clave;
        return string.Join('.', c.Split('.').Select(p => p.Length == 0 ? p : char.ToLowerInvariant(p[0]) + p[1..]));
    }
}

/// <summary>Excepciones → { status, title, errors?, traceId }, como el resto del sistema.</summary>
public class ManejoDeErrores(RequestDelegate next, ILogger<ManejoDeErrores> log)
{
    private static readonly JsonSerializerOptions Json = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,   // tildes legibles; es JSON de respuesta, no HTML
    };

    public async Task InvokeAsync(HttpContext ctx)
    {
        try
        {
            await next(ctx);
        }
        catch (Exception ex) when (!ctx.Response.HasStarted && !(ex is OperationCanceledException && ctx.RequestAborted.IsCancellationRequested))
        {
            var (status, titulo, errores) = ex switch
            {
                ValidacionException v => (HttpStatusCode.BadRequest, v.Message, new Dictionary<string, string[]> { [v.Campo] = [v.Message] }),
                AccesoDenegadoException a => (HttpStatusCode.Forbidden, a.Message, null),
                NoEncontradoException n => (HttpStatusCode.NotFound, n.Message, null),
                ConflictoException c => (HttpStatusCode.Conflict, c.Message, null),
                _ => (HttpStatusCode.InternalServerError, "Error interno del servidor.", (Dictionary<string, string[]>?)null),
            };
            if (status == HttpStatusCode.InternalServerError)
                log.LogError(ex, "Error no controlado");
            ctx.Response.StatusCode = (int)status;
            ctx.Response.ContentType = "application/json";
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { status = (int)status, title = titulo, errors = errores, traceId = ctx.TraceIdentifier }, Json));
        }
    }
}
