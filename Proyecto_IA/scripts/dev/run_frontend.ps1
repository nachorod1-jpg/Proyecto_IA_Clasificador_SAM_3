Param()

$ProjectRoot = Split-Path -Path $PSScriptRoot -Parent | Split-Path -Parent
Set-Location "$ProjectRoot/apps/frontend"

Write-Host "Iniciando frontend..."
# npm install
# npm run dev
