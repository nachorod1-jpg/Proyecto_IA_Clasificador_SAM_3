# Proyecto IA - Backend SAM-3 LOD1

Este backend implementa la fase 1 (Clasificación Jerárquica I · Nivel 1: detección masiva) sobre datasets locales usando FastAPI y SQLite.

## Requisitos
- Python 3.10+
- Dependencias: `pip install -e apps/backend`
- Pesos de SAM-3 descargados en la máquina local (no se versionan).

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

### Safe Mode (recomendado para GPUs <=4GB y Windows)
El modo seguro reduce la resolución y el número de detecciones para evitar cuelgues en GPUs pequeñas (por ejemplo GTX 1050 Ti) y obliga a CPU salvo que se pida explícitamente CUDA.

- Campos opcionales al crear jobs de nivel 1:
  - `safe_mode` (bool, por defecto `true`).
  - `device_preference`: `"auto" | "cpu" | "cuda"` (por defecto `"auto"`). En safe mode se usa CPU salvo que se pida `"cuda"` explícito.
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
