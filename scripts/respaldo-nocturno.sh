#!/bin/bash
# Respaldo nocturno de producción (hosting V2, cuenta etxmsuzy).
# - BD completa comprimida, todos los días.
# - Imágenes subidas (uploads/), los domingos.
# - Borra respaldos de más de 14 días.
# Las claves se leen de config.php (nunca van en este archivo).
# Cron sugerido (cPanel > Tareas Cron): 30 3 * * * /home/etxmsuzy/app.travelonline.cl/scripts/respaldo-nocturno.sh
set -euo pipefail
umask 077
APP="${APP:-$HOME/app.travelonline.cl}"
DEST="${DEST:-$HOME/respaldos}"
mkdir -p "$DEST"
HOY=$(date +%F)

read -r DB_HOST DB_PORT DB_NAME DB_USER DB_PASS < <(php -r "require '$APP/config.php'; echo DB_HOST,' ',DB_PORT,' ',DB_NAME,' ',DB_USER,' ',DB_PASS,PHP_EOL;")
MYSQL_PWD="$DB_PASS" mysqldump -h"$DB_HOST" -P"$DB_PORT" -u"$DB_USER" --no-tablespaces --single-transaction --routines "$DB_NAME" | gzip > "$DEST/bd-$HOY.sql.gz"

if [ "$(date +%u)" = "7" ]; then
  tar czf "$DEST/uploads-$HOY.tgz" -C "$APP" uploads
fi

find "$DEST" -type f \( -name 'bd-*.sql.gz' -o -name 'uploads-*.tgz' \) -mtime +14 -delete
echo "$(date '+%F %T') respaldo ok: $(ls -1 "$DEST" | wc -l) archivos, $(du -sh "$DEST" | cut -f1)"
