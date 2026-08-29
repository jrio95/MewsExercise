#!/bin/sh
set -e

# El volumen de Railway se monta en tiempo de ejecucion y pertenece a root, lo
# que tapa el chown hecho durante el build: sin esto, SQLite no puede crear la
# base y el contenedor se reinicia en bucle con SQLITE_CANTOPEN.
#
# Arrancamos como root solo para ajustar el propietario y bajamos de inmediato a
# un usuario sin privilegios para ejecutar la aplicacion.
if [ -d "$DATA_DIR" ]; then
  chown -R node:node "$DATA_DIR" || echo "aviso: no se pudo ajustar el propietario de $DATA_DIR"
fi

exec gosu node "$@"
