using System.Text.Json.Serialization;
using AnalisisComercial.Domain;

namespace AnalisisComercial.Application;

// El contrato con el front, en C#. La forma JSON está en CONTRATO_API.md (fuente de verdad): si cambia algo acá,
// se cambia allá y se le avisa al front ANTES. El usuario nunca viaja por parámetro: cada servicio toma el alcance de
// IAlcanceUsuario.

// ---- Sesión ----------------------------------------------------------------------------------------------------

public enum RolApp
{
    Admin,
    Supervisor,
    Operario,
}

public record VendedorDto(int IdPersonal, string Nombre);

/// <summary>Una opción del filtro de vendedor. <c>EsCasa</c>: cuentas de la casa (Deposito), solo para el Admin.</summary>
public record OpcionVendedorDto(int Id, string Nombre, bool EsCasa);

/// <param name="VeBultos">false = solo Cobertura y la ficha (Volumen y Devoluciones dan 403).</param>
public record SesionDto(string Email, RolApp Rol, VendedorDto? Vendedor, IReadOnlyList<OpcionVendedorDto> Vendedores,
    DateOnly Hoy, DateOnly MesEnCurso, bool VeBultos);

public record EstadoSincronizacionDto(DateTimeOffset? UltimaOk, DateOnly? VentasHasta);

public interface ISesionService
{
    Task<SesionDto> ObtenerAsync(CancellationToken ct = default);
    Task<EstadoSincronizacionDto> EstadoSincronizacionAsync(CancellationToken ct = default);
}

// ---- Cobertura -------------------------------------------------------------------------------------------------

public enum ChipCobertura
{
    Todos,
    CompraronMesActual,
    SinCompraMesActual,
    DejaronDeComprar,
}

/// <param name="Vendedor">idPersonal; null = todos los visibles sin la casa.</param>
/// <param name="Dia">Código de Chess (2 lunes … 7 sábado).</param>
/// <param name="Foco">idFoco de <c>/api/cobertura/focos</c>: cuenta como compra solo la de sus artículos.</param>
/// <param name="Abc">A, B o C (solo Admin): la cartera de cada mes, solo los clientes de esa categoría ese mes.</param>
public record FiltroCobertura(int? Vendedor = null, int? Dia = null, string? Unidad = null, string? Busqueda = null,
    ChipCobertura Chip = ChipCobertura.Todos, DateOnly? MesDesde = null, DateOnly? MesHasta = null, int? Foco = null,
    string? Abc = null);

public record KpiMesDto(DateOnly Mes, int ClientesConCompra, int ClientesCartera, decimal Porcentaje, bool MesEnCurso,
    DateOnly? CorteAl);

/// <param name="IdPersonal">El vendedor de la cartera de mesHasta (null = ruta sin vendedor). Para colorear el mapa.</param>
/// <param name="Abc">Su grupo ABC en mesHasta (<see cref="GrupoAbc"/>). Solo el Admin: para el resto no viaja.</param>
public record ClienteCoberturaDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal? Lat, decimal? Lng, IReadOnlyList<EstadoMes> Meses, bool DejoDeComprar,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Abc = null);

public record ChipsDto(int Todos, int CompraronMesActual, int SinCompraMesActual, int DejaronDeComprar);

public record CoberturaDto(string Titulo, string Subtitulo, IReadOnlyList<DateOnly> Meses, IReadOnlyList<KpiMesDto> Kpis,
    ChipsDto Chips, IReadOnlyList<ClienteCoberturaDto> Clientes);

public interface ICoberturaService
{
    Task<CoberturaDto> ObtenerAsync(FiltroCobertura filtro, CancellationToken ct = default);
    Task<IReadOnlyList<OpcionVendedorDto>> VendedoresAsync(CancellationToken ct = default);
    Task<IReadOnlyList<string>> UnidadesAsync(CancellationToken ct = default);

    /// <summary>
    /// Los focos de un mes (sin mes: el en curso), para la vista Focos y el filtro. Todos los roles (Checho, 11/11/2026);
    /// operario y supervisor, solo de los meses que ven (fuera de esos, vacío).
    /// </summary>
    Task<IReadOnlyList<FocoDto>> FocosAsync(DateOnly? mes, CancellationToken ct = default);
}

// ---- Focos del mes (Checho, 03/11/2026; por mes desde el 05/11) -------------------------------------------------

public record ArticuloFocoDto(int IdArticulo, string Descripcion);

/// <param name="Objetivos">Los objetivos de clientes por vendedor (Cesar, 12/11/2026), por nombre. Admin: todos;
/// supervisor y operario: los de sus vendedores.</param>
public record FocoDto(int IdFoco, DateOnly Mes, string Nombre, MedidaFoco Medida, decimal? Meta,
    IReadOnlyList<ArticuloFocoDto> Articulos, string ActualizadoPor, DateTimeOffset Actualizado,
    IReadOnlyList<ObjetivoFocoDto> Objetivos);

/// <param name="Clientes">El objetivo: cuántos clientes de su cartera tienen que comprar algún artículo del foco.</param>
/// <param name="ClientesConCompra">Los de su cartera en el mes del foco que ya compraron (la regla de
/// <c>/api/cobertura?foco=</c>, sin filtros).</param>
public record ObjetivoFocoDto(int IdPersonal, string Nombre, int Clientes, int ClientesConCompra);

/// <summary>Los objetivos de un foco: reemplazan a todos los que tenía.</summary>
/// <param name="Clientes">Decimal para que uno no entero dé 400 en <c>errors.objetivos</c>.</param>
public record ObjetivoDto(int IdPersonal, decimal Clientes);

public record GuardarObjetivosDto(IReadOnlyList<ObjetivoDto>? Objetivos);

/// <summary>Alta o edición de un foco (la edición reemplaza todo).</summary>
/// <param name="Medida">"ccc" (por defecto) o "vol"; texto para que un valor inválido dé 400 en <c>errors.medida</c>.</param>
public record GuardarFocoDto(DateOnly? Mes, string? Nombre, IReadOnlyList<int>? IdsArticulo, string? Medida = null,
    decimal? Meta = null);

/// <summary>
/// Cómo viene un foco. CCC: clientes de la cartera (la foto de ese mes, sin excluidos) que compraron algún artículo del
/// foco; <c>porcentaje</c> = de la cartera. VOL: además los bultos netos de esa cartera contra el mes anterior al mismo
/// día hábil (como <c>/api/volumen?foco=</c>); <c>porcentaje</c> = actual ÷ base (null si la base es 0).
/// </summary>
/// <param name="PorcentajeAnterior">CCC del mismo foco en el mes anterior; null sin mes anterior con datos o sin cartera.
/// Solo en ccc.</param>
/// <param name="BultosActual">Solo en vol.</param>
/// <param name="PorcentajeMeta">vol, en el total: bultosActual ÷ meta (los bultos objetivo) × 100.</param>
public record CccFocoDto(int ClientesConCompra, int ClientesCartera, decimal? Porcentaje, decimal? PorcentajeAnterior,
    decimal? BultosActual = null, decimal? BultosBase = null, decimal? PorcentajeMeta = null);

public record CccVendedorFocoDto(int IdPersonal, string Nombre, int ClientesConCompra, int ClientesCartera, decimal? Porcentaje,
    decimal? PorcentajeAnterior, decimal? BultosActual = null, decimal? BultosBase = null);

/// <param name="Total">«Todos los vendedores», sin la casa.</param>
public record AnalisisFocoDto(int IdFoco, string Nombre, MedidaFoco Medida, decimal? Meta, CccFocoDto Total,
    IReadOnlyList<CccVendedorFocoDto> Vendedores);

/// <summary>La comparación de los focos vol: la de <c>/api/volumen</c> del admin.</summary>
public record VolumenFocosDto(DateOnly? CorteAl, DateOnly? BaseHasta, int DiaHabil, int DiasHabilesMes, TipoComparacion Tipo);

/// <param name="CorteAl">Mes en curso: hasta qué día hay ventas. Mes cerrado: null.</param>
/// <param name="AnteriorAl">Mes en curso: el mismo día del mes anterior, para comparar parejo. Mes cerrado: null (completo).</param>
/// <param name="Volumen">null en el primer mes con datos (no hay base).</param>
public record AnalisisFocosDto(DateOnly Mes, bool MesEnCurso, DateOnly? CorteAl, DateOnly MesAnterior, DateOnly? AnteriorAl,
    VolumenFocosDto? Volumen, IReadOnlyList<AnalisisFocoDto> Focos);

/// <param name="ClientesMesAnterior">Clientes que lo compraron el mes pasado (para ver qué se mueve).</param>
public record ArticuloAdminDto(int IdArticulo, string Descripcion, string? UnidadNegocio, string? Division, bool Anulado,
    int ClientesMesAnterior);

// ---- Ficha de cliente ------------------------------------------------------------------------------------------

/// <param name="Bultos">Uno por mes; null = fuera de la cartera de quien mira (gobernanza).</param>
public record ArticuloMesDto(int IdArticulo, string Descripcion, string? UnidadNegocio, IReadOnlyList<bool> Meses,
    IReadOnlyList<decimal?> Bultos);

/// <param name="EnCartera">Si este mes está en la cartera de quien mira (admin: en alguna).</param>
/// <param name="Abc">Su grupo ABC en mesHasta. Solo el Admin: para el resto no viaja.</param>
public record FichaClienteDto(int IdCliente, string RazonSocial, bool EnCartera, string? Ruta, string? Vendedor, string DiasVisita,
    string? Direccion, decimal? Lat, decimal? Lng, DateOnly? UltimaCompra, int? DiasSinComprar,
    IReadOnlyList<DateOnly> Meses, IReadOnlyList<EstadoMes> Estados, IReadOnlyList<decimal?> Bultos,
    IReadOnlyList<ArticuloMesDto> Articulos,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Abc = null);

public record TotalVolumenDto(decimal? BultosActual, decimal? BultosBase, decimal? BultosEsperado, decimal? Porcentaje);

public record ArticuloVolumenDto(int IdArticulo, string Descripcion, string? UnidadNegocio, decimal? BultosActual,
    decimal? BultosBase, decimal? Porcentaje);

public record VolumenClienteDto(Comparacion Comparacion, TotalVolumenDto Total, IReadOnlyList<ArticuloVolumenDto> Articulos);

/// <param name="BultosVendidos">null = fuera de la cartera de quien mira.</param>
public record KpiDevolucionDto(DateOnly Mes, decimal? BultosVendidos, decimal? BultosDevueltos, decimal? Porcentaje,
    bool MesEnCurso, DateOnly? CorteAl);

/// <param name="BultosVendidos">null para el operario en /devoluciones (gobernanza 30/10: solo porcentajes).</param>
public record ArticuloDevolucionDto(int IdArticulo, string Descripcion, string? UnidadNegocio, decimal? BultosVendidos,
    decimal? BultosDevueltos, decimal? Porcentaje);

public record DevolucionesClienteDto(IReadOnlyList<DateOnly> Meses, IReadOnlyList<KpiDevolucionDto> Kpis, DateOnly Mes,
    IReadOnlyList<ArticuloDevolucionDto> Articulos);

public interface IClienteService
{
    /// <summary>NoEncontradoException si no existe o (operario y supervisor) si nunca estuvo en su cartera.</summary>
    Task<FichaClienteDto> FichaAsync(int idCliente, DateOnly? mesDesde, DateOnly? mesHasta, CancellationToken ct = default);

    Task<VolumenClienteDto> VolumenAsync(int idCliente, DateOnly? mes, CancellationToken ct = default);

    /// <param name="mes">El mes del detalle por artículo; por defecto, mesHasta.</param>
    Task<DevolucionesClienteDto> DevolucionesAsync(int idCliente, DateOnly? mesDesde, DateOnly? mesHasta, DateOnly? mes,
        CancellationToken ct = default);

    /// <summary>Los comprobantes del cliente en el mes, en orden (la ventanita de Devoluciones).</summary>
    Task<MovimientosClienteDto> MovimientosAsync(int idCliente, DateOnly? mes, string? unidad, int? foco,
        CancellationToken ct = default);
}

// ---- Movimientos de un cliente (Cesar, 10/11/2026: la historia del mes en Devoluciones) -------------------------

public enum TipoMovimiento
{
    Factura,
    NotaCredito,
}

/// <param name="Entregados">Lo que se entregó en el comprobante (las líneas positivas de una factura).</param>
/// <param name="Devueltos">Los cambios: las líneas negativas de una factura.</param>
/// <param name="Rechazados">Lo de una nota de crédito: volvió a la fábrica sin entregarse (no es devolución).</param>
public record LineaMovimientoDto(int IdArticulo, string Descripcion, string? UnidadNegocio, decimal Entregados, decimal Devueltos,
    decimal Rechazados);

/// <param name="Vendedor">El del comprobante; null si no se sabe o (operario y supervisor) si no es uno de los suyos.</param>
public record MovimientoDto(DateOnly Fecha, TipoMovimiento Tipo, string Comprobante, string? Vendedor, decimal Entregados,
    decimal Devueltos, decimal Rechazados, IReadOnlyList<LineaMovimientoDto> Lineas);

public record MovimientosClienteDto(int IdCliente, string RazonSocial, DateOnly Mes, IReadOnlyList<MovimientoDto> Movimientos);

// ---- Volumen (en bultos) ---------------------------------------------------------------------------------------

/// <param name="Mes">Por defecto, el mes en curso.</param>
/// <param name="Comparacion">Admin y supervisor: "parcial" (el mes anterior al mismo día hábil, por defecto) o
/// "acumulado" (el mes anterior entero, al ritmo). El operario compara siempre contra el mes entero.</param>
public record FiltroVolumen(int? Vendedor = null, int? Dia = null, string? Unidad = null, string? Busqueda = null,
    ChipVolumen Chip = ChipVolumen.Todos, DateOnly? Mes = null, int? Foco = null, string? Abc = null,
    string? Comparacion = null);

public record ChipsVolumenDto(int Todos, int SinCompraAun, int Nuevos, int Bajaron, int Subieron);

/// <param name="BultosBase">null = el cliente no era de la cartera de quien mira en el mes base («nuevo en tu cartera»).</param>
/// <param name="Articulos">Lo que compró en el mes (netos &gt; 0), de más a menos bultos: los íconos de la lista.</param>
/// <param name="Abc">Su grupo ABC en el mes. Solo el Admin: para el resto no viaja.</param>
public record ClienteVolumenDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal BultosActual, decimal? BultosBase, decimal? Porcentaje, IReadOnlyList<ArticuloIconoDto> Articulos,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Abc = null);

/// <summary>
/// Cuántos clientes de un grupo ABC hay en la cartera (con los filtros) y cuántos compraron en el mes, con la regla de
/// Cobertura.
/// </summary>
public record GrupoAbcDto(string Grupo, int Clientes, int ConCompra, decimal Porcentaje);

/// <param name="Abc">A, B y C, en ese orden. Solo el Admin, y solo si el mes tiene base: si no, no viaja.</param>
public record VolumenDto(string Titulo, Comparacion Comparacion, TotalVolumenDto Total, ChipsVolumenDto Chips,
    IReadOnlyList<ClienteVolumenDto> Clientes,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] IReadOnlyList<GrupoAbcDto>? Abc = null);

public interface IVolumenService
{
    Task<VolumenDto> ObtenerAsync(FiltroVolumen filtro, CancellationToken ct = default);
}

// ---- Devoluciones ----------------------------------------------------------------------------------------------

public record FiltroDevoluciones(int? Vendedor = null, int? Dia = null, string? Unidad = null, DateOnly? MesDesde = null,
    DateOnly? MesHasta = null, int? Foco = null, string? Abc = null);

/// <summary>Un artículo para dibujar su ícono en una lista (Volumen y Devoluciones): sin cantidades.</summary>
public record ArticuloIconoDto(int IdArticulo, string Descripcion, string? UnidadNegocio);

/// <param name="UnidadesDevueltas">Las unidades de negocio que devolvió en el mes, de la que más a la que menos.</param>
/// <param name="ArticulosDevueltos">Los artículos que devolvió en el mes, del más devuelto al menos (los íconos de la
/// lista).</param>
/// <param name="Abc">Su grupo ABC en el mes. Solo el Admin: para el resto no viaja.</param>
public record ClienteDevolucionDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal BultosVendidos, decimal BultosDevueltos, decimal? Porcentaje, IReadOnlyList<string> UnidadesDevueltas,
    IReadOnlyList<ArticuloIconoDto> ArticulosDevueltos,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)] string? Abc = null);

/// <param name="Mes">El mes de <paramref name="Clientes"/> y <paramref name="Articulos"/> (= mesHasta).</param>
public record DevolucionesDto(string Titulo, IReadOnlyList<DateOnly> Meses, IReadOnlyList<KpiDevolucionDto> Kpis, DateOnly Mes,
    IReadOnlyList<ClienteDevolucionDto> Clientes, IReadOnlyList<ArticuloDevolucionDto> Articulos);

public interface IDevolucionesService
{
    Task<DevolucionesDto> ObtenerAsync(FiltroDevoluciones filtro, CancellationToken ct = default);
}

// ---- Mi ruta de hoy --------------------------------------------------------------------------------------------

public record ClienteRutaHoyDto(int IdCliente, string RazonSocial, string? Ruta, string? Direccion, decimal? Lat,
    decimal? Lng, EstadoMes EstadoMesActual, bool DejoDeComprar, DateOnly? UltimaCompra);

public interface IRutaHoyService
{
    Task<IReadOnlyList<ClienteRutaHoyDto>> ClientesDelDiaAsync(int? vendedor, DateOnly? fecha, CancellationToken ct = default);
}

// ---- Resumen por vendedor (Admin y Supervisor) -----------------------------------------------------------------

public record ResumenVendedorDto(int IdPersonal, string Vendedor, bool EsCasa, IReadOnlyList<KpiMesDto> Kpis,
    int DejaronDeComprar, int Altas, int Bajas);

public interface IResumenService
{
    Task<IReadOnlyList<ResumenVendedorDto>> PorVendedorAsync(DateOnly? mesDesde, DateOnly? mesHasta, CancellationToken ct = default);
}

// ---- Administración (solo Admin) -------------------------------------------------------------------------------

/// <param name="IdsPersonal">Los vendedores que ve: los del operario (uno o varios) o los del equipo del supervisor.</param>
public record AccesoDto(int IdAcceso, string Email, string? Nombre, RolAcceso Rol, IReadOnlyList<int> IdsPersonal, bool Activo,
    bool Entro, DateTimeOffset? UltimoIngreso, string ActualizadoPor, DateTimeOffset Actualizado, string Version,
    bool Enlazado);

/// <summary>Alta (sin Activo ni Version) o edición (con Version obligatoria).</summary>
public record GuardarAccesoDto(string? Email, string? Nombre, RolAcceso? Rol, IReadOnlyList<int>? IdsPersonal,
    bool? Activo = null, string? Version = null);

/// <summary>Un vendedor de Chess para Administración: también los dados de baja (para enlazar el viejo y el nuevo).</summary>
public record VendedorAdminDto(int Id, string Nombre, bool Activo, bool EsCasa);

public record ExclusionDto(int IdCliente, string RazonSocial, string Motivo, string CreadoPor, DateTimeOffset CreadoEn);

public record NuevaExclusionDto(int? IdCliente, string? Motivo);

/// <summary>Un grupo de la base de clientes: un vendedor (o la casa, o «sin vendedor» con IdPersonal null).</summary>
/// <param name="Sugeridos">Cuántos tienen la sugerencia «excluir».</param>
public record GrupoClientesDto(int? IdPersonal, string? Vendedor, bool EsCasa, int Clientes, int Excluidos, int Sugeridos,
    int Vitales);

/// <param name="Vendedor">idPersonal, o "sin" para los clientes sin vendedor; null = todos.</param>
/// <param name="Excluidos">todos (por defecto), solo o sin.</param>
/// <param name="Sugerencia">excluir o revisar; null = todos.</param>
/// <param name="Vitales">todos (por defecto), solo o sin.</param>
public record FiltroClientesAdmin(string? Vendedor, string? Texto, string? Excluidos, int Pagina = 1, int Tamano = 50,
    string? Sugerencia = null, string? Vitales = null);

/// <param name="Estados">Uno por cada mes de la página (los últimos meses, como en /cobertura), con la cartera de la empresa.</param>
/// <param name="MotivoSugerencia">Ya redactado para mostrar («No compra hace 4 meses», «Dejó de comprar en septiembre»).</param>
public record ClienteAdminDto(int IdCliente, string RazonSocial, string? Ruta, int? IdPersonal, string? Vendedor, string? Localidad,
    DateOnly? UltimaCompra, int? DiasSinComprar, IReadOnlyList<EstadoMes> Estados, SugerenciaCliente? Sugerencia,
    string? MotivoSugerencia, bool Excluido, string? Motivo, string? ExcluidoPor, DateTimeOffset? ExcluidoEn,
    bool Vital, string? VitalPor, DateTimeOffset? VitalEn);

/// <summary>La marca Vital de un cliente.</summary>
public record VitalDto(int IdCliente, string RazonSocial, string MarcadoPor, DateTimeOffset MarcadoEn);

public record PaginaClientesDto(int Pagina, int Tamano, int Total, IReadOnlyList<DateOnly> Meses, IReadOnlyList<ClienteAdminDto> Filas);

public record SolicitudSincronizacionDto(string SolicitadoPor, DateTimeOffset SolicitadoEn);

public record PasoSincronizacionDto(Guid IdCorrida, DateTimeOffset Inicio, DateTimeOffset? Fin, string Endpoint,
    DateOnly? Desde, DateOnly? Hasta, int Registros, bool Ok, string? Error);

public record SincronizacionesDto(SolicitudSincronizacionDto? Pendiente, IReadOnlyList<PasoSincronizacionDto> Pasos);

/// <summary>Una cuenta de Madomi en la plataforma cruzada con su acceso a esta app (o un acceso sin cuenta todavía).</summary>
/// <param name="IdUsuario">La cuenta de la plataforma; null = acceso por email de alguien que todavía no tiene cuenta.</param>
/// <param name="Rol">Admin si tiene el rol «Administrador comercial» de la plataforma; si no, el de su acceso; null = no entra.</param>
/// <param name="Federada">Entra con su usuario de De Ruta: no tiene clave en la plataforma.</param>
public record CuentaMadomiDto(Guid? IdUsuario, string Usuario, string? Nombre, bool CuentaActiva, DateTimeOffset? UltimoIngreso,
    RolApp? Rol, int? IdAcceso, IReadOnlyList<int> IdsPersonal, bool AccesoActivo, string? Version, bool Federada,
    bool AccesoEnlazado);

/// <summary>Alta en un paso: la cuenta en la plataforma (rol «Comercial») y su acceso a esta app.</summary>
public record NuevaCuentaDto(string? Usuario, string? Nombre, string? Password, RolAcceso? Rol, IReadOnlyList<int>? IdsPersonal);

public interface IAdminService
{
    Task<IReadOnlyList<AccesoDto>> AccesosAsync(CancellationToken ct = default);
    Task<AccesoDto> CrearAccesoAsync(GuardarAccesoDto dto, CancellationToken ct = default);
    Task<AccesoDto> ActualizarAccesoAsync(int idAcceso, GuardarAccesoDto dto, CancellationToken ct = default);

    Task<IReadOnlyList<VendedorAdminDto>> VendedoresAsync(CancellationToken ct = default);

    /// <summary>Las cuentas de Madomi de la plataforma con su acceso, y los accesos sin cuenta.</summary>
    Task<IReadOnlyList<CuentaMadomiDto>> CuentasAsync(CancellationToken ct = default);

    /// <summary>Crea la cuenta en la plataforma y su acceso; valida lo de acá antes, para no dejar una cuenta suelta.</summary>
    Task<CuentaMadomiDto> CrearCuentaAsync(NuevaCuentaDto dto, CancellationToken ct = default);

    Task<IReadOnlyList<ExclusionDto>> ExclusionesAsync(CancellationToken ct = default);
    Task<ExclusionDto> ExcluirClienteAsync(NuevaExclusionDto dto, CancellationToken ct = default);
    Task QuitarExclusionAsync(int idCliente, CancellationToken ct = default);
    Task<IReadOnlyList<GrupoClientesDto>> ResumenClientesAsync(CancellationToken ct = default);
    Task<PaginaClientesDto> ClientesAsync(FiltroClientesAdmin filtro, CancellationToken ct = default);

    /// <summary>Marca el cliente como Vital; si ya lo era, devuelve la marca que tenía.</summary>
    Task<VitalDto> MarcarVitalAsync(int idCliente, CancellationToken ct = default);

    /// <summary>Le saca la marca Vital (si no la tenía, no hace nada).</summary>
    Task QuitarVitalAsync(int idCliente, CancellationToken ct = default);

    /// <summary>Los focos de todos los meses, por mes descendente y nombre.</summary>
    Task<IReadOnlyList<FocoDto>> FocosAsync(CancellationToken ct = default);
    Task<FocoDto> CrearFocoAsync(GuardarFocoDto dto, CancellationToken ct = default);
    Task<FocoDto> ActualizarFocoAsync(int idFoco, GuardarFocoDto dto, CancellationToken ct = default);
    Task BorrarFocoAsync(int idFoco, CancellationToken ct = default);

    /// <summary>Reemplaza los objetivos de clientes por vendedor del foco y devuelve el foco.</summary>
    Task<FocoDto> GuardarObjetivosAsync(int idFoco, GuardarObjetivosDto dto, CancellationToken ct = default);

    /// <summary>
    /// Cómo vienen los focos de un mes, por vendedor (sin mes: el en curso), con la Comparativa ("parcial" o
    /// "acumulado") y la categoría de cliente (A, B o C) elegidas.
    /// </summary>
    Task<AnalisisFocosDto> AnalisisFocosAsync(DateOnly? mes, string? comparacion = null, string? abc = null,
        CancellationToken ct = default);

    /// <summary>Los artículos para armar los focos.</summary>
    Task<IReadOnlyList<ArticuloAdminDto>> ArticulosAsync(CancellationToken ct = default);

    Task<SincronizacionesDto> SincronizacionesAsync(int cantidad, CancellationToken ct = default);
    Task<SolicitudSincronizacionDto> SolicitarSincronizacionAsync(CancellationToken ct = default);
}
