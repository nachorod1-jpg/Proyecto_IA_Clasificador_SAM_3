#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT/apps/backend"

echo "Iniciando backend..."
# python -m uvicorn main:app --reload
