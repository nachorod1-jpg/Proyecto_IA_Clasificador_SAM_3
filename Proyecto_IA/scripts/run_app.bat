@echo off
set SCRIPT_DIR=%~dp0
set PS1=%SCRIPT_DIR%run_app.ps1

where pwsh >nul 2>nul
if %errorlevel%==0 (
    pwsh -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
    goto :eof
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
