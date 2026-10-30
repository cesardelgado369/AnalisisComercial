using System.IdentityModel.Tokens.Jwt;
using System.Net.Http.Headers;
using System.Security.Claims;
using System.Security.Cryptography;
using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using AnalisisComercial.Pruebas;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.IdentityModel.Tokens;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// La API en memoria contra una base temporal en el SQL Server local (se crea con las migraciones y se borra al final),
/// con «hoy» fijo en el 26/10/2026 y tokens ES256 firmados con un par propio (la API verifica con su pública).
///
/// Datos (todos inventados):
///   Vendedores: 1 UNO, 2 DOS, 7 UNO BIS (personas; el 7 es UNO renombrado en Chess) y 6 DEPOSITO (la casa).
///   Rutas: 10 de UNO (lunes), 20 de DOS (martes), 30 de DEPOSITO (lunes a sábado), 40 sin vendedor, 50 de UNO BIS
///   (miércoles).
///   Cartera de oct: 101 y 102 en la 10, 201 en la 20, 301 en la 30, 401 en la 40, 501 en la 50. En sep, 102 estaba en
///   la 20 (de DOS); 501 entró en octubre.
///   Compras: 101 compró ago, sep y oct; 102 ago y sep (no oct: sin compra aún); 201 ago (no sep: dejó de comprar).
///   103 (gobernanza): en ago era de DOS y compró; en sep pasó a UNO y no compró; en oct ya no está en ninguna ruta.
///   Bultos de 101: sep 2 el 15/9, nota de crédito de 1 el 20/9 y 3 el 28/9 (4 netos; al 23/9, el día hábil 20, 1);
///   oct 2 el 20/10, y en la misma factura retiró 1 (línea negativa: cuenta como devolución) → 1 neto.
///   Accesos: operario@madomi → UNO; supervisor@madomi → DOS; nuevo@madomi → UNO (todavía no entró);
///   doble@madomi → operario con UNO y UNO BIS.
/// </summary>
public class Entorno : IAsyncLifetime
{
    public static readonly Guid Madomi = Guid.Parse("A1B2C3D4-0000-4000-8000-000000000001");
    public static readonly DateOnly Hoy = new(2026, 10, 26);
    public static readonly DateOnly Ago = new(2026, 8, 1), Sep = new(2026, 9, 1), Oct = new(2026, 10, 1);

    private readonly ECDsa _clave = ECDsa.Create(ECCurve.NamedCurves.nistP256);
    private readonly string _base = $"AC_Pruebas_{Guid.NewGuid():N}";
    private WebApplicationFactory<Program> _fabrica = null!;

    /// <summary>La API de cuentas de la plataforma, en memoria (la real no corre en las pruebas).</summary>
    public PlataformaFalsa Plataforma { get; } = new();

    private string Conexion => ServidorDePruebas.Conexion(_base);

    private sealed class RelojFijo : IReloj
    {
        public DateTimeOffset Ahora => new(Hoy.ToDateTime(new TimeOnly(10, 0)), TimeSpan.FromHours(-3));
        public DateOnly Hoy => Entorno.Hoy;
    }

    public async Task InitializeAsync()
    {
        var publica = Convert.ToBase64String(_clave.ExportSubjectPublicKeyInfo());
        _fabrica = new WebApplicationFactory<Program>().WithWebHostBuilder(b =>
        {
            b.UseEnvironment("Pruebas");
            b.UseSetting("ConnectionStrings:Comercial", Conexion);
            b.UseSetting("Jwt:ClavePublica", publica);
            b.UseSetting("Autenticacion:Desarrollo:Habilitado", "false");
            Ajustar(b);
            b.ConfigureTestServices(s =>
            {
                s.Replace(ServiceDescriptor.Singleton<IReloj, RelojFijo>());
                s.Replace(ServiceDescriptor.Singleton<IPlataforma>(Plataforma));
            });
        });
        _fabrica.CreateClient().Dispose();   // arranca la API: crea la base con las migraciones
        await SembrarAsync();
    }

    /// <summary>Para un entorno con otra configuración (<see cref="EntornoVentana"/>).</summary>
    protected virtual void Ajustar(IWebHostBuilder b) { }

    public async Task DisposeAsync()
    {
        await _fabrica.DisposeAsync();
        SqlConnection.ClearAllPools();
        await using var cn = new SqlConnection(ServidorDePruebas.Conexion("master"));
        await cn.OpenAsync();
        await using var cmd = cn.CreateCommand();
        cmd.CommandText = $"ALTER DATABASE [{_base}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; DROP DATABASE [{_base}];";
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<T> ConBaseAsync<T>(Func<ComercialDbContext, Task<T>> f)
    {
        using var scope = _fabrica.Services.CreateScope();
        return await f(scope.ServiceProvider.GetRequiredService<ComercialDbContext>());
    }

    // ---- clientes HTTP

    public HttpClient SinToken() => _fabrica.CreateClient();

    public HttpClient Como(string email, IEnumerable<string>? permisos = null, Guid? idUsuario = null, Guid? empresa = null,
        bool superAdmin = false, bool conModulo = true, ECDsa? firmadoCon = null)
    {
        var cliente = _fabrica.CreateClient();
        cliente.DefaultRequestHeaders.Authorization = new AuthenticationHeaderValue("Bearer",
            Token(email, permisos ?? [Permisos.Ver], idUsuario ?? IdDe(email), empresa ?? Madomi, superAdmin, conModulo, firmadoCon ?? _clave));
        return cliente;
    }

    public HttpClient Admin() => Como("checho@madomi", [Permisos.Ver, Permisos.Admin]);
    public HttpClient Operario() => Como("operario@madomi");
    public HttpClient Supervisor() => Como("supervisor@madomi");

    /// <summary>Un id de cuenta estable por email (como la plataforma: siempre el mismo para la misma persona).</summary>
    public static Guid IdDe(string email) => new(MD5.HashData(System.Text.Encoding.UTF8.GetBytes(email)));

    private static string Token(string email, IEnumerable<string> permisos, Guid idUsuario, Guid empresa, bool superAdmin,
        bool conModulo, ECDsa clave)
    {
        var claims = new List<Claim>
        {
            new("sub", idUsuario.ToString()), new("email", email), new("tenant_id", empresa.ToString()),
            new("is_superadmin", superAdmin ? "true" : "false"),
        };
        claims.AddRange(permisos.Select(p => new Claim("perm", p)));
        if (conModulo)
            claims.Add(new Claim("mod", Permisos.Modulo));
        var credenciales = new SigningCredentials(new ECDsaSecurityKey(clave), SecurityAlgorithms.EcdsaSha256);
        var token = new JwtSecurityToken("Vignoli.Plataforma", "Vignoli.Modulos", claims, DateTime.UtcNow.AddMinutes(-1),
            DateTime.UtcNow.AddMinutes(30), credenciales);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    // ---- datos

    private Task SembrarAsync() => ConBaseAsync(async db =>
    {
        db.Vendedores.AddRange(
            new Vendedor { IdPersonal = 1, Nombre = "VENDEDOR UNO", EsPersona = true, Activo = true },
            new Vendedor { IdPersonal = 2, Nombre = "VENDEDOR DOS", EsPersona = true, Activo = true },
            new Vendedor { IdPersonal = 7, Nombre = "VENDEDOR UNO BIS", EsPersona = true, Activo = true },
            new Vendedor { IdPersonal = 6, Nombre = "DEPOSITO", EsPersona = false, Activo = true });
        db.Rutas.AddRange(
            Ruta(10, "RUTA UNO", 1, "2"), Ruta(20, "RUTA DOS", 2, "3"),
            Ruta(30, "DEPOSITO", 6, "2,3,4,5,6,7"), Ruta(40, "SUR TUCUMAN", null, ""), Ruta(50, "RUTA UNO BIS", 7, "4"));
        db.Clientes.AddRange(
            Cliente(101, "ALMACEN UNO", 10, 1), Cliente(102, "DESPENSA DOS", 10, 2), Cliente(201, "KIOSCO TRES", 20, 1),
            Cliente(301, "CASA CUATRO", 30, null), Cliente(401, "SIN VENDEDOR CINCO", 40, null),
            Cliente(501, "ALMACEN BIS", 50, 1));
        db.Articulos.Add(new Articulo { IdArticulo = 900, Descripcion = "TALLARIN 500G", UnidadNegocio = "124 - PASTAS FRESCAS" });

        foreach (var mes in new[] { Ago, Sep, Oct })
        {
            db.CarterasMes.AddRange(
                Cartera(mes, 101, 10, 1),
                mes == Oct ? Cartera(mes, 102, 10, 1) : Cartera(mes, 102, 20, 2),
                Cartera(mes, 201, 20, 2), Cartera(mes, 301, 30, 6), Cartera(mes, 401, 40, null));
        }
        db.CarterasMes.Add(Cartera(Oct, 501, 50, 7));
        db.Clientes.Add(new Cliente { IdCliente = 103, RazonSocial = "PROVEEDURIA SIETE", EnChess = false });
        db.CarterasMes.AddRange(Cartera(Ago, 103, 20, 2), Cartera(Sep, 103, 10, 1));
        db.CarterasMes.Add(Cartera(new DateOnly(2026, 7, 1), 301, 30, 6));   // la casa: en cartera desde julio, nunca compró
        db.ComprasMes.AddRange(
            Compra(Ago, 101), Compra(Sep, 101), Compra(Oct, 101),
            Compra(Ago, 102), Compra(Sep, 102),
            Compra(Ago, 201), Compra(Ago, 103));
        // Las facturas que respaldan esas compras (la última compra sale de acá).
        db.VentaLineas.AddRange(
            Factura(1, new DateOnly(2026, 10, 20), 101), Factura(2, new DateOnly(2026, 9, 15), 101),
            Factura(3, new DateOnly(2026, 9, 15), 102), Factura(4, new DateOnly(2026, 8, 15), 102),
            Factura(5, new DateOnly(2026, 8, 10), 201), Factura(6, new DateOnly(2026, 8, 20), 103),
            Factura(7, new DateOnly(2026, 9, 20), 101, -1, "NOTA DE CREDITO"), Factura(8, new DateOnly(2026, 9, 28), 101, 3),
            Factura(1, new DateOnly(2026, 10, 20), 101, -1, linea: 2));
        db.SyncLogs.Add(new SyncLog
        {
            IdCorrida = Guid.NewGuid(), Inicio = new DateTimeOffset(2026, 10, 26, 5, 0, 0, TimeSpan.FromHours(-3)),
            Fin = new DateTimeOffset(2026, 10, 26, 5, 3, 0, TimeSpan.FromHours(-3)), Endpoint = "ventas/",
            Desde = new DateOnly(2026, 9, 28), Hasta = new DateOnly(2026, 10, 25), Registros = 1, Ok = true,
        });
        db.Accesos.AddRange(
            Acceso("operario@madomi", RolAcceso.Operario, enlazado: true, 1),
            Acceso("supervisor@madomi", RolAcceso.Supervisor, enlazado: true, 2),
            Acceso("nuevo@madomi", RolAcceso.Operario, enlazado: false, 1),
            Acceso("doble@madomi", RolAcceso.Operario, enlazado: true, 1, 7));
        await db.SaveChangesAsync();
        return 0;
    });

    private static Ruta Ruta(int id, string nombre, int? vendedor, string dias) => new()
    {
        IdRuta = id, Nombre = nombre, IdPersonal = vendedor, DiasVisita = dias, Vigente = true,
        FechaDesde = new DateOnly(2026, 5, 27), FechaHasta = new DateOnly(9999, 12, 31),
        Dias = DiasSemana.Parsear(dias).Select(d => new RutaDia { IdRuta = id, DiaSemana = d }).ToList(),
    };

    private static Cliente Cliente(int id, string nombre, int ruta, int? orden) => new()
    {
        IdCliente = id, RazonSocial = nombre, IdRuta = ruta, OrdenVisita = orden, Calle = "CALLE", Altura = 100,
        Localidad = "SAN MIGUEL DE TUCUMAN", Lat = -26.8m, Lng = -65.2m,
    };

    private static CarteraMes Cartera(DateOnly mes, int cliente, int ruta, int? vendedor)
        => new() { Mes = mes, IdCliente = cliente, IdRuta = ruta, IdPersonal = vendedor };

    private static VentaLinea Factura(long nro, DateOnly fecha, int cliente, decimal bultos = 2, string tipo = "FACTURA",
        int linea = 1) => new()
    {
        IdEmpresa = 1, IdDocumento = "FCVTA", Letra = "A", Serie = 1, NroDoc = nro, IdLinea = linea, Fecha = fecha, IdCliente = cliente,
        IdArticulo = 900, IdVendedor = 1, TipoDocumento = tipo, CantidadTotal = bultos, Neto = 50 * bultos, Final = 60.5m * bultos,
    };

    private static CompraMes Compra(DateOnly mes, int cliente)
        => new() { Mes = mes, IdCliente = cliente, IdArticulo = 900, Compro = true, Cantidad = 1, Neto = 100 };

    private static AccesoUsuario Acceso(string email, RolAcceso rol, bool enlazado, params int[] vendedores) => new()
    {
        Email = email, Rol = rol, Activo = true, IdUsuario = enlazado ? IdDe(email) : null,
        Vendedores = vendedores.Select(v => new AccesoVendedor { IdPersonal = v }).ToList(),
        ActualizadoPor = "pruebas", Actualizado = DateTimeOffset.UtcNow,
    };
}

[CollectionDefinition(Nombre)]
public class ColeccionEntorno : ICollectionFixture<Entorno>
{
    public const string Nombre = "Entorno";
}

/// <summary>Los mismos datos con la ventana de operario y supervisor en 2 meses (septiembre y octubre), para probarla.</summary>
public sealed class EntornoVentana : Entorno
{
    protected override void Ajustar(IWebHostBuilder b) => b.UseSetting("Comercial:MesesVisibles", "2");
}

[CollectionDefinition(Nombre)]
public class ColeccionEntornoVentana : ICollectionFixture<EntornoVentana>
{
    public const string Nombre = "EntornoVentana";
}
