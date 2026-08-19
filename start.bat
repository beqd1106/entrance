@echo off
chcp 65001 > nul
cd /d "%~dp0"
echo Houserule デモを起動します...
start "" http://localhost:5173/
node server.js 5173
pause
