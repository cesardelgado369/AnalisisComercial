#!/usr/bin/env bash
# Publica en el VPS las imágenes de Análisis Comercial ya armadas en esta PC (DESPLIEGUE.md, «Instalar o actualizar»).
#   bash Despliegue/publicar.sh 1.0        desde Git Bash, en la carpeta AnalisisComercial
# Antes: las tres imágenes analisis-prod-{api,sync,web}:<versión> armadas (paso 1 de DESPLIEGUE.md), el backup hecho
# (bash /opt/analisis-comercial/backup.sh en el VPS) y el OK del usuario.
# Las imágenes que estaban corriendo quedan etiquetadas «anterior»: volver atrás es el comando que imprime al final
# (la base migrada sirve igual para la versión anterior: las columnas nuevas tienen valor por defecto).
set -euo pipefail
version="${1:?Uso: bash Despliegue/publicar.sh <versión>, por ejemplo 1.0}"
cd "$(dirname "$0")/.."
vps() { ssh -i ~/.ssh/vignoli_despliegue -o BatchMode=yes root@2.25.126.222 "$@"; }

for s in api sync web; do
    docker image inspect "analisis-prod-$s:$version" >/dev/null 2>&1 || { echo "Falta la imagen analisis-prod-$s:$version (paso 1 de DESPLIEGUE.md)."; exit 1; }
done

echo "1/5 Marcando como «anterior» lo que corre hoy…"
vps 'for s in api sync web; do img=$(docker inspect --format "{{.Config.Image}}" analisis-prod-$s) && docker tag "$img" analisis-prod-$s:anterior && echo "  $s: $img"; done'

echo "2/5 Subiendo las imágenes $version (unos minutos)…"
docker save "analisis-prod-api:$version" "analisis-prod-sync:$version" "analisis-prod-web:$version" | gzip -1 | vps 'gunzip | docker load' | sed 's/^/  /'

echo "3/5 compose.yaml…"
tr -d '\r' < Despliegue/compose.yaml | vps "cd /opt/analisis-comercial && cp compose.yaml compose.yaml.anterior && cat > compose.yaml"

echo "4/5 Arrancando la versión $version…"
vps "cd /opt/analisis-comercial && echo ANALISIS_VERSION=$version > .env && docker compose up -d 2>&1 | sed 's/^/  /'"

echo "5/5 Esperando la API (migra la base al arrancar)…"
vps 'H="Host: analistascomercial.vignoliyasconsultoria.com"; c=0
     for i in $(seq 1 40); do c=$(curl -s -o /dev/null -w "%{http_code}" -H "$H" http://127.0.0.1:8098/api/sesion); [ "$c" = 401 ] && break; sleep 3; done
     echo "  /api/sesion sin sesión: $c (tiene que ser 401)"
     echo "  /api/admin/cuentas sin sesión: $(curl -s -o /dev/null -w "%{http_code}" -H "$H" http://127.0.0.1:8098/api/admin/cuentas) (401)"
     echo "  la página: $(curl -s -o /dev/null -w "%{http_code}" -H "$H" http://127.0.0.1:8098/) (200)"
     cd /opt/analisis-comercial && docker compose ps --format "  {{.Name}} {{.Image}} {{.Status}}"'

echo
echo "Listo: versión $version publicada."
echo "Para volver atrás, en el VPS:"
echo "  cd /opt/analisis-comercial && cp compose.yaml.anterior compose.yaml && echo ANALISIS_VERSION=anterior > .env && docker compose up -d"
