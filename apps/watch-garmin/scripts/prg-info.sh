#!/usr/bin/env bash
# Show version / device info for a built .prg (from filename, BUILD_INFO, or embedded strings).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PRG="${1:-${ROOT}/bin/SailingPerformance.prg}"
BUILD_INFO="${ROOT}/bin/BUILD_INFO.txt"

if [[ ! -f "${PRG}" ]]; then
  echo "File not found: ${PRG}" >&2
  echo "Run: ./scripts/build.sh epix2pro47mm" >&2
  exit 1
fi

echo "PRG: ${PRG}"
echo "Size: $(wc -c < "${PRG}" | tr -d ' ') bytes"
echo "Modified: $(stat -f "%Sm" "${PRG}" 2>/dev/null || stat -c "%y" "${PRG}")"

BASENAME="$(basename "${PRG}")"
if [[ "${BASENAME}" =~ SailingPerformance-v([0-9]+\.[0-9]+\.[0-9]+)-([^.]+)\.prg ]]; then
  echo "Filename version: ${BASH_REMATCH[1]}"
  echo "Filename device:  ${BASH_REMATCH[2]}"
fi

if [[ -f "${BUILD_INFO}" ]]; then
  echo ""
  echo "BUILD_INFO.txt:"
  cat "${BUILD_INFO}"
fi

EMBEDDED="$(strings "${PRG}" 2>/dev/null | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1 || true)"
if [[ -n "${EMBEDDED}" ]]; then
  echo ""
  echo "Embedded UI version string: ${EMBEDDED}"
else
  echo ""
  echo "Embedded UI version string: (not found — likely an older build)"
fi
