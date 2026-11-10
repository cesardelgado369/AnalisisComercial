# AnálisisComercial — contrato de la API

Fuente de verdad del contrato entre `Backend/` y `Frontend/` (26/10/2026). Si `Frontend/src/api/types.ts` y este
archivo se contradicen, vale este. Lo escribe la sesión del **backend**; un cambio se le avisa al front **antes** de
codificarlo. Reemplaza a la sección 8 de `CONTEXTO_BACKEND.md` (y la 9 de `CONTEXTO_FRONTEND.md`): ya no hay Blazor.

## Decisiones (Cesar, 26/10/2026)

- Front **React + TS + Vite** (`Frontend/`, puerto 5177) y una **API HTTP** (`Backend/`, `AnalisisComercial.API`, .NET 8,
  puerto **5030**). En desarrollo Vite reenvía `/api` a `http://localhost:5030`.
- **Login central** de la plataforma, con pantalla de login propia de esta app (como Mantenimiento):
  `?aplicacion=analisis-comercial` en la API de plataforma, cookie propia.
- Todo sale de la API de Chess, sincronizado a una base propia (SQL Server). Lo único que se carga a mano es quién
  tiene acceso y los clientes excluidos.

## Sesión, roles y alcance

- La API valida el token ES256 de la plataforma con su clave pública y exige `mod=analisis-comercial`. La empresa
  sale de `tenant_id` y tiene que ser **Madomi Pastas** (`A1B2C3D4-0000-4000-8000-000000000001`); otra → 403.
- Permisos de la plataforma: **`analisis-comercial.ver`** (entrar) y **`analisis-comercial.admin`** (rol Admin).
- **Rol en esta app** (lo resuelve el backend en cada request, nunca el front):

  | Rol | Quién | Ve |
  |---|---|---|
  | `admin` | tiene `analisis-comercial.admin` o es SuperAdmin | todo, incluidas las **cuentas de la casa** (Deposito, id 6, y rutas sin vendedor) |
  | `supervisor` | cargado en Administración con sus vendedores | los clientes de esos vendedores |
  | `operario` | cargado en Administración con **un** vendedor de Chess | solo los clientes de las rutas vigentes de su vendedor |

  Supervisor y operario se dan **por email** (o usuario sin dominio, como `jimena`: el que use para entrar a la
  plataforma) en `/api/admin/usuarios` (la cuenta la crea la plataforma). El acceso se enlaza a la cuenta **cuando el
  Admin lo guarda** (la cuenta cuyo usuario es ese email), y desde ahí vale aunque cambie su email. **Nunca se enlaza
  al entrar** (revisión de seguridad del 04/11/2026: la plataforma deja cambiar el email propio sin verificarlo, y
  cualquiera podía ponerse el de un acceso pendiente y heredarlo). Si la cuenta todavía no existe, el acceso queda
  pendiente y no deja entrar a nadie: cuando la creen, el Admin lo vuelve a guardar. Sin acceso cargado → **403** en todo,
  con un `title` legible («Todavía no tenés acceso a Análisis Comercial. Pedíselo al administrador.»).
- **Desarrollo** (`// TODO testing`, solo en Development): un request **sin** `Authorization` entra como Admin de
  Madomi (`desarrollo@analisis.local`). Para probar otro rol, en `appsettings.Development.json` de la API:
  `Autenticacion:Desarrollo:Email` (un email con acceso cargado) y `Autenticacion:Desarrollo:Permisos`
  (`["analisis-comercial.ver"]`). Con token se valida como en producción.
- La **ruta vigente** de Chess manda: si Chess reasigna una ruta, al día siguiente el acceso cambia solo.
- Pedir un vendedor fuera del alcance → **403**; un cliente fuera del alcance → **404** (no se revela que existe).
  Las dos cosas quedan en el registro de accesos.

### Gobernanza de datos (Cesar, 29/10/2026: prioridad 1)

Operario y supervisor ven un cliente **solo en los meses en que estuvo en la cartera de uno de sus vendedores**
(`CarteraMes`: la foto de cada mes). Los demás meses de ese cliente no existen para ellos. El admin ve todo.

- Vale para **todo**: estados, «compró el mes anterior» (el `dejoDeComprar` de un mes solo mira el anterior si
  también era suyo), última compra y días sin comprar, artículos, bultos, bases de comparación, KPI y totales.
- Nunca viajan el nombre ni los datos del vendedor anterior. Al operario no le llegan totales de la empresa,
  rankings ni nombres de otros vendedores.
- **Totales solo en porcentaje para el operario** (Cesar, 30/10): en `/api/volumen` le llegan `total.bultosActual`,
  `total.bultosBase` y `total.bultosEsperado` en null (queda `total.porcentaje`), y en `/api/devoluciones`
  `kpis[].bultosVendidos`, `kpis[].bultosDevueltos` y `articulos[].bultosVendidos` / `bultosDevueltos` en null (quedan
  los porcentajes). Los bultos de cada cliente (`clientes[]` y la ficha) sí los ve.
- **Ventana de 4 meses para operario y supervisor** (Cesar, 30/10): ven el mes en curso y los 3 anteriores. Un
  `mesDesde` más viejo se recorta al primero de la ventana; un `mesHasta` (o el `mes` de `/api/volumen` y de la pestaña
  Volumen) más viejo → 400 con `errors.mesHasta` / `errors.mes`. El admin pide cualquier mes desde julio de 2026.
- **El operario ve solo Cobertura y la ficha** (Cesar, 30/10, versión 1.2 para vendedores): `/api/volumen`,
  `/api/devoluciones` y las pestañas `/api/clientes/{id}/volumen` y `/devoluciones` le dan 403. La ficha la ve con sus
  artículos. Se abre sin publicar con `Comercial:OperarioSoloCobertura = false`; el front lo sabe por
  `sesion.veBultos`.
- Ficha y sus pestañas: el operario o supervisor entra si el cliente estuvo **alguna vez** en su cartera (desde julio
  de 2026), aunque hoy sea de otro: ve solo sus meses. Si nunca fue suyo, 404.
- Los clientes excluidos no cuentan en las carteras (como siempre), pero la exclusión no cambia de quién es cada mes.

## Convenciones

- Rutas bajo `/api`. JSON camelCase. **Enums como texto camelCase**.
- Fechas `yyyy-MM-dd`; meses como su día 1 (`2026-10-01`); instantes ISO con zona (`2026-10-26T05:00:12-03:00`).
- «Hoy» y el mes en curso son los de Argentina.
- Errores `{ status, title, errors?, traceId }` con `errors = { campo: [mensajes] }`:
  400 validación · 401 sin sesión · 403 sin permiso o fuera de alcance · 404 no existe o fuera de alcance ·
  409 otro lo cambió · 429 demasiados pedidos seguidos.
- **Empresa:** las políticas exigen `tenant_id` = Madomi (comparado como GUID). Otra empresa → 403 «Análisis Comercial
  no está disponible para esta empresa.» en todo, también SuperAdmin. Los 403 de la autorización (otra empresa, sin
  permiso, `/api/admin` sin ser Admin) traen el mismo `{ status, title }` y quedan en el registro de accesos.
- **Chatbot:** con el token del chatbot (claim `canal` = `chatbot`) solo se lee. Todo lo que no sea GET/HEAD → 403
  «Desde el chatbot, los cambios se hacen con una propuesta que la persona confirma.». Ver `CHATBOT.md` de la raíz.
- **Freno de pedidos:** 240 por minuto por persona y canal (`Freno:PedidosPorMinuto`) → 429
  `{ status: 429, title: "Demasiados pedidos seguidos: esperá un minuto." }`.
- Edición con `version` (texto opaco): el GET la trae, el PUT la exige y responde 409 si otro guardó en el medio.
- **Rango de meses** (`mesDesde`, `mesHasta`, donde se indica): por defecto `mesHasta` = mes en curso y `mesDesde` =
  tres meses antes (cuatro meses, como la web actual). Máximo 12 meses. No antes del primer mes con datos
  (2026-07-01): se recorta (para operario y supervisor, a su ventana de 4 meses: ver Gobernanza). `mesDesde > mesHasta`
  → 400.
- **Día de visita** (`dia`): código de Chess. 2 lunes · 3 martes · 4 miércoles · 5 jueves · 6 viernes · 7 sábado
  (1 domingo existe pero nadie lo usa).

### `EstadoMes`

| Valor | Cuándo | Celda |
|---|---|---|
| `compro` | compró al menos un artículo ese mes (de la unidad filtrada, si hay filtro) | ✓ verde |
| `noCompro` | mes cerrado, no compró, y el anterior tampoco | ✗ gris |
| `sinCompraAun` | mes en curso y todavía no compró (neutral, no es alarma) | – punteado |
| `dejoDeComprar` | mes cerrado, no compró, y el anterior sí | ✗ (la marca va en la fila, ver `dejoDeComprar`) |
| `fueraDeCartera` | ese mes no era cliente de la cartera mirada | vacía |

«Compró» (26/10, fijada con diag_ccc contra la Base CCC): en ese mes (por fecha de comprobante) hay FACTURA o
FACTURA CIERRE CONSIG. no anulada de ese artículo, y la cantidad neta de las notas de crédito del mes sigue > 0. La
FACTURA PRESUPUESTO no cuenta. Se reconfirma con la carga completa: si cambia, cambian los números, no el contrato.

## Endpoints

Todos piden sesión con `analisis-comercial.ver` y un rol en esta app, salvo donde se indica.

### `GET /api/sesion`

Con `analisis-comercial.ver` alcanza (sin rol cargado → 403 con el `title` de arriba).

```jsonc
{ "email": "franco@madomi",
  "rol": "admin" | "supervisor" | "operario",
  "vendedor": { "idPersonal": 2, "nombre": "FRANCO BAIGORRIA" } | null,   // el del operario SI tiene uno solo; null si tiene
                                                                          // varios, y para admin y supervisor
  "vendedores": [{ "id": 2, "nombre": "FRANCO BAIGORRIA", "esCasa": false }],   // los que puede elegir (el operario: los suyos)
  "hoy": "2026-10-26", "mesEnCurso": "2026-10-01",
  "veBultos": false }   // false = solo Cobertura y la ficha: sin Volumen ni Devoluciones (ni sus pestañas)
```

`vendedores` viene ordenado por nombre, con la casa al final («Cuentas de la casa (Deposito)», `esCasa: true`, solo
admin). El front arma el menú con `rol`: operario → Cobertura y Mi ruta; supervisor suma Resumen; admin suma
Administración. Con `veBultos: false` (hoy, el operario) no se muestran Volumen ni Devoluciones.

### `GET /api/sincronizacion/estado`

```jsonc
{ "ultimaOk": "2026-10-26T05:00:12-03:00" | null,   // «Datos de Chess al 26/10/2026 05:00»
  "ventasHasta": "2026-10-26" | null }             // hasta qué día hay ventas cargadas
```

Si `ultimaOk` tiene más de 36 h, el front muestra el aviso de datos viejos.

### `GET /api/cobertura?vendedor=&dia=&unidad=&foco=&abc=&busqueda=&chip=&mesDesde=&mesHasta=`

Todos los parámetros son opcionales.

- `vendedor`: `idPersonal`. Sin él: todos los vendedores visibles **sin** la casa. La casa se ve eligiéndola. Para el
  operario siempre es él: otro → 403.
- `dia`: código de Chess (ver Convenciones). Filtra por los días de visita de la ruta del cliente.
- `unidad`: una de `/api/cobertura/unidades`. Filtra lo que cuenta como compra, no la cartera.
- `foco` (**solo Admin**): un `idFoco` de `/api/cobertura/focos`. Como `unidad`: cuenta como compra solo la de los
  artículos del foco («CCC Manteca» = clientes de la cartera que compraron alguna manteca), en todos los meses de la
  ventana. Se puede combinar con `unidad`. El `subtitulo` termina en «foco Manteca». 400 en `errors.foco` si no
  existe. Operario y supervisor → 403 «Los focos del mes son solo para administradores.» (queda registrado): un enlace
  con foco falla en vez de mostrar números sin el filtro. Igual en `/api/volumen` y `/api/devoluciones`.
- `abc` (**solo Admin**): `A`, `B` o `C` (ver Clientes A, B y C). Recorta la cartera de **cada mes** a los clientes de
  esa categoría en ese mes (agosto con la de agosto, noviembre con la de noviembre): KPIs, chips y `clientes` salen
  sobre esa cartera. El `subtitulo` termina en «, clientes A». Otra letra → 400 en `errors.abc`; mesHasta sin base
  (07/2026) → 400 en `errors.abc`; un mes del rango sin base queda con la cartera vacía. Operario y supervisor → 403
  «La categoría de clientes es solo para administradores.» (queda registrado). Igual en `/api/volumen` (con la
  categoría de `mes`) y `/api/devoluciones` (la de cada mes).
- `busqueda`: código exacto o parte de la razón social, sin mayúsculas ni tildes. Solo filtra `clientes`.
- `chip`: `todos` (por defecto) · `compraronMesActual` · `sinCompraMesActual` · `dejaronDeComprar`. Solo filtra
  `clientes`.

```jsonc
{ "titulo": "Todos los vendedores",                       // o el nombre del vendedor
  "subtitulo": "246 clientes, lunes, todas las unidades",
  "meses": ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],
  "kpis": [{ "mes": "2026-10-01", "clientesConCompra": 162, "clientesCartera": 246,
             "porcentaje": 65.9,                          // 0–100, un decimal; el front lo redondea
             "mesEnCurso": true, "corteAl": "2026-10-22" }],   // corteAl: hasta qué día hay ventas (solo el mes en curso)
  "chips": { "todos": 246, "compraronMesActual": 162, "sinCompraMesActual": 84, "dejaronDeComprar": 43 },
  "clientes": [{ "idCliente": 59003, "razonSocial": "GP BRIGIDO",
                 "ruta": "ELENA WHITE" | null, "vendedor": "FRANCO BAIGORRIA" | null,   // null: rutas sin vendedor (solo admin)
                 "idPersonal": 2 | null,                    // el vendedor (de la cartera de mesHasta), para colorear el mapa
                 "lat": -26.8123 | null, "lng": -65.2101 | null,   // null si Chess no tiene la ubicación
                 "meses": ["compro", "compro", "noCompro", "sinCompraAun"],   // uno por cada mes de `meses`
                 "dejoDeComprar": false,
                 "abc": "A" | "B" | "C" }] }   // solo admin, en mesHasta (ver Clientes A, B y C); al resto no le viaja
```

- **Cartera de cada mes** = los clientes que ese mes estaban en las rutas de los vendedores mirados, menos los
  excluidos. Cada mes con **su** cartera (una foto por mes), no la de hoy.
- **KPI del mes** = clientes de la cartera de ese mes que compraron ÷ cartera de ese mes.
- **`clientes`** = la cartera de `mesHasta`, ordenada por razón social. Un mes en el que el cliente no estaba en la
  cartera mirada sale `fueraDeCartera`.
- `titulo` y `subtitulo` son textos de referencia (la unidad va tal cual la nombra Chess): el front puede armar los
  suyos con `chips.todos`, el día y su nombre legible de la unidad, y es lo recomendado.
- `chips` y `kpis` no cambian con `chip` ni con `busqueda`. Los chips cuentan sobre la cartera de `mesHasta`:
  `compraronMesActual` / `sinCompraMesActual` = compró o no en `mesHasta`.
- **`dejoDeComprar`** (la marca roja de la fila): el último mes **cerrado** del rango quedó en `dejoDeComprar` y, si
  el mes en curso está en el rango, todavía no volvió a comprar. Nunca se marca por el mes en curso solo.

### `GET /api/cobertura/vendedores`

`[{ "id": 2, "nombre": "FRANCO BAIGORRIA", "esCasa": false }]`: lo mismo que `sesion.vendedores`.

### `GET /api/cobertura/unidades`

`["ATM", "COMIDAS CONGELADAS", "PAN RALLADO1", "PASTAS FRESCAS", "SIN UNIDAD DE NEGOCIO", "TAPAS"]`: las unidades de
negocio de los artículos, ordenadas, tal como las nombra Chess (agrupación «UNIDAD DE NEGOCIO»; sin el «124 - » de la
web vieja). Los artículos sin esa agrupación (dulce de leche, quesos, salsas) van a `SIN UNIDAD DE NEGOCIO`.

### `GET /api/cobertura/focos?mes=` · solo Admin

Los **focos de un mes** (Checho, 03/11/2026; por mes y solo Admin desde el 05/11), por nombre, para el filtro «Foco»
de Cobertura, Volumen y Devoluciones. `mes`: el mes en el que está parada la app; sin él, el en curso.
`[{ idFoco, mes: "2026-11-01", nombre, medida: "ccc" | "vol", meta: 80 | null, articulos: [{ idArticulo, descripcion }],
actualizadoPor, actualizado }]`.
Vacío si ese mes no tiene focos (el filtro no se muestra). Operario y supervisor → 403.

### `GET /api/clientes/{idCliente}?mesDesde=&mesHasta=`

Ficha del cliente («CCC x bulto»). 404 si no existe o, para operario y supervisor, si nunca estuvo en su cartera
(ver Gobernanza).

```jsonc
{ "idCliente": 59003, "razonSocial": "GP BRIGIDO",
  "abc": "A" | "B" | "C",                                 // solo admin, en mesHasta; al resto no le viaja
  "enCartera": true,                                      // está en la cartera de quien mira este mes (admin: en alguna)
  "ruta": "ELENA WHITE" | null, "vendedor": "FRANCO BAIGORRIA" | null,   // null: sin ruta o sin vendedor (solo admin)
  "diasVisita": "Lunes y jueves",                         // "Sin día de visita" si la ruta no tiene
  "direccion": "AV. BRIGIDO TERAN 1234, SAN MIGUEL DE TUCUMAN" | null,
  "lat": -26.8123 | null, "lng": -65.2101 | null,         // null si Chess no tiene la ubicación
  "ultimaCompra": "2026-10-20" | null, "diasSinComprar": 6 | null,
  "meses": ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],
  "estados": ["fueraDeCartera", "compro", "compro", "compro"],   // el EstadoMes del cliente en cada mes (para la cabecera)
  "bultos": [null, 14, 9.5, 6],                           // bultos netos del mes; null = fuera de tu cartera
  "articulos": [{ "idArticulo": 101, "descripcion": "TALLARIN AL HUEVO 500G", "unidadNegocio": "PASTAS FRESCAS",
                  "meses": [false, true, false, true],    // compró ese mes
                  "bultos": [null, 4, 0, 2] }] }          // bultos netos; null = fuera de tu cartera
```

- `articulos`: los que compró al menos una vez en el rango, ordenados por unidad de negocio y descripción.
  `unidadNegocio` como en `/api/cobertura/unidades` (sin el «124 - »).
- **Operario y supervisor** (Gobernanza): los meses que no eran de su cartera salen `fueraDeCartera`, con `bultos`
  null y `meses` false en cada artículo; un artículo que solo compró en esos meses no viene. `ultimaCompra` y
  `diasSinComprar` salen solo de sus meses (null si ahí no compró). `ruta`, `vendedor` y `diasVisita` son los del
  último mes en que el cliente fue suyo (nunca el vendedor de otro); `enCartera: false` si hoy ya no lo es.
- **Admin**: todo. `ultimaCompra` es la de cualquier fecha, no solo la del rango; `bultos` siempre con número.
- Bultos: ver Volumen.

### `GET /api/clientes/{idCliente}/volumen?mes=`

La pestaña Volumen de la ficha: por artículo, lo que lleva del mes contra la base (la misma comparación que
`/api/volumen`, según el rol). 404 como la ficha.

```jsonc
{ "comparacion": { /* como en /api/volumen */ },
  "total": { "bultosActual": 12, "bultosBase": 15 | null, "bultosEsperado": 11.5 | null, "porcentaje": 80.0 | null },
  "articulos": [{ "idArticulo": 101, "descripcion": "TALLARIN AL HUEVO 500G", "unidadNegocio": "PASTAS FRESCAS",
                  "bultosActual": 2 | null, "bultosBase": 4 | null, "porcentaje": 50.0 | null }] }
```

Artículos con bultos en el mes o en la base, por unidad de negocio y descripción. Para operario y supervisor,
`bultosBase` o `bultosActual` (de cada artículo y del total) en null si ese período el cliente no era suyo. La marca
de bajó o subió de cada artículo es la misma referencia que la sección: el ritmo para el operario en un mes abierto,
la base para los demás.

### `GET /api/clientes/{idCliente}/devoluciones?mesDesde=&mesHasta=&mes=`

La pestaña Devoluciones de la ficha. `mes` (por defecto `mesHasta`) elige el mes del detalle por artículo. 404 como
la ficha.

```jsonc
{ "meses": ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],
  "kpis": [{ "mes": "2026-10-01", "bultosVendidos": 20 | null, "bultosDevueltos": 2 | null, "porcentaje": 9.1 | null,
             "mesEnCurso": true, "corteAl": "2026-10-28" | null }],   // null = fuera de tu cartera
  "mes": "2026-10-01",
  "articulos": [{ "idArticulo": 101, "descripcion": "…", "unidadNegocio": "PASTAS FRESCAS",
                  "bultosVendidos": 4, "bultosDevueltos": 1, "porcentaje": 20.0 }] }   // con devoluciones en `mes`
```

### `GET /api/clientes/{idCliente}/movimientos?mes=&unidad=&foco=`

La historia del mes de un cliente, comprobante por comprobante (Cesar, 10/11/2026: la ventanita al pasar el mouse en
Devoluciones). `mes`: por defecto el en curso. `unidad` y `foco` filtran las líneas como en `/api/devoluciones` (foco,
solo admin); la categoría `abc` es del cliente y no cambia nada acá.

```jsonc
{ "idCliente": 967, "razonSocial": "POLIRUBRO LAS MARÍAS 46", "mes": "2026-11-01",
  "movimientos": [                                        // por fecha y número, del más viejo al más nuevo
    { "fecha": "2026-11-03", "tipo": "factura" | "notaCredito", "comprobante": "A 0001-00001234",
      "vendedor": "ALEJANDRO LIZARRAGA" | null,           // el del comprobante (null: ver abajo)
      "entregados": 2.5, "devueltos": 1,
      "lineas": [{ "idArticulo": 201, "descripcion": "TAPAS DE EMPANADA FREIR X12", "unidadNegocio": "TAPAS" | null,
                   "entregados": 2.5, "devueltos": 1 }] }] }   // por unidad y descripción
```

- Comprobantes y bultos con la regla de Devoluciones: FACTURA y FACTURA CIERRE CONSIG. no anuladas y NOTA DE CREDITO
  (la FACTURA PRESUPUESTO no va). Factura: `entregados` = sus líneas positivas, `devueltos` = las negativas. Nota de
  crédito: `entregados` 0, `devueltos` = lo acreditado. Del mes: Σ `entregados` − Σ `devueltos` = `bultosVendidos` del
  cliente en `/api/devoluciones` y Σ `devueltos` = `bultosDevueltos`. Sin importes.
- Gobernanza como la ficha: el operario que no ve bultos → 403. Operario y supervisor, solo un mes en que el cliente
  era de su cartera (si no, 404 «No existe el cliente o no tenés acceso.», registrado), y `vendedor` en null si el
  comprobante es de un vendedor que no es suyo. Mes futuro o fuera de su ventana → 400 en `errors.mes`.

### `GET /api/ruta-hoy?vendedor=&fecha=`

Los clientes del día de visita de `fecha` (por defecto hoy). `vendedor` como en `/cobertura`: el operario, siempre él;
admin y supervisor pueden no mandarlo (todos los visibles sin la casa) o elegir uno.

```jsonc
[{ "idCliente": 59003, "razonSocial": "GP BRIGIDO", "ruta": "ELENA WHITE",
   "direccion": "AV. BRIGIDO TERAN 1234, SAN MIGUEL DE TUCUMAN" | null, "lat": -26.81 | null, "lng": -65.21 | null,
   "estadoMesActual": "sinCompraAun", "dejoDeComprar": true, "ultimaCompra": "2026-08-14" | null }]
```

Orden: primero los que marcan `dejoDeComprar`, después `sinCompraAun`, después el resto; dentro de cada grupo, por el
orden de visita de la ruta en Chess.

### Bultos (Volumen, Devoluciones y la ficha)

- Volumen **en bultos** (Cesar, 29/10): ni kilos ni pesos, para ningún rol. Un bulto es la cantidad de Chess
  (`cantidadesTotal`), con hasta 2 decimales.
- **Netos**: FACTURA y FACTURA CIERRE CONSIG. menos NOTA DE CREDITO, la misma regla que «compró» (un cliente que
  compró un artículo tiene bultos > 0 de ese artículo).
- ⚠️ Pendiente de confirmar con los datos: que `cantidadesTotal` venga en bultos y no en unidades, y si la FACTURA
  PRESUPUESTO suma volumen. Si cambia, cambian los números, no la forma.

### `GET /api/volumen?vendedor=&dia=&unidad=&foco=&abc=&busqueda=&chip=&mes=&comparacion=` · todos los roles

Cuántos bultos lleva cada cliente en el mes contra una base. `vendedor`, `dia`, `unidad` y `busqueda` como en
`/api/cobertura` (la unidad y el foco filtran los artículos que suman). `mes`: por defecto el mes en curso; el primer mes con
datos (2026-07-01) no tiene base → 400 (`errors.mes`).

```jsonc
{ "titulo": "Todos los vendedores",                       // como en /cobertura
  "comparacion": { "tipo": "mismoDiaHabil" | "mesAnteriorCompleto",
                   "mes": "2026-10-01", "mesBase": "2026-09-01",
                   "corteAl": "2026-10-28" | null,        // último día COMPLETO con ventas (null: todavía ninguno del mes)
                   "diaHabil": 23, "diasHabilesMes": 26,
                   "baseHasta": "2026-09-26" | null },    // hasta qué día suma la base
  "total": { "bultosActual": 820, "bultosBase": 1000, "bultosEsperado": 884.6, "porcentaje": 82.0 },
  "chips": { "todos": 246, "sinCompraAun": 40, "nuevos": 6, "bajaron": 80, "subieron": 120 },
  "clientes": [{ "idCliente": 59003, "razonSocial": "GP BRIGIDO", "ruta": "ELENA WHITE" | null,
                 "vendedor": "FRANCO BAIGORRIA" | null, "idPersonal": 2 | null,
                 "bultosActual": 12, "bultosBase": 15 | null, "porcentaje": 80.0 | null,
                 "abc": "A" | "B" | "C" }],               // solo admin
  "abc": [{ "grupo": "A", "clientes": 207, "conCompra": 170, "porcentaje": 82.1 },   // solo admin: A, B y C
          { "grupo": "B", … }, { "grupo": "C", … }] }
```

- **Clientes** = la cartera de `mes` (como Cobertura), por razón social. `bultosActual` = del 1 del mes a `corteAl`.
- **Base según el rol** (Cesar, 29/10):
  - operario → `mesAnteriorCompleto`: el mes anterior entero, como meta («llevás 820 de los 1.000 bultos de
    septiembre, 82%»). `baseHasta` = el último día del mes anterior.
  - admin y supervisor → `mismoDiaHabil`: el mes anterior hasta su día hábil número `diaHabil`; `baseHasta` = ese día.
  - **`comparacion`** (Cesar, 10/11: la Comparativa de la pantalla), solo admin y supervisor: `parcial` (por defecto)
    = `mismoDiaHabil`; `acumulado` = `mesAnteriorCompleto`, el mes anterior entero con `bultosEsperado` al ritmo,
    como el operario. Sin distinguir mayúsculas. Otro valor → 400 en `errors.comparacion`. El operario lo puede
    mandar, pero se ignora. Los chips y el porcentaje de cada cliente salen contra la base elegida.
  - Si `mes` ya cerró, todos comparan el mes entero contra el anterior entero (`tipo` = `mesAnteriorCompleto`), con
    cualquier `comparacion`.
- **Día hábil**: lunes a sábado, sin feriados nacionales ni el 24/9 (Batalla de Tucumán, feriado provincial). La
  lista vive en la configuración (`Comercial:Feriados`). `diaHabil` = días hábiles del 1 a `corteAl`;
  `diasHabilesMes` = los de todo el mes.
- **`corteAl`** no cuenta el día de hoy: la sincronización corre a las 05:00 y comparar medio día contra un día entero
  daría una baja falsa. Por eso puede ser un día antes que el `corteAl` de Cobertura.
- **`bultosBase`**: para operario y supervisor, null si ese cliente no era de su cartera en el mes base («nuevo en
  tu cartera»): nunca van los bultos del vendedor anterior. Para el admin, siempre número (0 si no compró).
- `bultosEsperado` = lo que debería llevar a esta altura: con `mismoDiaHabil`, la base; con `mesAnteriorCompleto`,
  la base × `diaHabil` / `diasHabilesMes` (el ritmo). Null si no hay base.
- `porcentaje` = `bultosActual / bultosBase` × 100, un decimal; null si la base es null o 0.
- `total` suma las filas sin mirar `chip` ni `busqueda` (la base, las que no son null). Los clientes que salieron de
  la cartera no cuentan.
- **Chips**: cada cliente cae en uno solo, así que suman `todos`. `chip` filtra solo `clientes`.

  | Chip | Cuándo |
  |---|---|
  | `sinCompraAun` | `bultosActual` ≤ 0 |
  | `nuevos` | compró y `bultosBase` es null |
  | `bajaron` | compró menos que su esperado (la base al mismo día hábil, o el ritmo del mes anterior para el operario) |
  | `subieron` | compró su esperado o más |

- **`abc`** (solo admin): cuántos clientes de cada grupo hay en la cartera de `mes` con los filtros (vendedor, día,
  unidad, foco; no `busqueda` ni `chip`) y cuántos compraron en el mes, con la regla de «compró» de Cobertura (en el
  mes en curso, las ventas cargadas, como el KPI de Cobertura). `porcentaje` = `conCompra / clientes` × 100, un
  decimal (0 si el grupo no tiene clientes). Siempre los tres grupos, en orden.

### Clientes A, B y C · solo admin

Cesar, 10/11/2026, como el Grupo ABC de De Ruta. Es del cliente, no del vendedor: la misma para toda la base, sin
mirar filtros, y cambia de un mes al otro.
- Bultos netos de cada cliente (la regla de Volumen) en los **3 meses cerrados anteriores** al que se mira (en
  noviembre: agosto, septiembre y octubre; recortados al primer mes con datos). Los excluidos no entran.
- De mayor a menor, acumulando el % del total: **A** hasta el 80 %, **B** hasta el 95 %, **C** el resto, los que no
  compraron y los de neto ≤ 0. El que cruza un corte queda en el grupo donde empieza. Empates: por `idCliente`.
- Viaja como `abc` en los clientes de `/api/cobertura` (en mesHasta), de `/api/volumen` (en `mes`) y en la ficha (en
  mesHasta), y como el bloque `abc` de `/api/volumen`. **Operario y supervisor no la ven nunca**: el campo no está (no
  viene en null). En el primer mes con datos (07/2026) no hay base y tampoco viaja.
- Filtro **`abc=A|B|C`** en Cobertura, Volumen y Devoluciones (ver `/api/cobertura`).

### `GET /api/devoluciones?vendedor=&dia=&unidad=&foco=&abc=&mesDesde=&mesHasta=` · todos los roles

Parámetros como en `/api/cobertura`.

```jsonc
{ "titulo": "Todos los vendedores",
  "meses": ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],
  "kpis": [{ "mes": "2026-10-01", "bultosVendidos": 9000, "bultosDevueltos": 410, "porcentaje": 4.4,
             "mesEnCurso": true, "corteAl": "2026-10-28" | null }],   // corteAl como en /cobertura
  "mes": "2026-10-01",                                    // = mesHasta: el mes de `clientes` y `articulos`
  "clientes": [{ "idCliente": 59003, "razonSocial": "GP BRIGIDO", "ruta": "…" | null, "vendedor": "…" | null,
                 "idPersonal": 2 | null, "bultosVendidos": 20, "bultosDevueltos": 5, "porcentaje": 20.0 }],
  "articulos": [{ "idArticulo": 101, "descripcion": "…", "unidadNegocio": "PASTAS FRESCAS",
                  "bultosVendidos": 300, "bultosDevueltos": 25, "porcentaje": 7.7 }] }
```

- KPI de cada mes con la cartera de ese mes (como Cobertura).
- `clientes`: los de la cartera de `mes` con alguna devolución ese mes, de mayor a menor porcentaje (primero los de
  porcentaje null: devolvieron sin que se les facturara nada ese mes).
- `articulos`: los que tuvieron devoluciones en `mes` dentro de esa cartera, de más a menos bultos devueltos.
- **Fórmula** (la de la nota): `porcentaje = devueltos / (vendidos + devueltos)` × 100, un decimal; null si los dos
  son 0.
- **Qué es devolución** (29/10, con los datos de julio a octubre; la confirma Cesar con Madomi):
  - las **líneas con cantidad negativa dentro de las FACTURA**: la mercadería que el vendedor retira en la misma
    factura (el front sospecha que son sobre todo pizzas). Son entre 1.449 y 2.156 líneas por mes, el 8–11 % de las
    líneas de factura;
  - más las **NOTA DE CREDITO** (unas 250 líneas por mes; 1,4–4,4 % de lo facturado).
  - El «rechazo» de Chess (`cantidadesRechazo`) es lo mismo que la nota de crédito (da igual todos los meses): no se
    suma aparte. DEVOLUCION PRESUPUESTO (casi nada) va con la FACTURA PRESUPUESTO, que todavía no suma.
  - `bultosVendidos` = los netos de Volumen (lo entregado menos lo devuelto), así `vendidos + devueltos` = lo
    entregado. Que las líneas negativas cuenten como devolución no cambia el volumen, solo el porcentaje; se apaga con
    `Comercial:NegativasSonDevolucion = false`.

### `GET /api/resumen?mesDesde=&mesHasta=` · admin y supervisor

```jsonc
[{ "idPersonal": 2, "vendedor": "FRANCO BAIGORRIA", "esCasa": false,
   "kpis": [ /* como en /cobertura, con la cartera de ese vendedor */ ],
   "dejaronDeComprar": 12,   // clientes con la marca, como en /cobertura
   "altas": 3, "bajas": 1 }] // clientes que entraron / salieron de su cartera de mesHasta contra el mes anterior
```

Una fila por vendedor visible, por nombre. La casa va al final (`esCasa: true`, solo admin). Operario → 403.

### Administración · solo admin

**Accesos** (supervisores y operarios; los admin salen del permiso de la plataforma):

```jsonc
// GET /api/admin/usuarios
[{ "idAcceso": 7, "email": "franco@madomi", "nombre": "Franco" | null,
   "rol": "supervisor" | "operario",
   "idsPersonal": [2, 9],           // los vendedores que ve: el operario los suyos (uno o varios), el supervisor su equipo
   "activo": true,
   "entro": true,                   // false = esa persona todavía no entró nunca
   "ultimoIngreso": "2026-10-26T09:12:00-03:00" | null,
   "actualizadoPor": "cesar@vignoli", "actualizado": "…", "version": "…" }]
```

- **Operario con 1 a N vendedores** (pedido del usuario, 29/10/2026): si Chess le cambia el nombre a un vendedor, lo da
  de alta con otro `idPersonal`; el acceso del operario puede tener los dos y ve la **unión** de sus clientes. En
  `/api/cobertura` sin `vendedor`, el operario ve todos los suyos y el `titulo` son sus nombres (`"UNO / UNO BIS"`).
  `idPersonal` ya no existe en los accesos: va todo en `idsPersonal`.
- `POST /api/admin/usuarios` → el acceso (201). Body: `{ email, nombre?, rol, idsPersonal }`.
- `PUT /api/admin/usuarios/{idAcceso}` → el acceso. Mismo body + `activo` + `version`.
- No se borra: `activo: false`. Corta el acceso en el próximo request de esa persona.
- `version` es un texto opaco: la manda el GET, el PUT la exige (400 si falta) y responde 409 si otro guardó en el
  medio. Que la persona entre **no** la cambia.
- Al guardar, el acceso se enlaza a la cuenta de la plataforma cuyo usuario es el email, si existe (si no, queda
  pendiente). Uno ya enlazado conserva su cuenta mientras no le cambien el email. 400 en `errors.email` «Esa cuenta ya
  tiene otro acceso.». `entro` = la persona ya entró alguna vez (sale del registro de accesos). `enlazado` = el acceso
  ya está atado a una cuenta (false = pendiente: no deja entrar a nadie hasta que se guarde con la cuenta creada).
- Validaciones (400 por campo): `email` (o usuario) sin espacios, 2–200, se guarda en minúsculas, único entre los
  accesos (`errors.email`); `nombre` ≤ 100;
  `rol` `supervisor` u `operario`; `idsPersonal` con al menos uno, todos vendedores que sean personas (no la casa:
  la ve solo el admin), en `errors.idsPersonal`.
- `GET /api/admin/vendedores` → `[{ id, nombre, activo, esCasa }]`: **todos** los vendedores de Chess, también los
  dados de baja (para enlazar el viejo y el nuevo). Personas activas por nombre, después las dadas de baja, la casa al
  final.

**Cuentas de la plataforma** (30/10/2026, con la API de cuentas de la central, script 034): el admin ve las cuentas de
Madomi y da de alta a un vendedor o supervisor en un paso. La API reenvía a la plataforma el token de quien entra
(nunca uno de servicio): la plataforma decide con sus permisos (`cuentas.administrar`, que tiene el «Administrador
comercial») y solo dentro de Madomi. Editar, dar de baja o cambiar la clave de una cuenta todavía no existen (pasan por
Vignoli); editar el acceso sigue siendo `PUT /api/admin/usuarios/{idAcceso}`.

```jsonc
// GET /api/admin/cuentas → por nombre
[{ "idUsuario": "uuid" | null,        // null: acceso por email de alguien que todavía no tiene cuenta en la plataforma
   "usuario": "franco@madomi", "nombre": "Franco" | null,
   "cuentaActiva": true,              // false también para los accesos sin cuenta
   "ultimoIngreso": "2026-10-30T09:12:00-03:00" | null,   // último login en la plataforma
   "rol": "admin" | "supervisor" | "operario" | null,     // admin = rol «Administrador comercial» de la plataforma;
                                                          // si no, el de su acceso; null = no entra a esta app
   "idAcceso": 7 | null, "idsPersonal": [2], "accesoActivo": true, "version": "3" | null,   // los de su acceso
   "federada": false }]               // entra con su usuario de De Ruta: no tiene clave en la plataforma
```

- Cada cuenta va con su acceso: el enlazado a ella o, si no, el pendiente con su usuario/email. `accesoEnlazado`
  = el acceso está atado a esa cuenta; false con `idAcceso` = pendiente (la persona recibe 403 hasta que el Admin
  guarde el acceso de nuevo con `PUT /api/admin/usuarios/{idAcceso}`); también false si no hay acceso o no hay cuenta.
- `POST /api/admin/cuentas` `{ usuario, nombre, password, rol: "operario" | "supervisor", idsPersonal }` → 201 con la
  fila como en el GET. Crea la cuenta con el rol «Comercial» de la plataforma y el acceso con el rol y los vendedores
  pedidos, ya enlazado a la cuenta nueva. Valida primero lo de esta app (usuario sin acceso, rol,
  vendedores) para no dejar una cuenta suelta. 400 en `errors.usuario` (también «Ya existe una cuenta con ese
  usuario.»), `errors.nombre`, `errors.password` (mínimo 8, máximo 64), `errors.rol`, `errors.idsPersonal`; 403 con
  `title` si la plataforma no lo permite.
- Sin la plataforma (en desarrollo no corre: `Plataforma:Url` vacío o sin token) → **404**, y el front muestra los
  accesos de `/api/admin/usuarios`.

**Clientes excluidos** (no cuentan en ninguna cartera):

- `GET /api/admin/exclusiones` → `[{ idCliente, razonSocial, motivo, creadoPor, creadoEn }]`.
- `POST /api/admin/exclusiones` `{ idCliente, motivo }` → 201. 400 si el cliente no existe (`errors.idCliente`), ya
  está excluido, o falta el motivo (≤ 200).
- `DELETE /api/admin/exclusiones/{idCliente}` → 204 (vuelve a contar). 404 si no estaba excluido.
- **La base de clientes** para excluir o volver a incluir (pedido del usuario, 29/10/2026): los que manda Chess y los
  que están en una ruta vigente, con el vendedor de su ruta de hoy. Sin ruta o con una ruta sin vendedor: «sin
  vendedor».
  - `GET /api/admin/clientes/resumen` → `[{ idPersonal | null, vendedor | null, esCasa, clientes, excluidos,
    sugeridos, vitales }]`: un grupo por vendedor, por nombre; la casa al final y «sin vendedor» (`idPersonal: null`) último.
    `sugeridos` = cuántos tienen la sugerencia `excluir`.
  - `GET /api/admin/clientes?vendedor=&texto=&excluidos=&sugerencia=&vitales=&pagina=1&tamano=50` →
    ```jsonc
    { "pagina": 1, "tamano": 50, "total": 1315,
      "meses": ["2026-07-01", "2026-08-01", "2026-09-01", "2026-10-01"],   // los mismos 4 meses que /cobertura
      "filas": [{ "idCliente": 201, "razonSocial": "…", "ruta": "…" | null, "idPersonal": 2 | null, "vendedor": "…" | null,
                  "localidad": "…" | null, "ultimaCompra": "2026-08-10" | null, "diasSinComprar": 77 | null,
                  "estados": ["fueraDeCartera", "compro", "dejoDeComprar", "sinCompraAun"],   // uno por mes, EstadoMes
                  "sugerencia": "excluir" | "revisar" | null, "motivoSugerencia": "Dejó de comprar en septiembre" | null,
                  "excluido": false, "motivo": null, "excluidoPor": null, "excluidoEn": null,
                  "vital": true, "vitalPor": "checho@madomi" | null, "vitalEn": "…" | null }] }
    ```
    `vendedor` = `idPersonal`, o `sin` para «sin vendedor»; `excluidos` y `vitales` = `todos` (por defecto), `solo` o `sin`;
    `sugerencia` = `excluir` o `revisar` (la pestaña «Sugeridos para excluir»); `texto` = código exacto o parte de la
    razón social (sin mayúsculas ni tildes); sin `texto` trae todos. Por razón social. `tamano` hasta 200. Errores en
    `errors.vendedor`, `errors.excluidos`, `errors.vitales`, `errors.sugerencia`, `errors.pagina`, `errors.tamano`. Reemplaza al buscador
    de hasta 20 que había antes.
  - `estados`: la regla de Cobertura con la cartera de **toda la empresa** (sin mirar exclusiones: un excluido igual
    muestra cómo viene). `diasSinComprar`: desde la última compra; null si nunca compró.
  - **Sugerencia** (regla de negocio del backend, pedido del usuario del 29/10; umbrales en
    `Comercial:DiasSugerirExcluir` = 90 y `Comercial:DiasSugerirRevisar` = 60). Solo sugiere: excluir lo decide el admin.
    | Sugerencia | Cuándo | `motivoSugerencia` |
    |---|---|---|
    | `excluir` | no compra hace 90 días o más | «No compra hace 4 meses» |
    | `excluir` | nunca compró y está en la cartera hace 90 días o más | «Nunca compró desde julio» |
    | `revisar` | dejó de comprar el último mes cerrado (y no volvió) | «Dejó de comprar en septiembre» |
    | `revisar` | no compra hace 60 a 89 días | «No compra hace 70 días» |
    | `null` | ya excluido, compra seguido, o es nuevo en la cartera y todavía no compró | — |
- **Clasificación de clientes: Vital** (Cesar, 30/10/2026). El admin marca un cliente como Vital con un click, sobre la
  misma base de clientes (`/api/admin/clientes`, filtro `vitales`). Por ahora es solo una marca para el admin: no cambia
  la cobertura ni ningún cálculo, y el vendedor no la ve (se decide más adelante).
  - `PUT /api/admin/clientes/{idCliente}/vital` → 200 `{ idCliente, razonSocial, marcadoPor, marcadoEn }`. Si ya era
    Vital, devuelve la marca que tenía (un segundo click no cambia nada). 404 si el cliente no existe.
  - `DELETE /api/admin/clientes/{idCliente}/vital` → 204, aunque no fuera Vital.

**Focos del mes** (Checho, 03/11/2026: «bloquear y desbloquear qué productos se pueden filtrar»; Cesar, 05/11: «cada
mes serán focos distintos», y solo los ve el Admin). Un foco es un grupo de artículos con nombre que pertenece a un mes:
«Manteca» = MANTECA MADOMI X100G + X200G, «Dulce de leche» = 200G + 380G, «Tacos» = MASA PARA TACOS. El mismo
«Manteca» en octubre y en noviembre son dos focos.

- `GET /api/admin/focos` → los de todos los meses, por mes descendente y nombre (mismo formato que
  `/api/cobertura/focos`). El front los agrupa por mes.
- `POST /api/admin/focos` `{ mes: "2026-11-01", nombre, idsArticulo: [..], medida?, meta? }` → 201 con el foco.
  «Copiar los del mes anterior» = un POST por foco (con su medida y su meta).
  - `medida` (los objetivos de Checho: «CCC MANTECA», «VOL TAPAS»): `"ccc"` (por defecto) = qué parte de la cartera lo
    compró; `"vol"` = los bultos contra el mes anterior al mismo día hábil.
  - `meta`: opcional (null = sin meta), siempre un porcentaje con hasta un decimal. ccc: de la cartera, 1–100. vol:
    contra el mes anterior, 1–999 (100 = igualarlo, 110 = crecer 10 %).
- `PUT /api/admin/focos/{idFoco}` mismo body → el foco (reemplaza todo). 404 si no existe.
- `DELETE /api/admin/focos/{idFoco}` → 204; 404 si no existe.
- 400: `errors.mes` (obligatorio, día 1, desde el primer mes con datos hasta el mes que viene, para dejarlo armado),
  `errors.nombre` (1–60, único en el mes: «Ya hay un foco con ese nombre en ese mes.»), `errors.idsArticulo` (entre 1
  y 50, todos existentes), `errors.medida` (otra cosa que ccc o vol), `errors.meta` (fuera de rango).
- `GET /api/admin/focos/analisis?mes=` (sin mes: el en curso) → cómo vienen vendiendo los focos de ese mes, por
  vendedor: el número de Checho («CCC Manteca»).

```jsonc
{ "mes": "2026-11-01", "mesEnCurso": true,
  "corteAl": "2026-11-04" | null,        // mes en curso: ventas hasta (como los KPI de cobertura); cerrado: null
  "mesAnterior": "2026-10-01",
  "anteriorAl": "2026-10-04" | null,     // mes en curso: el mismo día del anterior (recortado a fin de mes); cerrado: null
  "volumen": { "corteAl", "baseHasta", "diaHabil", "diasHabilesMes" } | null,   // la comparación de los vol (abajo)
  "focos": [{ "idFoco": 2, "nombre": "Ravioles", "medida": "ccc", "meta": 80 | null,
    "total": { "clientesConCompra": 120, "clientesCartera": 246, "porcentaje": 48.8, "porcentajeAnterior": 51.2 | null,
               "bultosActual": null, "bultosBase": null },
    "vendedores": [{ "idPersonal": 2, "nombre": "FRANCO BAIGORRIA", "clientesConCompra": 30, "clientesCartera": 60,
                     "porcentaje": 50.0, "porcentajeAnterior": 47.1 | null, "bultosActual": null, "bultosBase": null }] }] }
// focos y vendedores por nombre
```

  - **vol**: `bultosActual` y `bultosBase` = los bultos netos de la cartera (la del total o la del vendedor) con la
    regla de `/api/volumen?foco=` mirada por el admin; `porcentaje` = actual ÷ base × 100 con un decimal, null si la
    base es 0; `porcentajeAnterior` null; `clientesConCompra` y `clientesCartera` vienen igual. `volumen` es la
    `comparacion` de `/api/volumen` del admin: mismo día hábil en el mes en curso, mes anterior completo en uno
    cerrado; null en el primer mes con datos (y ahí los vol traen porcentaje y bultos en null).
  - **ccc**: lo que sigue; `bultosActual` y `bultosBase` en null.

  - `porcentaje` = clientes de la cartera del vendedor en ese mes (la foto del mes, sin excluidos) que compraron algún
    artículo del foco ÷ esa cartera, con la misma regla de «compró» que `/api/cobertura?foco=`. `total` = «Todos los
    vendedores», sin la casa. `vendedores` = las personas con cartera ese mes.
  - `porcentajeAnterior` = los mismos artículos en el mes anterior, con su cartera: en el mes en curso, con compras
    hasta `anteriorAl` (facturas menos notas de crédito por cliente × artículo hasta ese día); en uno cerrado, el mes
    completo. null si no hay mes anterior con datos o el vendedor no tenía cartera.
  - Un mes futuro o anterior al primero con datos → 400 en `errors.mes`.
- `GET /api/admin/articulos` → para elegir: `[{ idArticulo, descripcion, unidadNegocio, division, anulado,
  clientesMesAnterior }]`. Los no anulados primero, agrupados por `division` (la agrupación «DIVISION» de Chess: DULCE
  DE LECHE, TACOS, RAVIOLES ATM…; null = sin división, como la manteca y el pionono) y por descripción.
  `clientesMesAnterior` = clientes que lo compraron el mes pasado.

**Sincronización con Chess:**

```jsonc
// GET /api/admin/sincronizaciones?cantidad=30
{ "pendiente": { "solicitadoPor": "cesar@vignoli", "solicitadoEn": "…" } | null,   // un «Actualizar ahora» sin tomar
  "pasos": [{ "idCorrida": "uuid", "inicio": "…", "fin": "…" | null, "endpoint": "ventas/",
              "desde": "2026-10-01" | null, "hasta": "2026-10-26" | null,
              "registros": 2097, "ok": true, "error": null }] }   // del más nuevo al más viejo
```

- `POST /api/admin/sincronizaciones` → 202 `{ solicitadoEn }`: pide una corrida ya (la toma el proceso de
  sincronización en menos de un minuto). 409 si ya hay una pedida sin tomar, o si la última se pidió hace menos de
  10 minutos (`Comercial:EsperaSincronizacionMinutos`): el `title` dice desde qué hora se puede pedir otra.

## Estado

- 26/10: contrato v1 cerrado por el backend y **API hecha**: todos los endpoints de este archivo, con 86 pruebas
  (seguridad y alcance, cálculos de cobertura, Chess, sincronización). Corre en `http://localhost:5030` (ver
  `Backend/README.md`). **Todavía sin datos de Chess**: falta cargar las credenciales y correr la carga inicial.
- 29/10: **publicada** en `https://analistascomercial.vignoliyasconsultoria.com` con datos reales de Chess (ver
  `Despliegue/DESPLIEGUE.md`). Clientes con compra iguales a la Base CCC en julio y septiembre, +1 en agosto.
- 29/10: **fase 2** (pedido del dueño por el front): Gobernanza de datos, bultos en la ficha, `/api/volumen`,
  `/api/devoluciones` y las pestañas `/api/clientes/{id}/volumen` y `/devoluciones`. **API hecha en local** con sus
  pruebas (gobernanza, volumen, devoluciones). Guarda además `cantidadesSinCargo` de cada línea y `unidadesBulto` de
  cada artículo, para confirmar con los datos qué mide la cantidad y qué es una devolución; los meses ya cargados se
  completan con `--recargar-ventas`. Sin publicar.
- 30/10: operario con totales solo en porcentaje (`a35b943`) y **ventana de 4 meses** para operario y supervisor (ver
  Gobernanza). Salen en la 1.1.
- 04/11: **focos del mes** (pedido de Checho): `foco` en Cobertura, Volumen y Devoluciones, `/api/cobertura/focos`,
  `/api/admin/focos` y `/api/admin/articulos` (con la DIVISION de Chess). Migración `FocosDelMes`.
- 05/11: focos **por mes** (se va `activo`), **solo para el Admin** (403 al resto, también con `foco=`) y el
  **análisis del mes por vendedor** (`/api/admin/focos/analisis`). Como no estaba publicada, se rehízo la migración
  `FocosDelMes` en vez de sumar otra. Sale en la 1.3.
- 05/11: cada foco dice qué mide (`medida`: ccc o vol) y su `meta` opcional; el análisis trae los vol con bultos y el
  bloque `volumen`. Otra vez dentro de la migración `FocosDelMes` (sin publicar).
- 10/11: **clientes A, B y C**, solo para el Admin: `abc` en los clientes de Cobertura, Volumen y la ficha, y la
  cobertura por grupo en `/api/volumen`. Sin cambios en la base. Sale en la 1.3.
- 10/11: filtro **`abc`** (categoría de cliente, solo Admin) en Cobertura, Volumen y Devoluciones.
- 10/11: **`comparacion=parcial|acumulado`** en `/api/volumen` para admin y supervisor (la Comparativa).
- 10/11: **`/api/clientes/{id}/movimientos`**: los comprobantes del mes de un cliente (la ventanita de Devoluciones).
- 04/11: **revisión de seguridad** (CHATBOT.md): empresa en las políticas, `/api/admin` exige Admin en la política,
  chatbot solo lectura, freno de 240 pedidos por minuto (429), el acceso se enlaza al guardarlo y no al entrar, espera
  de 10 minutos entre «Actualizar ahora», y el registro guarda canal y empresa (también los rechazos de autorización).
- 30/10: **clientes Vitales** (`PUT`/`DELETE /api/admin/clientes/{id}/vital`, `vital` en la base de clientes, filtro
  `vitales`, `vitales` en el resumen). Migración `ClientesVitales` (una tabla nueva). Publicado como 1.1.
- 30/10: **el operario ve solo Cobertura y la ficha** (`sesion.veBultos`; Volumen y Devoluciones → 403). Sale en la 1.2.
- 26/10: regla de «compró» y unidad de negocio fijadas con diag_ccc. `GET /api/cobertura` suma `idPersonal`, `lat` y
  `lng` (vista de mapa). Los datos reales se bajan con `Backend/sincronizar.bat`.
