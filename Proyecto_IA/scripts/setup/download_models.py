"""Placeholder para descarga de modelos SAM 3."""

from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parents[2] / "checkpoints" / "sam3"


def main() -> None:
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Descarga de modelos pendiente. Directorio objetivo: {MODEL_DIR}")


if __name__ == "__main__":
    main()
