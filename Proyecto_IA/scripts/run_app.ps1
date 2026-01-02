Param(
    [ValidateSet('dev', 'app')]
    [string]$Mode = 'dev'
)

$ErrorActionPreference = 'Stop'
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptPath
$logsDir = Join-Path $repoRoot 'logs'
$launcherLog = Join-Path $logsDir 'launcher.log'
$frontendLog = Join-Path $logsDir 'frontend-dev.log'
$backendLog = Join-Path $logsDir 'backend-dev.log'

if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir | Out-Null }

function Write-Log($Message) {
    $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $line = "$timestamp - $Message"
    Write-Host $line
    Add-Content -Path $launcherLog -Value $line
}

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name no está instalado o no está en PATH."
    }
}

function Wait-ForHealth($Url, $Retries = 40) {
    for ($i = 0; $i -lt $Retries; $i++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -eq 200) { return $true }
        } catch {
            Start-Sleep -Seconds 1
        }
    }
    return $false
}

function Wait-ForEndpoint($Url, $Retries = 60, $DelaySeconds = 1, $ProcessId = $null) {
    for ($i = 0; $i -lt $Retries; $i++) {
        if ($ProcessId -and -not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
            Write-Log "El proceso asociado (PID $ProcessId) terminó antes de que $Url respondiera."
            return $false
        }
        try {
            $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
            if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) { return $true }
        } catch {
            Start-Sleep -Seconds $DelaySeconds
        }
    }
    return $false
}

Write-Log "Modo seleccionado: $Mode"
Require-Command python
Require-Command npm
Require-Command node

$venvPath = Join-Path $repoRoot '.venv'
$pythonCmd = 'python'
if (-not (Test-Path $venvPath)) {
    Write-Log "Creando entorno virtual en $venvPath"
    & $pythonCmd -m venv $venvPath
}
$pythonCmd = Join-Path $venvPath 'Scripts/python.exe'
if (-not (Test-Path $pythonCmd)) {
    $pythonCmd = Join-Path $venvPath 'bin/python'
}

Write-Log "Actualizando pip y dependencias del backend"
& $pythonCmd -m pip install --upgrade pip | Out-String | Add-Content -Path $launcherLog
& $pythonCmd -m pip install -e (Join-Path $repoRoot 'apps/backend') | Out-String | Add-Content -Path $launcherLog

$frontendDir = Join-Path $repoRoot 'frontend'
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Log "Instalando dependencias de frontend"
    Push-Location $frontendDir
    npm install | Out-String | Add-Content -Path $launcherLog
    Pop-Location
}

$env:APP_ENV = ($Mode -eq 'dev') ? 'dev' : 'app'
$env:ENABLE_LOGS_ENDPOINT = 'true'

if ($Mode -eq 'dev') {
    Write-Log 'Iniciando backend (uvicorn --reload)'
    $backendDir = Join-Path $repoRoot 'apps/backend'
    $backendArgs = "-m","uvicorn","src.main:app","--reload","--host","0.0.0.0","--port","8000","--app-dir","$backendDir","--workers","1"
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList $backendArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $backendLog -RedirectStandardError $backendLog
    Write-Log "Backend PID: $($backendProc.Id)"

    Write-Log 'Iniciando frontend (npm run dev)'
    $frontendProc = Start-Process -FilePath 'npm' -ArgumentList 'run','dev','--','--host' -WorkingDirectory $frontendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $frontendLog -RedirectStandardError $frontendLog
    Write-Log "Frontend PID: $($frontendProc.Id)"

    Start-Sleep -Seconds 1
    if ($frontendProc.HasExited) {
        Write-Log "El proceso de frontend terminó inmediatamente. Revisa $frontendLog."
        exit 1
    }

    $backendReady = Wait-ForHealth 'http://localhost:8000/api/v1/health'
    if ($backendReady) {
        Write-Log 'Backend listo (healthcheck OK).'
    } else {
        Write-Log 'El backend no respondió al healthcheck (http://localhost:8000/api/v1/health)'
    }

    Write-Log 'Esperando a que el frontend responda en http://localhost:5173/'
    $frontendReady = Wait-ForEndpoint 'http://localhost:5173/' 60 1 $frontendProc.Id

    if ($frontendReady -and $backendReady) {
        Write-Log 'Frontend listo, abriendo navegador en http://localhost:5173/system/status'
        Start-Process 'http://localhost:5173/system/status'
    } elseif ($frontendReady) {
        Write-Log 'Frontend respondió pero el backend no pasó el healthcheck. Revisa los logs antes de continuar.'
    } else {
        Write-Log "El frontend no respondió en el tiempo esperado. Revisa $frontendLog."
    }
} else {
    $distDir = Join-Path $frontendDir 'dist'
    if (-not (Test-Path $distDir)) {
        Write-Log 'No se encontró dist/, ejecutando npm run build'
        Push-Location $frontendDir
        npm run build | Out-String | Add-Content -Path $launcherLog
        Pop-Location
    }

    Write-Log 'Iniciando backend en modo APP (sirviendo build estático)'
    $backendDir = Join-Path $repoRoot 'apps/backend'
    $backendArgs = "-m","uvicorn","src.main:app","--host","0.0.0.0","--port","8000","--app-dir","$backendDir","--workers","1"
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList $backendArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $backendLog -RedirectStandardError $backendLog
    Write-Log "Backend PID: $($backendProc.Id)"

    if (Wait-ForHealth 'http://localhost:8000/api/v1/health') {
        Write-Log 'Aplicación lista, abriendo navegador en http://localhost:8000/'
        Start-Process 'http://localhost:8000/'
    } else {
        Write-Log 'El backend no respondió al healthcheck (http://localhost:8000/api/v1/health)'
    }
}

Write-Log 'Script finalizado.'
