Param()

$ProjectRoot = Split-Path -Path $PSScriptRoot -Parent | Split-Path -Parent
Set-Location "$ProjectRoot/apps/backend"

Write-Host "Iniciando backend..."
# python -m uvicorn main:app --reload
