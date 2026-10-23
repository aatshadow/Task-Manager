#!/bin/sh
# Trae al frente la pestaña de Terminal cuyo tty es $1 (el widget de 2day, LOGICA §14.8).
/usr/bin/osascript - "$1" <<'APPLE'
on run argv
	set objetivo to item 1 of argv
	tell application "Terminal"
		repeat with w in windows
			repeat with t in tabs of w
				if tty of t is objetivo then
					set selected of t to true
					set index of w to 1
					activate
					return
				end if
			end repeat
		end repeat
	end tell
end run
APPLE
