"""Carga SAM-3 y ejecuta un warm-up mínimo."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path
from typing import Any, Dict, Tuple

import numpy as np
import torch
from PIL import Image

TARGET_RESOLUTION = 1024
PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEIGHTS_DIR = PROJECT_ROOT / "checkpoints" / "sam3"
STATUS_PATH = PROJECT_ROOT / "output" / "system_status.json"
HF_REPO_ID = "facebook/sam3"


def get_device_info() -> Tuple[torch.device, bool, str | None, float | None]:
    cuda_available = torch.cuda.is_available()
    device = torch.device("cuda" if cuda_available else "cpu")
    gpu_name = None
    vram_total_gb = None

    if cuda_available:
        try:
            prop = torch.cuda.get_device_properties(device)
            gpu_name = prop.name
            vram_total_gb = round(prop.total_memory / (1024**3), 2)
        except Exception:  # noqa: BLE001
            gpu_name = torch.cuda.get_device_name(0)
    return device, cuda_available, gpu_name, vram_total_gb


def resize_to_target(image: Image.Image, target: int = TARGET_RESOLUTION) -> Image.Image:
    w, h = image.size
    scale = target / max(w, h)
    if scale == 1:
        return image
    new_size = (int(w * scale), int(h * scale))
    return image.resize(new_size, Image.BILINEAR)


def load_with_transformers(source: str | Path, device: torch.device):
    try:
        from transformers import (
            AutoModel,
            AutoModelForImageSegmentation,
            AutoProcessor,
        )
    except ImportError as exc:  # transformers no instalado
        raise RuntimeError("Se requiere transformers para cargar SAM-3") from exc

    processor = None
    processor_error = None
    try:
        processor = AutoProcessor.from_pretrained(source, trust_remote_code=True)
    except Exception as exc:  # noqa: BLE001
        processor_error = exc

    last_error: Exception | None = None
    model = None
    for cls in (AutoModelForImageSegmentation, AutoModel):
        try:
            model = cls.from_pretrained(source, trust_remote_code=True)
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc

    if model is None:
        msg = f"No se pudo cargar el modelo desde {source}: {last_error}"
        raise RuntimeError(msg)

    dtype = torch.float16 if device.type == "cuda" else torch.float32
    try:
        model = model.to(device, dtype=dtype)
    except TypeError:
        model = model.to(device)

    if processor is None and processor_error:
        print(f"Aviso: no se pudo cargar el processor: {processor_error}")
    return model, processor


def tune_processor_resolution(processor) -> None:
    if processor is None:
        return

    image_processor = getattr(processor, "image_processor", processor)
    size_attr = getattr(image_processor, "size", None)
    try:
        if isinstance(size_attr, dict):
            if "shortest_edge" in size_attr:
                size_attr["shortest_edge"] = TARGET_RESOLUTION
            elif "longest_edge" in size_attr:
                size_attr["longest_edge"] = TARGET_RESOLUTION
            elif "height" in size_attr and "width" in size_attr:
                size_attr["height"] = TARGET_RESOLUTION
                size_attr["width"] = TARGET_RESOLUTION
            image_processor.size = size_attr
        elif size_attr is not None:
            image_processor.size = TARGET_RESOLUTION
    except Exception:  # noqa: BLE001
        # En caso de que la API del processor sea distinta, continuamos con el
        # reescalado manual en ``prepare_inputs``.
        pass


def prepare_inputs(image: Image.Image, processor, device: torch.device) -> Dict[str, torch.Tensor]:
    image = resize_to_target(image, TARGET_RESOLUTION)
    if processor is not None:
        inputs = processor(images=image, return_tensors="pt")
        for key, value in inputs.items():
            if isinstance(value, torch.Tensor):
                inputs[key] = value.to(device)
        return inputs

    # Fallback manual: convierte a tensor [1, 3, H, W]
    tensor = torch.from_numpy(np.array(image)).permute(2, 0, 1).float() / 255.0
    tensor = tensor.unsqueeze(0).to(device)
    return {"pixel_values": tensor}


def run_warmup(model, processor, device: torch.device) -> float:
    """
    Warm-up mínimo. Para Sam3VideoModel hace una inferencia sobre 1 frame
    creando un inference_session (requerido por forward()).
    """
    import time
    import inspect
    import numpy as np

    model.eval()

    # Elegimos dtype seguro: en GTX 1050 Ti normalmente bf16 no es viable.
    if device.type == "cuda":
        dtype = torch.float16
    else:
        dtype = torch.float32

    # Detectar si el forward requiere inference_session
    sig = inspect.signature(model.forward)
    needs_session = "inference_session" in sig.parameters

    t0 = time.perf_counter()
    with torch.no_grad():
        if needs_session:
            # 1 frame dummy (H, W, C) uint8
            frame = np.zeros((480, 854, 3), dtype=np.uint8)
            video_frames = [frame]

            # Crear sesión (según README HF)
            inference_session = processor.init_video_session(
                video=video_frames,
                inference_device=device,
                processing_device="cpu",
                video_storage_device="cpu",
                dtype=dtype,
            )

            # Add minimal text prompt (required for SAM3 Video)
            inference_session = processor.add_text_prompt(
                inference_session=inference_session,
                text="object"
            )

            # Una inferencia mínima sobre el frame 0
            _ = model(inference_session=inference_session, frame_idx=0)
        else:
            # Fallback genérico por si en el futuro cargas un modelo "image"
            dummy = np.zeros((512, 512, 3), dtype=np.uint8)
            inputs = processor(images=dummy, text="warmup", return_tensors="pt")
            inputs = {k: v.to(device) if hasattr(v, "to") else v for k, v in inputs.items()}
            _ = model(**inputs)

    t1 = time.perf_counter()
    return t1 - t0


def save_status(payload: Dict[str, Any]) -> None:
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    STATUS_PATH.write_text(json.dumps(payload, indent=2))


def load_model(device: torch.device):
    sources = []
    if WEIGHTS_DIR.exists() and any(WEIGHTS_DIR.iterdir()):
        sources.append(WEIGHTS_DIR)
    sources.append(HF_REPO_ID)

    last_error: Exception | None = None
    for source in sources:
        try:
            print(f"Intentando cargar modelo desde: {source}")
            model, processor = load_with_transformers(source, device)
            tune_processor_resolution(processor)
            return model, processor, source
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print(f"Fallo al cargar desde {source}: {exc}")
    raise RuntimeError(f"No se pudo cargar SAM-3 desde ninguna fuente: {last_error}")


def main() -> int:
    device, cuda_available, gpu_name, vram_total_gb = get_device_info()
    print(f"torch version: {torch.__version__}")
    print(f"CUDA disponible: {cuda_available}")
    if cuda_available:
        print(f"GPU: {gpu_name} | VRAM total: {vram_total_gb} GB")
        if vram_total_gb is not None and vram_total_gb < 8:
            print("Advertencia: VRAM disponible es baja (<8 GB). El modelo podría necesitar CPU.")
    else:
        print("Usando CPU (puede ser más lento).")

    status: Dict[str, Any] = {
        "device": str(device),
        "cuda_available": cuda_available,
        "gpu_name": gpu_name,
        "vram_total_gb": vram_total_gb,
        "low_vram_warning": bool(vram_total_gb is not None and vram_total_gb < 8)
        if cuda_available
        else False,
        "torch_version": torch.__version__,
        "sam3_source": None,
        "weights_path": str(WEIGHTS_DIR),
        "warmup_ok": False,
        "error": None,
    }

    try:
        model, processor, source = load_model(device)
        status["sam3_source"] = str(source)
        warmup_time = run_warmup(model, processor, device)
        status["warmup_ok"] = True
        status["warmup_time_s"] = warmup_time
        print("OK warm-up completed")
    except RuntimeError as exc:
        if "out of memory" in str(exc).lower() and cuda_available:
            print("OOM en GPU. Reintentando en CPU...")
            torch.cuda.empty_cache()
            device_cpu = torch.device("cpu")
            try:
                model, processor, source = load_model(device_cpu)
                status["sam3_source"] = str(source)
                warmup_time = run_warmup(model, processor, device_cpu)
                status["warmup_ok"] = True
                status["device"] = "cpu"
                status["cuda_available"] = False
                status["gpu_name"] = None
                status["vram_total_gb"] = None
                status["warmup_time_s"] = warmup_time
                print("OK warm-up completed en CPU")
            except Exception as cpu_exc:  # noqa: BLE001
                status["error"] = f"CPU fallback failed: {cpu_exc}"
                print(f"Error en fallback CPU: {cpu_exc}")
        else:
            status["error"] = str(exc)
            print(f"Warm-up falló: {exc}")
    except Exception as exc:  # noqa: BLE001
        status["error"] = str(exc)
        print(f"Warm-up falló: {exc}")

    save_status(status)
    return 0 if status.get("warmup_ok") else 1


if __name__ == "__main__":
    sys.exit(main())
