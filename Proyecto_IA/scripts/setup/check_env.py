"""Comprobaciones básicas de entorno para el proyecto SAM 3."""

import sys

REQUIRED_MAJOR = 3
REQUIRED_MINOR = 10


def main() -> int:
    if sys.version_info < (REQUIRED_MAJOR, REQUIRED_MINOR):
        print(f"Python {REQUIRED_MAJOR}.{REQUIRED_MINOR} o superior es requerido.")
        return 1
    print("Entorno válido. Ajusta las dependencias en el futuro.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
