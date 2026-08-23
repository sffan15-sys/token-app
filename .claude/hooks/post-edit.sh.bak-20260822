#!/usr/bin/env bash
# PostToolUse hook (matcher: Edit|Write) — auto-format every file Claude edits.
# Keeps diffs clean so agents never "fix" formatting they weren't asked to touch.
#
# token-app: left empty on purpose — no formatter config exists in the repo
# (no .prettierrc, no eslint formatting setup). If one is added, set e.g.:
#   FORMAT_CMD="npx prettier --write"   # once prettier is an installed dep —
#                                       # npx fetching it live would blow the
#                                       # 30s hook timeout.

FORMAT_CMD=""

[ -z "$FORMAT_CMD" ] && exit 0

# Resolve a REAL python: project venv first, then python3/python — each
# verified runnable (the Windows Store ships a fake python3 stub that
# exists on PATH but fails when executed).
PYBIN=""
for c in ./.venv/Scripts/python ./.venv/bin/python python3 python; do
  command -v "$c" >/dev/null 2>&1 && "$c" -c "" >/dev/null 2>&1 && { PYBIN="$c"; break; }
done
[ -z "$PYBIN" ] && exit 0
f=$("$PYBIN" -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null)
[ -n "$f" ] && [ -f "$f" ] && $FORMAT_CMD "$f" >/dev/null 2>&1

exit 0
