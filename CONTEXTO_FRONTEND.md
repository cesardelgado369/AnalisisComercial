# AnalisisComercial — Contexto FRONTEND

> Para pegar en Claude Code (o como `CLAUDE.md` del proyecto `AnalisisComercial.Web`).
> Cliente: **Madomi** (fábrica de pastas, Tucumán). Desarrollo: Cesar (Vignoli Consultora).
> Versión: 26/10/2026. El backend tiene su propio archivo: `CONTEXTO_BACKEND.md`. El **contrato** (sección 9) es el mismo en los dos.

---

## 1. Qué es y para quién

Web para ver **qué clientes compraron**, por mes y por artículo. La usan:

- **Checho** (dueño, rol **Admin**): ve todo, desde la PC y el celular.
- **Los vendedores** (rol **Operario**): ven solo los clientes de su ruta, **sobre todo desde el celular**, en la calle.
- **Supervisor**: rol previsto, hoy sin usuarios.

Reemplaza a la web actual **"Cobertura de clientes"**. La gente ya la conoce: **la pantalla de inicio la replica** y suma lo que falta. Nada de rediseños creativos ni look genérico de plantilla.

---

## 2. Stack

- **Blazor Web App, .NET 8, render mode Interactive Server** (`@rendermode InteractiveServer`).
- La UI **no** llama a una API HTTP: inyecta los servicios del contrato (sección 9) con `@inject`. Los datos se arman en el servidor.
- Login con **ASP.NET Core Identity** (páginas de Identity con el estilo de la marca). Sin registro público: los usuarios los crea el Admin.
- CSS propio con **CSS isolation** (`Componente.razor.css`) + un `app.css` con las variables de marca (sección 4). Sin Bootstrap visible, sin librerías de componentes pesadas. Íconos SVG inline.
- Cultura **es-AR** (`CultureInfo("es-AR")`): meses en español, porcentajes sin decimales ("66%"), miles con punto.

---

## 3. Seguridad en la UI (regla de oro)

**La UI no decide qué datos ve cada uno: eso lo hace el backend.** La UI solo oculta controles que no corresponden:

- Operario: **no ve** el filtro de Vendedor (queda fijo en él), ni Resumen, ni Administración.
- Supervisor: el filtro de Vendedor muestra solo su equipo (`VendedoresVisiblesAsync`).
- Admin: todo.

Usar `<AuthorizeView Roles="Admin">` y `[Authorize(Roles = "...")]` en las páginas. Nunca armar consultas ni filtrar listas completas en el cliente. Si un servicio devuelve `null` (ficha fuera de alcance) → mostrar "No tenés acceso a este cliente".

---

## 4. Diseño visual (copiar la web actual)

Referencia: captura de la web actual "Cobertura de clientes" (Madomi). Si está el HTML/CSS de esa web, **tomar los valores exactos de ahí**; si no, estos:

- **Header** blanco: logo de Madomi a la izquierda (archivo provisto por Madomi, `wwwroot/img/madomi-logo.png`), título "Cobertura de clientes" en negrita, debajo en gris chico la fuente: **"Datos de Chess al 26/10/2026 05:00"** (de `ISyncStatus`).
- Debajo del header, **franja tricolor** horizontal: verde / blanco / rojo (bandas finas, ~4 px cada una).
- **Fondo** gris verdoso muy claro; contenido centrado, ancho máx. ~1000 px.
- **Tipografía condensada** (la actual se ve como *Barlow Semi Condensed*; Google Fonts). Títulos en 600–700.
- **Colores** (variables en `app.css`):
  - `--verde-madomi` (checks, porcentajes, barra de progreso): verde fuerte, aprox. `#1E8A3C`.
  - `--rojo-madomi` (flechas de los desplegables, badge "Dejó de comprar"): aprox. `#D2232A`.
  - `--fila-alerta`: rosa muy claro para la fila completa de quien dejó de comprar.
  - Grises para bordes, textos secundarios y el ✗.
- **Tarjetas** blancas con borde fino gris y radio chico (como la actual).

### Componentes de la pantalla Cobertura (de arriba abajo)

1. **Filtros** (3 desplegables en fila; en celular, uno debajo del otro): *Vendedor* ("Todos los vendedores" + lista), *Día de visita* (Lunes…Sábado + "Todos los días"), *Unidad de negocio* ("Todas las unidades" + lista). Label chico arriba de cada uno. Flecha roja.
2. **Tarjeta resumen**:
   - Izquierda: título grande con el vendedor elegido ("Todos los vendedores") y subtítulo "246 clientes, lunes, todas las unidades".
   - Derecha: **un KPI por mes** — porcentaje grande en verde ("66%"), nombre del mes, "162 de 246" chico, barra de progreso verde sobre gris.
   - **Mes en curso**: el KPI lleva la marca "al 22/10" y un estilo atenuado (no se compara de igual a igual con meses cerrados).
3. **Chips** (pills): `Todos 246` · `Compraron en octubre 162` · `Sin compra en octubre 84` · `Dejaron de comprar 43`. El activo va relleno oscuro con texto blanco. Al lado, **buscador** "Buscar cliente o código".
4. **Tabla**: columnas *Cód. cliente* (ordenable), *Razón social* (nombre en negrita mayúsculas + debajo, en gris, la **ruta**: "Elena White"), y una columna por mes.
   - Celda por mes según `EstadoMes`:
     - `Compro` → círculo verde lleno con ✓ blanco.
     - `NoCompro` → círculo con borde gris y ✗ gris.
     - `SinCompraAun` (mes en curso) → círculo con borde gris punteado y "–" (neutral, **no** alarma).
     - `FueraDeCartera` (ese mes no era su cliente) → celda vacía.
   - `DejoDeComprar = true` → badge rojo de borde "Dejó de comprar" al lado del nombre + fila con fondo `--fila-alerta`.
   - Click en la fila → **Ficha de cliente**.
   - Virtualizar la lista (`<Virtualize>`) si pasa de ~200 filas.

---

## 5. Pantallas y rutas

| Ruta | Pantalla | Roles | Servicio |
|---|---|---|---|
| `/login` | Login (Identity) | Público | — |
| `/` | **Cobertura** (sección 4) | Todos | `ICoberturaService.ObtenerAsync` |
| `/cliente/{id:int}` | **Ficha de cliente / CCC x bulto**: cabecera (nombre, ruta, vendedor, días de visita, dirección con link a Google Maps por lat/lng, última compra, días sin comprar) + matriz **artículos × meses** con ✓/✗, agrupada por unidad de negocio | Todos (dentro de su alcance) | `IClienteService.FichaAsync` |
| `/mi-ruta` | **Mi ruta de hoy**: clientes del día de visita de hoy, primero los `SinCompraAun` / `DejoDeComprar`. Pensada **para celular**: tarjetas grandes, dirección tocable (abre Maps). Admin y Supervisor eligen vendedor | Todos | `IRutaHoyService.ClientesDelDiaAsync` |
| `/resumen` | **Resumen de vendedores**: una fila por vendedor con su cobertura por mes, dejaron de comprar, altas y bajas. "Cuentas de la casa (Deposito)" aparte, solo Admin | Admin, Supervisor | `IResumenService.PorVendedorAsync` |
| `/admin/usuarios` | Alta de usuarios, rol, vínculo con vendedor de Chess, asignación de supervisor | Admin | `IAdminService` |
| `/admin/exclusiones` | Clientes excluidos (ej. CLIENTE TEST) con motivo, quién y cuándo | Admin | `IAdminService` |
| `/admin/sincronizacion` | Últimas corridas (fecha, endpoint, registros, error) + botón "Actualizar ahora" | Admin | `IAdminService` |

**Navegación:** barra superior con logo + menú (Cobertura · Mi ruta · Resumen · Admin según rol) + nombre del usuario y "Salir". En celular, menú hamburguesa.

---

## 6. Comportamiento

- Los filtros y el chip activo viven en la **URL** (query string: `?vendedor=2&dia=2&unidad=ATM&chip=dejaron`) para poder compartir un link o volver atrás.
- Cambiar un filtro recalcula KPIs, chips y tabla juntos (una sola llamada a `ObtenerAsync`).
- El buscador filtra por código o razón social (con debounce de ~300 ms).
- Estados: **cargando** (skeleton de la tabla), **vacío** ("No hay clientes para estos filtros"), **error** ("No pudimos cargar los datos. Probá de nuevo") y **datos viejos** (si la última sync OK tiene más de 36 h, aviso amarillo bajo el header).
- Textos en español rioplatense neutro ("Probá de nuevo", "Tenés"), sin tecnicismos.

---

## 7. Responsive

- ≥ 1024 px: como la web actual.
- < 768 px: filtros apilados; KPIs en carrusel horizontal o grilla 2×2; la tabla pasa a **tarjetas** por cliente (nombre, ruta y una fila de círculos por mes con la inicial del mes arriba).
- Áreas tocables ≥ 44 px. Sin scroll horizontal de página.

## 8. Accesibilidad

- Contraste AA. El estado no depende solo del color: ✓ / ✗ / – y `aria-label` ("Octubre: compró").
- Navegable con teclado (filtros, chips, filas).

---

## 9. CONTRATO con el backend (AnalisisComercial.Application)

> La UI **no** pasa el usuario: el backend lo toma de `ICurrentUser` y aplica el alcance. Mismo contrato que en `CONTEXTO_BACKEND.md`.

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
    Task<IReadOnlyList<OpcionDto>> VendedoresVisiblesAsync(CancellationToken ct = default);
    Task<IReadOnlyList<string>> UnidadesNegocioAsync(CancellationToken ct = default);
}
public interface IClienteService { Task<FichaClienteDto?> FichaAsync(int idCliente, CancellationToken ct = default); }
public interface IRutaHoyService {
    Task<IReadOnlyList<ClienteRutaHoyDto>> ClientesDelDiaAsync(int? idVendedor, DateOnly fecha, CancellationToken ct = default);
}
public interface IResumenService {
    Task<IReadOnlyList<ResumenVendedorDto>> PorVendedorAsync(DateOnly mesDesde, DateOnly mesHasta, CancellationToken ct = default);
}
public interface IAdminService {
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

**Para desarrollar sin backend:** crear implementaciones *fake* de estas interfaces (`FakeCoberturaService`, etc.) con datos de ejemplo realistas — vendedores Nicolás Córdoba, Franco Baigorria, Mauricio Soria, Mateo Rojas, Alejandro Lizarraga; rutas Elena White, Colmenar, Barrio Norte; clientes como MINISERVICE CHUPA, ORIGAMI, DESPENSA MARY; julio a octubre — y registrarlas con un flag de configuración (`UseFakeServices`).

## 10. Orden de trabajo sugerido

1. Layout (header, franja, navegación) + variables de marca + login.
2. Servicios fake.
3. Cobertura (la más importante: tiene que verse como la web actual).
4. Ficha de cliente.
5. Mi ruta de hoy (probar en celular real).
6. Resumen y Administración.
7. Conectar con los servicios reales del backend.
