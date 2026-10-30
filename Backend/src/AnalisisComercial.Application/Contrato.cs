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

public record SesionDto(string Email, RolApp Rol, VendedorDto? Vendedor, IReadOnlyList<OpcionVendedorDto> Vendedores,
    DateOnly Hoy, DateOnly MesEnCurso);

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
public record FiltroCobertura(int? Vendedor = null, int? Dia = null, string? Unidad = null, string? Busqueda = null,
    ChipCobertura Chip = ChipCobertura.Todos, DateOnly? MesDesde = null, DateOnly? MesHasta = null);

public record KpiMesDto(DateOnly Mes, int ClientesConCompra, int ClientesCartera, decimal Porcentaje, bool MesEnCurso,
    DateOnly? CorteAl);

/// <param name="IdPersonal">El vendedor de la cartera de mesHasta (null = ruta sin vendedor). Para colorear el mapa.</param>
public record ClienteCoberturaDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal? Lat, decimal? Lng, IReadOnlyList<EstadoMes> Meses, bool DejoDeComprar);

public record ChipsDto(int Todos, int CompraronMesActual, int SinCompraMesActual, int DejaronDeComprar);

public record CoberturaDto(string Titulo, string Subtitulo, IReadOnlyList<DateOnly> Meses, IReadOnlyList<KpiMesDto> Kpis,
    ChipsDto Chips, IReadOnlyList<ClienteCoberturaDto> Clientes);

public interface ICoberturaService
{
    Task<CoberturaDto> ObtenerAsync(FiltroCobertura filtro, CancellationToken ct = default);
    Task<IReadOnlyList<OpcionVendedorDto>> VendedoresAsync(CancellationToken ct = default);
    Task<IReadOnlyList<string>> UnidadesAsync(CancellationToken ct = default);
}

// ---- Ficha de cliente ------------------------------------------------------------------------------------------

/// <param name="Bultos">Uno por mes; null = fuera de la cartera de quien mira (gobernanza).</param>
public record ArticuloMesDto(int IdArticulo, string Descripcion, string? UnidadNegocio, IReadOnlyList<bool> Meses,
    IReadOnlyList<decimal?> Bultos);

/// <param name="EnCartera">Si este mes está en la cartera de quien mira (admin: en alguna).</param>
public record FichaClienteDto(int IdCliente, string RazonSocial, bool EnCartera, string? Ruta, string? Vendedor, string DiasVisita,
    string? Direccion, decimal? Lat, decimal? Lng, DateOnly? UltimaCompra, int? DiasSinComprar,
    IReadOnlyList<DateOnly> Meses, IReadOnlyList<EstadoMes> Estados, IReadOnlyList<decimal?> Bultos,
    IReadOnlyList<ArticuloMesDto> Articulos);

public record TotalVolumenDto(decimal? BultosActual, decimal? BultosBase, decimal? BultosEsperado, decimal? Porcentaje);

public record ArticuloVolumenDto(int IdArticulo, string Descripcion, string? UnidadNegocio, decimal? BultosActual,
    decimal? BultosBase, decimal? Porcentaje);

public record VolumenClienteDto(Comparacion Comparacion, TotalVolumenDto Total, IReadOnlyList<ArticuloVolumenDto> Articulos);

/// <param name="BultosVendidos">null = fuera de la cartera de quien mira.</param>
public record KpiDevolucionDto(DateOnly Mes, decimal? BultosVendidos, decimal? BultosDevueltos, decimal? Porcentaje,
    bool MesEnCurso, DateOnly? CorteAl);

public record ArticuloDevolucionDto(int IdArticulo, string Descripcion, string? UnidadNegocio, decimal BultosVendidos,
    decimal BultosDevueltos, decimal? Porcentaje);

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
}

// ---- Volumen (en bultos) ---------------------------------------------------------------------------------------

/// <param name="Mes">Por defecto, el mes en curso.</param>
public record FiltroVolumen(int? Vendedor = null, int? Dia = null, string? Unidad = null, string? Busqueda = null,
    ChipVolumen Chip = ChipVolumen.Todos, DateOnly? Mes = null);

public record ChipsVolumenDto(int Todos, int SinCompraAun, int Nuevos, int Bajaron, int Subieron);

/// <param name="BultosBase">null = el cliente no era de la cartera de quien mira en el mes base («nuevo en tu cartera»).</param>
public record ClienteVolumenDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal BultosActual, decimal? BultosBase, decimal? Porcentaje);

public record VolumenDto(string Titulo, Comparacion Comparacion, TotalVolumenDto Total, ChipsVolumenDto Chips,
    IReadOnlyList<ClienteVolumenDto> Clientes);

public interface IVolumenService
{
    Task<VolumenDto> ObtenerAsync(FiltroVolumen filtro, CancellationToken ct = default);
}

// ---- Devoluciones ----------------------------------------------------------------------------------------------

public record FiltroDevoluciones(int? Vendedor = null, int? Dia = null, string? Unidad = null, DateOnly? MesDesde = null,
    DateOnly? MesHasta = null);

public record ClienteDevolucionDto(int IdCliente, string RazonSocial, string? Ruta, string? Vendedor, int? IdPersonal,
    decimal BultosVendidos, decimal BultosDevueltos, decimal? Porcentaje);

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
    bool Entro, DateTimeOffset? UltimoIngreso, string ActualizadoPor, DateTimeOffset Actualizado, string Version);

/// <summary>Alta (sin Activo ni Version) o edición (con Version obligatoria).</summary>
public record GuardarAccesoDto(string? Email, string? Nombre, RolAcceso? Rol, IReadOnlyList<int>? IdsPersonal,
    bool? Activo = null, string? Version = null);

/// <summary>Un vendedor de Chess para Administración: también los dados de baja (para enlazar el viejo y el nuevo).</summary>
public record VendedorAdminDto(int Id, string Nombre, bool Activo, bool EsCasa);

public record ExclusionDto(int IdCliente, string RazonSocial, string Motivo, string CreadoPor, DateTimeOffset CreadoEn);

public record NuevaExclusionDto(int? IdCliente, string? Motivo);

/// <summary>Un grupo de la base de clientes: un vendedor (o la casa, o «sin vendedor» con IdPersonal null).</summary>
/// <param name="Sugeridos">Cuántos tienen la sugerencia «excluir».</param>
public record GrupoClientesDto(int? IdPersonal, string? Vendedor, bool EsCasa, int Clientes, int Excluidos, int Sugeridos);

/// <param name="Vendedor">idPersonal, o "sin" para los clientes sin vendedor; null = todos.</param>
/// <param name="Excluidos">todos (por defecto), solo o sin.</param>
/// <param name="Sugerencia">excluir o revisar; null = todos.</param>
public record FiltroClientesAdmin(string? Vendedor, string? Texto, string? Excluidos, int Pagina = 1, int Tamano = 50,
    string? Sugerencia = null);

/// <param name="Estados">Uno por cada mes de la página (los últimos meses, como en /cobertura), con la cartera de la empresa.</param>
/// <param name="MotivoSugerencia">Ya redactado para mostrar («No compra hace 4 meses», «Dejó de comprar en septiembre»).</param>
public record ClienteAdminDto(int IdCliente, string RazonSocial, string? Ruta, int? IdPersonal, string? Vendedor, string? Localidad,
    DateOnly? UltimaCompra, int? DiasSinComprar, IReadOnlyList<EstadoMes> Estados, SugerenciaCliente? Sugerencia,
    string? MotivoSugerencia, bool Excluido, string? Motivo, string? ExcluidoPor, DateTimeOffset? ExcluidoEn);

public record PaginaClientesDto(int Pagina, int Tamano, int Total, IReadOnlyList<DateOnly> Meses, IReadOnlyList<ClienteAdminDto> Filas);

public record SolicitudSincronizacionDto(string SolicitadoPor, DateTimeOffset SolicitadoEn);

public record PasoSincronizacionDto(Guid IdCorrida, DateTimeOffset Inicio, DateTimeOffset? Fin, string Endpoint,
    DateOnly? Desde, DateOnly? Hasta, int Registros, bool Ok, string? Error);

public record SincronizacionesDto(SolicitudSincronizacionDto? Pendiente, IReadOnlyList<PasoSincronizacionDto> Pasos);

public interface IAdminService
{
    Task<IReadOnlyList<AccesoDto>> AccesosAsync(CancellationToken ct = default);
    Task<AccesoDto> CrearAccesoAsync(GuardarAccesoDto dto, CancellationToken ct = default);
    Task<AccesoDto> ActualizarAccesoAsync(int idAcceso, GuardarAccesoDto dto, CancellationToken ct = default);

    Task<IReadOnlyList<VendedorAdminDto>> VendedoresAsync(CancellationToken ct = default);

    Task<IReadOnlyList<ExclusionDto>> ExclusionesAsync(CancellationToken ct = default);
    Task<ExclusionDto> ExcluirClienteAsync(NuevaExclusionDto dto, CancellationToken ct = default);
    Task QuitarExclusionAsync(int idCliente, CancellationToken ct = default);
    Task<IReadOnlyList<GrupoClientesDto>> ResumenClientesAsync(CancellationToken ct = default);
    Task<PaginaClientesDto> ClientesAsync(FiltroClientesAdmin filtro, CancellationToken ct = default);

    Task<SincronizacionesDto> SincronizacionesAsync(int cantidad, CancellationToken ct = default);
    Task<SolicitudSincronizacionDto> SolicitarSincronizacionAsync(CancellationToken ct = default);
}
