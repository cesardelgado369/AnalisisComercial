# AnálisisComercial — backend (.NET 8)

API de **Análisis Comercial de Madomi Pastas** (reemplaza a la web «Cobertura de clientes»): qué clientes compraron,
por mes y por artículo, con acceso por rol. Todo sale de la API de **Chess**, sincronizado a una base propia (SQL
Server). El contrato con el front, las decisiones y los cálculos están en **`../CONTRATO_API.md`** (fuente de verdad).
El contexto de negocio original está en `../CONTEXTO_BACKEND.md`: donde se contradice con el contrato (Blazor,
Identity), vale el contrato.

Estado al 26/10/2026: API, sincronización y 91 pruebas hechas; regla de «compró» y unidad de negocio fijadas con
diag_ccc. **Sin datos todavía**: falta correr la carga inicial (`sincronizar.bat`).

## Proyectos

```
AnalisisComercial.sln
├─ src/AnalisisComercial.Domain          entidades y reglas puras: ReglaCompra, Cobertura/ReglasEstado, DiasSemana, Calendario
├─ src/AnalisisComercial.Application     el contrato en C# (Contrato.cs), alcance y permisos (Seguridad.cs), excepciones
├─ src/AnalisisComercial.Infrastructure  DbContext + migraciones, cliente de Chess, servicios, Sincronizador
├─ src/AnalisisComercial.API             controllers finos, login central (ES256), errores — puerto 5030
├─ src/AnalisisComercial.Sync            proceso de sincronización con Chess (Worker Service)
└─ tests/  Domain.Tests (reglas) · Infrastructure.Tests (Chess y sincronizador) · Security.Tests (API: seguridad y contrato)
```

## Cómo correrlo

```bash
dotnet build
dotnet test                     # Infrastructure.Tests y Security.Tests crean y borran bases temporales en localhost
# Otro SQL Server (GitHub Actions usa uno de Linux, ver .github/workflows/ci.yml): la conexión sin base en PRUEBAS_SQL,
# p. ej. PRUEBAS_SQL="Server=localhost,1433;User ID=sa;Password=…;TrustServerCertificate=True" dotnet test

# API (crea o actualiza la base AnalisisComercial en localhost al arrancar)
ASPNETCORE_ENVIRONMENT=Development dotnet run --project src/AnalisisComercial.API --no-launch-profile --urls http://localhost:5030

# Bajar los datos reales: doble clic en sincronizar.bat (la primera vez pide usuario y clave de Chess y los guarda en los
# secretos de usuario de esta PC; NUNCA en appsettings ni en el repo). Al final muestra el resumen por mes contra la
# Base CCC.  sincronizar.bat clave = volver a pedir la clave · sincronizar.bat recalcular = recalcular compras.

# Que se baje solo: doble clic en programar-sincronizacion.bat. Crea la tarea de Windows «Analisis Comercial -
# Sincronizar Chess» (todos los días a las 06:30, después de la de producción; si la PC estaba apagada, al prenderla) y el
# acceso directo «Actualizar datos de Chess» en el escritorio (un clic = sincronizar.bat). Lo de cada corrida automática
# queda en %LOCALAPPDATA%\AnalisisComercial\logs (30 días). Otra hora: programar-sincronizacion.bat 07:15 · quitar:
# programar-sincronizacion.bat quitar. Dos corridas a la vez no pueden: la segunda avisa y se va.
# En producción no hace falta: el contenedor sync corre a las 05:00 y con «Actualizar ahora» de Administración.

# Sincronización a mano (lo mismo que hace el .bat)
dotnet run --project src/AnalisisComercial.Sync -- --una-vez                        # una corrida (la primera es la carga inicial)
dotnet run --project src/AnalisisComercial.Sync -- --una-vez --recalcular-compras   # si cambió la regla de «compró»
dotnet run --project src/AnalisisComercial.Sync -- --una-vez --recargar-ventas      # vuelve a leer todos los meses (un campo nuevo)
dotnet run --project src/AnalisisComercial.Sync                                     # servicio: 05:00 y cuando el Admin lo pide
```

- Base: `ConnectionStrings:Comercial` → `AnalisisComercial` en `localhost` (autenticación de Windows). El esquema lo
  definen las migraciones de EF (`Infrastructure/Datos/Migraciones`):
  `dotnet ef migrations add X -p src/AnalisisComercial.Infrastructure -s src/AnalisisComercial.API -o Datos/Migraciones`
  (`dotnet tool restore` antes).
- **Modo desarrollo** (`// TODO testing`): en Development, un request sin `Authorization` entra como Admin de Madomi.
  En esta PC no corre la plataforma (no está VignoliCentral), por eso hace falta. Ver `CONTRATO_API.md` › Sesión.
- Si la API está corriendo, `dotnet build` choca con los archivos bloqueados: frenarla antes.

## Reglas que no se negocian

- **Seguridad (lo más importante)**: el alcance se resuelve en el servidor en cada request (`AlcanceUsuario`). TODA
  consulta de clientes o ventas pasa por una `Mirada` armada desde el alcance (`Servicios/Lectura.cs`); ningún servicio
  usa un vendedor o un cliente del request sin validarlo ahí. Fuera de alcance: vendedor → 403, cliente → 404, y queda
  en `AccesoLog`. La empresa sale de `tenant_id` y tiene que ser Madomi.
- Roles: Admin = permiso `analisis-comercial.admin` de la plataforma (o SuperAdmin). Supervisor y operario =
  `AccesoUsuario` cargado por el Admin por email, enlazado a la cuenta (`sub`) en el primer ingreso. Sin acceso → 403.
- La casa (Deposito, id 6, y las rutas sin vendedor) solo la ve el Admin, y no entra en «Todos los vendedores».
- La regla de «compró» vive en **una sola clase**: `Domain/ReglaCompra.cs` (configurable en `Comercial:TiposFactura`,
  `Comercial:TiposCredito` y `Comercial:NetearCreditos`). Vigente (26/10, con diag_ccc): FACTURA y FACTURA CIERRE
  CONSIG., neteando las NOTA DE CREDITO del mes; la FACTURA PRESUPUESTO no cuenta. Neteando, el cruce celda por celda
  con la Base CCC dio 99/99/98/95 % (jul–oct) contra 95/94/92/87 % sin netear. Si cambia, `sincronizar.bat recalcular`.
- Unidad de negocio: la agrupación «UNIDAD DE NEGOCIO» de eAgrupaciones (`Sincronizacion/UnidadNegocio.cs`); sin ella,
  «SIN UNIDAD DE NEGOCIO» (11 de 66 artículos: dulce de leche, quesos, salsas).
- Credenciales de Chess solo en secretos. Este sistema nunca escribe en Chess.
- Todo endpoint nuevo lleva su prueba de alcance (operario, supervisor, casa) en `Security.Tests`.

## La sincronización (`Infrastructure/Sincronizacion/Sincronizador.cs`)

Por corrida, cada paso deja una fila en `SyncLog` y un error no corta los demás ni borra lo anterior:

1. `personalComercial/`, `rutasVenta/`, `clientes/` (paginado), `articulos/`: upsert. De cada ruta vale la versión
   **vigente** (`fechaHasta` 9999-12-31): Chess repite el `idRuta` una vez por período. Freno: si `clientes/` trae
   menos del 90 % de los que había, no se toca nada. Un cliente que está en una ruta pero no vino en `clientes/` se da
   de alta con lo que trae la ruta.
2. `ventas/` detallado, de a un mes: la primera vez desde `Comercial:PrimerMes` (2026-07-01); después el mes en curso +
   los últimos 3 días del anterior, más todo mes cerrado que haya quedado sin ventas. Reemplaza las líneas del rango en
   una transacción (freno: si trae menos de la mitad de lo que había, no se reemplaza).
3. `CompraMes` de los meses leídos (con `ReglaCompra`).
4. `CarteraMes`: el mes en curso se reescribe con las rutas vigentes; un mes cerrado queda congelado. Si un mes cerrado
   no tiene foto (la carga inicial), se reconstruye con la historia de Chess: `eClifuerza` del cliente al último día
   del mes y la versión de la ruta vigente ese día para el vendedor (verificado contra `rutasVenta` en la muestra del
   26/10: 100 de 100).

## Trampas aprendidas

- Chess devuelve los errores con HTTP 200 en un nodo `error`; «No se encontro informacion…» no es una falla, es que no
  hay datos (también marca el fin de la paginación). `cantClientes` / `cantComprobantesVentas` traen «lote 1/14».
- La cookie de sesión de Chess va **cruda** (`Cookie: <sessionId>`); se renueva cada 4 minutos y ante un 401/403.
- `AccesoUsuario` usa una versión propia (`int Version`) y no `rowversion`: el enlace de la cuenta en el primer
  ingreso actualiza la fila y con `rowversion` le daba un 409 falso al Admin que la estaba editando. El último ingreso
  sale de `AccesoLog` por la misma razón.
- `ventas/` detallado (verificado con las respuestas reales de diag_ccc, 26/10): pagina por **comprobante** (1.000 por
  lote, ~7.000 líneas y ~24 MB por lote), las notas de crédito traen cantidad y neto **negativos**, hay líneas de
  factura con cantidad 0 (no cuentan) y `fechaEntrega` viene en null.

## Pendiente

1. **Carga inicial** con `sincronizar.bat` y **Control 1**: que los clientes con compra por mes den cerca de la Base CCC
   (766 / 836 / 846 / 819 al 20/10; octubre da más porque la base llega hasta hoy). Pedir a Chess un usuario de API
   propio para esta app.
2. Alta en la plataforma: script `029` en `BaseDeDatosCentralizado` (módulo `analisis-comercial`, permisos
   `analisis-comercial.ver` y `.admin`, Madomi lo contrata, roles) y `analisis-comercial` en
   `Sesion:AplicacionesConSesionPropia` de la API de plataforma. Toca otros repos: con el OK del usuario.
3. Hosting (Azure o servidor de Madomi) y despliegue.
