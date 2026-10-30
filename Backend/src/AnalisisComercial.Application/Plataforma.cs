namespace AnalisisComercial.Application;

/// <summary>Los roles de Madomi en la plataforma que importan acá (script 031 de la central).</summary>
public static class RolesPlataforma
{
    /// <summary>analisis-comercial.ver + .admin (y cuentas.administrar, script 034): el admin de esta app.</summary>
    public const string Administrador = "Administrador comercial";

    /// <summary>analisis-comercial.ver: el que se da a vendedores y supervisores (lo que ven sale de su acceso acá).</summary>
    public const string Comercial = "Comercial";
}

/// <summary>Una cuenta de la empresa en la plataforma (<c>GET /api/cuentas</c> de la plataforma).</summary>
/// <param name="UltimoIngreso">UTC; null = nunca entró.</param>
public record CuentaPlataforma(Guid Id, string Usuario, string Nombre, bool Activa, IReadOnlyList<RolPlataforma> Roles,
    bool Federada, DateTime? UltimoIngreso);

public record RolPlataforma(int Id, string Nombre);

/// <summary>
/// La API de cuentas de la plataforma (30/10/2026), siempre con el token de la persona logueada y nunca con uno de
/// servicio: la plataforma mira los permisos de esa persona (cuentas.administrar) y la empresa de su sesión. Solo
/// listar y crear: editar, dar de baja o cambiar la clave no existen todavía.
/// Errores: NoEncontradoException si no está configurada en este entorno (en desarrollo no corre), ValidacionException
/// con el campo de la plataforma (usuario, nombre, clave, idRol) y AccesoDenegadoException si no lo permite.
/// </summary>
public interface IPlataforma
{
    Task<IReadOnlyList<CuentaPlataforma>> CuentasAsync(CancellationToken ct);

    /// <summary>Los roles de la empresa que quien pide puede dar.</summary>
    Task<IReadOnlyList<RolPlataforma>> RolesAsync(CancellationToken ct);

    Task<CuentaPlataforma> CrearCuentaAsync(string usuario, string nombre, string clave, int idRol, CancellationToken ct);
}
