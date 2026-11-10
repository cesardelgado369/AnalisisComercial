# Despliegue de Análisis Comercial (Madomi Pastas)

`https://analistascomercial.vignoliyasconsultoria.com`, en el VPS compartido (2.25.126.222), carpeta
`/opt/analisis-comercial`. Mismo esquema que el CashFlow (`CashFlow/Despliegue`): imágenes armadas en la PC, compose
propio, login de la plataforma central. **Cada paso en el VPS, con el OK del usuario y backup antes.**

El dominio es **analistascomercial** (con «analistas», decisión del usuario del 29/10: es el registro DNS que dio de
alta). La app, el módulo y las carpetas siguen siendo «analisis-comercial»; el 033 de la central corrige la URL del 031.

**Publicado el 29/10/2026** (versión `20261028`), con el OK del usuario paso por paso: plataforma redesplegada con
031 y la sesión propia (backup antes), 033 aplicado, Nginx del host + certificado, secretos (la clave de Chess la cargó
el usuario en el VPS), base creada y carga inicial OK. Clientes con compra contra la Base CCC (corte 20/10): julio
766/766, agosto 837/836, septiembre 846/846, octubre 836/819 (la diferencia de octubre ya estaba en diag_ccc: la API de
Chess daba 838).

**Versión `20261029`, publicada el 29/10** (OK del usuario, backup antes): operario con 1 a N vendedores (migración
`OperarioConVariosVendedores`), base de clientes por vendedor con estadística y sugerencia de excluir/revisar, lista
de vendedores para administración, y el front con Gestión de cuentas (sin la API de cuentas de la plataforma, muestra
los accesos) y los cambios de Clientes excluidos.

**Versión `1.0`, publicada el 30/10** (OK del usuario, la corrió él con `publicar.sh`): fase 2 (gobernanza, Volumen y
Devoluciones en bultos, pestañas de la ficha), cuentas de la plataforma en Gestión de cuentas. Migración
`SinCargoYUnidadesPorBulto` aplicada sin errores.

**Versión `1.1`, publicada el 30/10** (OK de Cesar en el chat del front; la publicó la sesión del front desde un
`git archive` de `f3f76b7`, backup antes: `AnalisisComercial_20261030_1553.bak.gz`). Back: el operario recibe los
totales solo en porcentaje (`a35b943`) y operario y supervisor ven solo los últimos 4 meses (`1e17dc8`). Front: el
vendedor solo con porcentajes, ayuda ⓘ del dueño, vista de celular, últimos 4 meses con el filtro «Mes» del dueño,
Tablero oculto. Sin migraciones nuevas.

**Versión `1.2`, publicada el 30/10** (OK del usuario, la corrió él; imágenes desde `git archive` de `9f3c389`, backup
antes: `AnalisisComercial_20261030_1750.bak.gz`). La versión para vendedores: el operario ve solo Cobertura y la ficha
(`sesion.veBultos`; Volumen y Devoluciones → 403, se abre con `Comercial:OperarioSoloCobertura=false`), y la
Clasificación de clientes del admin (Vital con un click). Migración `ClientesVitales` aplicada (una tabla nueva). La
republicación de la 1.1 con Vitales (16:50) no llegó a correr: entró con esta.

**Versión `1.3.0`, publicada el 10/11** (OK de Cesar en el chat del back; la corrió él con `publicar.sh`; imágenes
desde `git archive`: api y sync de `cee9cc2`, web de `291cfcf` (tag `v1.3.0`; desde `cee9cc2` solo cambió Frontend);
backup antes: `AnalisisComercial_20261110_1933.bak.gz`). Primera con versión 1.Major.Minor y tag git. Trae la 1.2.1
que no se había publicado (Actualizar ahora), la revisión de seguridad del 04/11 (empresa en las políticas, chatbot
solo lectura, freno de pedidos, el acceso se enlaza al guardarlo), Focos del mes (por mes, solo admin, CCC o VOL con
meta, análisis por vendedor con Comparativa y categoría), clientes A, B y C con su filtro, la Comparativa de Volumen
(parcial o acumulado), los movimientos del cliente y los íconos de productos en Volumen y Devoluciones. Migraciones
`AccesoLogCanalEmpresa` y `FocosDelMes` (solo agregan). Los bultos en la ficha del vendedor quedan como estaban.
Verificado: `/api/sesion` 401, la página 200, los tres contenedores en `1.3.0`, `X-Robots-Tag: noindex`.

```
navegador ─ HTTPS ─ Nginx del host ─┬─ /plataforma/…  → portal de la plataforma (127.0.0.1:8090) → su API
                                    └─ todo lo demás  → analisis-prod-web (127.0.0.1:8098)
                                                          ├─ SPA (React)
                                                          └─ /api/… → analisis-prod-api ─┐
                              analisis-prod-sync ── Chess (internet, 05:00 y «Actualizar ahora»)
                                                                                          └─ base AnalisisComercial
                                                                                             en vignoli-sqlserver
```

| Contenedor | Imagen | Qué hace |
|---|---|---|
| `analisis-prod-api` | `analisis-prod-api:<fecha>` | API .NET 8 (`Backend/src/AnalisisComercial.API`), sin privilegios, solo lectura. Migra la base al arrancar. |
| `analisis-prod-sync` | `analisis-prod-sync:<fecha>` | Sincronización con Chess (`AnalisisComercial.Sync`). La primera vez que arranca con la base vacía hace la carga inicial (desde el 01/07/2026). |
| `analisis-prod-web` | `analisis-prod-web:<fecha>` | Nginx sin privilegios con el front; manda `/api/` a la API. |

**La base** no tiene contenedor propio: es `AnalisisComercial` en `vignoli-sqlserver` (el SQL Server Express de la
plataforma), con el usuario `analisis_app`, dueño solo de esa base. Otro SQL Server costaba 1,5 GB más de RAM. API y
sync entran a la red `vignoli_default` para llegar a él.

## Secretos (solo en el VPS, `/opt/analisis-comercial/secretos`, 700/600; nunca en OneDrive ni en un chat)

| Archivo | Lo crea | Contiene |
|---|---|---|
| `db.env` | `preparar-secretos.sh` | `ANALISIS_DB_CLAVE` (la usa solo `preparar-base.sh`) |
| `base.env` | `preparar-secretos.sh` | `ConnectionStrings__Comercial` con `analisis_app` |
| `chess.env` | `preparar-secretos.sh`, **lo escribe la persona en la terminal del VPS** | `Chess__Usuario` y `Chess__Clave` |

La clave de `sa` no se copia: `preparar-base.sh` y `backup.sh` la leen del `.env` de la plataforma
(`/home/vignoli/MainPage/deploy/.env`) y la pasan por variable.

## Lo que tiene que estar en la plataforma

- Scripts **`031_analisis_comercial.sql`** y **`033_analisis_comercial_dominio.sql`** (la URL con este dominio) de
  BaseDeDatosCentralizado aplicados en VignoliCentral: módulo `analisis-comercial`, permisos `analisis-comercial.ver` y `.admin`, Madomi Pastas y Vignoli lo
  tienen, roles de Madomi «Administrador comercial» (ver + admin) y «Comercial» (ver). Lo aplica `redeploy.sh` de la
  plataforma (`aplicar-central.sh`) cuando el repo está pusheado.
- **`analisis-comercial` en `Sesion:AplicacionesConSesionPropia`** de la API de la plataforma (valor por defecto en
  `AuthController.cs`, con su prueba en `SesionPorAplicacionTests`). Sin eso, `?aplicacion=analisis-comercial` da 400.
- **Cuentas**: el dueño de Madomi con el rol «Administrador comercial»; los vendedores con «Comercial». Las cuentas de
  Madomi que entran por De Ruta (login federado) se crean sin roles: hay que asignárselos. SQL de un solo uso, fuera
  del repo (como las demás cuentas de producción). Dentro de la app, el Admin da acceso a cada vendedor por email.
- La clave con la que firma la plataforma tiene que ser la de `Jwt__ClavePublica` en `compose.yaml` (la misma del
  CashFlow, comprobada el 28/10). Si no coincide, el login anda pero `/api/` da 401.
- Sin CORS: el login pasa por `/plataforma/` de este mismo dominio.

## Instalar o actualizar

1. **Imágenes**, en la PC, desde la carpeta `AnalisisComercial` (con Docker Desktop prendido):

   ```
   docker build --pull --platform linux/amd64 -f Despliegue/backend.Dockerfile --target api  -t analisis-prod-api:<fecha>  Backend
   docker build --pull --platform linux/amd64 -f Despliegue/backend.Dockerfile --target sync -t analisis-prod-sync:<fecha> Backend
   docker build --pull --platform linux/amd64 -f Despliegue/web.Dockerfile --build-context despliegue=Despliegue -t analisis-prod-web:<fecha> Frontend
   docker save analisis-prod-api:<fecha> analisis-prod-sync:<fecha> analisis-prod-web:<fecha> | gzip -1 | ssh -i ~/.ssh/vignoli_despliegue root@2.25.126.222 'gunzip | docker load'
   ```

2. **Archivos** a `/opt/analisis-comercial`, sin finales de línea de Windows (`tr -d '\r'`): `compose.yaml`,
   `preparar-secretos.sh`, `preparar-base.sh`, `backup.sh`, `nginx-host-analistascomercial.conf`.

3. **La primera vez**, en el VPS (`preparar-secretos.sh` en una terminal: pide la clave de Chess):

   ```
   cd /opt/analisis-comercial
   bash preparar-secretos.sh
   bash preparar-base.sh
   echo ANALISIS_VERSION=<fecha> > .env      # la versión de las imágenes; sin .env, compose no arranca
   docker compose up -d
   docker logs -f analisis-prod-sync         # la carga inicial: unos minutos, termina con «Sincronización … OK»
   ```

   **Actualizar**: imágenes nuevas (paso 1), `bash backup.sh` en el VPS y, desde Git Bash en la carpeta
   AnalisisComercial, `bash Despliegue/publicar.sh <versión>`: marca lo que corre como `anterior`, sube las imágenes y
   el compose, cambia `ANALISIS_VERSION`, arranca y verifica. Al final imprime cómo volver atrás. Desde la 1.0 (30/10)
   las versiones van por número (`1.0`, `1.1`…), no por fecha.

4. **Nginx del host**, solo la primera vez (el registro DNS A `analistascomercial` → 2.25.126.222 tiene que existir; si
   no, certbot falla):

   ```
   cp nginx-host-analistascomercial.conf /etc/nginx/sites-available/vignoli-analistascomercial.conf
   ln -s /etc/nginx/sites-available/vignoli-analistascomercial.conf /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   certbot --nginx --redirect -d analistascomercial.vignoliyasconsultoria.com
   ```

   El nombre empieza con `vignoli-` a propósito: ningún sitio es `default_server` y Nginx manda los nombres que no conoce
   al primero en orden alfabético (`julietteadmin`); `analistascomercial.conf` le ganaría. Certbot agrega el 443 en el
   archivo del VPS: **no volver a copiar el del kit encima** (quedaría sin TLS y, por el HSTS, el navegador no deja
   seguir). Para cambiar algo, editar el del VPS.

5. **Respaldo**: en el cron de root, `15 4 * * * bash /opt/analisis-comercial/backup.sh >> /var/log/analisis-backup.log 2>&1`.

## Verificar

```
H="Host: analistascomercial.vignoliyasconsultoria.com"
curl -s -o /dev/null -w "%{http_code}\n" -H "$H" http://127.0.0.1:8098/              # 200 (el SPA)
curl -s -o /dev/null -w "%{http_code}\n" -H "$H" http://127.0.0.1:8098/api/sesion    # 401 sin sesión
docker compose -f /opt/analisis-comercial/compose.yaml ps
docker logs --tail 40 analisis-prod-sync
```

Desde afuera, con el DNS y el certificado:

```
U=https://analistascomercial.vignoliyasconsultoria.com
curl -s -o /dev/null -w "%{http_code}\n" $U/api/sesion                                 # 401 sin sesión
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Content-Type: application/json" \
  -d '{"email":"x@ejemplo.invalid","password":"x"}' "$U/plataforma/api/auth/login?aplicacion=analisis-comercial"
# 401 con la plataforma al día; 400 «no tiene sesión propia» si a la plataforma le falta analisis-comercial
```

## Pendiente

- **Fase 2** (publicada en la 1.0): falta, una sola vez y opcional, volver a leer las ventas para completar los bultos
  sin cargo de los meses ya cargados:
  `docker compose stop sync && docker compose run --rm sync --una-vez --recargar-ventas && docker compose start sync`.
  Las unidades por bulto de los artículos llegan con la sincronización diaria.

- Cuentas: el dueño de Madomi con el rol «Administrador comercial» (falta su email); después él da acceso a los
  vendedores desde Administración.
- **Borrar las cuentas de prueba** cuando terminen las pruebas (claves débiles): `testing@testing` (admin, 29/10) y
  `vendedor@madomi` (vendedor de MATEO ROJAS, 30/10). Scripts `*_borrar.sql` en `BaseDeDatosCentralizado/prueba/`.
- Programar `backup.sh` en el cron de root (paso 5).
- La clave de `madomiapi` es débil y pasó por un chat el 29/10: cambiarla o pedir un usuario propio (se actualiza con
  `bash preparar-secretos.sh --chess` y `docker compose up -d --force-recreate sync`).
- Usuario de API de Chess propio para esta app (hoy `madomiapi`, el mismo de Power BI y De Ruta).
- Sumar `backups/` a la copia que baja la MiniPC.
- .NET 10 antes del 10/11/2026 (como el resto del sistema).
