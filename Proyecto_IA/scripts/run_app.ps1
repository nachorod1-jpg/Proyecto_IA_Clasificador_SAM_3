Param(
    [ValidateSet('dev', 'app')]
    [string]$Mode = 'dev',
    [string]$BackendPython,
    [string]$CondaEnvName,
    [switch]$SkipVenv,
    [switch]$InstallBackendEditable,
    [switch]$KillPorts,
    [switch]$ForceKillPorts
)

$ErrorActionPreference = 'Stop'
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptPath
$logsDir = Join-Path $repoRoot 'logs'
$launcherLog = Join-Path $logsDir 'launcher.log'
$frontendOutLog = Join-Path $logsDir "frontend-$Mode.out.log"
$frontendErrLog = Join-Path $logsDir "frontend-$Mode.err.log"
$backendOutLog = Join-Path $logsDir "backend-$Mode.out.log"
$backendErrLog = Join-Path $logsDir "backend-$Mode.err.log"

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

function Get-ListeningPids($Port) {
    $pids = @()

    if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
        try {
            $pids = Get-NetTCPConnection -LocalPort $Port -State Listen | Select-Object -ExpandProperty OwningProcess -Unique
        } catch {
            Write-Log "Get-NetTCPConnection falló para el puerto ${Port}: $_"
        }
    }

    if (-not $pids -or $pids.Count -eq 0) {
        $netstatOutput = netstat -ano | findstr ":$Port"
        foreach ($line in $netstatOutput) {
            if ($line -match 'LISTENING\s+(\d+)$') {
                $pids += $matches[1]
            }
        }
    }

    return $pids | Sort-Object -Unique
}

function Should-KillProcess($Pid, $Port, $ForceKill, $CommandLine) {
    if ($ForceKill) { return $true }

    $cmdLine = $CommandLine
    if (-not $cmdLine) {
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$Pid").CommandLine
        } catch {
            Write-Log "No se pudo obtener la CommandLine del PID $Pid (puerto $Port): $_"
        }
    }

    if (-not $cmdLine) {
        Write-Log "Sin CommandLine para PID $Pid en puerto $Port. Usa -ForceKillPorts para forzar."
        return $false
    }

    if ($Port -eq 8000) {
        if ($cmdLine -match '(uvicorn|python)') { return $true }
    } elseif ($Port -eq 5173) {
        if ($cmdLine -match '(node|vite)') { return $true }
    }

    Write-Log "PID $Pid en puerto $Port no coincide con procesos esperados (cmdline: $cmdLine). Use -ForceKillPorts para forzar."
    return $false
}

function Kill-Port($Port, $ForceKill) {
    $pids = Get-ListeningPids -Port $Port
    if (-not $pids -or $pids.Count -eq 0) {
        Write-Log "No se encontraron procesos en escucha en el puerto $Port."
        return
    }

    foreach ($pid in $pids) {
        $cmdLine = $null
        try {
            $cmdLine = (Get-CimInstance Win32_Process -Filter "ProcessId=$pid").CommandLine
        } catch {
            $cmdLine = $null
        }

        if (Should-KillProcess -Pid $pid -Port $Port -ForceKill $ForceKill -CommandLine $cmdLine) {
            if ($cmdLine) {
                Write-Log "Matando PID $pid en puerto $Port (cmdline: $cmdLine)"
            } else {
                Write-Log "Matando PID $pid en puerto $Port"
            }
            try {
                taskkill /PID $pid /F | Out-String | Add-Content -Path $launcherLog
            } catch {
                Write-Log "No se pudo terminar PID $pid en puerto ${Port}: $_"
            }
        }
    }
}

Write-Log "Modo seleccionado: $Mode"
Require-Command npm
Require-Command node

function Test-PythonExecutable($Path) {
    if (-not (Test-Path $Path)) {
        throw "Python no encontrado en '$Path'. Usa -BackendPython para especificar la ruta correcta."
    }

    Write-Log "Validando Python en $Path"
    $versionOutput = & $Path -c "import sys; print(sys.version)" 2>&1
    Add-Content -Path $launcherLog -Value "[python-version] $versionOutput"

    try {
        $sam3Output = & $Path -c "from transformers import Sam3Model; print('Sam3Model OK')" 2>&1
        Add-Content -Path $launcherLog -Value "[sam3-check] $sam3Output"
    } catch {
        $message = "El entorno de Python no puede importar transformers.Sam3Model. Usa -BackendPython apuntando a 'sam3_env' o instala las dependencias."
        Add-Content -Path $launcherLog -Value "[sam3-check-error] $_"
        throw $message
    }
}

function Resolve-CondaPython($EnvName) {
    $condaCmd = $env:CONDA_EXE
    if (-not $condaCmd) {
        $condaCmd = (Get-Command conda -ErrorAction SilentlyContinue)?.Source
    }
    if (-not $condaCmd) {
        $condaCmd = (Get-Command conda.bat -ErrorAction SilentlyContinue)?.Source
    }
    if (-not $condaCmd) {
        throw "No se encontró 'conda'. Proporciona -BackendPython con la ruta de python.exe en sam3_env."
    }

    Write-Log "Resolviendo python de conda para el entorno '$EnvName'"
    $tempFile = New-TemporaryFile
    $cmd = "`"$condaCmd`" run -n $EnvName python -c ""import sys; print(sys.executable)"""
    & cmd.exe /c $cmd | Out-File -FilePath $tempFile -Encoding utf8
    $pythonPath = (Get-Content $tempFile -Raw).Trim()
    Remove-Item $tempFile -ErrorAction SilentlyContinue

    if (-not $pythonPath) {
        throw "No se pudo resolver el python del entorno conda '$EnvName'."
    }

    return $pythonPath
}

$backendPythonExplicit = $false
$pythonCmd = $null

if ($BackendPython) {
    $pythonCmd = (Resolve-Path $BackendPython).Path
    $backendPythonExplicit = $true
    Write-Log "Usando BackendPython proporcionado: $pythonCmd"
} elseif ($CondaEnvName) {
    $pythonCmd = Resolve-CondaPython $CondaEnvName
    $backendPythonExplicit = $true
    Write-Log "Usando python de conda ($CondaEnvName): $pythonCmd"
}

$useVenv = -not $backendPythonExplicit
if ($SkipVenv -and $backendPythonExplicit) {
    Write-Log "Se omitirá la creación de .venv porque se definió un intérprete externo."
}

if ($useVenv -and -not $SkipVenv) {
    Require-Command python
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
} elseif (-not $backendPythonExplicit) {
    Require-Command python
    $pythonCmd = 'python'
    Write-Log "Usando el intérprete de Python disponible en PATH sin crear .venv (SkipVenv)."
}

if (-not $pythonCmd) {
    throw "No se pudo determinar el intérprete de Python. Usa -BackendPython o -CondaEnvName, o permite la creación de .venv."
}

Write-Log "BackendPython efectivo: $pythonCmd"
Test-PythonExecutable $pythonCmd

if ($useVenv -and -not $SkipVenv) {
    Write-Log "Actualizando pip y dependencias del backend en .venv"
    & $pythonCmd -m pip install --upgrade pip | Out-String | Add-Content -Path $launcherLog
    & $pythonCmd -m pip install -e (Join-Path $repoRoot 'apps/backend') | Out-String | Add-Content -Path $launcherLog
} elseif ($InstallBackendEditable) {
    Write-Log "Instalando apps/backend en el entorno proporcionado (InstallBackendEditable)."
    & $pythonCmd -m pip install -e (Join-Path $repoRoot 'apps/backend') | Out-String | Add-Content -Path $launcherLog
} else {
    Write-Log "Se asume que el entorno ya tiene las dependencias del backend (sin pip install)."
}

$frontendDir = Join-Path $repoRoot 'frontend'
if (-not (Test-Path (Join-Path $frontendDir 'node_modules'))) {
    Write-Log "Instalando dependencias de frontend"
    Push-Location $frontendDir
    npm install | Out-String | Add-Content -Path $launcherLog
    Pop-Location
}

$env:APP_ENV = 'app'
if ($Mode -eq 'dev') {
    $env:APP_ENV = 'dev'
}
$env:ENABLE_LOGS_ENDPOINT = 'true'
$env:UVICORN_WORKERS = '1'

$killPortsEffective = $false
if ($PSBoundParameters.ContainsKey('KillPorts')) {
    if ($KillPorts) { $killPortsEffective = $true }
} elseif ($Mode -eq 'dev') {
    $killPortsEffective = $true
}

if ($killPortsEffective) {
    Write-Log "Liberando puertos previos (8000 y 5173). ForceKillPorts=$ForceKillPorts"
    Kill-Port -Port 8000 -ForceKill $ForceKillPorts
    Kill-Port -Port 5173 -ForceKill $ForceKillPorts
}

if ($Mode -eq 'dev') {
    Write-Log 'Iniciando backend (uvicorn --reload)'
    $backendDir = Join-Path $repoRoot 'apps/backend'
    $backendArgs = "-m","uvicorn","src.main:app","--reload","--host","0.0.0.0","--port","8000","--app-dir","$backendDir","--workers","1"
    Write-Log "Comando uvicorn: $pythonCmd $($backendArgs -join ' ')"
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList $backendArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog
    Write-Log "Backend PID: $($backendProc.Id)"

    Write-Log 'Iniciando frontend (npm run dev -- --host)'
    $frontendProc = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm run dev -- --host' -WorkingDirectory $frontendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $frontendOutLog -RedirectStandardError $frontendErrLog
    Write-Log "Frontend PID: $($frontendProc.Id)"

    Start-Sleep -Seconds 1
    if ($frontendProc.HasExited) {
        Write-Log "El proceso de frontend terminó inmediatamente. Revisa $frontendErrLog."
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
        Write-Log "El frontend no respondió en el tiempo esperado. Revisa $frontendErrLog."
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
    Write-Log "Comando uvicorn: $pythonCmd $($backendArgs -join ' ')"
    $backendProc = Start-Process -FilePath $pythonCmd -ArgumentList $backendArgs -WorkingDirectory $backendDir -PassThru -WindowStyle Normal -RedirectStandardOutput $backendOutLog -RedirectStandardError $backendErrLog
    Write-Log "Backend PID: $($backendProc.Id)"

    if (Wait-ForHealth 'http://localhost:8000/api/v1/health') {
        Write-Log 'Aplicación lista, abriendo navegador en http://localhost:8000/'
        Start-Process 'http://localhost:8000/'
    } else {
        Write-Log 'El backend no respondió al healthcheck (http://localhost:8000/api/v1/health)'
    }
}

Write-Log 'Script finalizado.'
