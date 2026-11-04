namespace AnalisisComercial.Domain;

// Espejo de Chess: lo escribe solo la sincronización. Los ids son los de Chess.

public class Vendedor
{
    public int IdPersonal { get; set; }
    public string Nombre { get; set; } = "";
    /// <summary>false para las cuentas de la casa (DEPOSITO, id 6): no es una persona.</summary>
    public bool EsPersona { get; set; }
    /// <summary>false si Chess dejó de mandarlo.</summary>
    public bool Activo { get; set; }
}

/// <summary>
/// Una fila por ruta de Chess. Chess manda varias versiones de la misma ruta (una por período): se guarda la
/// vigente (fechaHasta 9999-12-31) o, si ya no hay ninguna vigente, la última, con <see cref="Vigente"/> en false.
/// </summary>
public class Ruta
{
    public int IdRuta { get; set; }
    public string Nombre { get; set; } = "";
    /// <summary>null si la ruta no tiene vendedor asignado en Chess (idPersonal 0).</summary>
    public int? IdPersonal { get; set; }
    /// <summary>Días de visita normalizados: códigos de Chess sin repetir y ordenados ("2,5"). Vacío = sin día.</summary>
    public string DiasVisita { get; set; } = "";
    public bool Vigente { get; set; }
    public DateOnly FechaDesde { get; set; }
    public DateOnly FechaHasta { get; set; }
    public List<RutaDia> Dias { get; set; } = [];
}

public class RutaDia
{
    public int IdRuta { get; set; }
    /// <summary>Código de Chess: 1 domingo, 2 lunes … 7 sábado (ver <see cref="DiasSemana"/>).</summary>
    public int DiaSemana { get; set; }
}

public class Cliente
{
    public int IdCliente { get; set; }
    public string RazonSocial { get; set; } = "";
    public string? Localidad { get; set; }
    public string? Calle { get; set; }
    public int? Altura { get; set; }
    public decimal? Lat { get; set; }
    public decimal? Lng { get; set; }
    /// <summary>La ruta vigente que lo tiene en su cartera (rutasVenta), o null si no está en ninguna.</summary>
    public int? IdRuta { get; set; }
    /// <summary>intercalacionVisita: el orden en que el vendedor lo visita dentro de su ruta.</summary>
    public int? OrdenVisita { get; set; }
    public bool Anulado { get; set; }
    /// <summary>null = sin baja (Chess manda 9999-12-31).</summary>
    public DateOnly? FechaBaja { get; set; }
    /// <summary>false si Chess dejó de mandarlo: no se borra, conserva sus ventas.</summary>
    public bool EnChess { get; set; } = true;
}

public class Articulo
{
    public int IdArticulo { get; set; }
    public string Descripcion { get; set; } = "";
    /// <summary>Sale de una agrupación de eAgrupaciones (pendiente confirmar cuál). null = sin asociar.</summary>
    public string? UnidadNegocio { get; set; }
    /// <summary>eAgrupaciones tal cual vino de Chess, para elegir la agrupación sin volver a bajar los artículos.</summary>
    public string? AgrupacionesJson { get; set; }
    /// <summary>unidadesBulto de Chess: para confirmar si las cantidades de las ventas vienen en bultos o en unidades.</summary>
    public decimal? UnidadesBulto { get; set; }
    public bool Anulado { get; set; }
}

/// <summary>Una línea de comprobante de ventas/ detallado. Clave: empresa + documento + letra + serie + número + línea.</summary>
public class VentaLinea
{
    public int IdEmpresa { get; set; }
    public string IdDocumento { get; set; } = "";
    public string Letra { get; set; } = "";
    public int Serie { get; set; }
    public long NroDoc { get; set; }
    public int IdLinea { get; set; }

    /// <summary>fechaComprobate (sic) de Chess: la que define el mes.</summary>
    public DateOnly Fecha { get; set; }
    public DateOnly? FechaEntrega { get; set; }
    public int IdCliente { get; set; }
    public int IdArticulo { get; set; }
    public int IdVendedor { get; set; }
    /// <summary>dsDocumento: FACTURA, NOTA DE CREDITO, FACTURA PRESUPUESTO…</summary>
    public string TipoDocumento { get; set; } = "";
    public bool Anulado { get; set; }
    public decimal CantidadTotal { get; set; }
    public decimal CantidadRechazo { get; set; }
    /// <summary>cantidadesSinCargo: la parte de CantidadTotal que se entregó sin cargo (bonificación o cambio).</summary>
    public decimal CantidadSinCargo { get; set; }
    public decimal Kilos { get; set; }
    /// <summary>subtotalNeto (sin IVA).</summary>
    public decimal Neto { get; set; }
    /// <summary>subtotalFinal (con IVA).</summary>
    public decimal Final { get; set; }
}

/// <summary>Derivada de VentaLinea con <see cref="ReglaCompra"/>: una fila por mes × cliente × artículo con movimiento.</summary>
public class CompraMes
{
    /// <summary>Día 1 del mes.</summary>
    public DateOnly Mes { get; set; }
    public int IdCliente { get; set; }
    public int IdArticulo { get; set; }
    public bool Compro { get; set; }
    public decimal Cantidad { get; set; }
    public decimal Neto { get; set; }
}

/// <summary>
/// Foto de la cartera: qué ruta (y vendedor) tenía cada cliente en ese mes. La del mes en curso se actualiza en
/// cada sincronización; la de un mes cerrado no se toca más.
/// </summary>
public class CarteraMes
{
    public DateOnly Mes { get; set; }
    public int IdCliente { get; set; }
    public int IdRuta { get; set; }
    /// <summary>null si la ruta no tenía vendedor.</summary>
    public int? IdPersonal { get; set; }
}

// Configuración: la carga el Admin.

public enum RolAcceso
{
    Supervisor = 1,
    Operario = 2,
}

/// <summary>
/// Acceso de una persona a la app. Las cuentas son de la plataforma (login central): el Admin da acceso a un email y
/// la primera vez que esa persona entra queda enlazado a su cuenta (<see cref="IdUsuario"/> = claim sub). Desde ahí
/// se la reconoce por la cuenta, aunque cambie de email. Los Admin no van acá: salen del permiso de la plataforma.
/// </summary>
public class AccesoUsuario
{
    public int IdAcceso { get; set; }
    /// <summary>En minúsculas. Único.</summary>
    public string Email { get; set; } = "";
    public string? Nombre { get; set; }
    public RolAcceso Rol { get; set; }
    /// <summary>
    /// Los vendedores de Chess que ve (al menos uno). Operario: los suyos; puede tener varios porque Chess, si le cambia
    /// el nombre a un vendedor, lo da de alta con otro idPersonal (pedido del usuario, 29/10/2026), y ve la unión de sus
    /// clientes. Supervisor: los de su equipo.
    /// </summary>
    public List<AccesoVendedor> Vendedores { get; set; } = [];
    public bool Activo { get; set; } = true;
    /// <summary>La cuenta de la plataforma; null hasta que la persona entra por primera vez.</summary>
    /// <remarks>El último ingreso sale de AccesoLog: guardarlo acá le cambiaría la versión en cada request y el Admin
    /// que lo está editando recibiría un 409 falso.</remarks>
    public Guid? IdUsuario { get; set; }
    public string ActualizadoPor { get; set; } = "";
    public DateTimeOffset Actualizado { get; set; }
    /// <summary>
    /// Concurrencia optimista: la sube solo la edición del Admin. No es un rowversion a propósito: enlazar la cuenta
    /// (el primer ingreso de la persona) también actualiza la fila, y no tiene que darle un 409 al Admin que la edita.
    /// </summary>
    public int Version { get; set; }
}

public class AccesoVendedor
{
    public int IdAcceso { get; set; }
    public int IdPersonal { get; set; }
}

/// <summary>Cliente que no cuenta en la cartera (ej. CLIENTE TEST).</summary>
public class Exclusion
{
    public int IdCliente { get; set; }
    public string Motivo { get; set; } = "";
    public string CreadoPor { get; set; } = "";
    public DateTimeOffset CreadoEn { get; set; }
}

/// <summary>Cliente que el dueño marcó como Vital (Cesar, 30/10/2026): por ahora solo una marca en la lista.</summary>
public class ClienteVital
{
    public int IdCliente { get; set; }
    public string MarcadoPor { get; set; } = "";
    public DateTimeOffset MarcadoEn { get; set; }
}

// Trazas.

public class SyncLog
{
    public long Id { get; set; }
    /// <summary>Agrupa los pasos de una misma corrida.</summary>
    public Guid IdCorrida { get; set; }
    public DateTimeOffset Inicio { get; set; }
    public DateTimeOffset? Fin { get; set; }
    public string Endpoint { get; set; } = "";
    public DateOnly? Desde { get; set; }
    public DateOnly? Hasta { get; set; }
    public int Registros { get; set; }
    public bool Ok { get; set; }
    public string? Error { get; set; }
}

/// <summary>Pedido de sincronización del Admin («Actualizar ahora»): la web lo anota y el worker lo toma.</summary>
public class SyncSolicitud
{
    public long Id { get; set; }
    public string SolicitadoPor { get; set; } = "";
    public DateTimeOffset SolicitadoEn { get; set; }
    public DateTimeOffset? TomadoEn { get; set; }
}

public class AccesoLog
{
    public long Id { get; set; }
    public Guid IdUsuario { get; set; }
    public string Email { get; set; } = "";
    /// <summary>La empresa del token (null si no traía): para ver los intentos desde otra empresa.</summary>
    public Guid? IdEmpresa { get; set; }
    /// <summary>El canal del token (<c>chatbot</c>); null = la web.</summary>
    public string? Canal { get; set; }
    public DateTimeOffset Fecha { get; set; }
    public string Pantalla { get; set; } = "";
    public string? Parametros { get; set; }
    /// <summary>true si pidió algo fuera de su alcance.</summary>
    public bool Denegado { get; set; }
}
