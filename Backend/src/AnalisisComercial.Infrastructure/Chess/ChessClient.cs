using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using AnalisisComercial.Domain;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Chess;

/// <summary>
/// Sección "Chess". Usuario y clave van en secretos (user-secrets en desarrollo, variables de entorno en el servidor):
/// nunca en appsettings versionado, en logs ni en el navegador.
/// </summary>
public class OpcionesChess
{
    public string BaseUrl { get; set; } = "https://guillermomartinabdala.chesserp.com/AR1423/web/api/chess/v1/";
    public string Usuario { get; set; } = "";
    public string Clave { get; set; } = "";
    /// <summary>La sesión de Chess vence rápido: se renueva antes de este tiempo.</summary>
    public int RenovarSesionMinutos { get; set; } = 4;
    public int Reintentos { get; set; } = 3;
    public int TimeoutSegundos { get; set; } = 180;
    /// <summary>Tope de lotes por consulta, por si Chess nunca corta (ninguna consulta real pasa de ~20).</summary>
    public int MaxLotes { get; set; } = 200;
}

/// <summary>Lo que la sincronización lee de Chess. Solo lectura: este sistema nunca escribe en Chess.</summary>
public interface IChess
{
    Task<IReadOnlyList<VendedorChess>> VendedoresAsync(CancellationToken ct);
    Task<IReadOnlyList<RutaChess>> RutasAsync(CancellationToken ct);
    Task<IReadOnlyList<ClienteChess>> ClientesAsync(CancellationToken ct);
    Task<IReadOnlyList<ArticuloChess>> ArticulosAsync(CancellationToken ct);
    /// <summary>Las líneas de venta (detallado) de un rango; si pasa de un mes se pide mes por mes.</summary>
    Task<IReadOnlyList<VentaLinea>> VentasAsync(DateOnly desde, DateOnly hasta, CancellationToken ct);
}

public class ChessException(string mensaje, Exception? interna = null) : Exception(mensaje, interna);

/// <summary>La sesión de Chess, compartida entre los pedidos de una corrida (singleton).</summary>
public sealed class SesionChess
{
    internal readonly SemaphoreSlim Candado = new(1, 1);
    internal string? Id;
    internal DateTimeOffset Obtenida;
}

public class ChessClient(HttpClient http, SesionChess sesion, IOptions<OpcionesChess> opciones, TimeProvider reloj,
    ILogger<ChessClient> log) : IChess
{
    private readonly OpcionesChess _op = opciones.Value;

    public async Task<IReadOnlyList<VendedorChess>> VendedoresAsync(CancellationToken ct)
        => ParserChess.Vendedores(await GetAsync("personalComercial/", [], ct));

    public async Task<IReadOnlyList<RutaChess>> RutasAsync(CancellationToken ct)
        => ParserChess.Rutas(await GetAsync("rutasVenta/", [], ct));

    public async Task<IReadOnlyList<ArticuloChess>> ArticulosAsync(CancellationToken ct)
        => ParserChess.Articulos(await GetAsync("articulos/", [], ct));

    public async Task<IReadOnlyList<ClienteChess>> ClientesAsync(CancellationToken ct)
        => await PaginadoAsync("clientes/", [], ParserChess.Clientes, c => c.IdCliente, ct);

    public async Task<IReadOnlyList<VentaLinea>> VentasAsync(DateOnly desde, DateOnly hasta, CancellationToken ct)
    {
        if (hasta < desde)
            return [];
        var todas = new List<VentaLinea>();
        // Chess acepta como mucho un mes por consulta: se parte por mes calendario.
        for (var d = desde; d <= hasta; d = Calendario.Mes(d).AddMonths(1))
        {
            var h = Calendario.FinDeMes(d) < hasta ? Calendario.FinDeMes(d) : hasta;
            todas.AddRange(await PaginadoAsync("ventas/", new()
            {
                ["fechaDesde"] = d.ToString("yyyy-MM-dd"),
                ["fechaHasta"] = h.ToString("yyyy-MM-dd"),
                ["detallado"] = "true",
                ["empresas"] = "",
            }, ParserChess.Ventas, ParserChess.Clave, ct));
        }
        return todas;
    }

    /// <summary>
    /// Pide lote 1, 2, 3… hasta el total que informa Chess, o hasta que un lote venga vacío o sin filas nuevas.
    /// Si el lote 1 viene vacío, prueba nroLote=0 (= todos). Deduplica por clave.
    /// </summary>
    private async Task<IReadOnlyList<T>> PaginadoAsync<T, TClave>(string ruta, Dictionary<string, string> query,
        Func<JsonElement, Lote<T>> parsear, Func<T, TClave> clave, CancellationToken ct) where TClave : notnull
    {
        var vistas = new Dictionary<TClave, T>();
        int? total = null;
        for (var lote = 1; lote <= _op.MaxLotes && (total is null || lote <= total); lote++)
        {
            var raiz = await GetAsync(ruta, new(query) { ["nroLote"] = lote.ToString() }, ct, sinDatosEsVacio: true);
            var leido = parsear(raiz);
            total ??= leido.TotalLotes;
            if (leido.Filas.Count == 0 && lote == 1)
            {
                var todos = parsear(await GetAsync(ruta, new(query) { ["nroLote"] = "0" }, ct, sinDatosEsVacio: true));
                foreach (var f in todos.Filas)
                    vistas.TryAdd(clave(f), f);
                break;
            }
            var nuevas = leido.Filas.Count(f => vistas.TryAdd(clave(f), f));
            if (nuevas == 0)
                break;
        }
        return vistas.Values.ToList();
    }

    /// <summary>GET con la sesión de Chess, renovándola si venció o si Chess responde 401/403, con reintentos.</summary>
    private async Task<JsonElement> GetAsync(string ruta, Dictionary<string, string> query, CancellationToken ct,
        bool sinDatosEsVacio = false)
    {
        var url = ruta + (query.Count == 0 ? "" : "?" + string.Join('&',
            query.Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value)}")));
        for (var intento = 1; ; intento++)
        {
            try
            {
                var id = await SesionAsync(forzar: false, ct);
                using var pedido = new HttpRequestMessage(HttpMethod.Get, url);
                pedido.Headers.TryAddWithoutValidation("Cookie", id);   // crudo, sin "JSESSIONID="
                pedido.Headers.Accept.ParseAdd("application/json");
                using var respuesta = await http.SendAsync(pedido, ct);
                if (respuesta.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden)
                {
                    await SesionAsync(forzar: true, ct);
                    throw new HttpRequestException($"Chess respondió {(int)respuesta.StatusCode}", null, respuesta.StatusCode);
                }
                respuesta.EnsureSuccessStatusCode();
                await using var cuerpo = await respuesta.Content.ReadAsStreamAsync(ct);
                using var doc = await JsonDocument.ParseAsync(cuerpo, cancellationToken: ct);
                var raiz = doc.RootElement.Clone();
                var errores = ParserChess.Errores(raiz);
                if (errores.Count > 0)
                {
                    if (sinDatosEsVacio && errores.All(ParserChess.EsSinDatos))
                        return default;   // ValueKind Undefined: los parsers devuelven vacío
                    throw new ChessException($"Chess ({ruta}): {string.Join(" | ", errores)}");
                }
                return raiz;
            }
            catch (Exception ex) when (intento < _op.Reintentos && EsTransitoria(ex, ct))
            {
                var espera = TimeSpan.FromSeconds(Math.Pow(3, intento - 1));   // 1 s, 3 s, 9 s…
                log.LogWarning("Chess {Ruta}: intento {Intento} falló ({Motivo}); reintento en {Espera} s.",
                    ruta, intento, ex.Message, espera.TotalSeconds);
                await Task.Delay(espera, reloj, ct);
            }
            catch (Exception ex) when (ex is not ChessException && !(ex is OperationCanceledException && ct.IsCancellationRequested))
            {
                throw new ChessException($"No se pudo leer {ruta} de Chess: {ex.Message}", ex);
            }
        }
    }

    private static bool EsTransitoria(Exception ex, CancellationToken ct)
        => !ct.IsCancellationRequested && ex is HttpRequestException or TaskCanceledException or JsonException
            or ChessException { InnerException: HttpRequestException };

    private async Task<string> SesionAsync(bool forzar, CancellationToken ct)
    {
        await sesion.Candado.WaitAsync(ct);
        try
        {
            var vencida = reloj.GetUtcNow() - sesion.Obtenida > TimeSpan.FromMinutes(_op.RenovarSesionMinutos);
            if (sesion.Id is not null && !forzar && !vencida)
                return sesion.Id;
            if (string.IsNullOrWhiteSpace(_op.Usuario) || string.IsNullOrWhiteSpace(_op.Clave))
                throw new ChessException("Faltan Chess:Usuario y Chess:Clave en la configuración (secretos).");

            using var respuesta = await http.PostAsJsonAsync("auth/login", new { usuario = _op.Usuario, password = _op.Clave }, ct);
            if (!respuesta.IsSuccessStatusCode)
                throw new HttpRequestException($"El login de Chess respondió {(int)respuesta.StatusCode}.", null, respuesta.StatusCode);
            using var doc = JsonDocument.Parse(await respuesta.Content.ReadAsStringAsync(ct));
            var errores = ParserChess.Errores(doc.RootElement);
            var id = doc.RootElement.ValueKind == JsonValueKind.Object ? ParserChess.Texto(doc.RootElement, "sessionId") : null;
            if (errores.Count > 0 || id is null)
                throw new ChessException("El login de Chess no devolvió sesión" + (errores.Count > 0 ? $": {string.Join(" | ", errores)}" : "."));
            sesion.Id = id;
            sesion.Obtenida = reloj.GetUtcNow();
            log.LogInformation("Sesión de Chess renovada.");
            return id;
        }
        finally
        {
            sesion.Candado.Release();
        }
    }
}
