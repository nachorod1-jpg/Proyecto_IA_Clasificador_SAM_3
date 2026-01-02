$ErrorActionPreference = 'Stop'
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptPath
$logsDir = Join-Path $repoRoot 'logs'
$launcherLog = Join-Path $logsDir 'launcher.log'
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

function Write-Log($Message) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "$timestamp - $Message"
    Write-Host $line
    Add-Content -Path $launcherLog -Value $line
}

$ports = @(8000, 5173)
foreach ($port in $ports) {
    try {
        $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
        foreach ($conn in $connections) {
            try {
                $proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Log "Deteniendo proceso $($proc.ProcessName) (PID $($proc.Id)) en puerto $port"
                    Stop-Process -Id $proc.Id -Force
                }
            } catch {}
        }
    } catch {
        Write-Log "No se pudo inspeccionar el puerto $port."
    }
}

Write-Log 'Deteniendo procesos npm/uvicorn activos (si existen).'
Get-Process -Name uvicorn, python, node, npm -ErrorAction SilentlyContinue | ForEach-Object {
    try {
        Write-Log "Deteniendo $_.ProcessName (PID $($_.Id))"
        Stop-Process -Id $_.Id -Force
    } catch {}
}

Write-Log 'Stop finalizado.'
