#!/usr/bin/env bash
# Respaldo diario de la base AnalisisComercial. Lo que importa de verdad es lo que se carga a mano (accesos y
# exclusiones) y las fotos de cartera de los meses cerrados; el resto se vuelve a bajar de Chess.
# Queda en /opt/analisis-comercial/backups, 30 días. Cron de root, después de los de la plataforma y el CashFlow:
#   15 4 * * * bash /opt/analisis-comercial/backup.sh >> /var/log/analisis-backup.log 2>&1
# Restaurar: gunzip el .bak, docker cp a vignoli-sqlserver:/var/opt/mssql/data y RESTORE DATABASE ... WITH REPLACE.
set -euo pipefail
umask 027
B=/opt/analisis-comercial/backups
mkdir -p "$B"
F="AnalisisComercial_$(date +%Y%m%d_%H%M).bak"

SQLCMDPASSWORD=$(set -a; source /home/vignoli/MainPage/deploy/.env; printf '%s' "$SA_PASSWORD")
export SQLCMDPASSWORD
# Igual que la plataforma: Express no comprime (se comprime afuera) y SQL no puede escribir en una carpeta de root,
# así que el .bak se hace en la carpeta de datos del contenedor y se copia con docker cp.
docker exec -e SQLCMDPASSWORD vignoli-sqlserver /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -C -b -Q \
    "BACKUP DATABASE [AnalisisComercial] TO DISK=N'/var/opt/mssql/data/$F' WITH INIT"
docker cp "vignoli-sqlserver:/var/opt/mssql/data/$F" "$B/$F"
docker exec vignoli-sqlserver rm -f "/var/opt/mssql/data/$F"
gzip -f "$B/$F"
find "$B" -name 'AnalisisComercial_*.bak.gz' -mtime +30 -delete
echo "$(date '+%d/%m %H:%M') respaldo $F.gz ($(du -h "$B/$F.gz" | cut -f1))"
