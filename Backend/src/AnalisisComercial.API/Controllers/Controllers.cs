using AnalisisComercial.Application;
using AnalisisComercial.Domain;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace AnalisisComercial.API.Controllers;

// Controllers finos: el contrato está en CONTRATO_API.md y la lógica (incluido el alcance) en los servicios.

[ApiController]
[Authorize(Policy = Permisos.Ver)]
public class SesionController(ISesionService sesion) : ControllerBase
{
    [HttpGet("api/sesion")]
    public Task<SesionDto> Obtener(CancellationToken ct) => sesion.ObtenerAsync(ct);

    [HttpGet("api/sincronizacion/estado")]
    public Task<EstadoSincronizacionDto> Estado(CancellationToken ct) => sesion.EstadoSincronizacionAsync(ct);
}

[ApiController]
[Route("api/cobertura")]
[Authorize(Policy = Permisos.Ver)]
public class CoberturaController(ICoberturaService cobertura) : ControllerBase
{
    [HttpGet]
    public Task<CoberturaDto> Obtener([FromQuery] int? vendedor, [FromQuery] int? dia, [FromQuery] string? unidad,
        [FromQuery] string? busqueda, [FromQuery] ChipCobertura? chip, [FromQuery] DateOnly? mesDesde,
        [FromQuery] DateOnly? mesHasta, [FromQuery] int? foco, [FromQuery] string? abc, CancellationToken ct)
        => cobertura.ObtenerAsync(new FiltroCobertura(vendedor, dia, unidad, busqueda, chip ?? ChipCobertura.Todos, mesDesde, mesHasta,
            foco, abc), ct);

    [HttpGet("vendedores")]
    public Task<IReadOnlyList<OpcionVendedorDto>> Vendedores(CancellationToken ct) => cobertura.VendedoresAsync(ct);

    [HttpGet("unidades")]
    public Task<IReadOnlyList<string>> Unidades(CancellationToken ct) => cobertura.UnidadesAsync(ct);

    [HttpGet("focos")]
    public Task<IReadOnlyList<FocoDto>> Focos([FromQuery] DateOnly? mes, CancellationToken ct) => cobertura.FocosAsync(mes, ct);
}

[ApiController]
[Authorize(Policy = Permisos.Ver)]
public class ClientesController(IClienteService clientes, IRutaHoyService rutaHoy, IResumenService resumen) : ControllerBase
{
    [HttpGet("api/clientes/{idCliente:int}")]
    public Task<FichaClienteDto> Ficha(int idCliente, [FromQuery] DateOnly? mesDesde, [FromQuery] DateOnly? mesHasta, CancellationToken ct)
        => clientes.FichaAsync(idCliente, mesDesde, mesHasta, ct);

    [HttpGet("api/clientes/{idCliente:int}/volumen")]
    public Task<VolumenClienteDto> VolumenCliente(int idCliente, [FromQuery] DateOnly? mes, CancellationToken ct)
        => clientes.VolumenAsync(idCliente, mes, ct);

    [HttpGet("api/clientes/{idCliente:int}/devoluciones")]
    public Task<DevolucionesClienteDto> DevolucionesCliente(int idCliente, [FromQuery] DateOnly? mesDesde, [FromQuery] DateOnly? mesHasta,
        [FromQuery] DateOnly? mes, CancellationToken ct)
        => clientes.DevolucionesAsync(idCliente, mesDesde, mesHasta, mes, ct);

    [HttpGet("api/clientes/{idCliente:int}/movimientos")]
    public Task<MovimientosClienteDto> MovimientosCliente(int idCliente, [FromQuery] DateOnly? mes, [FromQuery] string? unidad,
        [FromQuery] int? foco, CancellationToken ct)
        => clientes.MovimientosAsync(idCliente, mes, unidad, foco, ct);

    [HttpGet("api/ruta-hoy")]
    public Task<IReadOnlyList<ClienteRutaHoyDto>> RutaHoy([FromQuery] int? vendedor, [FromQuery] DateOnly? fecha, CancellationToken ct)
        => rutaHoy.ClientesDelDiaAsync(vendedor, fecha, ct);

    [HttpGet("api/resumen")]
    public Task<IReadOnlyList<ResumenVendedorDto>> Resumen([FromQuery] DateOnly? mesDesde, [FromQuery] DateOnly? mesHasta, CancellationToken ct)
        => resumen.PorVendedorAsync(mesDesde, mesHasta, ct);
}

[ApiController]
[Authorize(Policy = Permisos.Ver)]
public class BultosController(IVolumenService volumen, IDevolucionesService devoluciones) : ControllerBase
{
    [HttpGet("api/volumen")]
    public Task<VolumenDto> Volumen([FromQuery] int? vendedor, [FromQuery] int? dia, [FromQuery] string? unidad,
        [FromQuery] string? busqueda, [FromQuery] ChipVolumen? chip, [FromQuery] DateOnly? mes, [FromQuery] int? foco,
        [FromQuery] string? abc, [FromQuery] string? comparacion, CancellationToken ct)
        => volumen.ObtenerAsync(new FiltroVolumen(vendedor, dia, unidad, busqueda, chip ?? ChipVolumen.Todos, mes, foco, abc,
            comparacion), ct);

    [HttpGet("api/devoluciones")]
    public Task<DevolucionesDto> Devoluciones([FromQuery] int? vendedor, [FromQuery] int? dia, [FromQuery] string? unidad,
        [FromQuery] DateOnly? mesDesde, [FromQuery] DateOnly? mesHasta, [FromQuery] int? foco, [FromQuery] string? abc,
        CancellationToken ct)
        => devoluciones.ObtenerAsync(new FiltroDevoluciones(vendedor, dia, unidad, mesDesde, mesHasta, foco, abc), ct);
}

/// <summary>
/// Solo Admin (permiso analisis-comercial.admin o SuperAdmin): lo exige la política y, además, AdminService, por si un
/// endpoint nuevo se pusiera en otro controller.
/// </summary>
[ApiController]
[Route("api/admin")]
[Authorize(Policy = Permisos.Admin)]
public class AdminController(IAdminService admin) : ControllerBase
{
    [HttpGet("usuarios")]
    public Task<IReadOnlyList<AccesoDto>> Accesos(CancellationToken ct) => admin.AccesosAsync(ct);

    [HttpPost("usuarios")]
    public async Task<ActionResult<AccesoDto>> CrearAcceso(GuardarAccesoDto dto, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await admin.CrearAccesoAsync(dto, ct));

    [HttpPut("usuarios/{idAcceso:int}")]
    public Task<AccesoDto> ActualizarAcceso(int idAcceso, GuardarAccesoDto dto, CancellationToken ct)
        => admin.ActualizarAccesoAsync(idAcceso, dto, ct);

    [HttpGet("exclusiones")]
    public Task<IReadOnlyList<ExclusionDto>> Exclusiones(CancellationToken ct) => admin.ExclusionesAsync(ct);

    [HttpPost("exclusiones")]
    public async Task<ActionResult<ExclusionDto>> Excluir(NuevaExclusionDto dto, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await admin.ExcluirClienteAsync(dto, ct));

    [HttpDelete("exclusiones/{idCliente:int}")]
    public async Task<IActionResult> QuitarExclusion(int idCliente, CancellationToken ct)
    {
        await admin.QuitarExclusionAsync(idCliente, ct);
        return NoContent();
    }

    [HttpGet("vendedores")]
    public Task<IReadOnlyList<VendedorAdminDto>> Vendedores(CancellationToken ct) => admin.VendedoresAsync(ct);

    [HttpGet("cuentas")]
    public Task<IReadOnlyList<CuentaMadomiDto>> Cuentas(CancellationToken ct) => admin.CuentasAsync(ct);

    [HttpPost("cuentas")]
    public async Task<ActionResult<CuentaMadomiDto>> CrearCuenta(NuevaCuentaDto dto, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await admin.CrearCuentaAsync(dto, ct));

    [HttpGet("clientes/resumen")]
    public Task<IReadOnlyList<GrupoClientesDto>> ResumenClientes(CancellationToken ct) => admin.ResumenClientesAsync(ct);

    [HttpGet("clientes")]
    public Task<PaginaClientesDto> Clientes([FromQuery] string? vendedor, [FromQuery] string? texto, [FromQuery] string? excluidos,
        [FromQuery] string? sugerencia, [FromQuery] string? vitales, [FromQuery] int? pagina, [FromQuery] int? tamano, CancellationToken ct)
        => admin.ClientesAsync(new FiltroClientesAdmin(vendedor, texto, excluidos, pagina ?? 1, tamano ?? 50, sugerencia, vitales), ct);

    [HttpGet("focos")]
    public Task<IReadOnlyList<FocoDto>> Focos(CancellationToken ct) => admin.FocosAsync(ct);

    [HttpPost("focos")]
    public async Task<ActionResult<FocoDto>> CrearFoco(GuardarFocoDto dto, CancellationToken ct)
        => StatusCode(StatusCodes.Status201Created, await admin.CrearFocoAsync(dto, ct));

    [HttpPut("focos/{idFoco:int}")]
    public Task<FocoDto> ActualizarFoco(int idFoco, GuardarFocoDto dto, CancellationToken ct) => admin.ActualizarFocoAsync(idFoco, dto, ct);

    [HttpDelete("focos/{idFoco:int}")]
    public async Task<IActionResult> BorrarFoco(int idFoco, CancellationToken ct)
    {
        await admin.BorrarFocoAsync(idFoco, ct);
        return NoContent();
    }

    [HttpGet("focos/analisis")]
    public Task<AnalisisFocosDto> AnalisisFocos([FromQuery] DateOnly? mes, CancellationToken ct) => admin.AnalisisFocosAsync(mes, ct);

    [HttpGet("articulos")]
    public Task<IReadOnlyList<ArticuloAdminDto>> Articulos(CancellationToken ct) => admin.ArticulosAsync(ct);

    [HttpPut("clientes/{idCliente:int}/vital")]
    public Task<VitalDto> MarcarVital(int idCliente, CancellationToken ct) => admin.MarcarVitalAsync(idCliente, ct);

    [HttpDelete("clientes/{idCliente:int}/vital")]
    public async Task<IActionResult> QuitarVital(int idCliente, CancellationToken ct)
    {
        await admin.QuitarVitalAsync(idCliente, ct);
        return NoContent();
    }

    [HttpGet("sincronizaciones")]
    public Task<SincronizacionesDto> Sincronizaciones([FromQuery] int? cantidad, CancellationToken ct)
        => admin.SincronizacionesAsync(cantidad ?? 30, ct);

    [HttpPost("sincronizaciones")]
    public async Task<ActionResult<SolicitudSincronizacionDto>> Solicitar(CancellationToken ct)
        => StatusCode(StatusCodes.Status202Accepted, await admin.SolicitarSincronizacionAsync(ct));
}
