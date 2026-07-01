#!/usr/bin/env bash
# Build and sideload SailingPerformance.prg to a USB-mounted watch (GARMIN/APPS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE="${1:-epix2pro47mm}"

"${ROOT}/scripts/build.sh" "${DEVICE}"

VERSION="$(grep 'version=' "${ROOT}/manifest.xml" | grep -v '<?xml' | grep -v 'iq:manifest' | sed -n 's/.*version="\([^"]*\)".*/\1/p' | head -1)"
PRG="${ROOT}/bin/SailingPerformance-v${VERSION}-${DEVICE}.prg"
if [[ ! -f "${PRG}" ]]; then
  PRG="${ROOT}/bin/SailingPerformance.prg"
fi

if [[ ! -f "${PRG}" ]]; then
  echo "Missing built PRG after build." >&2
  exit 1
fi

echo "Installing: $(basename "${PRG}")"

find_garmin_apps_dir() {
  local vol apps
  for vol in /Volumes/*; do
    [[ -d "${vol}" ]] || continue
    for apps in "${vol}/GARMIN/APPS" "${vol}/Garmin/Apps" "${vol}/garmin/apps"; do
      if [[ -d "${apps}" ]]; then
        printf '%s\n' "${apps}"
        return 0
      fi
    done
  done
  return 1
}

echo ""
echo "Sideload: copy the versioned .prg to the watch over USB (OpenMTP → GARMIN/APPS)."
echo "Check version: ./scripts/prg-info.sh"
echo ""

if APPS_DIR="$(find_garmin_apps_dir)"; then
  DEST="${APPS_DIR}/$(basename "${PRG}")"
  cp -f "${PRG}" "${DEST}"
  echo "Installed: ${DEST}"
  echo ""
  echo "Eject the watch volume safely, then on the watch:"
  echo "  Apps list → Sailing Performance"
  echo "Or confirm in Garmin Connect → Connect IQ."
else
  echo "Could not find GARMIN/APPS on /Volumes/*"
  echo ""
  if [[ "$(uname -s)" == "Darwin" ]]; then
    echo "macOS: fēnix / Quatix watches use MTP — they usually do NOT appear in Finder."
    echo ""
    echo "Option A — OpenMTP (USB sideload, recommended on Mac):"
    echo "  1. Quit Garmin Express completely (menu bar icon too)."
    echo "  2. Connect watch via USB."
    echo "  3. Open OpenMTP → GARMIN → APPS"
    echo "  4. Drag: ${PRG}"
    echo "  5. Safely disconnect, reboot watch if the app does not appear."
    echo ""
    echo "Option B — Beta via phone (no USB file access):"
    echo "  ./scripts/package-iq.sh"
    echo "  Upload bin/SailingPerformance.iq at https://developer.garmin.com/connect-iq/submit-an-app/"
    echo "  Check Beta App → install from Garmin Connect on your phone."
    echo ""
  else
    echo "Manual install: copy ${PRG} to the watch GARMIN/APPS folder"
    echo ""
  fi
  echo "Built PRG ready at: ${PRG}"
  exit 1
fi
