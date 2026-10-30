using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using AnalisisComercial.Infrastructure.Datos;
using Microsoft.EntityFrameworkCore;

namespace AnalisisComercial.Infrastructure.Servicios;

/// <summary>Administración: solo el Admin. Accesos por email, clientes excluidos y sincronización con Chess.</summary>
public class AdminService(ComercialDbContext db, IAlcanceUsuario alcance, IReloj reloj, Lectura lectura, IPlataforma plataforma)
    : IAdminService
{
    private async Task<Alcance> AdminAsync(string pantalla, CancellationToken ct)
    {
        var a = await alcance.ObtenerAsync(ct);
        if (!a.EsAdmin)
        {
            await alcance.RegistrarAsync(pantalla, null, denegado: true, ct);
            throw new AccesoDenegadoException("La administración es solo para administradores.");
        }
        return a;
    }

    // ---- accesos

    public async Task<IReadOnlyList<AccesoDto>> AccesosAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-usuarios", ct);
        var accesos = await db.Accesos.AsNoTracking().Include(a => a.Vendedores).OrderBy(a => a.Email).ToListAsync(ct);
        var ingresos = await UltimosIngresosAsync(accesos.Where(a => a.IdUsuario != null).Select(a => a.IdUsuario!.Value).ToList(), ct);
        return accesos.Select(a => Dto(a, ingresos)).ToList();
    }

    public async Task<AccesoDto> CrearAccesoAsync(GuardarAccesoDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-usuarios", ct);
        var acceso = new AccesoUsuario();
        await AplicarAsync(acceso, dto, admin, ct);
        db.Accesos.Add(acceso);
        await db.GuardarAsync(ct);
        return Dto(acceso, []);
    }

    public async Task<AccesoDto> ActualizarAccesoAsync(int idAcceso, GuardarAccesoDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-usuarios", ct);
        var acceso = await db.Accesos.Include(a => a.Vendedores).FirstOrDefaultAsync(a => a.IdAcceso == idAcceso, ct)
                     ?? throw new NoEncontradoException("No existe ese acceso.");
        if (string.IsNullOrWhiteSpace(dto.Version))
            throw new ValidacionException("version", "Falta la versión: volvé a cargar el acceso.");
        if (!int.TryParse(dto.Version, out var leida))
            throw new ValidacionException("version", "Versión inválida.");
        // El UPDATE va con WHERE Version = la que leyó el Admin: si otro guardó en el medio, 409.
        db.Entry(acceso).Property(a => a.Version).OriginalValue = leida;
        await AplicarAsync(acceso, dto, admin, ct);
        acceso.Activo = dto.Activo ?? acceso.Activo;
        acceso.Version = leida + 1;
        await db.GuardarAsync(ct);
        var ingresos = acceso.IdUsuario is { } u ? await UltimosIngresosAsync([u], ct) : [];
        return Dto(acceso, ingresos);
    }

    private async Task AplicarAsync(AccesoUsuario acceso, GuardarAccesoDto dto, Alcance admin, CancellationToken ct)
    {
        // La plataforma admite cuentas sin dominio («jimena»): vale el email o el usuario con el que entra.
        var email = dto.Email?.Trim().ToLowerInvariant() ?? "";
        if (email.Length == 0)
            throw new ValidacionException("email", "Ingresá el email o usuario con el que entra a la plataforma.");
        if (email.Length is < 2 or > 200 || email.Any(char.IsWhiteSpace))
            throw new ValidacionException("email", "El email o usuario no es válido.");
        if (await db.Accesos.AnyAsync(a => a.Email == email && a.IdAcceso != acceso.IdAcceso, ct))
            throw new ValidacionException("email", "Ese email ya tiene acceso.");
        var nombre = string.IsNullOrWhiteSpace(dto.Nombre) ? null : dto.Nombre.Trim();
        if (nombre is { Length: > 100 })
            throw new ValidacionException("nombre", "Hasta 100 caracteres.");
        if (dto.Rol is not { } rol || !Enum.IsDefined(rol))
            throw new ValidacionException("rol", "Elegí supervisor u operario.");

        // Operario y supervisor: al menos un vendedor, todos personas (la casa la ve solo el Admin). El operario puede
        // tener varios: el mismo vendedor con su idPersonal viejo y el nuevo, si Chess lo renombró.
        var personas = await db.Vendedores.Where(v => v.EsPersona).Select(v => v.IdPersonal).ToListAsync(ct);
        var ids = (dto.IdsPersonal ?? []).Distinct().ToList();
        if (ids.Count == 0)
            throw new ValidacionException("idsPersonal", rol == RolAcceso.Operario ? "Elegí su vendedor de Chess." : "Elegí al menos un vendedor.");
        if (ids.Any(id => !personas.Contains(id)))
            throw new ValidacionException("idsPersonal", "Hay un vendedor que no existe o no es una persona.");
        // Diferencia (no borrar y volver a agregar la misma clave: EF no lo admite en un mismo guardado).
        acceso.Vendedores.RemoveAll(v => !ids.Contains(v.IdPersonal));
        acceso.Vendedores.AddRange(ids.Where(id => acceso.Vendedores.All(v => v.IdPersonal != id))
            .Select(id => new AccesoVendedor { IdAcceso = acceso.IdAcceso, IdPersonal = id }));
        acceso.Email = email;
        acceso.Nombre = nombre;
        acceso.Rol = rol;
        acceso.ActualizadoPor = admin.Email;
        acceso.Actualizado = reloj.Ahora;
    }

    private Task<Dictionary<Guid, DateTimeOffset>> UltimosIngresosAsync(List<Guid> usuarios, CancellationToken ct)
        => db.AccesoLogs.AsNoTracking()
            .Where(l => usuarios.Contains(l.IdUsuario) && !l.Denegado)
            .GroupBy(l => l.IdUsuario)
            .Select(g => new { g.Key, Fecha = g.Max(l => l.Fecha) })
            .ToDictionaryAsync(x => x.Key, x => x.Fecha, ct);

    private static AccesoDto Dto(AccesoUsuario a, Dictionary<Guid, DateTimeOffset> ingresos)
        => new(a.IdAcceso, a.Email, a.Nombre, a.Rol, a.Vendedores.Select(v => v.IdPersonal).Order().ToList(), a.Activo, a.IdUsuario is not null, a.IdUsuario is { } u && ingresos.TryGetValue(u, out var f) ? f : null,
            a.ActualizadoPor, a.Actualizado, a.Version.ToString(System.Globalization.CultureInfo.InvariantCulture));

    // ---- cuentas de la plataforma (30/10/2026: la API de cuentas de la central, con el token de quien entra)

    public async Task<IReadOnlyList<CuentaMadomiDto>> CuentasAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-cuentas", ct);
        var cuentas = await plataforma.CuentasAsync(ct);
        var accesos = await db.Accesos.AsNoTracking().Include(a => a.Vendedores).ToListAsync(ct);

        // Cada cuenta con su acceso: el enlazado a ella o, si todavía no entró, el de su usuario.
        var porCuenta = accesos.Where(a => a.IdUsuario is not null).ToDictionary(a => a.IdUsuario!.Value);
        var porEmail = accesos.Where(a => a.IdUsuario is null).ToDictionary(a => a.Email);
        var usados = new HashSet<int>();
        var filas = new List<CuentaMadomiDto>();
        foreach (var c in cuentas)
        {
            var acceso = porCuenta.GetValueOrDefault(c.Id) ?? porEmail.GetValueOrDefault(c.Usuario.Trim().ToLowerInvariant());
            if (acceso is not null)
                usados.Add(acceso.IdAcceso);
            filas.Add(Cuenta(c, acceso));
        }
        // Accesos sin cuenta en la plataforma (se dieron por email antes de que la persona tuviera cuenta).
        filas.AddRange(accesos.Where(a => !usados.Contains(a.IdAcceso))
            .Select(a => new CuentaMadomiDto(a.IdUsuario, a.Email, a.Nombre, false, null, RolDe(a.Rol), a.IdAcceso,
                IdsPersonal(a), a.Activo, Version(a), false)));
        return filas.OrderBy(f => f.Nombre ?? f.Usuario, StringComparer.Create(System.Globalization.CultureInfo.GetCultureInfo("es-AR"), true))
            .ThenBy(f => f.Usuario, StringComparer.Ordinal)
            .ToList();
    }

    public async Task<CuentaMadomiDto> CrearCuentaAsync(NuevaCuentaDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-cuentas", ct);
        // Primero lo de esta app (usuario sin acceso, rol, vendedores): si algo no va, no queda una cuenta suelta.
        var acceso = new AccesoUsuario();
        try
        {
            await AplicarAsync(acceso, new GuardarAccesoDto(dto.Usuario, dto.Nombre, dto.Rol, dto.IdsPersonal), admin, ct);
        }
        catch (ValidacionException e) when (e.Campo == "email")
        {
            throw new ValidacionException("usuario", e.Message);
        }

        var comercial = (await plataforma.RolesAsync(ct)).FirstOrDefault(r => r.Nombre == RolesPlataforma.Comercial)
                        ?? throw new ValidacionException("rol", $"La plataforma no tiene el rol «{RolesPlataforma.Comercial}» para darte.");
        CuentaPlataforma cuenta;
        try
        {
            cuenta = await plataforma.CrearCuentaAsync(dto.Usuario?.Trim() ?? "", dto.Nombre?.Trim() ?? "", dto.Password ?? "",
                comercial.Id, ct);
        }
        catch (ValidacionException e) when (e.Campo is "clave" or "idRol")
        {
            throw new ValidacionException(e.Campo == "clave" ? "password" : "rol", e.Message);
        }

        // Sin enlazar: se enlaza la primera vez que entra (así «entró» sigue diciendo la verdad).
        db.Accesos.Add(acceso);
        await db.GuardarAsync(ct);
        await alcance.RegistrarAsync("admin-cuentas", $"alta={acceso.Email};rol={acceso.Rol}", denegado: false, ct);
        return Cuenta(cuenta, acceso);
    }

    private static CuentaMadomiDto Cuenta(CuentaPlataforma c, AccesoUsuario? acceso)
    {
        var esAdmin = c.Roles.Any(r => r.Nombre == RolesPlataforma.Administrador);
        DateTimeOffset? ingreso = c.UltimoIngreso is { } u
            ? TimeZoneInfo.ConvertTime(new DateTimeOffset(DateTime.SpecifyKind(u, DateTimeKind.Utc)), Calendario.Argentina)
            : null;
        return new CuentaMadomiDto(c.Id, c.Usuario, c.Nombre, c.Activa, ingreso,
            esAdmin ? RolApp.Admin : acceso is null ? null : RolDe(acceso.Rol), acceso?.IdAcceso,
            acceso is null ? [] : IdsPersonal(acceso), acceso?.Activo ?? false, acceso is null ? null : Version(acceso), c.Federada);
    }

    private static RolApp RolDe(RolAcceso rol) => rol == RolAcceso.Supervisor ? RolApp.Supervisor : RolApp.Operario;

    private static List<int> IdsPersonal(AccesoUsuario a) => a.Vendedores.Select(v => v.IdPersonal).Order().ToList();

    private static string Version(AccesoUsuario a) => a.Version.ToString(System.Globalization.CultureInfo.InvariantCulture);

    // ---- exclusiones

    public async Task<IReadOnlyList<ExclusionDto>> ExclusionesAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-exclusiones", ct);
        return await db.Exclusiones.AsNoTracking()
            .OrderBy(e => e.IdCliente)
            .Select(e => new ExclusionDto(e.IdCliente,
                db.Clientes.Where(c => c.IdCliente == e.IdCliente).Select(c => c.RazonSocial).FirstOrDefault() ?? "",
                e.Motivo, e.CreadoPor, e.CreadoEn))
            .ToListAsync(ct);
    }

    public async Task<ExclusionDto> ExcluirClienteAsync(NuevaExclusionDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-exclusiones", ct);
        if (dto.IdCliente is not { } id)
            throw new ValidacionException("idCliente", "Elegí el cliente.");
        var cliente = await db.Clientes.AsNoTracking().FirstOrDefaultAsync(c => c.IdCliente == id, ct)
                      ?? throw new ValidacionException("idCliente", "No existe ese cliente.");
        var motivo = dto.Motivo?.Trim() ?? "";
        if (motivo.Length == 0)
            throw new ValidacionException("motivo", "Contá por qué se excluye.");
        if (motivo.Length > 200)
            throw new ValidacionException("motivo", "Hasta 200 caracteres.");
        if (await db.Exclusiones.AnyAsync(e => e.IdCliente == id, ct))
            throw new ValidacionException("idCliente", "Ese cliente ya está excluido.");
        var e = new Exclusion { IdCliente = id, Motivo = motivo, CreadoPor = admin.Email, CreadoEn = reloj.Ahora };
        db.Exclusiones.Add(e);
        await db.GuardarAsync(ct);
        return new ExclusionDto(id, cliente.RazonSocial, e.Motivo, e.CreadoPor, e.CreadoEn);
    }

    public async Task QuitarExclusionAsync(int idCliente, CancellationToken ct = default)
    {
        await AdminAsync("admin-exclusiones", ct);
        if (await db.Exclusiones.Where(e => e.IdCliente == idCliente).ExecuteDeleteAsync(ct) == 0)
            throw new NoEncontradoException("Ese cliente no estaba excluido.");
    }

    // ---- clientes Vitales (Cesar, 30/10/2026: un click en la lista)

    public async Task<VitalDto> MarcarVitalAsync(int idCliente, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-vitales", ct);
        var cliente = await db.Clientes.AsNoTracking().FirstOrDefaultAsync(c => c.IdCliente == idCliente, ct)
                      ?? throw new NoEncontradoException("No existe ese cliente.");
        var v = await db.Vitales.AsNoTracking().FirstOrDefaultAsync(x => x.IdCliente == idCliente, ct);
        if (v is null)
        {
            v = new ClienteVital { IdCliente = idCliente, MarcadoPor = admin.Email, MarcadoEn = reloj.Ahora };
            db.Vitales.Add(v);
            await db.GuardarAsync(ct);
        }
        return new VitalDto(idCliente, cliente.RazonSocial, v.MarcadoPor, v.MarcadoEn);
    }

    public async Task QuitarVitalAsync(int idCliente, CancellationToken ct = default)
    {
        await AdminAsync("admin-vitales", ct);
        await db.Vitales.Where(x => x.IdCliente == idCliente).ExecuteDeleteAsync(ct);
    }

    // ---- base de clientes (para excluir y clasificar) y vendedores

    /// <summary>
    /// La base de clientes: los que manda Chess y los que están en una ruta vigente, con el vendedor de su ruta de hoy.
    /// Sin ruta, o con una ruta sin vendedor: «sin vendedor» (IdPersonal null).
    /// </summary>
    private IQueryable<FilaBase> Base()
        => from c in db.Clientes.AsNoTracking()
           where c.EnChess || c.IdRuta != null
           join r in db.Rutas on c.IdRuta equals (int?)r.IdRuta into rr
           from r in rr.DefaultIfEmpty()
           join e in db.Exclusiones on c.IdCliente equals e.IdCliente into ee
           from e in ee.DefaultIfEmpty()
           join v in db.Vitales on c.IdCliente equals v.IdCliente into vv
           from v in vv.DefaultIfEmpty()
           select new FilaBase
           {
               IdCliente = c.IdCliente, RazonSocial = c.RazonSocial, Ruta = r == null ? null : r.Nombre,
               IdPersonal = r == null ? null : r.IdPersonal, Localidad = c.Localidad, Excluido = e != null,
               Motivo = e == null ? null : e.Motivo, ExcluidoPor = e == null ? null : e.CreadoPor,
               ExcluidoEn = e == null ? null : (DateTimeOffset?)e.CreadoEn,
               Vital = v != null, VitalPor = v == null ? null : v.MarcadoPor,
               VitalEn = v == null ? null : (DateTimeOffset?)v.MarcadoEn,
           };

    // Con propiedades (no un record posicional): EF traduce el Where y el GroupBy que se arman encima de esta proyección
    // solo si los miembros salen de un inicializador, no de un constructor.
    private sealed class FilaBase
    {
        public int IdCliente { get; init; }
        public string RazonSocial { get; init; } = "";
        public string? Ruta { get; init; }
        public int? IdPersonal { get; init; }
        public string? Localidad { get; init; }
        public bool Excluido { get; init; }
        public string? Motivo { get; init; }
        public string? ExcluidoPor { get; init; }
        public DateTimeOffset? ExcluidoEn { get; init; }
        public bool Vital { get; init; }
        public string? VitalPor { get; init; }
        public DateTimeOffset? VitalEn { get; init; }
    }

    public async Task<IReadOnlyList<VendedorAdminDto>> VendedoresAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-usuarios", ct);
        var todos = await db.Vendedores.AsNoTracking().ToListAsync(ct);
        // Personas activas por nombre, después las dadas de baja (para enlazar un vendedor renombrado), la casa al final.
        return todos.OrderBy(v => !v.EsPersona).ThenBy(v => !v.Activo).ThenBy(v => v.Nombre)
            .Select(v => new VendedorAdminDto(v.IdPersonal, v.Nombre, v.Activo, !v.EsPersona))
            .ToList();
    }

    /// <summary>
    /// La estadística rápida de cada cliente: su estado en los últimos meses (con la cartera de toda la empresa, sin
    /// mirar exclusiones), la última compra y la sugerencia de estado (<see cref="Sugerencias"/>).
    /// </summary>
    private sealed record Estadistica(IReadOnlyList<EstadoMes> Estados, DateOnly? UltimaCompra, int? DiasSinComprar,
        SugerenciaCliente? Sugerencia, string? Motivo);

    private async Task<(IReadOnlyList<DateOnly> Meses, Dictionary<int, Estadistica> PorCliente)> EstadisticasAsync(
        IReadOnlyCollection<FilaBase> filas, CancellationToken ct)
    {
        var meses = lectura.Meses(null, null);
        var (hoy, mesEnCurso, op) = (lectura.Hoy, lectura.MesEnCurso, lectura.Op);
        var primero = meses[0];
        var cartera = (await db.CarterasMes.AsNoTracking().Where(c => c.Mes >= primero)
            .Select(c => new { c.IdCliente, c.Mes }).ToListAsync(ct)).Select(c => (c.IdCliente, c.Mes)).ToHashSet();
        var desde = await db.CarterasMes.AsNoTracking().GroupBy(c => c.IdCliente)
            .Select(g => new { g.Key, Desde = g.Min(c => c.Mes) }).ToDictionaryAsync(x => x.Key, x => x.Desde, ct);
        var compras = await lectura.ComprasAsync(meses, null, ct);
        var ultimas = await lectura.UltimasComprasAsync(filas.Select(x => x.IdCliente).ToList(), ct);
        var ultimoCerrado = meses.LastOrDefault(m => m < mesEnCurso);

        var porCliente = new Dictionary<int, Estadistica>();
        foreach (var x in filas)
        {
            var id = x.IdCliente;
            var (estados, dejo) = Cobertura.Estados(meses, mesEnCurso, op.PrimerMes,
                m => cartera.Contains((id, m)), m => compras.Contains((id, m)));
            DateOnly? ultima = ultimas.TryGetValue(id, out var u) ? u : null;
            var (sugerencia, motivo) = Sugerencias.Calcular(x.Excluido, hoy, ultima,
                desde.TryGetValue(id, out var d) ? d : null, dejo ? ultimoCerrado : null, op.DiasSugerirExcluir, op.DiasSugerirRevisar);
            porCliente[id] = new Estadistica(estados, ultima, ultima is { } fu ? hoy.DayNumber - fu.DayNumber : null, sugerencia, motivo);
        }
        return (meses, porCliente);
    }

    public async Task<IReadOnlyList<GrupoClientesDto>> ResumenClientesAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-exclusiones", ct);
        var filas = await Base().ToListAsync(ct);
        var (_, estadisticas) = await EstadisticasAsync(filas, ct);
        var vendedores = await db.Vendedores.AsNoTracking().ToDictionaryAsync(v => v.IdPersonal, ct);
        // Por nombre, la casa al final y «sin vendedor» último.
        return filas.GroupBy(f => f.IdPersonal)
            .Select(g => (g, v: g.Key is { } p ? vendedores.GetValueOrDefault(p) : null))
            .OrderBy(x => x.g.Key is null ? 2 : x.v is { EsPersona: false } ? 1 : 0)
            .ThenBy(x => x.v?.Nombre)
            .Select(x => new GrupoClientesDto(x.g.Key, x.v?.Nombre ?? (x.g.Key is { } p ? $"Vendedor {p}" : null),
                x.v is { EsPersona: false }, x.g.Count(), x.g.Count(f => f.Excluido),
                x.g.Count(f => estadisticas[f.IdCliente].Sugerencia == SugerenciaCliente.Excluir), x.g.Count(f => f.Vital)))
            .ToList();
    }

    public async Task<PaginaClientesDto> ClientesAsync(FiltroClientesAdmin f, CancellationToken ct = default)
    {
        await AdminAsync("admin-exclusiones", ct);
        if (f.Pagina < 1)
            throw new ValidacionException("pagina", "Desde 1.");
        if (f.Tamano is < 1 or > 200)
            throw new ValidacionException("tamano", "Entre 1 y 200.");
        SugerenciaCliente? sugerida = (f.Sugerencia?.Trim().ToLowerInvariant()) switch
        {
            null or "" => null,
            "excluir" => SugerenciaCliente.Excluir,
            "revisar" => SugerenciaCliente.Revisar,
            _ => throw new ValidacionException("sugerencia", "excluir o revisar."),
        };

        var q = Base();
        switch (f.Vendedor?.Trim().ToLowerInvariant())
        {
            case null or "":
                break;
            case "sin":
                q = q.Where(x => x.IdPersonal == null);
                break;
            case var v when int.TryParse(v, out var id):
                q = q.Where(x => x.IdPersonal == id);
                break;
            default:
                throw new ValidacionException("vendedor", "Un idPersonal o «sin».");
        }
        q = (f.Excluidos?.Trim().ToLowerInvariant()) switch
        {
            null or "" or "todos" => q,
            "solo" => q.Where(x => x.Excluido),
            "sin" => q.Where(x => !x.Excluido),
            _ => throw new ValidacionException("excluidos", "todos, solo o sin."),
        };
        q = (f.Vitales?.Trim().ToLowerInvariant()) switch
        {
            null or "" or "todos" => q,
            "solo" => q.Where(x => x.Vital),
            "sin" => q.Where(x => !x.Vital),
            _ => throw new ValidacionException("vitales", "todos, solo o sin."),
        };
        if (f.Texto?.Trim() is { Length: > 0 } t)
        {
            var codigo = int.TryParse(t, out var n) ? n : (int?)null;
            q = q.Where(x => x.IdCliente == codigo || EF.Functions.Collate(x.RazonSocial, "Latin1_General_CI_AI").Contains(t));
        }

        q = q.OrderBy(x => x.RazonSocial).ThenBy(x => x.IdCliente);
        int total;
        List<FilaBase> filas;
        IReadOnlyList<DateOnly> meses;
        Dictionary<int, Estadistica> estadisticas;
        if (sugerida is null)
        {
            // Sin filtro de sugerencia: se pagina en la base y se calcula solo la página.
            total = await q.CountAsync(ct);
            filas = await q.Skip((f.Pagina - 1) * f.Tamano).Take(f.Tamano).ToListAsync(ct);
            (meses, estadisticas) = await EstadisticasAsync(filas, ct);
        }
        else
        {
            // La sugerencia se calcula en memoria: se calcula para todos (son unos 1.300) y después se pagina.
            var todas = await q.ToListAsync(ct);
            (meses, estadisticas) = await EstadisticasAsync(todas, ct);
            var sugeridas = todas.Where(x => estadisticas[x.IdCliente].Sugerencia == sugerida).ToList();
            total = sugeridas.Count;
            filas = sugeridas.Skip((f.Pagina - 1) * f.Tamano).Take(f.Tamano).ToList();
        }

        var vendedores = await db.Vendedores.AsNoTracking().ToDictionaryAsync(v => v.IdPersonal, v => v.Nombre, ct);
        return new PaginaClientesDto(f.Pagina, f.Tamano, total, meses, filas.Select(x =>
        {
            var e = estadisticas[x.IdCliente];
            return new ClienteAdminDto(x.IdCliente, x.RazonSocial, x.Ruta, x.IdPersonal,
                x.IdPersonal is { } p ? vendedores.GetValueOrDefault(p) : null, x.Localidad, e.UltimaCompra, e.DiasSinComprar,
                e.Estados, e.Sugerencia, e.Motivo, x.Excluido, x.Motivo, x.ExcluidoPor, x.ExcluidoEn, x.Vital, x.VitalPor, x.VitalEn);
        }).ToList());
    }

    // ---- sincronización

    public async Task<SincronizacionesDto> SincronizacionesAsync(int cantidad, CancellationToken ct = default)
    {
        await AdminAsync("admin-sincronizacion", ct);
        if (cantidad is < 1 or > 200)
            throw new ValidacionException("cantidad", "Entre 1 y 200.");
        var pendiente = await db.SyncSolicitudes.AsNoTracking().Where(s => s.TomadoEn == null)
            .OrderBy(s => s.SolicitadoEn).Select(s => new SolicitudSincronizacionDto(s.SolicitadoPor, s.SolicitadoEn))
            .FirstOrDefaultAsync(ct);
        var pasos = await db.SyncLogs.AsNoTracking().OrderByDescending(s => s.Id).Take(cantidad)
            .Select(s => new PasoSincronizacionDto(s.IdCorrida, s.Inicio, s.Fin, s.Endpoint, s.Desde, s.Hasta, s.Registros, s.Ok, s.Error))
            .ToListAsync(ct);
        return new SincronizacionesDto(pendiente, pasos);
    }

    public async Task<SolicitudSincronizacionDto> SolicitarSincronizacionAsync(CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-sincronizacion", ct);
        if (await db.SyncSolicitudes.AnyAsync(s => s.TomadoEn == null, ct))
            throw new ConflictoException("Ya hay una actualización pedida: se va a hacer en menos de un minuto.");
        var s = new SyncSolicitud { SolicitadoPor = admin.Email, SolicitadoEn = reloj.Ahora };
        db.SyncSolicitudes.Add(s);
        await db.GuardarAsync(ct);
        return new SolicitudSincronizacionDto(s.SolicitadoPor, s.SolicitadoEn);
    }
}
