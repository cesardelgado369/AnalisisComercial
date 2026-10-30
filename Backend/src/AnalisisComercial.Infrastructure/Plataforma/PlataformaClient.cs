using System.Net;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using AnalisisComercial.Application;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Plataforma;

/// <summary>Sección "Plataforma" de la configuración.</summary>
public class OpcionesPlataforma
{
    /// <summary>
    /// La API de la plataforma vista desde esta API. En el VPS, por la red de Docker: http://plataforma:8080/ (el mismo
    /// destino de /plataforma/ en el portal). Sin Url (desarrollo: la plataforma no corre en la PC), las cuentas dan 404.
    /// </summary>
    public string? Url { get; set; }

    public int TimeoutSegundos { get; set; } = 20;
}

/// <summary>
/// <see cref="IPlataforma"/> por HTTP. Reenvía el token del request: la plataforma decide con los permisos y la empresa de
/// esa persona, nunca con una cuenta de servicio. Los errores de la plataforma ({ status, title, errors }) se traducen a
/// las excepciones de la app.
/// </summary>
public class PlataformaClient(HttpClient http, IUsuarioActual usuario, IOptions<OpcionesPlataforma> opciones) : IPlataforma
{
    private const string NoDisponible = "La gestión de cuentas de la plataforma no está disponible acá.";
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<IReadOnlyList<CuentaPlataforma>> CuentasAsync(CancellationToken ct)
        => await EnviarAsync<List<CuentaPlataforma>>(Pedido(HttpMethod.Get, "api/cuentas"), ct);

    public async Task<IReadOnlyList<RolPlataforma>> RolesAsync(CancellationToken ct)
        => await EnviarAsync<List<RolPlataforma>>(Pedido(HttpMethod.Get, "api/cuentas/roles"), ct);

    public Task<CuentaPlataforma> CrearCuentaAsync(string usuario, string nombre, string clave, int idRol, CancellationToken ct)
    {
        var pedido = Pedido(HttpMethod.Post, "api/cuentas");
        pedido.Content = JsonContent.Create(new { usuario, nombre, clave, idRol }, options: Json);
        return EnviarAsync<CuentaPlataforma>(pedido, ct);
    }

    private HttpRequestMessage Pedido(HttpMethod metodo, string ruta)
    {
        if (string.IsNullOrWhiteSpace(opciones.Value.Url))
            throw new NoEncontradoException(NoDisponible);
        // Sin token propio (el usuario de desarrollo) no hay a quién representar ante la plataforma.
        var token = usuario.Token ?? throw new NoEncontradoException(NoDisponible);
        var url = opciones.Value.Url.EndsWith('/') ? opciones.Value.Url : opciones.Value.Url + "/";
        var pedido = new HttpRequestMessage(metodo, new Uri(new Uri(url), ruta));
        pedido.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        return pedido;
    }

    private async Task<T> EnviarAsync<T>(HttpRequestMessage pedido, CancellationToken ct)
    {
        using (pedido)
        using (var r = await http.SendAsync(pedido, ct))
        {
            if (r.IsSuccessStatusCode)
                return await r.Content.ReadFromJsonAsync<T>(Json, ct) ?? throw new InvalidOperationException("La plataforma respondió vacío.");

            var error = await LeerErrorAsync(r, ct);
            throw r.StatusCode switch
            {
                HttpStatusCode.BadRequest when error?.Errors?.FirstOrDefault(e => e.Value is { Length: > 0 }) is { Key: { } campo } e
                    => new ValidacionException(campo, e.Value[0]),
                HttpStatusCode.Unauthorized => new AccesoDenegadoException("La sesión de la plataforma venció: volvé a entrar."),
                HttpStatusCode.Forbidden => new AccesoDenegadoException(error?.Title ?? "La plataforma no te deja administrar las cuentas."),
                HttpStatusCode.NotFound => new NoEncontradoException(NoDisponible),
                _ => new HttpRequestException($"La plataforma respondió {(int)r.StatusCode}: {error?.Title}"),
            };
        }
    }

    private static async Task<ErrorPlataforma?> LeerErrorAsync(HttpResponseMessage r, CancellationToken ct)
    {
        try
        {
            return await r.Content.ReadFromJsonAsync<ErrorPlataforma>(Json, ct);
        }
        catch (JsonException)
        {
            return null;
        }
    }

    private sealed record ErrorPlataforma(string? Title, Dictionary<string, string[]>? Errors);
}
