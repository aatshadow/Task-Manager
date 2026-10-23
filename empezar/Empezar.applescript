-- Empezar (LOGICA §14.4): 2day en local + cuatro terminales con Claude Code en rejilla 2×2.
-- 2day ya está siempre encendido en :5400 (LaunchAgent net.core.2day-local); aquí sólo se despierta por si acaso.

do shell script "launchctl kickstart gui/$(id -u)/net.core.2day-local >/dev/null 2>&1 || true"

tell application "Google Chrome"
	activate
	open location "http://localhost:5400"
end tell

tell application "Finder" to set {x0, y0, x1, y1} to bounds of window of desktop
set arriba to y0 + 38 -- barra de menús
set hueco to 6
set ancho to ((x1 - x0) - hueco) div 2
set alto to ((y1 - arriba) - hueco) div 2
set huecos to {{x0, arriba}, {x0 + ancho + hueco, arriba}, {x0, arriba + alto + hueco}, {x0 + ancho + hueco, arriba + alto + hueco}}

set yaAbierto to application "Terminal" is running
tell application "Terminal"
	activate
	repeat with i from 1 to 4
		if i is 1 and not yaAbierto then
			delay 0.6
			do script "cd ~ && claude" in window 1
		else
			do script "cd ~ && claude"
		end if
		delay 0.3
		set {px, py} to item i of huecos
		set bounds of front window to {px, py, px + ancho, py + alto}
	end repeat
end tell
