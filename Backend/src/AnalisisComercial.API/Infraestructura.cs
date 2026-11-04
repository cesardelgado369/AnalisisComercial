using System.Net;
using System.Security.Claims;
using System.Text.Encodings.Web;
using System.Text.Json;
using AnalisisComercial.Application;
using AnalisisComercial.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Authorization.Policy;
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

    public bool EsSuperAdmin => Politicas.EsSuperAdmin(Usuario);

    public string? Canal => Usuario.FindFirst(Politicas.ClaimCanal)?.Value;

    public bool Tiene(string permiso) => (_permisos ??= Usuario.FindAll("perm").Select(c => c.Value).ToHashSet()).Contains(permiso);

    public string? Token
        => http.HttpContext?.Request.Headers.Authorization.ToString() is { } h && h.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? h["Bearer ".Length..].Trim()
            : null;
}

/// <summary>
/// La base de toda política: sesión, el módulo contratado (claim <c>mod=analisis-comercial</c>) y que la empresa del
/// token sea Madomi (revisión de seguridad del 04/11/2026: así un endpoint nuevo que se olvide de mirarla igual queda
/// cerrado). La empresa se compara como GUID: la plataforma la manda en minúsculas y la configuración la tiene en
/// mayúsculas.
/// </summary>
public static class Politicas
{
    public const string ClaimCanal = "canal";
    public const string CanalChatbot = "chatbot";

    public static AuthorizationPolicyBuilder Base(Guid idEmpresa) => new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser().RequireClaim("mod", Permisos.Modulo)
        .RequireAssertion(c => Guid.TryParse(c.User.FindFirst("tenant_id")?.Value, out var t) && t == idEmpresa);

    public static bool EsSuperAdmin(ClaimsPrincipal u)
        => string.Equals(u.FindFirst("is_superadmin")?.Value, "true", StringComparison.OrdinalIgnoreCase);
}

/// <summary>
/// Cada política con punto en el nombre es un código de permiso (<c>[Authorize(Policy = "analisis-comercial.ver")]</c>):
/// la base de <see cref="Politicas"/> y el permiso (claim <c>perm</c>), o SuperAdmin. No hay que registrar nada.
/// </summary>
public class PoliticaPorPermiso(IOptions<AuthorizationOptions> options, IOptions<OpcionesComercial> comercial)
    : DefaultAuthorizationPolicyProvider(options)
{
    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
        => policyName.Contains('.')
            ? Politicas.Base(comercial.Value.IdEmpresa)
                .RequireAssertion(c => c.User.HasClaim("perm", policyName) || Politicas.EsSuperAdmin(c.User))
                .Build()
            : await base.GetPolicyAsync(policyName);
}

/// <summary>
/// Con el token del chatbot (claim <c>canal=chatbot</c>) solo se lee: todo lo que no sea GET o HEAD da 403 (CHATBOT.md,
/// «freno por canal»). Cuando haya propuestas, se eximen solo sus tres rutas, no todo <c>/api/bot</c>.
/// </summary>
public class CanalChatbot(RequestDelegate next)
{
    public const string Mensaje = "Desde el chatbot, los cambios se hacen con una propuesta que la persona confirma.";

    public Task InvokeAsync(HttpContext ctx)
    {
        if (ctx.User.HasClaim(Politicas.ClaimCanal, Politicas.CanalChatbot)
            && !HttpMethods.IsGet(ctx.Request.Method) && !HttpMethods.IsHead(ctx.Request.Method))
            throw new AccesoDenegadoException(Mensaje);
        return next(ctx);
    }
}

/// <summary>
/// Los rechazos de la autorización (otra empresa, sin el módulo, sin el permiso) quedan en AccesoLog como cualquier otro
/// denegado, con la ruta como pantalla (antes no se registraban: no llegaban a los servicios), y responden con el
/// formato del sistema, <c>{ status, title }</c>, como los 403 de los servicios.
/// </summary>
public class RegistroDeRechazos(ILogger<RegistroDeRechazos> log, IOptions<OpcionesComercial> comercial)
    : IAuthorizationMiddlewareResultHandler
{
    private readonly AuthorizationMiddlewareResultHandler _base = new();

    public async Task HandleAsync(RequestDelegate next, HttpContext ctx, AuthorizationPolicy policy, PolicyAuthorizationResult resultado)
    {
        if (!resultado.Forbidden)
        {
            await _base.HandleAsync(next, ctx, policy, resultado);
            return;
        }
        if (Guid.TryParse(ctx.User.FindFirst("sub")?.Value, out _))
        {
            try
            {
                await ctx.RequestServices.GetRequiredService<IAlcanceUsuario>()
                    .RegistrarAsync($"rechazo {ctx.Request.Method} {ctx.Request.Path}", null, denegado: true, ctx.RequestAborted);
            }
            catch (Exception ex) when (ex is not OperationCanceledException)
            {
                log.LogWarning(ex, "No se pudo registrar el rechazo de {Ruta}", ctx.Request.Path.ToString());
            }
        }
        var titulo = !(Guid.TryParse(ctx.User.FindFirst("tenant_id")?.Value, out var t) && t == comercial.Value.IdEmpresa)
            ? "Análisis Comercial no está disponible para esta empresa."
            : ctx.Request.Path.StartsWithSegments("/api/admin", StringComparison.OrdinalIgnoreCase)
                ? "La administración es solo para administradores."
                : AccesoDenegadoException.SinAcceso;
        ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
        ctx.Response.ContentType = "application/json";
        await ctx.Response.WriteAsync(JsonSerializer.Serialize(new { status = 403, title = titulo, traceId = ctx.TraceIdentifier },
            new JsonSerializerOptions { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
    }
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
