#!/bin/sh
# Panel de 2day (LOGICA §14.8): abre o cierra la ventana estrecha pegada a la derecha.
# Va en un Chrome aislado (perfil propio en ~/.claude/2day-bitacora/panel-chrome) para poder
# saber si está abierto y cerrarlo sin tocar el Chrome de Alex: abrir/cerrar = arrancar/parar ese proceso.
PERFIL="$HOME/.claude/2day-bitacora/panel-chrome"
# Un solo panel: un segundo clic en menos de 3 s (doble clic, Chrome aún arrancando) no hace nada.
MARCA="$HOME/.claude/2day-bitacora/panel.ultimo"
ahora=$(date +%s)
[ -f "$MARCA" ] && [ $(( ahora - $(cat "$MARCA") )) -lt 3 ] && exit 0
echo "$ahora" > "$MARCA"
if pgrep -f "user-data-dir=$PERFIL" >/dev/null; then
  pkill -f "user-data-dir=$PERFIL"
  exit 0
fi
ancho=$(/usr/bin/osascript -e 'tell application "Finder" to get item 3 of (get bounds of window of desktop)' 2>/dev/null)
x=$(( ${ancho:-1710} - 430 ))
open -na "Google Chrome" --args --user-data-dir="$PERFIL" --no-first-run --no-default-browser-check \
  --app="http://localhost:5400/#panel" --window-size=420,1040 --window-position=$x,38
