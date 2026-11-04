using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Servicios;

/// <summary>
/// Resuelve qué ve el usuario del request (CONTEXTO_BACKEND §7). Scoped: se calcula una vez por request.
/// - Admin: permiso analisis-comercial.admin de la plataforma, o SuperAdmin. Ve todo, incluida la casa.
/// - Supervisor / operario: un AccesoUsuario activo enlazado a su cuenta (IdUsuario). Se enlaza cuando el Admin lo da,
///   nunca por el email al entrar: la plataforma deja cambiar el email propio sin verificarlo, y con el enlace por
///   email cualquiera se ponía el de un acceso pendiente y lo heredaba (revisión de seguridad del 04/11/2026).
/// - Cualquier otro caso: sin acceso (el acceso se otorga, no se presupone).
/// </summary>
public class AlcanceUsuario(ComercialDbContext db, IUsuarioActual usuario, IReloj reloj, IOptions<OpcionesComercial> opciones)
    : IAlcanceUsuario
{
    private Alcance? _alcance;

    public async Task<Alcance> ObtenerAsync(CancellationToken ct = default)
    {
        if (_alcance is not null)
            return _alcance;
        if (usuario.IdEmpresa != opciones.Value.IdEmpresa)
            throw new AccesoDenegadoException("Análisis Comercial no está disponible para esta empresa.");

        if (usuario.EsSuperAdmin || usuario.Tiene(Permisos.Admin))
        {
            var todos = await db.Vendedores.Select(v => v.IdPersonal).ToListAsync(ct);
            return _alcance = new Alcance(RolApp.Admin, usuario.IdUsuario, usuario.Email, todos.ToHashSet(), VeCasa: true);
        }
        if (!usuario.Tiene(Permisos.Ver))
            throw new AccesoDenegadoException(AccesoDenegadoException.SinAcceso);

        var acceso = await db.Accesos.Include(a => a.Vendedores).FirstOrDefaultAsync(a => a.IdUsuario == usuario.IdUsuario, ct);
        if (acceso is null || !acceso.Activo)
            throw new AccesoDenegadoException(AccesoDenegadoException.SinAcceso);

        // Operario y supervisor ven los vendedores de su acceso (el operario, uno o varios). Sin ninguno, nada.
        var vendedores = acceso.Vendedores.Select(v => v.IdPersonal).ToHashSet();
        if (vendedores.Count == 0)
            throw new AccesoDenegadoException(AccesoDenegadoException.SinAcceso);
        var rol = acceso.Rol switch
        {
            RolAcceso.Operario => RolApp.Operario,
            RolAcceso.Supervisor => RolApp.Supervisor,
            _ => throw new AccesoDenegadoException(AccesoDenegadoException.SinAcceso),
        };
        return _alcance = new Alcance(rol, usuario.IdUsuario, usuario.Email, vendedores, VeCasa: false);
    }

    public async Task RegistrarAsync(string pantalla, string? parametros, bool denegado, CancellationToken ct = default)
    {
        Guid? empresa;
        try
        {
            empresa = usuario.IdEmpresa;
        }
        catch (AccesoDenegadoException)
        {
            empresa = null;
        }
        db.AccesoLogs.Add(new AccesoLog
        {
            IdUsuario = usuario.IdUsuario,
            Email = usuario.Email is { Length: > 200 } e ? e[..200] : usuario.Email,
            IdEmpresa = empresa,
            Canal = usuario.Canal is { Length: > 20 } c ? c[..20] : usuario.Canal,
            Fecha = reloj.Ahora,
            Pantalla = pantalla.Length > 60 ? pantalla[..60] : pantalla,
            Parametros = parametros is { Length: > 500 } ? parametros[..500] : parametros,
            Denegado = denegado,
        });
        await db.SaveChangesAsync(ct);
    }
}
