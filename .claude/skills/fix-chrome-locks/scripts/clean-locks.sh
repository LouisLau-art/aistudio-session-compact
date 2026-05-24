#!/usr/bin/env bash
# clean-locks.sh - Safe Chrome process termination and lock cleaning.
set -euo pipefail

echo "Scanning for residual Chrome/Chromium processes..."
pkill -f "google-chrome-unstable" || true
pkill -f "google-chrome" || true
pkill -f "chromium" || true

PROFILE_DIR="${HOME}/.config/aistudio-cdp-profile"

if [ -d "$PROFILE_DIR" ]; then
  echo "Locating SingletonLock and LOCK files in ${PROFILE_DIR}..."
  find "$PROFILE_DIR" -name "LOCK" -o -name "SingletonLock" -print0 | xargs -0 rm -f
  echo "Lock files successfully cleared."
else
  echo "Profile directory ${PROFILE_DIR} not found, skipping locks check."
fi
