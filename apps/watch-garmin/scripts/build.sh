#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CIQ_HOME="${HOME}/Library/Application Support/Garmin/ConnectIQ"
SDK_ROOT="${CIQ_HOME}/Sdks"
export CONNECT_IQ_HOME="${CIQ_HOME}"

SDK_BIN="$(ls -d "${SDK_ROOT}"/connectiq-sdk-mac-*/bin 2>/dev/null | sort -V | tail -1)"
export PATH="${SDK_BIN}:${PATH}"
export PATH="/opt/homebrew/opt/openjdk@21/bin:${PATH}"

DEVICE="${1:-epix2pro47mm}"
KEY="${GARMIN_DEV_KEY:-${HOME}/.garmin/developer_key.der}"
VERSION="$(grep 'version=' "${ROOT}/manifest.xml" | grep -v '<?xml' | grep -v 'iq:manifest' | sed -n 's/.*version="\([^"]*\)".*/\1/p' | head -1)"
if [[ -z "${VERSION}" ]]; then
  echo "Could not read app version from manifest.xml" >&2
  exit 1
fi

VERSIONED_NAME="SailingPerformance-v${VERSION}-${DEVICE}.prg"
OUT="${ROOT}/bin/${VERSIONED_NAME}"
LATEST_LINK="${ROOT}/bin/SailingPerformance.prg"
BUILD_INFO="${ROOT}/bin/BUILD_INFO.txt"

mkdir -p "${ROOT}/bin"
cd "${ROOT}"
monkeyc -f monkey.jungle -o "${OUT}" -y "${KEY}" -d "${DEVICE}" -w

cp -f "${OUT}" "${LATEST_LINK}"
cat > "${BUILD_INFO}" <<EOF
version=${VERSION}
device=${DEVICE}
prg=${VERSIONED_NAME}
built=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
manifest=${ROOT}/manifest.xml
EOF

echo "Built ${OUT}"
echo "Version: ${VERSION}  Device: ${DEVICE}"
echo "Also copied to ${LATEST_LINK}"
echo "Build metadata: ${BUILD_INFO}"
