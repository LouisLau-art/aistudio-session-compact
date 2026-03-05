#!/usr/bin/env bash
set -euo pipefail

browser="${1:-auto}"
port="${2:-9222}"
open_url="${3:-}"
host="${CDP_HOST:-127.0.0.1}"
endpoint="http://${host}:${port}/json/version"
profile_dir="${CDP_USER_DATA_DIR:-$HOME/.config/aistudio-cdp-profile}"
log_file="${CDP_LOG_FILE:-/tmp/aistudio-cdp.log}"
headless="${CDP_HEADLESS:-0}"

pick_browser() {
  case "${browser}" in
    auto)
      if command -v chromium >/dev/null 2>&1; then
        command -v chromium
      elif command -v chromium-browser >/dev/null 2>&1; then
        command -v chromium-browser
      elif command -v google-chrome-canary >/dev/null 2>&1; then
        command -v google-chrome-canary
      elif command -v google-chrome >/dev/null 2>&1; then
        command -v google-chrome
      else
        return 1
      fi
      ;;
    canary)
      command -v google-chrome-canary
      ;;
    chromium)
      if command -v chromium >/dev/null 2>&1; then
        command -v chromium
      else
        command -v chromium-browser
      fi
      ;;
    chrome)
      command -v google-chrome
      ;;
    *)
      echo "Unsupported browser option: ${browser}" >&2
      echo "Use one of: auto | canary | chromium | chrome" >&2
      exit 1
      ;;
  esac
}

if curl -fsS "${endpoint}" >/dev/null 2>&1; then
  echo "CDP is already running on ${host}:${port}"
  curl -fsS "${endpoint}"
  echo
  exit 0
fi

if ! browser_bin="$(pick_browser)"; then
  echo "No supported browser found for CDP launch." >&2
  echo "Install one of: google-chrome-canary, chromium, chromium-browser, google-chrome" >&2
  exit 1
fi

mkdir -p "${profile_dir}"

echo "Launching ${browser_bin} with CDP on ${host}:${port}"
echo "Profile: ${profile_dir}"
echo "Log: ${log_file}"
if [[ -n "${open_url}" ]]; then
  echo "Open URL: ${open_url}"
fi

launch_args=(
  --remote-debugging-port="${port}"
  --user-data-dir="${profile_dir}"
  --no-first-run
  --no-default-browser-check
)

if [[ "${headless}" == "1" ]]; then
  launch_args+=(--headless=new --disable-gpu)
fi

if [[ -n "${open_url}" ]]; then
  launch_args+=("${open_url}")
fi

nohup "${browser_bin}" "${launch_args[@]}" >"${log_file}" 2>&1 < /dev/null &
pid=$!
echo "PID: ${pid}"

for _ in {1..10}; do
  if curl -fsS "${endpoint}" >/dev/null 2>&1; then
    echo "CDP started successfully."
    curl -fsS "${endpoint}"
    echo
    exit 0
  fi
  sleep 1
done

echo "CDP is still unavailable at ${endpoint}." >&2
echo "Likely cause: browser is already running without --remote-debugging-port." >&2
echo "Fix: close all windows/processes of this browser, then rerun this script." >&2
echo "Recent log output:" >&2
tail -n 30 "${log_file}" >&2 || true
exit 1
