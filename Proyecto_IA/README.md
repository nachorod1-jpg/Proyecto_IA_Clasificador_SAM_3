# Proyecto IA - Backend SAM-3 LOD1

Este backend implementa la fase 1 (Clasificación Jerárquica I · Nivel 1: detección masiva) sobre datasets locales usando FastAPI y SQLite.

## Requisitos
- Python 3.10+
- Dependencias: `pip install -e apps/backend`
- Pesos de SAM-3 descargados en la máquina local (no se versionan).
- Node.js 18+ y npm (para el frontend o build embebido en modo APP).

## Arranque rápido (Windows)

Scripts listos para doble clic en `scripts/`:

- `run_app.bat` / `run_app.ps1`: lanza el entorno completo y escribe trazas en `logs/launcher.log`.
  - **Modo DEV (por defecto)**: `scripts\run_app.bat` abre dos procesos (backend con `uvicorn --reload` y frontend con `npm run dev -- --host`), mata previamente cualquier PID en escucha en 8000/5173 (solo uvicorn/python/node/vite salvo `-ForceKillPorts`), valida salud en `http://localhost:8000/api/v1/health` y abre el navegador en `http://localhost:5173/system/status` cuando todo responde.
  - **Modo APP**: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run_app.ps1 -Mode app` construye el frontend si falta `frontend/dist/`, levanta solo el backend sirviendo la build estática y abre `http://localhost:8000/`.
- `run_app_sam3_env.bat`: wrapper opcional que delega en `run_app.ps1` con `-Mode dev -CondaEnvName sam3_env -SkipVenv -KillPorts` (útil si ya tienes el entorno con las dependencias de SAM-3).
- `stop_app.bat` / `stop_app.ps1`: intenta cerrar procesos en los puertos 8000/5173 y detiene procesos `uvicorn/python/node/npm` activos.

El launcher redirige stdout/stderr del backend y frontend a `logs/backend-dev.out.log`, `logs/backend-dev.err.log`, `logs/frontend-dev.out.log` y `logs/frontend-dev.err.log` respectivamente (además de `logs/launcher.log`).

Los scripts crean un `venv` en `.venv/` (si no existe), instalan dependencias (`pip install -e apps/backend`, `npm install` si falta `node_modules`) y exportan `APP_ENV`/`ENABLE_LOGS_ENDPOINT=true` para habilitar los endpoints de logs en la UI. Si ya tienes un entorno externo con SAM-3 (por ejemplo `sam3_env`), puedes usarlo sin crear `.venv` pasando `-BackendPython` o `-CondaEnvName` al launcher.

### Ejecutar en modo DEV usando el entorno `sam3_env`

- Recomendada: especifica la ruta a `python.exe` del entorno existente (no necesita activación previa):
  ```powershell
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_app.ps1 -Mode dev -BackendPython "C:\ruta\a\sam3_env\python.exe" -SkipVenv -KillPorts
  ```
- Alternativa con conda (el script resuelve la ruta interna y valida `transformers.Sam3Model`):
  ```powershell
  pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\run_app.ps1 -Mode dev -CondaEnvName sam3_env -SkipVenv -KillPorts
  ```

Notas:
- El script valida el intérprete elegido con `python -c "from transformers import Sam3Model; ..."` y aborta si falta la dependencia.
- En estos modos no se ejecuta `pip install` sobre el entorno externo, salvo que se indique `-InstallBackendEditable` explícitamente.
 - El parámetro `-KillPorts` está activo por defecto en DEV e intenta cerrar únicamente procesos uvicorn/python (8000) y node/vite (5173); usa `-ForceKillPorts` para forzar el cierre de otros procesos en esos puertos.

### Archivos de log generados

- `logs/launcher.log`: bitácora principal del launcher (incluye procesos matados y comandos usados).
- `logs/backend-dev.out.log` / `logs/backend-dev.err.log`: salida y errores estándar del backend en modo DEV.
- `logs/frontend-dev.out.log` / `logs/frontend-dev.err.log`: salida y errores estándar del frontend en modo DEV.

## Variables de entorno
Crea un archivo `.env` basado en `.env.example`:

```bash
cp .env.example .env
```

Variables relevantes:
- `SAM3_WEIGHTS_DIR`: carpeta con los checkpoints de SAM-3.
- `SAM3_CHECKPOINT_PATH`: ruta directa a un checkpoint (tiene prioridad sobre `SAM3_WEIGHTS_DIR`).
- `DATABASE_PATH` (opcional): por defecto `data/app.db`.
- `LOGS_DIR`, `OUTPUT_DIR` (opcionales).

Si la ruta de pesos no existe, el endpoint `/api/v1/health` y los jobs reportarán "SAM-3 weights not found".

## Estructura de datos
- Base de datos SQLite en `data/app.db` (se crea automáticamente).
- Logs de jobs en `logs/job_{id}.log`.
- Máscaras/artefactos opcionales en `output/masks` y miniaturas en `output/thumbs`.

## Ejecutar el servidor
```bash
cd apps/backend
pip install -e .
UVICORN_WORKERS=1 uvicorn main:app --reload --port 8000
```

## Endpoints principales (ejemplos cURL)
Registrar dataset e indexar imágenes:
```bash
curl -X POST http://localhost:8000/api/v1/datasets \
  -H "Content-Type: application/json" \
  -d '{"name": "demo", "root_path": "C:/datasets/imagenes"}'
```

Crear o actualizar concepto:
```bash
curl -X POST http://localhost:8000/api/v1/concepts \
  -H "Content-Type: application/json" \
  -d '{"name": "roof", "family": "ROOF", "color_hex": "#4caf50", "level": 1}'
```

Lanzar job nivel 1:
```bash
curl -X POST http://localhost:8000/api/v1/jobs/level1 \
  -H "Content-Type: application/json" \
  -d '{"dataset_id":1, "concepts":[{"concept_id":1,"prompt_text":"roof"}], "user_confidence":0.5, "batch_size":1, "target_long_side":768}'
```

PowerShell con payload completo (usa siempre `concepts`, no `concept_ids`):
```powershell
$body = @{ \
  dataset_id = 1 \
  concepts = @(@{ concept_id = 1; prompt_text = "roof" }) \
  batch_size = 1 \
  safe_mode = $true \
  safe_load = $true \
  device_preference = "auto" \
  target_long_side = 384 \
  box_threshold = 0.6 \
  max_detections_per_image = 20 \
  sleep_ms_between_images = 0 \
  max_images = 100 \
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "http://localhost:8000/api/v1/jobs/level1" -ContentType "application/json" -Body $body
```

### Safe Mode vs Safe Load

- `safe_load` (nuevo, por defecto `true`): controla la estrategia de carga del modelo para minimizar picos de RAM/VRAM (usa `device_map="auto"`, `low_cpu_mem_usage` y fp16 cuando hay CUDA). No fuerza CPU y evita recargas innecesarias.
- `safe_mode` (inferencias): reduce resolución, top-K y pacing durante la ejecución, pero ya no altera el dispositivo de carga.

Campos opcionales al crear jobs de nivel 1:
  - `safe_load` (bool): si falta se asume `true` por compatibilidad.
  - `safe_mode` (bool): controla solo parámetros de inferencia.
  - `device_preference`: `"auto" | "cpu" | "cuda"`. Si no se envía y el job es legacy con `safe_mode=true`, se infiere CPU para mantener compatibilidad.
  - `target_long_side`: si no se envía, `512` en safe mode o `768` en modo normal.
  - `box_threshold`: si no se envía, `0.5` en safe mode o `0.3` en modo normal.
  - `max_detections_per_image`: si no se envía, `20` en safe mode o `100` en modo normal.
  - `sleep_ms_between_images`: pausa entre imágenes (200 ms en safe mode, 0 en normal si no se envía).

Ejemplo de request seguro en CPU:

```bash
curl -X POST http://localhost:8000/api/v1/jobs/level1 \
  -H "Content-Type: application/json" \
  -d '{
    "dataset_id": 1,
    "concepts": [{"concept_id": 1, "prompt_text": "roof"}],
    "safe_mode": true,
    "device_preference": "cpu",
    "max_images": 5
  }'
```

Consultar estado del job y estadísticas:
```bash
curl http://localhost:8000/api/v1/jobs/1
```

Obtener muestras para overlay:
```bash
curl "http://localhost:8000/api/v1/jobs/1/samples?concept_id=1&bucket=b1&limit=5"
```

Descargar imagen original por ID:
```bash
curl -O http://localhost:8000/api/v1/images/10/file
```

## Notas sobre SAM-3
- El backend valida la existencia de la ruta de pesos antes de ejecutar.
- La inferencia usa batch_size=1 y `target_long_side=768` por defecto (configurable en el request).
- Si se produce OOM, se reduce el batch a 1 y se sigue procesando la siguiente imagen.
- El JobManager reutiliza un único runner SAM-3 por ruta de pesos; solo se descarga y recarga si cambian los checkpoints.
- Antes de cargar el modelo se ejecuta un preflight de RAM (y VRAM si aplica) con psutil/torch; si no hay margen suficiente se aborta rápido con error claro.
- El post-procesado usa `threshold=box_threshold` para evitar explosiones de candidatos temporales.

## Cómo funciona el sistema (LOD1)

1. **Backend FastAPI** (carpeta `apps/backend`) expone la API REST y administra:
   - Registro/listado de datasets (`/api/v1/datasets`).
   - Gestión de conceptos de nivel 1 (`/api/v1/concepts`).
   - Lanzamiento y monitorización de jobs de clasificación nivel 1 (`/api/v1/jobs/level1`, `/api/v1/jobs/{job_id}`).
   - Consulta de estadísticas y samples (`/api/v1/jobs/{job_id}/stats`, `/api/v1/jobs/{job_id}/samples`).
   - Servicio de imágenes siempre por HTTP (`/api/v1/images/{image_id}/file`).
2. **Modelo SAM-3**: el backend carga de forma segura los pesos (safe_load) y ejecuta inferencia con parámetros conservadores (safe_mode) si se solicita.
3. **Base de datos SQLite**: persiste datasets, conceptos, jobs y resultados. Se crea automáticamente en `data/app.db`.
4. **Frontend React (Vite + TypeScript)** en `frontend/` consume la API y ofrece:
   - Panel de salud/hardware.
   - Altas y listado de datasets/conceptos.
   - Creación y seguimiento de jobs con polling adaptativo.
   - Resultados con estadísticas y galería paginada de samples (imágenes siempre por HTTP, nunca `file://`).

## Probar en local (backend + frontend)

Sigue estos pasos en dos terminales distintas. Requiere Python 3.10+ y Node.js 18+.

1. **Backend**
   ```bash
   cd apps/backend
   cp ../.env.example ../.env        # configura rutas de pesos SAM-3 y DB
   pip install -e .
   UVICORN_WORKERS=1 uvicorn main:app --reload --port 8000
   ```
   - Comprueba salud en http://localhost:8000/api/v1/health (o vía `/docs`).
   - Registra un dataset de prueba (ajusta la ruta `root_path` a tu carpeta de imágenes):
     ```bash
     curl -X POST http://localhost:8000/api/v1/datasets \
       -H "Content-Type: application/json" \
       -d '{"name": "demo", "root_path": "/ruta/a/imagenes"}'
     ```
   - Crea un concepto L1 mínimo:
     ```bash
     curl -X POST http://localhost:8000/api/v1/concepts \
       -H "Content-Type: application/json" \
       -d '{"name": "roof", "prompt": "roof", "level": 1}'
     ```

2. **Frontend**
   ```bash
   cd frontend
   cp .env.example .env   # define VITE_API_BASE_URL (p. ej. http://localhost:8000)
   npm install
   npm run dev            # Vite en http://localhost:5173
   ```
   - El `vite.config.ts` ya incluye proxy opcional de `/api` hacia `VITE_API_BASE_URL`. Si no lo usas, habilita CORS en el backend.

3. **Flujo de prueba en la UI**
   - Ve a `http://localhost:5173/system/status` para comprobar el health (polling cada 10s con degradación si falta información).
   - En `Datasets`, registra el dataset (usa el mismo nombre y ruta del paso 1) y verifica que aparezca listado.
   - En `Concepts`, crea/edita conceptos de nivel 1.
   - En `Classification > New job`, selecciona el dataset y los conceptos, ajusta umbral opcionalmente y lanza el job.
   - Al crear, se redirige al monitor del job (`/classification/level1/jobs/{id}`) con polling dinámico; desde allí puedes cancelar/reanudar si el backend lo permite.
   - Cuando el job termine, abre la pestaña de resultados para ver estadísticas y la galería paginada de samples (filtros por concepto/bucket, carga diferida de miniaturas).

### Logs y panel de sistema
- El backend escribe trazas rotadas en `logs/backend.log` (directorio creado automáticamente).
- Endpoints de soporte: `GET /api/v1/logs/tail?lines=200` (texto plano) y `GET /api/v1/logs/stream` (SSE). Solo se exponen si `APP_ENV=dev` o `ENABLE_LOGS_ENDPOINT=true`.
- La UI incluye un acordeón "Logs recientes" en `/system/status` con streaming automático y fallback a polling; permite pausar, copiar y elegir el número de líneas.
- El banner de "backend offline" en la UI solo se activa si el healthcheck falla o hay un error de conectividad general. Los errores funcionales (por ejemplo, un 404 en `/api/v1/datasets`) se muestran en la sección correspondiente sin marcar el backend como caído.

### Modo APP (single server)
- Ejecuta `npm run build` en `frontend/` (el launcher lo hace si falta `dist/`).
- Inicia el backend sirviendo los estáticos (ejemplo manual):
  ```bash
  APP_ENV=app ENABLE_LOGS_ENDPOINT=true UVICORN_WORKERS=1 uvicorn src.main:app --host 0.0.0.0 --port 8000 --app-dir apps/backend
  ```
- La SPA queda accesible en `http://localhost:8000/` y las llamadas a la API siguen en `/api/v1/...`.

## Frontend (Vite + React)
El frontend de LOD1 vive en `frontend/` y consume el backend vía HTTP.

### Arranque rápido solo frontend
```bash
cd frontend
cp .env.example .env   # define VITE_API_BASE_URL (p. ej. http://localhost:8000)
npm install
npm run dev
```

En desarrollo, Vite puede hacer proxy de `/api` hacia `VITE_API_BASE_URL`. Si prefieres no usar el proxy, habilita CORS en el backend FastAPI.
