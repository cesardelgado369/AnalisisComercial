#!/usr/bin/env bash
# Crea (o pone al día) la base AnalisisComercial y su usuario analisis_app en el SQL Server de la plataforma
# (vignoli-sqlserver). analisis_app es dueño solo de AnalisisComercial (las migraciones de EF crean sus tablas) y no
# entra a VignoliCentral ni a Mantenimiento. Idempotente: vuelve a fijar la clave con la de secretos/db.env.
#
#   bash /opt/analisis-comercial/preparar-base.sh       (después de preparar-secretos.sh y antes de levantar la API)
#
# Usa sa (la clave sale del .env de la plataforma y va por variable, no queda en la lista de procesos), como
# usuarios-sql.sh de la plataforma. El SQL viaja por la entrada estándar.
set -euo pipefail
source /opt/analisis-comercial/secretos/db.env
: "${ANALISIS_DB_CLAVE:?falta ANALISIS_DB_CLAVE en secretos/db.env (correr preparar-secretos.sh)}"
case "$ANALISIS_DB_CLAVE" in *"'"*|*";"*|*'"'*) echo "La clave de la base no puede tener comillas ni punto y coma"; exit 1;; esac

SQLCMDPASSWORD=$(set -a; source /home/vignoli/MainPage/deploy/.env; printf '%s' "$SA_PASSWORD")
export SQLCMDPASSWORD
docker exec -i -e SQLCMDPASSWORD vignoli-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -I -f 65001 <<SQL
USE master;
IF DB_ID(N'AnalisisComercial') IS NULL CREATE DATABASE AnalisisComercial;
IF SUSER_ID(N'analisis_app') IS NULL
    CREATE LOGIN analisis_app WITH PASSWORD = N'$ANALISIS_DB_CLAVE', CHECK_POLICY = ON, DEFAULT_DATABASE = AnalisisComercial;
ELSE
    ALTER LOGIN analisis_app WITH PASSWORD = N'$ANALISIS_DB_CLAVE';
GO

USE AnalisisComercial;
IF USER_ID(N'analisis_app') IS NULL CREATE USER analisis_app FOR LOGIN analisis_app;
ALTER ROLE db_owner ADD MEMBER analisis_app;
GO
SQL
echo "Listo: base AnalisisComercial y usuario analisis_app al día."
