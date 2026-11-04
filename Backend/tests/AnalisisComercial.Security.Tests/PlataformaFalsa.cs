using AnalisisComercial.Application;

namespace AnalisisComercial.Security.Tests;

/// <summary>
/// La API de cuentas de la plataforma en memoria, con las mismas reglas que la de la central: usuario único, clave de al
/// menos 8 y un rol de la empresa. Cuentas: checho (Administrador comercial), operario y supervisor (Comercial, con su
/// acceso en el Entorno) y derutas@madomi (entra con De Ruta, sin roles). nuevo@ y doble@ tienen acceso pero no cuenta.
/// </summary>
public sealed class PlataformaFalsa : IPlataforma
{
    public static readonly RolPlataforma Administrador = new(24, RolesPlataforma.Administrador);
    public static readonly RolPlataforma Comercial = new(25, RolesPlataforma.Comercial);

    private readonly List<CuentaPlataforma> _cuentas =
    [
        new(Entorno.IdDe("checho@madomi"), "checho@madomi", "Checho", true, [Administrador], false,
            new DateTime(2026, 10, 26, 13, 0, 0, DateTimeKind.Utc)),
        new(Entorno.IdDe("operario@madomi"), "operario@madomi", "Vendedor Uno", true, [Comercial], false, null),
        new(Entorno.IdDe("supervisor@madomi"), "supervisor@madomi", "Supervisor Dos", true, [Comercial], false, null),
        new(Entorno.IdDe("derutas@madomi"), "derutas@madomi", "Cuenta De Ruta", true, [], true, null),
    ];

    /// <summary>Cuántas cuentas se crearon (para ver que un alta que falla en la app no llega a la plataforma).</summary>
    public int Altas { get; private set; }

    public Task<IReadOnlyList<CuentaPlataforma>> CuentasAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<CuentaPlataforma>>(_cuentas.ToList());

    public Task<IReadOnlyList<RolPlataforma>> RolesAsync(CancellationToken ct)
        => Task.FromResult<IReadOnlyList<RolPlataforma>>([Administrador, Comercial]);

    public Task<CuentaPlataforma> CrearCuentaAsync(string usuario, string nombre, string clave, int idRol, CancellationToken ct)
    {
        if (_cuentas.Any(c => string.Equals(c.Usuario, usuario, StringComparison.OrdinalIgnoreCase)))
            throw new ValidacionException("usuario", "Ya existe una cuenta con ese usuario.");
        if (clave.Length < 8)
            throw new ValidacionException("clave", "La contraseña tiene que tener al menos 8 caracteres.");
        var rol = new[] { Administrador, Comercial }.FirstOrDefault(r => r.Id == idRol)
                  ?? throw new ValidacionException("idRol", "Elegí un rol de la empresa.");
        var cuenta = new CuentaPlataforma(Guid.NewGuid(), usuario.ToLowerInvariant(), nombre, true, [rol], false, null);
        _cuentas.Add(cuenta);
        Altas++;
        return Task.FromResult(cuenta);
    }

    public void Quitar(string usuario) => _cuentas.RemoveAll(c => c.Usuario == usuario);

    /// <summary>Una cuenta Comercial creada en la plataforma (no desde esta app), con el id de <see cref="Entorno.IdDe"/>.</summary>
    public Guid Agregar(string usuario)
    {
        var id = Entorno.IdDe(usuario);
        _cuentas.Add(new CuentaPlataforma(id, usuario, usuario, true, [Comercial], false, null));
        return id;
    }
}
