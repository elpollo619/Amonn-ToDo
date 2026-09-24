#!/usr/bin/env bash
# Diagnóstico del NAS en un solo comando, SOLO LECTURA (no cambia nada).
#
# Uso, desde el Mac de Cris (con Tailscale encendido):
#   bash scripts/diagnostico-nas.sh
#
# Qué mira, en el orden en que suele fallar:
#   1. ¿Se llega al NAS por Tailscale?
#   2. Estado de todos los contenedores (servidor, BD, gateway de WhatsApp, Watchtower, tailscale)
#   3. Últimas líneas del servidor y de la BD
#   4. Dueño de los ficheros de Postgres (el incidente del 08.09: pasaron a root y la BD enmudeció)
#   5. Espacio en disco
#   6. Watchtower y la versión que corre
#   7. /api/health y /api/version desde dentro del NAS
#
# No imprime el compose (tiene los secretos reales). Al final sugiere el arreglo
# según lo encontrado, pero no lo ejecuta.

set -u
NAS="${NAS:-Cris@100.77.9.60}"
KEY="${KEY:-$HOME/.ssh/id_ed25519_kali}"

echo "== 1. Conexión con el NAS ($NAS) =="
if ! ssh -i "$KEY" -o ConnectTimeout=10 -o BatchMode=yes "$NAS" true 2>/dev/null; then
  echo "❌ No se llega al NAS por SSH."
  echo "   · ¿Está encendido el NAS? (luz del frontal)"
  echo "   · ¿Tailscale está encendido en este Mac? (icono arriba a la derecha)"
  echo "   · Si el NAS está encendido pero no aparece en Tailscale: reiniciarlo"
  echo "     desde UGOS (http://192.168.1.9 estando en la red de casa)."
  exit 1
fi
echo "✅ SSH OK"

ssh -i "$KEY" -o ConnectTimeout=10 "$NAS" 'bash -s' <<'REMOTO'
set -u
seccion() { echo; echo "== $* =="; }

seccion "2. Contenedores"
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}' 2>&1

seccion "3a. Servidor (amonn-server), últimas 40 líneas"
docker logs --tail 40 amonn-server 2>&1 | sed -E 's/(password|secret|token|key)=[^ ]+/\1=***/Ig'

seccion "3b. Base de datos, últimas 20 líneas"
DB=$(docker ps -a --format '{{.Names}}' | grep -iE 'amonn.*db|db.*amonn|^db$|postgres' | head -1)
if [ -n "$DB" ]; then
  echo "(contenedor: $DB)"
  docker logs --tail 20 "$DB" 2>&1
else
  echo "⚠️ No se encontró el contenedor de la BD"
fi

seccion "4. Dueño de los ficheros de Postgres (debe ser 70:70)"
PG=/volume1/docker/data/pgdata
if [ -d "$PG" ]; then
  docker run --rm -v "$PG":/d alpine sh -c 'stat -c "%u:%g %a %n" /d; echo "ficheros que NO son de 70: $(find /d ! -uid 70 | wc -l)"' 2>&1
else
  echo "(no existe $PG; quizá la BD usa un volumen con nombre)"
fi

seccion "5. Disco"
df -h /volume1 2>&1 | tail -1
docker system df 2>&1 | head -5

seccion "6. Watchtower (últimas 10 líneas)"
docker logs --tail 10 amonn-watchtower 2>&1

seccion "7. Salud y versión (desde dentro del NAS)"
echo -n "health:  "; curl -s -m 5 http://localhost:8080/api/health || echo "sin respuesta"
echo; echo -n "version: "; curl -s -m 5 http://localhost:8080/api/version || echo "sin respuesta"
echo

seccion "Sugerencia"
ESTADO=$(docker inspect -f '{{.State.Status}} {{.State.ExitCode}} restarts={{.RestartCount}}' amonn-server 2>/dev/null || echo "no-existe")
echo "amonn-server: $ESTADO"
case "$ESTADO" in
  no-existe*) echo "→ El contenedor no existe: recrear el proyecto:
   cd /volume1/docker && docker compose -p amonn -f docker-compose.yaml up -d" ;;
  exited*|dead*|created*) echo "→ Está parado. Leer el punto 3a (la causa suele estar en la última línea) y luego:
   cd /volume1/docker && docker compose -p amonn -f docker-compose.yaml up -d" ;;
  restarting*) echo "→ Se reinicia en bucle: la causa está en el punto 3a. Si habla de la BD (42501, permission denied), ver punto 4." ;;
  running*) echo "→ Corre. Si el asistente no responde, mirar en 3a las líneas [wa] (sesión de WhatsApp desvinculada → escanear el QR en el panel del Gateway, puerto 2785)." ;;
esac
echo "Si el punto 4 muestra ficheros que no son de 70 (arreglo del 08.09):
   docker run --rm -v /volume1/docker/data/pgdata:/d alpine sh -c 'chown -R 70:70 /d && chmod 700 /d'
   y reiniciar la BD y el servidor."
REMOTO
