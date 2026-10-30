using AnalisisComercial.Domain;

namespace AnalisisComercial.Application;

/// <summary>Permisos de la plataforma (claim <c>perm</c>) y el módulo (claim <c>mod</c>).</summary>
public static class Permisos
{
    public const string Modulo = "analisis-comercial";
    public const string Ver = "analisis-comercial.ver";
    public const string Admin = "analisis-comercial.admin";
}

/// <summary>El usuario del request, tal como viene en el token del login central.</summary>
public interface IUsuarioActual
{
    Guid IdUsuario { get; }
    Guid IdEmpresa { get; }
    string Email { get; }
    bool EsSuperAdmin { get; }
    bool Tiene(string permiso);
}

/// <summary>
/// Qué puede ver el usuario. Se resuelve en el servidor en cada request (nunca se acepta del front).
/// </summary>
/// <param name="Vendedores">Los vendedores visibles. Admin: todos, incluida la casa. Operario: los suyos (uno o varios).</param>
/// <param name="VeCasa">Las cuentas de la casa (vendedores que no son persona y rutas sin vendedor): solo el Admin.</param>
public sealed record Alcance(RolApp Rol, Guid IdUsuario, string Email, IReadOnlySet<int> Vendedores, bool VeCasa)
{
    public bool EsAdmin => Rol == RolApp.Admin;
}

public interface IAlcanceUsuario
{
    /// <summary>
    /// El alcance del usuario del request. AccesoDenegadoException si no tiene acceso a la app (sin rol cargado,
    /// desactivado, o de otra empresa). Lo calcula una vez por request.
    /// </summary>
    Task<Alcance> ObtenerAsync(CancellationToken ct = default);

    /// <summary>Anota en el registro de accesos (los denegados, para auditoría).</summary>
    Task RegistrarAsync(string pantalla, string? parametros, bool denegado, CancellationToken ct = default);
}

/// <summary>La fecha de negocio (Argentina). Se reemplaza en las pruebas.</summary>
public interface IReloj
{
    DateTimeOffset Ahora { get; }
    DateOnly Hoy { get; }
}

public class RelojArgentina(TimeProvider reloj) : IReloj
{
    public DateTimeOffset Ahora => Calendario.AhoraArgentina(reloj);
    public DateOnly Hoy => Calendario.HoyArgentina(reloj);
}
