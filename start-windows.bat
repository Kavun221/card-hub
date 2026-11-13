@echo off
REM Starts the Card Hub on this PC: http://127.0.0.1:8080/
REM Needs Node.js (https://nodejs.org, LTS version). Close this window to stop the site.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is not installed. Get it from https://nodejs.org & pause & exit /b 1)
start "" http://127.0.0.1:8080/
node server\server.js
pause
