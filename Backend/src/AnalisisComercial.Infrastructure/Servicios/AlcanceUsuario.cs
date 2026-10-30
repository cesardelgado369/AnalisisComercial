using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace AnalisisComercial.Infrastructure.Servicios;

/// <summary>
/// Resuelve qué ve el usuario del request (CONTEXTO_BACKEND §7). Scoped: se calcula una vez por request.
/// - Admin: permiso analisis-comercial.admin de la plataforma, o SuperAdmin. Ve todo, incluida la casa.
/// - Supervisor / operario: un AccesoUsuario activo (por cuenta, o por email la primera vez, y ahí se enlaza).
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
        if (acceso is null)
        {
            // Primera vez: se reconoce por el email y queda enlazado a la cuenta.
            var email = usuario.Email.Trim().ToLowerInvariant();
            acceso = await db.Accesos.Include(a => a.Vendedores).FirstOrDefaultAsync(a => a.IdUsuario == null && a.Email == email, ct);
            if (acceso is not null)
            {
                acceso.IdUsuario = usuario.IdUsuario;
                await db.GuardarAsync(ct);
            }
        }
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
        db.AccesoLogs.Add(new AccesoLog
        {
            IdUsuario = usuario.IdUsuario,
            Email = usuario.Email,
            Fecha = reloj.Ahora,
            Pantalla = pantalla,
            Parametros = parametros is { Length: > 500 } ? parametros[..500] : parametros,
            Denegado = denegado,
        });
        await db.SaveChangesAsync(ct);
    }
}
