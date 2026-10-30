using System.Net;
using System.Text;
using AnalisisComercial.Infrastructure.Chess;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using static AnalisisComercial.Infrastructure.Tests.RespuestasChess;

namespace AnalisisComercial.Infrastructure.Tests;

public class ChessClientTests
{
    /// <summary>Responde con una función y anota cada pedido (ruta + query + Cookie).</summary>
    private sealed class HandlerFalso(Func<HttpRequestMessage, int, (HttpStatusCode, string)> responder) : HttpMessageHandler
    {
        public List<(string Ruta, string Cookie)> Pedidos { get; } = [];
        public int Logins { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage pedido, CancellationToken ct)
        {
            var ruta = pedido.RequestUri!.PathAndQuery;
            if (ruta.EndsWith("auth/login"))
                Logins++;
            else
                Pedidos.Add((ruta, pedido.Headers.TryGetValues("Cookie", out var c) ? string.Join(";", c) : ""));
            var (status, cuerpo) = responder(pedido, Pedidos.Count);
            return Task.FromResult(new HttpResponseMessage(status) { Content = new StringContent(cuerpo, Encoding.UTF8, "application/json") });
        }
    }

    private static (ChessClient, HandlerFalso) Crear(Func<HttpRequestMessage, int, (HttpStatusCode, string)> responder, int reintentos = 3)
    {
        var handler = new HandlerFalso((p, n) => p.RequestUri!.AbsolutePath.EndsWith("auth/login") ? (HttpStatusCode.OK, Login) : responder(p, n));
        var http = new HttpClient(handler) { BaseAddress = new Uri("https://chess.prueba/api/chess/v1/") };
        var op = Options.Create(new OpcionesChess { Usuario = "u", Clave = "c", Reintentos = reintentos });
        return (new ChessClient(http, new SesionChess(), op, TimeProvider.System, NullLogger<ChessClient>.Instance), handler);
    }

    private static string Query(HttpRequestMessage p, string clave)
        => System.Web.HttpUtility.ParseQueryString(p.RequestUri!.Query)[clave] ?? "";

    [Fact]
    public async Task Loguea_una_vez_y_manda_la_cookie_cruda()
    {
        var (chess, h) = Crear((_, _) => (HttpStatusCode.OK, Personal));
        await chess.VendedoresAsync(default);
        await chess.VendedoresAsync(default);
        Assert.Equal(1, h.Logins);
        Assert.All(h.Pedidos, p => Assert.Equal("SESION-1", p.Cookie));
    }

    [Fact]
    public async Task Ante_un_401_vuelve_a_loguear_y_reintenta()
    {
        var (chess, h) = Crear((_, n) => n == 1 ? (HttpStatusCode.Unauthorized, "") : (HttpStatusCode.OK, Personal));
        var v = await chess.VendedoresAsync(default);
        Assert.Equal(3, v.Count);
        Assert.Equal(2, h.Logins);
    }

    [Fact]
    public async Task Pagina_hasta_el_total_de_lotes_y_deduplica()
    {
        var (chess, h) = Crear((p, _) => Query(p, "nroLote") switch
        {
            "1" => (HttpStatusCode.OK, Clientes(1, 3, 10, 11)),
            "2" => (HttpStatusCode.OK, Clientes(2, 3, 11, 12)),   // repite el 11
            "3" => (HttpStatusCode.OK, Clientes(3, 3, 99)),
            _ => (HttpStatusCode.OK, SinDatos),
        });
        var c = await chess.ClientesAsync(default);
        Assert.Equal([10, 11, 12, 99], c.Select(x => x.IdCliente).Order());
        Assert.Equal(3, h.Pedidos.Count);
    }

    [Fact]
    public async Task Sin_total_corta_cuando_Chess_dice_que_no_hay_mas()
    {
        var (chess, h) = Crear((p, _) => Query(p, "nroLote") switch
        {
            "1" => (HttpStatusCode.OK, Ventas(1, 0, Linea(1, 1)).Replace("1/0", "")),
            "2" => (HttpStatusCode.OK, Ventas(2, 0, Linea(1, 2)).Replace("2/0", "")),
            _ => (HttpStatusCode.OK, SinDatos),
        });
        var v = await chess.VentasAsync(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 26), default);
        Assert.Equal(2, v.Count);
        Assert.Equal(3, h.Pedidos.Count);
    }

    [Fact]
    public async Task Si_el_lote_1_viene_vacio_prueba_el_lote_0()
    {
        var (chess, h) = Crear((p, _) => Query(p, "nroLote") switch
        {
            "0" => (HttpStatusCode.OK, Ventas(0, 1, Linea(1, 1), Linea(1, 2))),
            _ => (HttpStatusCode.OK, SinDatos),
        });
        var v = await chess.VentasAsync(new DateOnly(2026, 10, 1), new DateOnly(2026, 10, 26), default);
        Assert.Equal(2, v.Count);
        Assert.Equal(["1", "0"], h.Pedidos.Select(p => System.Web.HttpUtility.ParseQueryString(new Uri("https://x" + p.Ruta).Query)["nroLote"]));
    }

    [Fact]
    public async Task Las_ventas_se_piden_de_a_un_mes_detalladas()
    {
        var (chess, h) = Crear((_, _) => (HttpStatusCode.OK, SinDatos));
        await chess.VentasAsync(new DateOnly(2026, 7, 15), new DateOnly(2026, 9, 3), default);
        var rangos = h.Pedidos.Select(p => System.Web.HttpUtility.ParseQueryString(new Uri("https://x" + p.Ruta).Query))
            .Where(q => q["nroLote"] == "1")
            .Select(q => (q["fechaDesde"], q["fechaHasta"], q["detallado"]))
            .ToList();
        Assert.Equal([("2026-07-15", "2026-07-31", "true"), ("2026-08-01", "2026-08-31", "true"), ("2026-09-01", "2026-09-03", "true")], rangos);
    }

    [Fact]
    public async Task Un_error_de_negocio_con_HTTP_200_es_una_falla_con_su_mensaje()
    {
        var (chess, _) = Crear((_, _) => (HttpStatusCode.OK, ErrorFecha));
        var ex = await Assert.ThrowsAsync<ChessException>(() => chess.VendedoresAsync(default));
        Assert.Contains("Debe enviar una unica fecha", ex.Message);
    }

    [Fact]
    public async Task Un_500_que_no_se_arregla_termina_en_ChessException()
    {
        var (chess, h) = Crear((_, _) => (HttpStatusCode.InternalServerError, ""), reintentos: 2);
        await Assert.ThrowsAsync<ChessException>(() => chess.RutasAsync(default));
        Assert.Equal(2, h.Pedidos.Count);
    }

    [Fact]
    public async Task Sin_usuario_ni_clave_no_intenta_entrar()
    {
        var handler = new HandlerFalso((_, _) => (HttpStatusCode.OK, Login));
        var chess = new ChessClient(new HttpClient(handler) { BaseAddress = new Uri("https://chess.prueba/") }, new SesionChess(),
            Options.Create(new OpcionesChess()), TimeProvider.System, NullLogger<ChessClient>.Instance);
        var ex = await Assert.ThrowsAsync<ChessException>(() => chess.VendedoresAsync(default));
        Assert.Contains("Chess:Usuario", ex.Message);
        Assert.Equal(0, handler.Logins);
    }
}
