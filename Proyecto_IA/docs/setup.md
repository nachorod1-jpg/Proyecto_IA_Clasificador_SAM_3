# Configuración de SAM-3 (weights locales + warm-up)

## Prerrequisitos
- Windows 10 con Python 3.11 (conda env `sam3_env`).
- PyTorch + torchvision instalados (CUDA 11.8 recomendado si hay GPU).
- Repositorio SAM-3 instalado en editable (`pip install -e vendor/sam3`) o mediante el paquete correspondiente.

## Acceso gated y login
1. Solicita acceso al modelo en Hugging Face una sola vez por cuenta: https://huggingface.co/facebook/sam3
2. Una vez aprobado, inicia sesión en la máquina (no requiere `huggingface-cli` en PATH):
   ```bash
   python -m huggingface_hub.commands.huggingface_cli login
   ```

## Descarga de pesos
Los pesos **no** se versionan (carpeta `checkpoints/` está en `.gitignore`). Para descargarlos o verificarlos:
```bash
python Proyecto_IA/scripts/download_sam3_weights.py
```
Esto dejará el snapshot en `Proyecto_IA/checkpoints/sam3/` evitando symlinks (compatible con Windows) y reusará descargas previas.

## Warm-up del motor SAM-3
Una vez descargados los pesos, ejecuta un warm-up mínimo (usa GPU si está disponible, caso contrario CPU):
```bash
python Proyecto_IA/scripts/warmup_sam3.py
```
El script registra hardware, carga el modelo a resolución objetivo 1024, corre dos inferencias dummy y genera `Proyecto_IA/output/system_status.json` con el estado.
