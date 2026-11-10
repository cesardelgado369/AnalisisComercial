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
        await EnlazarAsync(acceso, emailAnterior: null, ct);
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
        var emailAnterior = acceso.Email;
        await AplicarAsync(acceso, dto, admin, ct);
        await EnlazarAsync(acceso, emailAnterior, ct);
        acceso.Activo = dto.Activo ?? acceso.Activo;
        acceso.Version = leida + 1;
        await db.GuardarAsync(ct);
        var ingresos = acceso.IdUsuario is { } u ? await UltimosIngresosAsync([u], ct) : [];
        return Dto(acceso, ingresos);
    }

    /// <summary>
    /// El acceso se enlaza a la cuenta de la plataforma cuando el Admin lo guarda, nunca al entrar (ver AlcanceUsuario):
    /// la cuenta cuyo usuario es el email, si existe. Si todavía no existe, queda pendiente y no deja entrar a nadie
    /// hasta que el Admin lo vuelva a guardar. Uno ya enlazado conserva su cuenta mientras no le cambien el email.
    /// </summary>
    private async Task EnlazarAsync(AccesoUsuario acceso, string? emailAnterior, CancellationToken ct)
    {
        if (acceso.IdUsuario is not null && acceso.Email == emailAnterior)
            return;
        var cuenta = (await plataforma.CuentasAsync(ct)).FirstOrDefault(c => c.Usuario.Trim().ToLowerInvariant() == acceso.Email);
        if (cuenta is not null && await db.Accesos.AnyAsync(a => a.IdUsuario == cuenta.Id && a.IdAcceso != acceso.IdAcceso, ct))
            throw new ValidacionException("email", "Esa cuenta ya tiene otro acceso.");
        acceso.IdUsuario = cuenta?.Id;
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
        => new(a.IdAcceso, a.Email, a.Nombre, a.Rol, a.Vendedores.Select(v => v.IdPersonal).Order().ToList(), a.Activo, a.IdUsuario is { } e && ingresos.ContainsKey(e), a.IdUsuario is { } u && ingresos.TryGetValue(u, out var f) ? f : null,
            a.ActualizadoPor, a.Actualizado, a.Version.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Enlazado: a.IdUsuario is not null);

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
                IdsPersonal(a), a.Activo, Version(a), false, AccesoEnlazado: false)));
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

        // Enlazado ya a la cuenta recién creada («entró» sale de sus ingresos, no del enlace).
        acceso.IdUsuario = cuenta.Id;
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
            acceso is null ? [] : IdsPersonal(acceso), acceso?.Activo ?? false, acceso is null ? null : Version(acceso), c.Federada,
            AccesoEnlazado: acceso?.IdUsuario == c.Id);
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

    // ---- focos del mes (Checho, 03/11/2026; Cesar, 05/11: uno por mes y solo para el Admin)

    public async Task<IReadOnlyList<FocoDto>> FocosAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-focos", ct);
        return await FocosAsync(db, mes: null, ct);
    }

    /// <summary>
    /// Los focos con sus artículos, por mes descendente y nombre (<paramref name="mes"/>: solo los de ese mes). También
    /// para el filtro de las pantallas.
    /// </summary>
    internal static async Task<IReadOnlyList<FocoDto>> FocosAsync(ComercialDbContext db, DateOnly? mes, CancellationToken ct)
    {
        var focos = await db.Focos.AsNoTracking().Include(f => f.Articulos).Where(f => mes == null || f.Mes == mes).ToListAsync(ct);
        var ids = focos.SelectMany(f => f.Articulos.Select(a => a.IdArticulo)).Distinct().ToList();
        var nombres = await db.Articulos.AsNoTracking().Where(a => ids.Contains(a.IdArticulo))
            .ToDictionaryAsync(a => a.IdArticulo, a => a.Descripcion, ct);
        return focos.Select(f => Dto(f, nombres))
            .OrderByDescending(f => f.Mes)
            .ThenBy(f => f.Nombre, StringComparer.Create(System.Globalization.CultureInfo.GetCultureInfo("es-AR"), true))
            .ToList();
    }

    public async Task<FocoDto> CrearFocoAsync(GuardarFocoDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-focos", ct);
        var foco = new Foco();
        await AplicarAsync(foco, dto, admin, ct);
        db.Focos.Add(foco);
        await db.GuardarAsync(ct);
        await alcance.RegistrarAsync("admin-focos", $"alta={foco.Nombre}", denegado: false, ct);
        return await UnFocoAsync(foco.IdFoco, ct);
    }

    public async Task<FocoDto> ActualizarFocoAsync(int idFoco, GuardarFocoDto dto, CancellationToken ct = default)
    {
        var admin = await AdminAsync("admin-focos", ct);
        var foco = await db.Focos.Include(f => f.Articulos).FirstOrDefaultAsync(f => f.IdFoco == idFoco, ct)
                   ?? throw new NoEncontradoException("No existe ese foco.");
        await AplicarAsync(foco, dto, admin, ct);
        await db.GuardarAsync(ct);
        return await UnFocoAsync(idFoco, ct);
    }

    public async Task BorrarFocoAsync(int idFoco, CancellationToken ct = default)
    {
        await AdminAsync("admin-focos", ct);
        if (await db.Focos.Where(f => f.IdFoco == idFoco).ExecuteDeleteAsync(ct) == 0)
            throw new NoEncontradoException("No existe ese foco.");
    }

    public async Task<IReadOnlyList<ArticuloAdminDto>> ArticulosAsync(CancellationToken ct = default)
    {
        await AdminAsync("admin-focos", ct);
        var mesPasado = lectura.MesEnCurso.AddMonths(-1);
        var clientes = await db.ComprasMes.AsNoTracking().Where(c => c.Compro && c.Mes == mesPasado)
            .GroupBy(c => c.IdArticulo).Select(g => new { g.Key, Clientes = g.Select(c => c.IdCliente).Distinct().Count() })
            .ToDictionaryAsync(x => x.Key, x => x.Clientes, ct);
        var articulos = await db.Articulos.AsNoTracking().ToListAsync(ct);
        return articulos
            .Select(a => new ArticuloAdminDto(a.IdArticulo, a.Descripcion, a.UnidadNegocio, a.Division, a.Anulado,
                clientes.GetValueOrDefault(a.IdArticulo)))
            .OrderBy(a => a.Anulado).ThenBy(a => a.Division ?? "\uffff").ThenBy(a => a.Descripcion, StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// Cómo vienen los focos del mes, por vendedor (Cesar, 05/11/2026: el número de Checho, «CCC Manteca»): la misma
    /// regla de compró, cartera y exclusiones que <c>/api/cobertura?foco=</c>. Contra el mes anterior: en el mes en
    /// curso, hasta el mismo día; en uno cerrado, completo.
    /// </summary>
    public async Task<AnalisisFocosDto> AnalisisFocosAsync(DateOnly? mes, string? comparacion = null, string? abc = null,
        CancellationToken ct = default)
    {
        await AdminAsync("admin-focos-analisis", ct);
        var elegida = Lectura.Comparativa(comparacion);
        var m = Calendario.Mes(mes ?? lectura.MesEnCurso);
        if (m > lectura.MesEnCurso)
            throw new ValidacionException("mes", "No puede ser posterior al mes en curso.");
        if (m < lectura.Op.PrimerMes)
            throw new ValidacionException("mes", $"No hay datos antes de {lectura.Op.PrimerMes:MM/yyyy}.");
        var anterior = m.AddMonths(-1);
        var hayAnterior = anterior >= lectura.Op.PrimerMes;
        var enCurso = m == lectura.MesEnCurso;
        // Comparativa (Cesar, 10/11/2026): parcial = el anterior al mismo día; acumulado = el anterior entero.
        var alMismoDia = enCurso && elegida != TipoComparacion.MesAnteriorCompleto;
        var grupo = await lectura.FiltroAbcAsync(abc, m, ct);

        DateOnly? corteAl = null, anteriorAl = null;
        if (enCurso && await lectura.VentasHastaAsync(ct) is { } hasta && hasta >= m)
        {
            corteAl = hasta;
            var fin = Calendario.FinDeMes(anterior);
            if (alMismoDia)
                anteriorAl = anterior.AddDays(hasta.Day - 1) is var d && d <= fin ? d : fin;
        }

        var focos = await FocosAsync(db, m, ct);
        var vendedores = await lectura.VendedoresAsync(ct);
        var mirada = await lectura.MiradaAsync(null, "admin-focos-analisis", ct);   // las personas: sin la casa
        var carteras = await lectura.CarterasAsync(mirada, [m, anterior], null, ct);
        if (grupo is not null)
            await lectura.RecortarAbcAsync(carteras, grupo, ct);   // cada mes con su categoría, como en Cobertura
        // Los vol, con la comparación de /api/volumen del admin (el primer mes con datos no tiene base).
        var comparacionVol = m > lectura.Op.PrimerMes ? await lectura.ComparacionAsync(m, ct, elegida) : null;

        var resultado = new List<AnalisisFocoDto>();
        foreach (var foco in focos)
        {
            var filtro = new FiltroArticulos(null, foco.IdFoco, foco.Nombre);
            var compras = await lectura.ComprasAsync([m], filtro, ct);   // trae también el mes anterior completo
            var esVol = foco.Medida == MedidaFoco.Vol;
            HashSet<int> compraronAntes = !hayAnterior || esVol ? []
                : alMismoDia ? anteriorAl is { } al ? await CompraronHastaAsync(foco.Articulos.Select(a => a.IdArticulo).ToList(), anterior, al, ct) : []
                : compras.Where(c => c.Mes == anterior).Select(c => c.IdCliente).ToHashSet();
            Dictionary<int, decimal> actual = [], enBase = [];
            if (esVol && comparacionVol is not null)
            {
                var (act, bas) = await lectura.BultosComparadosAsync(comparacionVol, carteras[m].Keys.ToList(), filtro, ct);
                actual = act.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));
                enBase = bas.GroupBy(b => b.IdCliente).ToDictionary(g => g.Key, g => g.Sum(b => b.Netos));
            }

            CccFocoDto Medir(Func<CarteraMes, bool> deQuien)
            {
                var ahora = carteras[m].Values.Where(deQuien).ToList();
                var conCompra = ahora.Count(c => compras.Contains((c.IdCliente, m)));
                if (esVol)
                {
                    if (comparacionVol is null)
                        return new CccFocoDto(conCompra, ahora.Count, null, null);
                    // Como /api/volumen: cada cliente redondeado y después la suma.
                    var bultosActual = Volumen.Redondear(ahora.Sum(c => Volumen.Redondear(actual.GetValueOrDefault(c.IdCliente))));
                    var bultosBase = Volumen.Redondear(ahora.Sum(c => Volumen.Redondear(enBase.GetValueOrDefault(c.IdCliente))));
                    return new CccFocoDto(conCompra, ahora.Count, Volumen.Porcentaje(bultosActual, bultosBase), null,
                        bultosActual, bultosBase);
                }
                var antes = carteras[anterior].Values.Where(deQuien).ToList();
                decimal? porcentajeAnterior = hayAnterior && (!alMismoDia || anteriorAl is not null) && antes.Count > 0
                    ? Cobertura.Porcentaje(antes.Count(c => compraronAntes.Contains(c.IdCliente)), antes.Count)
                    : null;
                return new CccFocoDto(conCompra, ahora.Count, Cobertura.Porcentaje(conCompra, ahora.Count), porcentajeAnterior);
            }

            var porVendedor = carteras[m].Values.Where(c => c.IdPersonal is not null).Select(c => c.IdPersonal!.Value).Distinct()
                .Select(id =>
                {
                    var x = Medir(c => c.IdPersonal == id);
                    return new CccVendedorFocoDto(id, vendedores.GetValueOrDefault(id)?.Nombre ?? $"Vendedor {id}",
                        x.ClientesConCompra, x.ClientesCartera, x.Porcentaje, x.PorcentajeAnterior, x.BultosActual, x.BultosBase);
                })
                .OrderBy(v => v.Nombre, StringComparer.Create(System.Globalization.CultureInfo.GetCultureInfo("es-AR"), true))
                .ToList();
            resultado.Add(new AnalisisFocoDto(foco.IdFoco, foco.Nombre, foco.Medida, foco.Meta, Medir(_ => true), porVendedor));
        }
        await alcance.RegistrarAsync("admin-focos-analisis", $"mes={m:yyyy-MM-dd};comparacion={comparacion};abc={abc}", denegado: false, ct);
        var volumen = comparacionVol is { } k ? new VolumenFocosDto(k.CorteAl, k.BaseHasta, k.DiaHabil, k.DiasHabilesMes, k.Tipo) : null;
        return new AnalisisFocosDto(m, enCurso, corteAl, anterior, anteriorAl, volumen, resultado);
    }

    /// <summary>
    /// Los clientes que compraron alguno de los artículos entre el 1 del mes y <paramref name="hasta"/>, con
    /// <see cref="ReglaCompra"/> por cliente × artículo (como CompraMes, pero cortado en un día).
    /// </summary>
    private async Task<HashSet<int>> CompraronHastaAsync(List<int> articulos, DateOnly mes, DateOnly hasta, CancellationToken ct)
    {
        var regla = lectura.Op.Regla();
        var tipos = regla.TiposFactura.Concat(regla.TiposCredito).ToList();
        var lineas = await db.VentaLineas.AsNoTracking()
            .Where(l => l.Fecha >= mes && l.Fecha <= hasta && articulos.Contains(l.IdArticulo) && tipos.Contains(l.TipoDocumento))
            .ToListAsync(ct);
        return lineas.GroupBy(l => (l.IdCliente, l.IdArticulo))
            .Where(g => regla.Evaluar(g).Compro)
            .Select(g => g.Key.IdCliente)
            .ToHashSet();
    }

    private async Task AplicarAsync(Foco foco, GuardarFocoDto dto, Alcance admin, CancellationToken ct)
    {
        // Desde el primer mes con datos hasta el que viene (para dejarlo armado).
        if (dto.Mes is not { } mes || mes.Day != 1)
            throw new ValidacionException("mes", "Elegí el mes (el primer día).");
        if (mes < lectura.Op.PrimerMes || mes > lectura.MesEnCurso.AddMonths(1))
            throw new ValidacionException("mes", $"Tiene que ser entre {lectura.Op.PrimerMes:MM/yyyy} y {lectura.MesEnCurso.AddMonths(1):MM/yyyy}.");
        var nombre = dto.Nombre?.Trim() ?? "";
        if (nombre.Length is < 1 or > 60)
            throw new ValidacionException("nombre", "Ponele un nombre de hasta 60 caracteres.");
        if (await db.Focos.AnyAsync(f => f.Mes == mes && f.Nombre == nombre && f.IdFoco != foco.IdFoco, ct))
            throw new ValidacionException("nombre", "Ya hay un foco con ese nombre en ese mes.");
        var medida = dto.Medida?.Trim().ToLowerInvariant() switch
        {
            null or "" or "ccc" => MedidaFoco.Ccc,
            "vol" => MedidaFoco.Vol,
            _ => throw new ValidacionException("medida", "Elegí qué se mide: ccc (clientes) o vol (bultos)."),
        };
        var tope = medida == MedidaFoco.Ccc ? 100 : 999;
        if (dto.Meta is { } meta && (meta < 1 || meta > tope || decimal.Round(meta, 1) != meta))
            throw new ValidacionException("meta", medida == MedidaFoco.Ccc
                ? "La meta es qué parte de la cartera: de 1 a 100 %."
                : "La meta es contra el mes anterior: de 1 a 999 % (100 = igualarlo).");
        var ids = (dto.IdsArticulo ?? []).Distinct().ToList();
        if (ids.Count is < 1 or > 50)
            throw new ValidacionException("idsArticulo", "Elegí entre 1 y 50 artículos.");
        if (await db.Articulos.CountAsync(a => ids.Contains(a.IdArticulo), ct) != ids.Count)
            throw new ValidacionException("idsArticulo", "Hay un artículo que no existe.");
        foco.Articulos.RemoveAll(a => !ids.Contains(a.IdArticulo));
        foco.Articulos.AddRange(ids.Where(id => foco.Articulos.All(a => a.IdArticulo != id))
            .Select(id => new FocoArticulo { IdFoco = foco.IdFoco, IdArticulo = id }));
        foco.Mes = mes;
        foco.Nombre = nombre;
        foco.Medida = medida;
        foco.Meta = dto.Meta;
        foco.ActualizadoPor = admin.Email;
        foco.Actualizado = reloj.Ahora;
    }

    private async Task<FocoDto> UnFocoAsync(int idFoco, CancellationToken ct)
        => (await FocosAsync(db, mes: null, ct)).Single(f => f.IdFoco == idFoco);

    private static FocoDto Dto(Foco f, Dictionary<int, string> nombres)
        => new(f.IdFoco, f.Mes, f.Nombre, f.Medida, f.Meta,
            f.Articulos.Select(a => new ArticuloFocoDto(a.IdArticulo, nombres.GetValueOrDefault(a.IdArticulo, $"Artículo {a.IdArticulo}")))
                .OrderBy(a => a.Descripcion, StringComparer.Ordinal).ToList(),
            f.ActualizadoPor, f.Actualizado);

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
        // Una espera entre pedidos: cada actualización vuelve a bajar de Chess y recalcula las carteras.
        var desde = reloj.Ahora.AddMinutes(-lectura.Op.EsperaSincronizacionMinutos);
        if (await db.SyncSolicitudes.Where(s => s.SolicitadoEn > desde).MaxAsync(s => (DateTimeOffset?)s.SolicitadoEn, ct) is { } ultima)
            throw new ConflictoException(
                $"Ya se actualizó hace poco: podés pedir otra desde las {ultima.AddMinutes(lectura.Op.EsperaSincronizacionMinutos).ToOffset(TimeSpan.FromHours(-3)):HH:mm}.");
        var s = new SyncSolicitud { SolicitadoPor = admin.Email, SolicitadoEn = reloj.Ahora };
        db.SyncSolicitudes.Add(s);
        await db.GuardarAsync(ct);
        return new SolicitudSincronizacionDto(s.SolicitadoPor, s.SolicitadoEn);
    }
}
