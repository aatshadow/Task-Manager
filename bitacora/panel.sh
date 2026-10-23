#!/bin/sh
# Abre el panel de 2day (LOGICA §14.8) como ventana estrecha pegada a la derecha; si ya está abierto, lo cierra.
abierto=$(/usr/bin/osascript <<'APPLE'
tell application "System Events" to set corre to (exists process "Google Chrome")
if not corre then return "no"
tell application "Google Chrome"
	repeat with w in windows
		if (URL of active tab of w) contains "localhost:5400/#panel" then
			close w
			return "cerrado"
		end if
	end repeat
end tell
return "no"
APPLE
)
[ "$abierto" = "cerrado" ] && exit 0
ancho=$(/usr/bin/osascript -e 'tell application "Finder" to get item 3 of (get bounds of window of desktop)')
x=$(( ${ancho:-1710} - 430 ))
open -na "Google Chrome" --args --app="http://localhost:5400/#panel" --window-size=420,1040 --window-position=$x,38
