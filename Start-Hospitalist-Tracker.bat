@echo off
REM RoundingOS launcher: starts the local server (server.ps1) and opens http://localhost:8765
REM Running on localhost lets the browser use the microphone and save to data\hospitalist-data.json
title RoundingOS - local server (keep this window open)
cd /d "%~dp0"
if not exist "%~dp0server.ps1" (
  echo server.ps1 was not found next to this file.
  echo Put Start-Hospitalist-Tracker.bat in the same folder as index.html and server.ps1.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server.ps1"
echo.
echo The RoundingOS server has stopped.
pause
