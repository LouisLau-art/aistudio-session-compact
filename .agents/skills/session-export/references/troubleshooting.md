# Session Export Troubleshooting

## CDP Connection Timeout
- Ensure the browser is running with `--remote-debugging-port=9222`.
- Run `curl -fsS http://127.0.0.1:9222/json/list` to test CDP socket binding.
- If the connection is refused, run the `fix-chrome-locks` utility.

## ChatGPT Cloudflare Interstitials
- Headless Chrome (`--headless`) often triggers the `Just a moment...` anti-bot wall.
- To fix, launch headed Chrome in a foreground TTY session with a dedicated user data profile:
  ```bash
  google-chrome --remote-debugging-port=9222 --user-data-dir="$HOME/.config/aistudio-cdp-profile" --new-window
  ```

## Runtime.evaluate Payload Timeout
- Larger ChatGPT conversation payloads (1,000+ turns) might trigger CDP response timeouts.
- Retry the command with an increased timeout configuration or fetch directly from the backend conversation REST API after extracting the session cookie token via:
  ```javascript
  fetch(location.origin + "/api/auth/session")
  ```
