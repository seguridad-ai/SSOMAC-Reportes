@echo off
title SSOMAC Digital
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  start http://localhost:8000
  py -m http.server 8000
  goto :eof
)
where python >nul 2>nul
if %errorlevel%==0 (
  start http://localhost:8000
  python -m http.server 8000
  goto :eof
)
start index.html
