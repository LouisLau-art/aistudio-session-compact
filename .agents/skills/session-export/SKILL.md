---
name: session-export
description: This skill should be used when the user asks to "export ChatGPT conversation", "download Gemini session", "fetch Google AI Studio prompt", "save conversational logs", "backup chat text", or mentions backing up local browser-based chats. Make sure to use this skill whenever conversational URLs from chatgpt.com, gemini.google.com, or aistudio.google.com are provided, even if the user does not explicitly request an "export".
user-invocable: true
---

# Session Export

To export conversational data from ChatGPT, Gemini, or Google AI Studio, follow the guidelines below.

## Unified Router Export
Run the unified exporter script directly:
```bash
bun run dev -- export-url "<conversation-url>" --out "out/<provider>-<id>-$(date +%Y%m%d)"
```

## Specific Provider Captures
If direct routing fails, execute targeted provider scripts:

### 1. ChatGPT
Ensure the Chrome CDP debugger is running, navigate the browser to the conversation page, and run:
```bash
bun run dev -- export-chatgpt --conversation-url "<chatgpt-url>" --out "out/chatgpt-session"
```

### 2. Gemini
Ensure the Gemini DOM is loaded, then execute:
```bash
bun run dev -- export-gemini --conversation-url "<gemini-url>" --out "out/gemini-session"
```

### 3. Google AI Studio (Text-Only)
For AI Studio URLs, run text-only extraction with headless parameters and disabled vision:
```bash
bun run dev -- export-transcript --cdp-url http://127.0.0.1:9222 --url-match "aistudio.google.com/prompts/" --out "out/aistudio-session" --provider none --max-image-screenshots 0
```

## Additional Resources

### Reference Files
For debugging proxies, Cloudflare anti-bot pages, and large payload timeouts, consult:
- **`references/troubleshooting.md`** - Detailed CDP browser troubleshooting
