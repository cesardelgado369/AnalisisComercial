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
| `admin/BaseClientes` | Las piezas de las pantallas sobre la base de clientes (`/api/admin/clientes`): `BarraClientes` (filtros y buscador), `GruposPorVendedor` (plegables), `ListaClientes` (paginada, con los meses y la última compra; cada pantalla pone su estado y su acción) y los cambios locales hasta que la API manda datos nuevos. La usan Clientes excluidos y Clasificación de clientes |
| `comercial/ayuda` | Los globos de ayuda del dueño (`Parrafo`, `ParrafoCartera`, `ParrafoEnCurso`): cómo se calculó cada número de Cobertura, Volumen y Devoluciones con las reglas del contrato. `useFiltrosComerciales().ayuda` es null para quien no es admin |
| `comercial/mesReferencia` | El mes en el que se para la app (30/10): todo muestra ese mes y los tres anteriores (`ventana`). Para vendedor y supervisor es el mes en curso (cada mes nuevo corre la ventana); el dueño elige otro en la cabecera (`layout/MesCabecera`, una píldora con el calendario que se pone ámbar en un mes pasado, con el botón **Focos** que prende y apaga la vista por focos de Cobertura; en el celular, los dos en la barra de filtros) o en el desplegable de Volumen, y cambia Cobertura, Volumen, Devoluciones, la ficha y el Tablero. Parado en un mes pasado, cada pantalla comercial avisa «Estás viendo septiembre de 2026» con «Volver a octubre». Dura lo que la pestaña (sessionStorage) |
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
| `/` | Cobertura de clientes: tabla y **mapa**. Filtros en la URL: vendedor, día, unidad de negocio y, **solo el dueño** (Cesar, 05/11: los empleados no ven los focos; la API les da 403), **foco del mes** (`?foco=`; también en Volumen y Devoluciones: los focos del mes en el que está parada la app, `/cobertura/focos?mes=`). Tercera vista, **Focos** (`?vista=focos`; el dueño también la abre con «Focos» de la cabecera): una columna por foco del mes en lugar de los meses (CCC: ✓ si compró; VOL: sus bultos con la flecha contra el mes anterior al mismo día hábil), el número de cada foco arriba con su **meta** si es CCC (cumplida, o cuántos clientes faltan; la rayita en la barra) y qué dice cada marca en la barra del buscador (una consulta `/cobertura?foco=` o `/volumen?foco=` por foco: los números son de la API). **Desde el 11/11 la ven también vendedores y supervisores** (pedido de Checho), cada uno con su cartera; quien no ve bultos (`veBultos` en false, el vendedor) mira los VOL como los CCC, si cada cliente compró o no, sin bultos ni la etiqueta CCC/VOL. En el celular, cada cliente con sus focos en dos columnas, la marca y el nombre entero | todos | hecha con el mock; la API tiene que abrir `/cobertura/focos` y `foco=` a los vendedores |
| `/cliente/:id` | **Ficha del cliente** (29/10): cabecera (código bien visible, ruta, días de visita, dirección con Google Maps, última compra), un recuadro por mes con su estado y sus bultos, y tres pestañas (`?pestana=`): **Qué compró** (artículos × meses por unidad de negocio, con los bultos debajo de cada ✓), **Volumen** (el total contra la base y qué artículos bajaron y cuáles subieron, con su %) y **Devoluciones** (un recuadro por mes y lo devuelto en el mes elegido). Los cuatro meses en los que está parada la app (30/10: antes, toda la historia). **Gobernanza**: para operario y supervisor, los meses fuera de su cartera van rayados («Fuera de tu cartera») y sin ningún dato; si hoy ya no es suyo, un aviso | todos (si alguna vez estuvo en su cartera) | hecha con el mock (contrato de la fase 2) |
| `/volumen` | **Volumen** (29/10): bultos del mes contra la base del rol (operario: el mes anterior **completo** como meta, con la marca del **ritmo**; admin y supervisor: al **mismo día hábil**). Filtros como Cobertura, mes, chips (debajo del ritmo / bajaron, en ritmo / subieron, nuevos, sin compra), buscador, tabla ordenable y tarjetas en el celular. Abre la ficha en la pestaña Volumen. **Hoy el vendedor no la ve** (1.2, 30/10: `sesion.veBultos` en false; lo abre el backend con `Comercial:OperarioSoloCobertura`). Con ella abierta, el **vendedor ve el total de su cartera solo en porcentaje** (30/10: sin bultos totales; los de cada cliente, sí); el dueño tiene la ⓘ con el cálculo | todos | hecha con el mock |
| `/devoluciones` | **Devoluciones** (29/10): % = devueltos ÷ (vendidos + devueltos), un indicador por mes (se elige tocándolo) y, de ese mes, los clientes (de mayor a menor %) y los artículos más devueltos. Abre la ficha en la pestaña Devoluciones. **Hoy el vendedor no la ve** (como Volumen, `sesion.veBultos`). Con ella abierta, el **vendedor ve lo que suma su cartera** (por mes y por artículo) **solo en porcentaje** (30/10); el dueño tiene la ⓘ con el cálculo del mes elegido | todos | hecha con el mock; qué cuenta como devolución lo confirma Cesar |
| `/mi-ruta` | Mi ruta de hoy | todos | **oculta** (29/10, pedido de Cesar): el link lleva a Cobertura |
| `/resumen` | **Tablero** (29/10): grilla 3×3 que entra en la pantalla (contra el mes anterior, días de visita, vendedores) sobre `/api/cobertura`; semáforo provisorio (`TODO testing`) | admin, supervisor | **oculto** (30/10, pedido de Cesar): el link lleva a Cobertura; la pantalla queda hecha (falta pasarla a `/api/resumen`) |
| `/admin/usuarios` | **Gestión de cuentas** (29/10): las cuentas de Madomi con su rol y sus vendedores de Chess (1 a N: si Chess renombra a un vendedor con otro id, se suman los dos), crear cuentas de vendedor con contraseña inicial, dar acceso, editar y pausar El usuario se escribe sin dominio: el campo pone «@madomi» solo (30/10). **Accesos por habilitar** (revisión de seguridad del 04/11): el acceso se ata a la cuenta cuando el admin lo guarda, nunca al entrar; uno sin atar (`accesoEnlazado`/`enlazado` false) dice «Falta habilitarla» con el botón **Habilitar** (el mismo `PUT` sin cambios) o «Pendiente: sin cuenta», y aparece la pestaña «Por habilitar» | admin | listar y crear cuentas (`/admin/cuentas`) **sin contrato**: la plataforma todavía no lo permite (lo decide Cesar). Con la API real (404) la pantalla pasa a **«solo accesos»**: lista `/admin/usuarios`, «Dar acceso a un usuario» y editar/pausar (confirmados). Un 409 toma la versión nueva sin perder lo editado; la cuenta creada no se cierra con Esc (la contraseña no se vuelve a mostrar) |
| `/admin/exclusiones` | **Clientes excluidos** (29/10): toda la base de clientes de Chess agrupada por vendedor (grupos plegables, como los A/B/C de De Ruta), con la **estadística rápida** (últimos 4 meses, última compra) y la **sugerencia** del backend («Sugerido excluir» / «Para revisar» con su motivo); excluir con motivo (precargado si se sugiere) o volver a incluir. Los filtros (Sugeridos, Excluidos, Sin excluir) y la búsqueda van en una lista sola con el vendedor en cada fila | admin | hecha (contrato confirmado) |
| `/admin/clasificacion` | **Clasificación de clientes** (30/10, pedido de Cesar): la misma base de clientes que Clientes excluidos (`admin/BaseClientes`), para marcar los **Vitales** con un click (la estrella cambia al toque y vuelve si la API no lo guarda). Filtros Todos / Vitales / Sin clasificar y Vitales por vendedor. Por ahora solo una marca del dueño: no cambia ningún número y el vendedor no la ve | admin | hecha con el mock (API en 75eba35, sale en la 1.2) |
| `/admin/focos` | **Focos del mes** (04/11, pedido de Checho; **por mes** desde el 05/11): los objetivos del mes como los escribe Checho, grupos de artículos con nombre («Manteca» = X100G + X200G) medidos con **CCC** (clientes de la cartera que compraron) o **VOL** (bultos contra el mes anterior al mismo día hábil), con **meta opcional** en %. Arriba los meses (del primero con datos al que viene, `?mes=`); en cada uno, **un contenedor por objetivo con todo junto** (Cesar, 05/11): qué se mide, la meta, los artículos y cómo viene cada vendedor (`/admin/focos/analisis`: barra del mes, rayita del mes anterior, meta punteada), que lleva a sus clientes en Cobertura o Volumen con ese foco. «Copiar los de octubre» (un POST por foco, con medida y meta). El modal elige qué se mide, la meta y los artículos de `/admin/articulos` por DIVISION de Chess. PREVENTA queda para cuando Checho diga qué mide | admin | hecha con el mock (API en 3ecf282, sin publicar) |
| `/admin/sincronizacion` | **Sincronización con Chess** (30/10, pedido de Cesar): de cuándo son los datos (`/sincronizacion/estado`), «Actualizar ahora» (`POST /admin/sincronizaciones`; 409 con una ya pedida → se sigue esa; 409 por la espera de 10 minutos → el `title` tal cual, «podés pedir otra desde las…»; se distinguen releyendo `pendiente`) con la animación de carga y los pasos mientras corre (se vuelve a mirar cada 5 s; con el freno de pedidos, 429, cada minuto), el resultado y las últimas corridas con sus errores. Al terminar avisa a las otras pantallas (la cabecera y Cobertura se vuelven a leer). La sincronización no anota el final de la corrida: termina con las carteras, o antes si fallaron rutas o clientes | admin | hecha con el mock (la API está desde la v1) |
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
  `client.ts` (un refresh que falla por red o 5xx ya no borra la sesión; el 403 y el 429 muestran el `title` del backend y no se reintenta solo),
  `AuthContext` (un login que falla al pasar de empresa no deja la sesión guardada), `RequireAuth` (vuelve del login
  con los filtros de la URL), `useConsulta` (mensaje fijo ante errores de red o 5xx; ruta null limpia el estado).
- Logo de la app (hoy es de texto, `TODO testing`).
- Despliegue (dominio, nginx), cuando lo decida el usuario.
