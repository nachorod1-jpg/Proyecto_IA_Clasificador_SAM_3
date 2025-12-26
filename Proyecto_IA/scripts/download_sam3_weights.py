"""Descarga los pesos de SAM-3 desde Hugging Face a checkpoints/sam3.

Este script es idempotente: reutiliza el contenido existente cuando ya está
presente en ``checkpoints/sam3`` y evita el uso de symlinks para asegurar
compatibilidad con Windows.
"""
from __future__ import annotations

import sys
from pathlib import Path

from huggingface_hub import HfApi, HfFolder, HfHubHTTPError, snapshot_download

REPO_ID = "facebook/sam3"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
TARGET_DIR = PROJECT_ROOT / "checkpoints" / "sam3"


def ensure_token() -> str:
    token = HfFolder.get_token()
    if token:
        return token
    raise SystemExit(
        "No se encontró token de Hugging Face. Ejecuta:\n"
        "  python -m huggingface_hub.commands.huggingface_cli login"
    )


def assert_repo_access(api: HfApi, token: str) -> None:
    try:
        api.repo_info(repo_id=REPO_ID, repo_type="model", token=token)
    except HfHubHTTPError as exc:  # acceso denegado o sin permisos
        status = exc.response.status_code if exc.response is not None else None
        if status == 401:
            raise SystemExit(
                "El token es inválido o expiró. Repite el login y prueba de nuevo."
            )
        if status == 403:
            raise SystemExit(
                "Acceso denegado al repositorio gated. Asegúrate de haber solicitado "
                "acceso al modelo SAM-3 en Hugging Face y que haya sido aprobado."
            )
        raise


def print_summary(target_dir: Path) -> None:
    files = [p for p in target_dir.rglob("*") if p.is_file()]
    total_bytes = sum(p.stat().st_size for p in files)
    big_candidates = [p for p in files if p.name in {"model.safetensors", "sam3.pt"}]

    print(f"Archivos descargados: {len(files)}")
    print(f"Tamaño total: {total_bytes / (1024 ** 3):.2f} GB")

    if not big_candidates:
        big_candidates = sorted(files, key=lambda p: p.stat().st_size, reverse=True)[:2]

    if big_candidates:
        print("Archivos grandes:")
        for p in big_candidates:
            size_gb = p.stat().st_size / (1024 ** 3)
            print(f" - {p.name}: {size_gb:.2f} GB")


def main() -> int:
    print("=== Descarga de pesos SAM-3 ===")
    token = ensure_token()
    api = HfApi()
    assert_repo_access(api, token)

    TARGET_DIR.mkdir(parents=True, exist_ok=True)
    if any(TARGET_DIR.iterdir()):
        print(f"Se detectaron archivos existentes en {TARGET_DIR}. Reutilizando...")

    try:
        snapshot_download(
            repo_id=REPO_ID,
            local_dir=TARGET_DIR,
            local_dir_use_symlinks=False,
            resume_download=True,
            token=token,
        )
    except HfHubHTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status == 401:
            print("Error de autenticación. Repite el login con tu token.")
            return 1
        if status == 403:
            print(
                "El token no tiene acceso al modelo gated. Solicita acceso en "
                "https://huggingface.co/facebook/sam3"
            )
            return 1
        raise
    except Exception as exc:  # noqa: BLE001
        print(f"Fallo durante la descarga: {exc}")
        return 1

    print_summary(TARGET_DIR)
    print("Descarga finalizada. Los pesos se encuentran en checkpoints/sam3/.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
