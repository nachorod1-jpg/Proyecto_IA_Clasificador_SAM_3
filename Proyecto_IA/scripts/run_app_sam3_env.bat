@echo off
set SCRIPT_DIR=%~dp0
set DEFAULT_ENV=sam3_env
call "%SCRIPT_DIR%run_app.bat" -Mode dev -CondaEnvName %DEFAULT_ENV% %*
