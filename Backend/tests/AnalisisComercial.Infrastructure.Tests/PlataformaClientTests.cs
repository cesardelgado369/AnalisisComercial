using System.Net;
using System.Text;
using AnalisisComercial.Application;
using AnalisisComercial.Infrastructure.Plataforma;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Tests;

/// <summary>El cliente de la API de cuentas de la plataforma, contra respuestas armadas (como las de la central).</summary>
public class PlataformaClientTests
{
    private sealed class Usuario(string? token) : IUsuarioActual
    {
        public Guid IdUsuario => Guid.Empty;
        public Guid IdEmpresa => Guid.Empty;
        public string Email => "checho@madomi";
        public bool EsSuperAdmin => false;
        public string? Canal => null;
        public bool Tiene(string permiso) => false;
        public string? Token => token;
    }

    private sealed class Respuesta(HttpStatusCode estado, string cuerpo) : HttpMessageHandler
    {
        public HttpRequestMessage? Pedido { get; private set; }
        public string? Enviado { get; private set; }

        protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
        {
            Pedido = request;
            Enviado = request.Content is null ? null : await request.Content.ReadAsStringAsync(ct);
            return new HttpResponseMessage(estado) { Content = new StringContent(cuerpo, Encoding.UTF8, "application/json") };
        }
    }

    private static PlataformaClient Cliente(Respuesta respuesta, string? token = "token-de-checho", string? url = "http://plataforma:8080")
        => new(new HttpClient(respuesta), new Usuario(token), Options.Create(new OpcionesPlataforma { Url = url }));

    private const string UnaCuenta = """
        { "id": "0b8f1c3e-2a4d-4e5f-8a9b-0c1d2e3f4a5b", "usuario": "vendedor@madomi", "nombre": "Vendedor", "activa": true,
          "roles": [{ "id": 25, "nombre": "Comercial" }], "federada": false, "ultimoIngreso": "2026-10-30T12:00:00Z" }
        """;

    [Fact]
    public async Task Reenvia_el_token_de_quien_entra_y_no_uno_de_servicio()
    {
        var r = new Respuesta(HttpStatusCode.OK, $"[{UnaCuenta}]");
        var cuentas = await Cliente(r).CuentasAsync(CancellationToken.None);
        Assert.Equal("http://plataforma:8080/api/cuentas", r.Pedido!.RequestUri!.ToString());
        Assert.Equal("Bearer token-de-checho", r.Pedido.Headers.Authorization!.ToString());
        var c = cuentas.Single();
        Assert.Equal(("vendedor@madomi", "Comercial", new DateTime(2026, 10, 30, 12, 0, 0)), (c.Usuario, c.Roles.Single().Nombre, c.UltimoIngreso!.Value));
    }

    [Fact]
    public async Task El_alta_manda_clave_e_idRol()
    {
        var r = new Respuesta(HttpStatusCode.Created, UnaCuenta);
        var c = await Cliente(r, url: "http://plataforma:8080/").CrearCuentaAsync("vendedor@madomi", "Vendedor", "Clave1234", 25, CancellationToken.None);
        Assert.Equal(HttpMethod.Post, r.Pedido!.Method);
        Assert.Equal("http://plataforma:8080/api/cuentas", r.Pedido.RequestUri!.ToString());
        Assert.Contains("\"clave\":\"Clave1234\"", r.Enviado);
        Assert.Contains("\"idRol\":25", r.Enviado);
        Assert.Equal("vendedor@madomi", c.Usuario);
    }

    [Fact]
    public async Task Los_errores_de_la_plataforma_llegan_con_su_campo()
    {
        var repetido = new Respuesta(HttpStatusCode.BadRequest,
            """{ "status": 400, "title": "Revisá los datos.", "errors": { "usuario": ["Ya existe una cuenta con ese usuario."] } }""");
        var e = await Assert.ThrowsAsync<ValidacionException>(() => Cliente(repetido).CrearCuentaAsync("x", "X", "Clave1234", 25, CancellationToken.None));
        Assert.Equal(("usuario", "Ya existe una cuenta con ese usuario."), (e.Campo, e.Message));

        var prohibido = new Respuesta(HttpStatusCode.Forbidden, """{ "status": 403, "title": "No podés dar un rol con permisos que vos no tenés." }""");
        var p = await Assert.ThrowsAsync<AccesoDenegadoException>(() => Cliente(prohibido).RolesAsync(CancellationToken.None));
        Assert.Equal("No podés dar un rol con permisos que vos no tenés.", p.Message);

        await Assert.ThrowsAsync<AccesoDenegadoException>(() => Cliente(new Respuesta(HttpStatusCode.Unauthorized, "")).CuentasAsync(CancellationToken.None));
        await Assert.ThrowsAsync<HttpRequestException>(() => Cliente(new Respuesta(HttpStatusCode.InternalServerError, "nada")).CuentasAsync(CancellationToken.None));
    }

    [Fact]
    public async Task Sin_plataforma_configurada_o_sin_token_no_esta_disponible()
    {
        var r = new Respuesta(HttpStatusCode.OK, "[]");
        await Assert.ThrowsAsync<NoEncontradoException>(() => Cliente(r, url: null).CuentasAsync(CancellationToken.None));
        await Assert.ThrowsAsync<NoEncontradoException>(() => Cliente(r, token: null).CuentasAsync(CancellationToken.None));
        Assert.Null(r.Pedido);   // no salió nada
    }
}
