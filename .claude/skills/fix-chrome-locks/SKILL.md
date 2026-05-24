---
name: fix-chrome-locks
description: This skill should be used when the user asks to "kill Chrome processes", "remove SingletonLock files", "clear profile locks", "fix CDP port connection", or encounters "CDP connection timeout", "Profile in use", or "remote debugging refused" terminal errors. Always invoke this skill automatically whenever a browser automation script or export command fails due to socket attachment or lockfile errors.
disable-model-invocation: true
user-invocable: true
---

# Chrome Lock Cleaner

Resolve browser startup issues caused by abnormal Chrome terminations, locked ports, or residual profile locks.

## Execution
Run the lock cleaning script to safely clear all Google Chrome Unstable and Chromium locks:
```bash
bash .claude/skills/fix-chrome-locks/scripts/clean-locks.sh
```

## Precautions
Executing this script will forcefully close all active Google Chrome and Chromium instances. Use this tool only when the browser is unresponsive or when the debugger profile is locked.
