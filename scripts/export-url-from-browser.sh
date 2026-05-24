#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/export-url-from-browser.sh <url> [options]

Starts or reuses a Chrome CDP browser, waits until the target conversation URL is open,
then runs:
  bun run dev -- export-url <url>

Options:
  --browser <name>     Browser for start-cdp-browser.sh: auto|chrome|chromium|canary (default: auto)
  --port <port>        CDP port (default: 9222)
  --host <host>        CDP host (default: 127.0.0.1)
  --out <dir>          Output directory passed to export-url
  --timeout <seconds>  Max wait for target URL before export (default: 600)
  --dry-run            Print commands without launching browser or exporting
  -h, --help           Show this help

Environment:
  CDP_PROXY_SERVER     Optional browser proxy, for example http://127.0.0.1:7897
  CDP_USER_DATA_DIR    Optional browser profile directory
USAGE
}

quote_cmd() {
  printf '%q ' "$@"
  printf '\n'
}

url=""
browser="${CDP_BROWSER:-auto}"
port="${CDP_PORT:-9222}"
host="${CDP_HOST:-127.0.0.1}"
timeout_seconds="${EXPORT_URL_WAIT_SECONDS:-600}"
out_dir=""
dry_run=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --browser)
      browser="${2:?Missing value for --browser}"
      shift 2
      ;;
    --port)
      port="${2:?Missing value for --port}"
      shift 2
      ;;
    --host)
      host="${2:?Missing value for --host}"
      shift 2
      ;;
    --out)
      out_dir="${2:?Missing value for --out}"
      shift 2
      ;;
    --timeout)
      timeout_seconds="${2:?Missing value for --timeout}"
      shift 2
      ;;
    --dry-run)
      dry_run=1
      shift
      ;;
    --*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [[ -n "${url}" ]]; then
        echo "Unexpected extra argument: $1" >&2
        usage >&2
        exit 2
      fi
      url="$1"
      shift
      ;;
  esac
done

if [[ -z "${url}" ]]; then
  echo "Missing URL." >&2
  usage >&2
  exit 2
fi

if ! [[ "${timeout_seconds}" =~ ^[0-9]+$ ]]; then
  echo "Invalid --timeout value: ${timeout_seconds}" >&2
  exit 2
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd "${script_dir}/.." && pwd)"
cd "${repo_dir}"

cdp_url="http://${host}:${port}"
start_display=(scripts/start-cdp-browser.sh "${browser}" "${port}" "${url}")
start_cmd=(bash "${script_dir}/start-cdp-browser.sh" "${browser}" "${port}" "${url}")
export_cmd=(bun run dev -- export-url "${url}" --cdp-url "${cdp_url}")
if [[ -n "${out_dir}" ]]; then
  export_cmd+=(--out "${out_dir}")
fi

if [[ "${dry_run}" == "1" ]]; then
  echo "Start browser command:"
  quote_cmd "${start_display[@]}"
  echo "Export command:"
  quote_cmd "${export_cmd[@]}"
  exit 0
fi

target_match="$(bun --eval 'const u = new URL(process.argv[1]); console.log(u.hostname + u.pathname);' "${url}")"
provider_host="$(bun --eval 'const u = new URL(process.argv[1]); console.log(u.hostname);' "${url}")"

open_target_tab() {
  local encoded
  encoded="$(bun --eval 'console.log(encodeURIComponent(process.argv[1]));' "${url}")"
  curl -fsS -X PUT "${cdp_url}/json/new?${encoded}" >/dev/null 2>&1 || true
}

echo "Starting/reusing CDP browser for: ${url}"
"${start_cmd[@]}"

# If CDP was already running, start-cdp-browser.sh does not open a new tab.
open_target_tab

echo "Waiting for target tab: ${target_match}"
deadline=$((SECONDS + timeout_seconds))
last_status=0
last_reopen=0
target_ready=0

while (( SECONDS <= deadline )); do
  tab_list="$(curl -fsS "${cdp_url}/json/list" 2>/dev/null || true)"
  if [[ "${tab_list}" == *"${target_match}"* ]]; then
    target_ready=1
    break
  fi

  if (( SECONDS - last_status >= 15 )); then
    echo "Still waiting. Finish login if the browser is on an auth page."
    last_status="${SECONDS}"
  fi

  if [[ "${tab_list}" == *"${provider_host}"* ]] && (( SECONDS - last_reopen >= 45 )); then
    open_target_tab
    last_reopen="${SECONDS}"
  fi

  sleep 2
done

if [[ "${target_ready}" != "1" ]]; then
  echo "Timed out waiting for target URL: ${target_match}" >&2
  echo "Keep the CDP browser open, navigate to the URL manually, then rerun export-url if needed:" >&2
  quote_cmd "${export_cmd[@]}" >&2
  exit 1
fi

echo "Target tab found. Exporting..."
"${export_cmd[@]}"
