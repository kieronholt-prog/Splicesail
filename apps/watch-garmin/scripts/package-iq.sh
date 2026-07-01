#!/usr/bin/env bash
# Build a signed .iq package for Garmin Connect beta testing.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CIQ_HOME="${HOME}/Library/Application Support/Garmin/ConnectIQ"
SDK_ROOT="${CIQ_HOME}/Sdks"
export CONNECT_IQ_HOME="${CIQ_HOME}"

SDK_BIN="$(ls -d "${SDK_ROOT}"/connectiq-sdk-mac-*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${SDK_BIN}:${PATH}"
export PATH="/opt/homebrew/opt/openjdk@21/bin:${PATH}"

KEY="${GARMIN_DEV_KEY:-${HOME}/.garmin/developer_key.der}"
OUT="${ROOT}/bin/SailingPerformance.iq"

if [[ ! -f "${KEY}" ]]; then
  echo "Developer key missing at ${KEY}" >&2
  exit 1
fi

mkdir -p "${ROOT}/bin"
cd "${ROOT}"
monkeyc -f monkey.jungle -o "${OUT}" -y "${KEY}" -e -r -w
echo "Packaged ${OUT}"
echo "Upload at https://developer.garmin.com/connect-iq/submit-an-app/ (Beta App for private testing)."
