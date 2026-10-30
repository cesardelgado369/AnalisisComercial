# AnalisisComercial — Contexto BACKEND

> Para pegar en Claude Code (o como `CLAUDE.md` del proyecto backend).
> Cliente: **Madomi** (fábrica de pastas, Tucumán). ERP: **ChessERP**. Desarrollo: Cesar (Vignoli Consultora).
> Versión: 26/10/2026. El frontend tiene su propio archivo: `CONTEXTO_FRONTEND.md`. El **contrato** entre ambos (sección 8) es el mismo en los dos archivos: si cambia acá, cambia allá.

---

## 1. Qué es

Web que muestra **qué clientes compraron**, por mes y por artículo, con **acceso por rol**:

- **Admin** (Checho, dueño de Madomi; Cesar como admin técnico): ve todo.
- **Supervisor** (no existe hoy en Madomi, queda implementado): ve los vendedores que el Admin le asigne.
- **Operario** (los vendedores): ve **solo los clientes de sus rutas vigentes**.

Reemplaza a la web actual "Cobertura de clientes", que se alimenta del Excel `Base App CCC dd.mm.xlsx` exportado a mano. Acá **todo sale de la API de Chess**, sincronizado a una base propia. Solo la configuración (usuarios, vínculos, exclusiones) se carga a mano desde la pantalla de Admin.

**Fuera del MVP:** ventas en $ y kilos (fase 2, pero los datos ya se guardan), objetivos (fase 3), listas de precios (la API no da permiso), costos/margen (queda en Power BI).

---

## 2. Stack y estructura de la solución

- .NET 8, C#, `Nullable` habilitado, async en todo el I/O.
- ASP.NET Core 8 — **Blazor Web App en modo Interactive Server** (el frontend). La UI llama a los servicios en proceso, sin API HTTP pública: los datos se renderizan en el servidor y **nunca viajan al navegador clientes de otra ruta**.
- ASP.NET Core Identity (usuarios, roles, claves hasheadas, lockout).
- EF Core 8 + SQL Server (Express en desarrollo; Azure SQL o servidor de Madomi en producción — decisión pendiente).
- Worker Service de .NET para la sincronización con Chess.
- xUnit para tests.

```
AnalisisComercial.sln
├─ src/
│  ├─ AnalisisComercial.Domain          entidades y reglas de negocio puras (sin EF, sin HTTP)
│  ├─ AnalisisComercial.Application     CONTRATO: interfaces de servicios + DTOs (sección 8), ICurrentUser
│  ├─ AnalisisComercial.Infrastructure  DbContext, migraciones, ChessClient, implementación de servicios, sync
│  ├─ AnalisisComercial.Web             Blazor + Identity  (FRONTEND, ver CONTEXTO_FRONTEND.md)
│  └─ AnalisisComercial.Sync            Worker Service que corre la sincronización
└─ tests/
   ├─ AnalisisComercial.Domain.Tests    reglas de negocio
   └─ AnalisisComercial.Security.Tests  "ningún operario ve clientes ajenos"
```

Convenciones: nombres de dominio en **español** (Cliente, Ruta, Vendedor, CompraMes), código en inglés técnico donde sea estándar (Repository, Service, Dto). Montos `decimal`. Fechas de negocio `DateOnly`. Zona horaria: `America/Argentina/Buenos_Aires` (UTC−3).

---

## 3. API de Chess

### 3.1 Conexión

- **URL base:** `https://guillermomartinabdala.chesserp.com/AR1423/web/api/chess/v1`
- **Login:** `POST auth/login` con body JSON `{"usuario": "...", "password": "..."}` → respuesta `{"sessionId": "..."}`.
- **Cada GET** lleva el header `Cookie: <sessionId>` **crudo** (sin `JSESSIONID=` delante) y `Accept: application/json`.
- El token vence rápido: **re-loguear cada 4 minutos** o ante 401/403, con reintento.
- **Credenciales:** usuario `madomiapi`. Van en secretos (User Secrets en desarrollo, variables de entorno o Azure Key Vault en producción). **Nunca** en el repo, en `appsettings.json` versionado, en logs ni en el navegador. Pendiente: pedir a Chess un usuario de API propio para esta web.
- Errores de negocio vienen con HTTP 200 y un array `error: [{route, statusCode, codigo, tipo, mensaje}]` → tratarlos como error y loguear `mensaje`.

### 3.2 Parseo (importante)

- Strings vacíos `""` → `null` antes de convertir.
- Números en formato **en-US** → `CultureInfo.InvariantCulture`.
- Booleanos de Chess vienen como `"SI"` / `"NO"` (p. ej. `anulado`), o como `true/false` según el endpoint. Normalizar.
- Fechas `YYYY-MM-DD`. `9999-12-31` = "sin fecha de fin" (vigente).
- Los ids de cliente cruzan entre `ventas/`, `clientes/` y `rutasVenta/` (validado: 838 de 838 clientes de octubre).

### 3.3 Endpoints que usamos

| Endpoint | Parámetros | Ruta del array en el JSON | Uso |
|---|---|---|---|
| `personalComercial/` | — | `PersonalComercial.ePersCom[]` | Vendedores |
| `rutasVenta/` | — | `RutasVenta.eRutasVenta[]` (+ sub-array `eClientesRutas[]`) | Rutas, día de visita, cartera |
| `clientes/` | `nroLote` (paginado, ~100 por lote; trae `cantClientes`) | `Clientes.eClientes[]` (+ `eClialias[]`, `eClifuerza[]`) | Maestro de clientes |
| `articulos/` | — | `Articulos.eArticulos[]` (+ `eAgrupaciones[]`) | Artículos y unidad de negocio |
| `ventas/` | `fechaDesde`, `fechaHasta` (**máx. 1 mes**), `detallado=true`, `nroLote`, `empresas=""` | `dsReporteComprobantesApi.VentasResumen[]` | Líneas de venta |

**Sin acceso / no usar:** `listaPrecios/` (sin permiso al módulo), `roma/*` (error 500), `movStock` (escritura). `pedidos/` existe pero no entra en el MVP.

**Paginación (`nroLote`):** pedir lote 1, 2, 3… hasta que venga vacío o no traiga filas nuevas. Si el lote 1 viene vacío, probar `nroLote=0` (= todos). **Deduplicar** siempre (en ventas: comprobante + línea).

### 3.4 Campos relevantes

**personalComercial** → `idPersonal, desPersonal, apellido, nombres, idFuerzaVentas, cargo, idPersonalSuperior, desPersonalSuperior, correoelectronico, usuarioSistema`.
Hoy: 6 personas, todas `cargo = VENDEDOR`, `idPersonalSuperior = 0`. **El 6 = "DEPOSITO" no es una persona** (cuenta de la casa).

| idPersonal | Vendedor |
|---|---|
| 1 | NICOLAS CORDOBA |
| 2 | FRANCO BAIGORRIA |
| 3 | MAURICIO SORIA |
| 4 | MATEO ROJAS |
| 5 | ALEJANDRO LIZARRAGA |
| 6 | DEPOSITO (no es persona) |

**rutasVenta** → `idSucursal, idFuerzaVentas, idModoAtencion, idRuta, desRuta, fechaDesde, fechaHasta, anulado, idPersonal, desPersonal, periodicidadVisita, semanaVisita, diasVisita, periodicidadEntrega, semanaEntrega, diasEntrega, eClientesRutas[{idCliente, razonSocial, intercalacionVisita, intercalacionEntrega}]`.
- Vienen **91 rutas: 46 vigentes** (`fechaHasta = 9999-12-31`) y 45 históricas. **Usar solo las vigentes.** Con eso las 46 coinciden con el Excel (mismo vendedor y día) y 1290 de 1295 clientes tienen la misma ruta.
- `diasVisita`: texto con números separados por coma. **2 = lunes, 3 = martes, 4 = miércoles, 5 = jueves, 6 = viernes, 7 = sábado** (1 = domingo, inferido; nadie lo usa). Ej.: `"2,5"` = lunes y jueves; `"2,3,4,5,6,7"` = Deposito todos los días. Puede venir duplicado (`"2,2"`) → distinct. Vacío = ruta sin día de visita (8 rutas: Salta, Catamarca, Santiago, Sur Tucumán, etc.).
- La ruta vigente de un cliente define su **vendedor** y su **día de visita**.

**clientes** → `idCliente, anulado, fechaBaja, idFormaPago, desFormaPago, idListaPrecio, desLocalidad, calle, altura, latitudGeo, longitudGeo, horario, telefonoMovil, idCanalMkt, desCanalMkt, idSubcanalMkt, idSegmentoMkt, eClialias[], eClifuerza[]`.
- **Nombre:** `eClialias[0].razonSocial` (fallback `fantasiaSocial`). No está en la raíz.
- `eClifuerza[]`: `idRuta, diasVisita, fechaInicioFuerza, fechaFinFuerza, anulado…` — coincide con la ruta; usar `rutasVenta` como fuente principal.
- Hoy: 1305 clientes en la API.

**articulos** → `idArticulo, desArticulo, anulado, unidadesBulto, pesoBulto, idArticuloEstadistico, idTipoMercaderia, desTipoMercaderia, eAgrupaciones[]`.
- La **unidad de negocio** que usa la web actual ("124 - ATM", "124 - TAPAS", "124 - PASTAS FRESCAS", "124 - COMIDAS CONGELADAS", "124 - PAN RALLADO1", "124 - Articulos Sin Asociar Agrupacion") sale de una agrupación dentro de `eAgrupaciones`. **Pendiente** confirmar cuál con `diag_ccc.bat`.

**ventas (detallado=true)** → una fila por línea de comprobante:
`idEmpresa, idDocumento, dsDocumento, letra, serie, nrodoc, anulado, fechaComprobate (sic), fechaEntrega, idSucursal, idFuerzaVentas, idVendedor, dsVendedor, idSupervisor, idCliente, nombreCliente, idCanalMkt, idSubcanalMkt, idSegmentoMkt, idPedido, fechaPedido, origen, idLinea, idArticulo, dsArticulo, idArticuloEstadistico, presentacionArticulo, cantidadSolicitada, unidadesSolicitadas, cantidadesCorCargo, cantidadesSinCargo, cantidadesTotal, cantidadesRechazo, pesoTotal, precioUnitarioBruto, bonificacion, precioUnitarioNeto, subtotalBruto, subtotalBonificado, subtotalNeto, iva21, iva27, iva105, per3337, iva2, percepcion212, percepcioniibb, internos, subtotalFinal`.
- Clave única de línea: `idEmpresa + idDocumento + letra + serie + nrodoc + idLinea`.
- `dsDocumento` vistos en octubre: `FACTURA`, `NOTA DE CREDITO`, `FACTURA PRESUPUESTO`, `FACTURA CIERRE CONSIG.`, `DEVOLUCION PRESUPUESTO`.
- `subtotalNeto` = sin IVA; `subtotalFinal` = con IVA. Las ventas "en negro" vienen sin impuestos.

---

## 4. Modelo de datos (SQL Server)

| Tabla | Columnas principales | Notas |
|---|---|---|
| `Vendedor` | IdPersonal (PK), Nombre, EsPersona, Activo | EsPersona = false para Deposito (6) |
| `Ruta` | IdRuta (PK), Nombre, IdPersonal (FK), DiasVisita (texto normalizado "2,5"), Vigente, FechaDesde, FechaHasta | |
| `RutaDia` | IdRuta, DiaSemana (1–7) | Explota DiasVisita para filtrar por día |
| `Cliente` | IdCliente (PK), RazonSocial, Localidad, Calle, Altura, Lat, Lng, IdRuta (FK, ruta vigente), Anulado, FechaBaja | |
| `Articulo` | IdArticulo (PK), Descripcion, UnidadNegocio, Anulado | |
| `VentaLinea` | Clave de línea (sección 3.4), Fecha, FechaEntrega, IdCliente, IdArticulo, IdVendedor, TipoDocumento, Anulado, CantidadTotal, CantidadRechazo, Kilos, Neto, Final | Guarda $ y kilos ya, para la fase 2 |
| `CompraMes` | Mes (DateOnly, día 1), IdCliente, IdArticulo, Compro (bit), Cantidad, Neto | Derivada de VentaLinea; se recalcula en cada sync para los meses tocados |
| `CarteraMes` | Mes, IdCliente, IdRuta, IdPersonal | **Foto** de la cartera al cierre de cada mes (y la del mes en curso se actualiza a diario) |
| Identity (`AspNetUsers`, `AspNetRoles`…) | | Roles: `Admin`, `Supervisor`, `Operario` |
| `UsuarioVendedor` | UserId, IdPersonal | Operario → su vendedor de Chess (1 a 1) |
| `SupervisorVendedor` | UserId, IdPersonal | Supervisor → N vendedores |
| `Exclusion` | IdCliente, Motivo, CreadoPor, CreadoEn | Ej.: CLIENTE TEST (id 1) |
| `SyncLog` | Id, Inicio, Fin, Endpoint, Desde, Hasta, Registros, Ok, Error | Una fila por endpoint y corrida |
| `AccesoLog` | UserId, Fecha, Pantalla, Parametros | Auditoría de quién vio qué |

Índices: `VentaLinea(Fecha, IdCliente)`, `CompraMes(Mes, IdCliente)`, `CarteraMes(Mes, IdPersonal)`, `Cliente(IdRuta)`.

---

## 5. Sincronización (AnalisisComercial.Sync)

1. **Carga inicial** (una vez): maestros + ventas mes a mes desde **2026-07-01** hasta hoy.
2. **Diaria** (madrugada, ~05:00 ART) y **a pedido del Admin**:
   - Maestros completos: `personalComercial`, `rutasVenta`, `clientes` (paginado), `articulos`. Upsert.
   - Ventas: **mes en curso + los últimos 3 días del mes anterior** (por correcciones tardías). Upsert por clave de línea; las líneas que ya no vienen en el rango se marcan/eliminan (decidir).
   - Recalcular `CompraMes` de los meses tocados.
   - Actualizar `CarteraMes` del mes en curso. El día 1 de cada mes, la foto del mes anterior queda **congelada**.
3. Cada paso escribe `SyncLog`. Si un endpoint falla, se reintenta (3 veces, backoff) y **no se borra lo anterior**: la web sigue mostrando la última carga buena con su fecha.
4. `ISyncStatus.UltimaSincronizacionOk()` → fecha/hora que muestra el frontend en "Datos de Chess al …".

---

## 6. Reglas de negocio (Domain)

- **Compró** (por cliente × artículo × mes): existe al menos una línea de `FACTURA` / `FACTURA PRESUPUESTO` / `FACTURA CIERRE CONSIG.` **no anulada** con `cantidadesTotal > 0` en ese mes (por `fechaComprobate`).
  - ⚠️ **Pendiente** (resultado de `diag_ccc.bat`): ¿se netean las notas de crédito / devoluciones? ¿Cuentan las facturas presupuesto? Dejar la regla en **una sola clase** (`ReglaCompra`) para cambiarla en un lugar.
- **Cliente con compra en el mes** = compró al menos un artículo (o, si se filtra por unidad de negocio, un artículo de esa unidad).
- **Cartera del mes** = clientes en `CarteraMes` de ese mes, **menos** `Exclusion`.
- **Cobertura del mes** = clientes con compra ∩ cartera ÷ cartera. Cada mes con **su** cartera (no la de hoy).
- **Dejó de comprar** = compró en el mes M−1 y **no** compró en M, con **M cerrado**.
- **Sin compra aún** = mes en curso y todavía no compró. Nunca se marca "Dejó de comprar" en el mes en curso.
- **Deposito** (IdPersonal 6): sus clientes solo los ve el Admin y se muestran separados ("Cuentas de la casa"), fuera de los totales de vendedores.
- Valores de validación (corte 20/10/2026, Excel Base App CCC 20.10): clientes con compra jul 766, ago 836, sep 846, oct 819. La API da 838 en octubre: la diferencia (19) se resuelve al fijar la regla de "compró".

---

## 7. Seguridad (lo más importante del proyecto)

- El **alcance** de un usuario se resuelve en el servidor, en cada request: `IAlcanceUsuario.VendedoresVisibles()` →
  - Admin: todos (incluido 6).
  - Supervisor: `SupervisorVendedor`.
  - Operario: su `UsuarioVendedor` (uno). Sin vínculo → **ninguno** (el acceso se otorga, no se presupone).
- **Todas** las consultas de clientes/ventas pasan por ese alcance (filtro global de EF Core o un `IQueryable` base obligatorio). Ningún servicio recibe `idVendedor` del frontend sin validarlo contra el alcance: si un Operario pide otro vendedor o un cliente ajeno → 403 / vacío y se registra en `AccesoLog`.
- La ruta vigente manda: si Chess reasigna una ruta, al día siguiente el acceso cambia solo.
- Identity: lockout tras 5 intentos, clave mínima 8, cookie `HttpOnly` + `Secure`, HTTPS obligatorio. Solo el Admin crea usuarios (sin registro público).
- **Tests obligatorios** (`Security.Tests`), corren en cada build:
  - un Operario no ve clientes de otra ruta (ni pidiendo su id directo);
  - un Operario sin vínculo no ve nada;
  - un Supervisor ve solo sus vendedores;
  - Deposito solo lo ve el Admin.

---

## 8. CONTRATO con el frontend (AnalisisComercial.Application)

> El usuario actual **no** se pasa por parámetro: cada servicio lo toma de `ICurrentUser` y aplica el alcance.

```csharp
public enum EstadoMes { Compro, NoCompro, SinCompraAun, DejoDeComprar, FueraDeCartera }

public record FiltroCobertura(int? IdVendedor, int? DiaSemana, string? UnidadNegocio, string? Busqueda,
                              ChipCobertura Chip, DateOnly MesDesde, DateOnly MesHasta);
public enum ChipCobertura { Todos, CompraronMesActual, SinCompraMesActual, DejaronDeComprar }

public record KpiMesDto(DateOnly Mes, int ClientesConCompra, int ClientesCartera, decimal Porcentaje, bool MesEnCurso, DateOnly? CorteAl);
public record ClienteCoberturaDto(int IdCliente, string RazonSocial, string Ruta, string Vendedor,
                                  IReadOnlyList<EstadoMes> Meses, bool DejoDeComprar);
public record CoberturaDto(string Titulo, string Subtitulo, IReadOnlyList<KpiMesDto> Kpis,
                           IReadOnlyDictionary<ChipCobertura, int> Chips, IReadOnlyList<ClienteCoberturaDto> Clientes);

public record ArticuloMesDto(int IdArticulo, string Descripcion, string UnidadNegocio, IReadOnlyList<bool> Meses);
public record FichaClienteDto(int IdCliente, string RazonSocial, string Ruta, string Vendedor, string DiasVisita,
                              string? Direccion, decimal? Lat, decimal? Lng, DateOnly? UltimaCompra, int? DiasSinComprar,
                              IReadOnlyList<DateOnly> Meses, IReadOnlyList<ArticuloMesDto> Articulos);

public record ClienteRutaHoyDto(int IdCliente, string RazonSocial, string? Direccion, EstadoMes EstadoMesActual,
                                bool DejoDeComprar, DateOnly? UltimaCompra);
public record ResumenVendedorDto(int IdPersonal, string Vendedor, IReadOnlyList<KpiMesDto> Kpis,
                                 int DejaronDeComprar, int Altas, int Bajas);
public record OpcionDto(int Id, string Nombre);

public interface ICoberturaService {
    Task<CoberturaDto> ObtenerAsync(FiltroCobertura filtro, CancellationToken ct = default);
    Task<IReadOnlyList<OpcionDto>> VendedoresVisiblesAsync(CancellationToken ct = default); // Operario: solo él
    Task<IReadOnlyList<string>> UnidadesNegocioAsync(CancellationToken ct = default);
}
public interface IClienteService {
    Task<FichaClienteDto?> FichaAsync(int idCliente, CancellationToken ct = default);    // null si está fuera de su alcance
}
public interface IRutaHoyService {
    Task<IReadOnlyList<ClienteRutaHoyDto>> ClientesDelDiaAsync(int? idVendedor, DateOnly fecha, CancellationToken ct = default);
}
public interface IResumenService {   // Admin y Supervisor
    Task<IReadOnlyList<ResumenVendedorDto>> PorVendedorAsync(DateOnly mesDesde, DateOnly mesHasta, CancellationToken ct = default);
}
public interface IAdminService {     // solo Admin
    Task<IReadOnlyList<UsuarioDto>> UsuariosAsync(CancellationToken ct = default);
    Task CrearUsuarioAsync(NuevoUsuarioDto dto, CancellationToken ct = default);
    Task VincularVendedorAsync(string userId, int idPersonal, CancellationToken ct = default);
    Task AsignarSupervisorAsync(string userId, IReadOnlyList<int> idsPersonal, CancellationToken ct = default);
    Task<IReadOnlyList<ExclusionDto>> ExclusionesAsync(CancellationToken ct = default);
    Task ExcluirClienteAsync(int idCliente, string motivo, CancellationToken ct = default);
    Task QuitarExclusionAsync(int idCliente, CancellationToken ct = default);
    Task<IReadOnlyList<SyncLogDto>> UltimasSincronizacionesAsync(int cantidad, CancellationToken ct = default);
    Task LanzarSincronizacionAsync(CancellationToken ct = default);
}
public interface ISyncStatus { Task<DateTimeOffset?> UltimaSincronizacionOkAsync(CancellationToken ct = default); }
```

(`UsuarioDto`, `NuevoUsuarioDto`, `ExclusionDto`, `SyncLogDto`: definir con los campos obvios de las tablas de la sección 4.)

---

## 9. Orden de trabajo sugerido

1. `ChessClient` (login, renovación, paginación, parseo) + tests con JSON de ejemplo (en `Madomi - Chess\diag_cartera\*.json` hay respuestas reales).
2. DbContext, migraciones y sync de maestros.
3. Sync de ventas + `CompraMes` + `CarteraMes`.
4. **Control 1:** la cobertura por mes coincide con la Base CCC (766 / 836 / 846 / 819 al 20/10).
5. Identity, roles, `IAlcanceUsuario`, servicios del contrato.
6. **Control 2:** tests de seguridad en verde.
7. Implementación completa de los servicios para el frontend.

## 10. Pendientes que afectan al backend

- Regla de "compró" (NC, presupuestos) → `diag_ccc.bat`.
- Agrupación de `articulos/` que da la unidad de negocio → `diag_ccc.bat`.
- ¿La cobertura cuenta cualquier artículo o solo las unidades de negocio de la Base CCC?
- Hosting (Azure vs servidor de Madomi) y usuario de API propio.
