"""Escaneo preliminar de datasets para validar estructura y tamaño."""

from pathlib import Path

DATASET_DIR = Path(__file__).resolve().parents[2] / "data" / "datasets"


def main() -> None:
    DATASET_DIR.mkdir(parents=True, exist_ok=True)
    archivos = list(DATASET_DIR.iterdir())
    if not archivos:
        print(f"No se encontraron datasets en {DATASET_DIR}. Agrega datos antes de entrenar.")
    else:
        for ruta in archivos:
            print(f"- {ruta.name}: {'directorio' if ruta.is_dir() else 'archivo'}")


if __name__ == "__main__":
    main()
