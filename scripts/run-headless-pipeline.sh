#!/usr/bin/env bash
set -euo pipefail

target_url="${1:-${AISTUDIO_URL:-}}"
if [[ -z "${target_url}" ]]; then
  echo "Usage: bash scripts/run-headless-pipeline.sh <aistudio-session-url> [extra pipeline args]" >&2
  echo "Example: npm run pipeline:headless -- \"https://aistudio.google.com/prompts/<id>\"" >&2
  exit 1
fi
shift || true

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repo_root}"

cdp_port="${CDP_PORT:-9222}"
cdp_url="http://127.0.0.1:${cdp_port}"
profile_dir="${CDP_USER_DATA_DIR:-$HOME/.config/chromium}"
out_dir="${OUT_DIR:-./out}"
provider="${VISION_PROVIDER:-none}"
ocr_engine="${OCR_ENGINE:-auto}"
ocr_lang="${OCR_LANG:-eng+chi_sim}"
python_bin="${OCR_PYTHON_BIN:-python3}"
model="${VISION_MODEL:-${GEMINI_MODEL:-gemini-3-flash-preview}}"

CDP_HEADLESS=1 CDP_USER_DATA_DIR="${profile_dir}" \
  bash scripts/start-cdp-browser.sh chromium "${cdp_port}" "${target_url}"

set +e
npm run dev -- pipeline \
  --cdp-url "${cdp_url}" \
  --url-match "aistudio.google.com/prompts/" \
  --tab-index 0 \
  --out "${out_dir}" \
  --provider "${provider}" \
  --ocr-engine "${ocr_engine}" \
  --ocr-lang "${ocr_lang}" \
  --python-bin "${python_bin}" \
  --model "${model}" \
  "$@"
rc=$?
set -e

if [[ ${rc} -ne 0 ]]; then
  cat <<EOF

Pipeline failed.
If error says Google sign-in is required, refresh login once with the same profile:
  CDP_USER_DATA_DIR="${profile_dir}" bash scripts/start-cdp-browser.sh chromium ${cdp_port} "${target_url}"
Then rerun:
  npm run pipeline:headless -- "${target_url}"
EOF
  exit "${rc}"
fi
