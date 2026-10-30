#!/usr/bin/env bash
# Genera en el VPS los secretos de Análisis Comercial y nunca los muestra. Quedan en /opt/analisis-comercial/secretos,
# solo para root (700/600).
#   - db.env y base.env: la clave del usuario analisis_app de la base. Se generan una sola vez: si ya existen no se tocan
#     (la base ya tiene esa clave; para cambiarla, borrar los dos y volver a correr este script y preparar-base.sh).
#   - chess.env: usuario y clave de la API de Chess. Los escribe la persona, acá, en la terminal del VPS: no pasan por
#     ningún chat ni por OneDrive. Con --chess se vuelven a pedir.
#
#   bash /opt/analisis-comercial/preparar-secretos.sh            (la primera vez, en una terminal: pide la clave de Chess)
#   bash /opt/analisis-comercial/preparar-secretos.sh --chess    (cambiar usuario o clave de Chess)
set -euo pipefail
D=/opt/analisis-comercial/secretos
umask 077
install -d -m 700 "$D"

if [ ! -s "$D/db.env" ]; then
    # SQL Server (CHECK_POLICY) pide al menos tres tipos de caracteres: mayúsculas, minúsculas y números. Sin comillas,
    # punto y coma ni $: va dentro de la cadena de conexión y Compose no la toca.
    clave="Ac1$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 40)"
    printf 'ANALISIS_DB_CLAVE=%s\n' "$clave" > "$D/db.env"
    printf 'ConnectionStrings__Comercial=Server=vignoli-sqlserver,1433;Database=AnalisisComercial;User Id=analisis_app;Password=%s;TrustServerCertificate=True;Encrypt=False\n' \
        "$clave" > "$D/base.env"
    unset clave
    echo "db.env y base.env: creados (después: bash preparar-base.sh)"
else
    echo "db.env: ya existe, no se toca"
fi

if [ ! -s "$D/chess.env" ] || [ "${1:-}" = "--chess" ]; then
    [ -t 0 ] || { echo "chess.env: FALTA. Correr este script en una terminal (pide la clave de Chess)."; exit 1; }
    read -rp "Usuario de la API de Chess [madomiapi]: " usuario
    usuario=${usuario:-madomiapi}
    read -rsp "Clave de la API de Chess (no se ve): " clave; echo
    [ -n "$clave" ] || { echo "No se ingresó la clave."; exit 1; }
    case "$usuario$clave" in *"'"*) echo "Ni el usuario ni la clave pueden tener comillas simples."; exit 1;; esac
    # Entre comillas simples: Compose no interpreta los $ que pueda tener la clave.
    printf "Chess__Usuario='%s'\nChess__Clave='%s'\n" "$usuario" "$clave" > "$D/chess.env"
    unset clave
    echo "chess.env: guardado"
else
    echo "chess.env: está (para cambiarlo: --chess)"
fi
chmod 600 "$D"/*.env
