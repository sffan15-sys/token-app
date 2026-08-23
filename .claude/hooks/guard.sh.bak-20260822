#!/usr/bin/env bash
# PreToolUse guard (matcher: Bash) — deterministic backstop for the few hard
# lines CLAUDE.md keeps even under this project's maximum-autonomy mode.
# NOTE (token-app): production deploys (vercel --prod) are PRE-AUTHORIZED here
# and deliberately NOT blocked — see CLAUDE.md's standing authorization.
# Env files (kit-v3): touching a real .env is now denied outright, on top of
# the project's older staging/committing deny. `.env.example/.sample/
# .template/.dist` stay readable. Fails open by design: if anything errors,
# the command proceeds and normal permissions apply.

input=$(cat)

# Resolve a REAL python: project venv first, then python3/python — each
# verified runnable (the Windows Store ships a fake python3 stub that
# exists on PATH but fails when executed).
PYBIN=""
for c in ./.venv/Scripts/python ./.venv/bin/python python3 python; do
  command -v "$c" >/dev/null 2>&1 && "$c" -c "" >/dev/null 2>&1 && { PYBIN="$c"; break; }
done
[ -z "$PYBIN" ] && exit 0
"$PYBIN" - "$input" <<'PY'
import json, re, sys

try:
    data = json.loads(sys.argv[1])
    cmd = data.get("tool_input", {}).get("command", "") or ""
except Exception:
    sys.exit(0)

PATTERNS = [
    (r"\brm\s+(-[a-zA-Z]*[rf][a-zA-Z]*\s+)+(?!(\./)?(node_modules|dist|public|\.tmp-npm-cache)\b)", "recursive/forced rm (generated dirs node_modules/dist/public are exempt)"),
    (r"\bgit\s+push\b[^\n]*(\s--force\b|\s-f\b|\s--force-with-lease\b)", "force push"),
    (r"\bgit\s+reset\s+--hard\b", "hard reset"),
    (r"\bgit\s+clean\b", "git clean"),
    (r"--no-verify\b", "verification bypass (--no-verify)"),
    # Real secret files only — .env.example/.sample/.template/.dist stay readable.
    # Trailing class includes shell metachars so `cat .env;` can't slip the deny.
    # The exempt lookahead is END-ANCHORED on purpose: the kit-v3 original was
    # not, so `.env.examples` / `.env.templateXYZ` (a secret file one character
    # off a template name) silently bypassed the deny. Exempt = exactly those
    # four names, nothing that merely starts with them.
    (r"(^|[\s/'\"])\.env(?!\.(example|sample|template|dist)([\s'\";|&<>)]|$))"
     r"(\.[A-Za-z0-9_.-]+)?([\s'\";|&<>)]|$)",
     "touching .env files"),
    # token-app hardening the generic kit lacks — kept: even if the broad rule
    # above is ever relaxed, committing secrets stays mechanically impossible.
    (r"\bgit\s+(add|commit|stage)\b[^\n]*(^|[\s/'\"])\.env(?!\.example\b)(rc\b)?"
     r"(\.[A-Za-z0-9_.-]+)?([\s'\";|&<>)]|$)",
     "staging/committing a .env file — never commit secrets"),
    (r"\bgit\s+add\s+(-A\b|--all\b|\.(\s|$|[;|&]))",
     "blanket git add — stage files explicitly so secrets can't slip in"),
    (r"\bchmod\s+(-R\s+)?777\b", "chmod 777"),
    (r"\bgh\s+(secret|variable)\s+(set|delete)\b", "gh secret/variable mutation"),
]

for pat, label in PATTERNS:
    if re.search(pat, cmd):
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason":
                f"Blocked by guard hook: {label}. This is one of the hard "
                "lines CLAUDE.md keeps even in maximum-autonomy mode — stop "
                "and ask the human."}}))
        sys.exit(0)

sys.exit(0)
PY
