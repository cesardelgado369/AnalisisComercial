# Análisis Comercial (front) — Vignoli Consultora

Front de **Análisis Comercial** de **Madomi Pastas**: qué clientes compraron, por mes y por artículo, con acceso por rol
(Checho admin; los vendedores, operarios, sobre todo desde el celular; supervisor previsto). Reemplaza a la web
«Cobertura de clientes». Arrancado el 26/10/2026.

React + TypeScript + Vite + react-router-dom, **copiando la estructura de De Ruta** (`LogisticaRutas/Frontend/admin`):
cabecera, lateral, login, modales, cargas, animaciones y perfil, con **paleta violeta**. Fuente Plus Jakarta Sans,
íconos Material Symbols.

```bash
npm install
npm run dev        # http://localhost:5177, contra la API (proxy /api → localhost:5030) y la plataforma (/plataforma → 5010)
npm run dev:mock   # sin ningún backend: login y /api de prueba (mock/servidorPrueba.ts + datosCobertura.ts), cualquier contraseña
npm run build      # tsc + vite: es el «compilar» de cada cambio
```

En `dev:mock` el rol sale del usuario que se escribe: con «vendedores» entra como operario con dos vendedores de Chess
(Nicolás y Mateo: la unión de carteras), con «vendedor» como operario (Nicolás Córdoba), con «supervisor» como
supervisor (Franco y Mauricio), con «sinacceso» sin acceso a la app, y con cualquier otro como admin (Checho). Con
«sincuentas» (admin), `/admin/cuentas` responde 404 como la API real de hoy, para ver Gestión de cuentas en modo
«solo accesos». Los artículos, bultos y devoluciones salen de `mock/datosArticulos.ts`; Volumen y Devoluciones, de
`mock/datosVolumen.ts`; la ficha, de `mock/datosFicha.ts` (con la gobernanza del contrato: operario y supervisor solo ven
los meses de su cartera). Los datos son inventados (~760 clientes con los nombres del contexto) y siguen las reglas del contrato, pero
**no son la lógica oficial** (esa es la del backend). Sin token, el mock responde 401 como la API real.

La API real (`AnalisisComercial/Backend`, puerto 5030) ya está hecha; en Development entra sin token como admin. Hasta
que se cargue Chess viene vacía: para pantallas con datos, seguir con `dev:mock`.

## Decisiones del usuario (26/10/2026)

- **React como De Ruta, no Blazor** (el `CONTEXTO_FRONTEND.md` pedía Blazor): el backend expone una **API HTTP**.
- **Se ignoran las instrucciones estéticas del contexto** (header blanco, franja tricolor, Barlow): la estética es la de
  De Ruta llevada a **violeta**. La estructura de las pantallas (filtros, KPI por mes, chips, tabla ✓/✗) sí sigue el
  contexto.
- Una animación de carga propia: **`LoadingAnalisis`** (ver abajo).

## Contrato

La fuente de verdad es **`AnalisisComercial/CONTRATO_API.md`** (lo escribe la sesión del backend; API .NET 8 en el
puerto **5030**). `src/api/types.ts` es su espejo: si se contradicen, vale el contrato. Los cambios los avisa el
backend antes de codificarlos.

## Sesión y roles

- **Login central** de la plataforma con pantalla y sesión propias: `?aplicacion=analisis-comercial` (lo agrega
  `api/client.ts`), cookie propia. Permisos de la plataforma: `analisis-comercial.ver` y `analisis-comercial.admin`.
- Después del login, **`GET /api/sesion`** (`auth/SesionApp.tsx`) da el **rol en esta app** (`admin`, `supervisor` u
  `operario`), su vendedor, los vendedores que puede elegir, `hoy` y `mesEnCurso`. Sin acceso → 403 con un `title`
  legible, que se muestra en una pantalla sola (sin «Probar de nuevo»).
- El menú se arma con el rol: operario → Cobertura y Mi ruta; supervisor suma Resumen; admin suma Administración.
  `SoloRoles` devuelve a Cobertura a quien llega por URL a una sección que no le toca. **Qué datos ve cada uno lo filtra
  la API**: el front solo oculta controles.

## Piezas

| Pieza | Qué es |
|---|---|
| `index.css` | Tokens violeta (`--cabecera`, `--lateral`, `--acento`, `--titulo-chico`, `--piedra`…) y las clases comunes de De Ruta y CashFlow |
| `components/loading/LoadingAnalisis` | **La carga larga** (como la camioneta de De Ruta o el taller de Mantenimiento): las barras de ventas crecen, la línea de tendencia se dibuja, la lupa la recorre y frena en el mejor mes, que se ilumina con una flecha de «crece» y chispas. Ciclo de 6 s, con la **Web Animations API** (cada pieza tiene su momento y quedan sincronizadas). Modos `siempre` (bucle, con segundos), `una-vez` (corre y queda armada: el login) y `quieta`; `sobreOscuro` para fondo violeta. Respeta `prefers-reduced-motion` (queda el dibujo armado). **Solo para esperas largas de verdad** (p. ej. «Actualizar ahora» desde Chess) |
| `components/loading/LoadingDefault`, `LoadingModal` | Círculo con el arco violeta, en una página o dentro de un modal |
| `components/Modal`, `ModalPasos`, `Paginado`, `SelectorEnLinea`, `Segmentado` | Copiados de De Ruta y CashFlow (modal con cabecera oscura, foco atrapado, Esc; riel de pasos; selector que guarda al instante) |
| `components/ErrorCarga` | Lo que no se pudo cargar y el «Probar de nuevo», igual en todas las pantallas (secciones, ficha, administración y tablero) |
| `comercial/filtros` | `useFiltrosComerciales` (vendedor, día y unidad en la URL; `cambiar`, buscador, chip, «Ver todos», mes elegido, título y subtítulo) y `BarraFiltros`: los mismos en Cobertura, Volumen y Devoluciones |
| `comercial/ayuda` | Los globos de ayuda del dueño (`Parrafo`, `ParrafoCartera`, `ParrafoEnCurso`): cómo se calculó cada número de Cobertura, Volumen y Devoluciones con las reglas del contrato. `useFiltrosComerciales().ayuda` es null para quien no es admin |
| `comercial/mesReferencia` | El mes en el que se para la app (30/10): todo muestra ese mes y los tres anteriores (`ventana`). Para vendedor y supervisor es el mes en curso (cada mes nuevo corre la ventana); el dueño elige otro con el filtro «Mes» (`SelectorMes`, en la barra de filtros y en el Tablero) y cambia Cobertura, Volumen, Devoluciones, la ficha y el Tablero. Dura lo que la pestaña (sessionStorage) |
| `comercial/lista` | Las piezas de las listas de clientes: `Chips`, `SinClientes`, `CabeceraOrden`, `FilaCliente` / `TarjetaCliente` (código bien visible en el celular) y `useAbrirFicha` (link con la pestaña y el mes, y «Volver a…» a la misma vista) |
| `utils/useRecordarAltura` | Al volver de la ficha con Atrás, la lista queda a la misma altura (Cobertura, Volumen y Devoluciones) |
| `animations/` | `ola`, `agrandar`, `entrada` y `Animacion`, de De Ruta (la ola en violeta) |
| `modules/calendario` | El calendario de De Ruta (todavía sin uso) |
| `layout/Layout` | Cabecera con gradiente violeta: logo de Madomi, logo de la app (con el menú de aplicaciones), «Datos de Chess al …» (`/api/sincronizacion/estado`; en amarillo con más de 36 h), chat, notificaciones, usuario con su rol y salir. En el celular el lateral se abre encima del contenido, con un velo que lo cierra; ahí van «Mi perfil» y «Cerrar sesión» (30/10: en la cabecera no entran), y el vendedor ve solo el logo de la app, sin el menú para saltar a otras |
| `pages/LoginPage` + `PanelLogin` | El login de De Ruta; a la derecha, panel violeta con `LoadingAnalisis` «una vez» y frases que cambian (`TODO testing`) |
| `pages/VitrinaPage` | `TODO testing`, solo en desarrollo (`/vitrina`): todas las piezas genéricas y la animación, para revisarlas |
| `perfil/` | Copiado de CashFlow |
| `cobertura/CoberturaPage` | **Cobertura** (`/`), la estructura de la web actual en violeta: filtros (vendedor —no para el operario—, día de visita con el código de Chess, unidad), tarjeta con un indicador por mes (el mes en curso atenuado, «al 25/10»), chips con sus cantidades, buscador (300 ms, componente aparte para no re-dibujar la tabla) y Tabla/Mapa. Todo en la URL (`vendedor`, `dia`, `unidad`, `chip`, `busqueda`, `orden`, `vista`, `mes`); los cambios se arman sobre la URL real del navegador (no la del render: React Router renderiza en transición). Una sola llamada a `/api/cobertura` por cambio; con error no se muestran números viejos. Al volver de la ficha, la lista sale del caché de `useConsulta` y a la misma altura |
| `cobertura/TablaCobertura` | Memoizada. Computadora: tabla ordenable por código o razón social, encabezado fijo, scroll propio entre 768 y 1000 px. Celular: una tarjeta por cliente con la inicial del mes. Fila de «dejó de comprar» en rosado con la etiqueta roja. Seleccionar texto no abre la ficha |
| `cobertura/VistaMapa` | **Mapa** (prueba pedida el 26/10, se baja aparte con `lazy`): el de De Ruta (Leaflet en canvas, OSM en grises, «Expandir mapa»). Cada cliente en su ubicación de Chess, del color de su vendedor (`colores.ts`), lleno si compró, hueco si no, punteado si es el mes en curso y todavía no, con aro rojo si dejó de comprar. El mes elegido va como `mesHasta` (así cartera, color y estado son de ese mes, como pidió el backend). Leyenda para apagar vendedores y estados, popup con «Ver ficha», aviso de los sin ubicación. La tabla es la vista accesible |
| `cobertura/colores.ts` | Un color por vendedor (por `idPersonal`), validado con el validador de la guía de dataviz para un mapa (todos los pares, junto con el rojo de «dejó»): sin verde ni naranjas. Un vendedor nuevo va en gris hasta validar un sexto color |

Las piezas copiadas tal cual de De Ruta, Mantenimiento o CashFlow (`Modal`, `ModalPasos`, `Paginado`,
`SelectorEnLinea`, `animations/`, `api/client.ts`, `sesion.ts`, `useConsulta`, `auth/`, `perfil/`): si se corrige una
acá, conviene corregirla también allá.

## Pantallas (CONTEXTO_FRONTEND.md + CONTRATO_API.md)

| Ruta | Pantalla | Roles | Estado |
|---|---|---|---|
| `/` | Cobertura de clientes: tabla y **mapa** | todos | hecha (con el mock; falta probar contra la API con datos) |
| `/cliente/:id` | **Ficha del cliente** (29/10): cabecera (código bien visible, ruta, días de visita, dirección con Google Maps, última compra), un recuadro por mes con su estado y sus bultos, y tres pestañas (`?pestana=`): **Qué compró** (artículos × meses por unidad de negocio, con los bultos debajo de cada ✓), **Volumen** (el total contra la base y qué artículos bajaron y cuáles subieron, con su %) y **Devoluciones** (un recuadro por mes y lo devuelto en el mes elegido). Los cuatro meses en los que está parada la app (30/10: antes, toda la historia). **Gobernanza**: para operario y supervisor, los meses fuera de su cartera van rayados («Fuera de tu cartera») y sin ningún dato; si hoy ya no es suyo, un aviso | todos (si alguna vez estuvo en su cartera) | hecha con el mock (contrato de la fase 2) |
| `/volumen` | **Volumen** (29/10): bultos del mes contra la base del rol (operario: el mes anterior **completo** como meta, con la marca del **ritmo**; admin y supervisor: al **mismo día hábil**). Filtros como Cobertura, mes, chips (debajo del ritmo / bajaron, en ritmo / subieron, nuevos, sin compra), buscador, tabla ordenable y tarjetas en el celular. Abre la ficha en la pestaña Volumen. El **vendedor ve el total de su cartera solo en porcentaje** (30/10: sin bultos totales; los de cada cliente, sí); el dueño tiene la ⓘ con el cálculo | todos | hecha con el mock |
| `/devoluciones` | **Devoluciones** (29/10): % = devueltos ÷ (vendidos + devueltos), un indicador por mes (se elige tocándolo) y, de ese mes, los clientes (de mayor a menor %) y los artículos más devueltos. Abre la ficha en la pestaña Devoluciones. El **vendedor ve lo que suma su cartera** (por mes y por artículo) **solo en porcentaje** (30/10); el dueño tiene la ⓘ con el cálculo del mes elegido | todos | hecha con el mock; qué cuenta como devolución lo confirma Cesar |
| `/mi-ruta` | Mi ruta de hoy | todos | **oculta** (29/10, pedido de Cesar): el link lleva a Cobertura |
| `/resumen` | **Tablero** (29/10): grilla 3×3 que entra en la pantalla (contra el mes anterior, días de visita, vendedores) sobre `/api/cobertura`; semáforo provisorio (`TODO testing`) | admin, supervisor | hecha; pasarla a `/api/resumen` |
| `/admin/usuarios` | **Gestión de cuentas** (29/10): las cuentas de Madomi con su rol y sus vendedores de Chess (1 a N: si Chess renombra a un vendedor con otro id, se suman los dos), crear cuentas de vendedor con contraseña inicial, dar acceso, editar y pausar | admin | listar y crear cuentas (`/admin/cuentas`) **sin contrato**: la plataforma todavía no lo permite (lo decide Cesar). Con la API real (404) la pantalla pasa a **«solo accesos»**: lista `/admin/usuarios`, «Dar acceso a un usuario» y editar/pausar (confirmados). Un 409 toma la versión nueva sin perder lo editado; la cuenta creada no se cierra con Esc (la contraseña no se vuelve a mostrar) |
| `/admin/exclusiones` | **Clientes excluidos** (29/10): toda la base de clientes de Chess agrupada por vendedor (grupos plegables, como los A/B/C de De Ruta), con la **estadística rápida** (últimos 4 meses, última compra) y la **sugerencia** del backend («Sugerido excluir» / «Para revisar» con su motivo); excluir con motivo (precargado si se sugiere) o volver a incluir. Los filtros (Sugeridos, Excluidos, Sin excluir) y la búsqueda van en una lista sola con el vendedor en cada fila | admin | hecha (contrato confirmado) |
| `/admin/sincronizacion` | Sincronización con Chess | admin | en construcción |
| `/perfil` | Mi perfil | todos | hecho |

## Rendimiento en el celular (29/10)

Los vendedores la usan en la calle, con datos móviles. Lo que se hizo y hay que cuidar:

- **Fuente de íconos recortada**: `index.html` pide solo los íconos que usa la app (`icon_names=`) y los grosores 400
  a 700: 18 KB en lugar de varios MB. **Si se suma un ícono, `npm run iconos`** (`scripts/iconos.mjs` rehace la lista);
  si no, se ve su nombre en texto.
- **Pantallas diferidas** (`src/rutas.ts`): el paquete principal trae Cobertura; el resto se baja aparte y, después de
  entrar, en segundo plano las del rol (no con «ahorro de datos» activado).
- **Logo de Madomi** a 3× su tamaño en pantalla (32 KB en lugar de 193 KB).
- **Sin señal**: aviso pegado arriba (`useEnLinea`); los pedidos se cortan a los 25 s con «La conexión está muy
  lenta…» en lugar de quedar cargando para siempre (`api/client.ts`).

## Reglas

Las de los sistemas de Vignoli, salvo lo estético: todo en español rioplatense, la lógica de negocio en el backend
(el front no calcula coberturas, carteras ni «dejó de comprar»), compilar al cerrar cada parte, marcar el hardcode de
prueba con `// TODO testing`. Probar a 390 px: sin scroll horizontal, áreas tocables de 44 px.

## Pendiente

- Las pantallas que faltan, en el orden del contexto: Ficha, Mi ruta, Resumen, Administración. Mientras la API no
  tenga datos de Chess, con datos fake en `mock/` que respeten el contrato.
- Arreglos hechos acá en piezas copiadas que convendría llevar a De Ruta, Mantenimiento y CashFlow (26/10):
  `client.ts` (un refresh que falla por red o 5xx ya no borra la sesión; el 403 muestra el `title` del backend),
  `AuthContext` (un login que falla al pasar de empresa no deja la sesión guardada), `RequireAuth` (vuelve del login
  con los filtros de la URL), `useConsulta` (mensaje fijo ante errores de red o 5xx; ruta null limpia el estado).
- Logo de la app (hoy es de texto, `TODO testing`).
- Despliegue (dominio, nginx), cuando lo decida el usuario.
