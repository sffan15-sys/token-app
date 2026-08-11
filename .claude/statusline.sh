#!/usr/bin/env bash
# Statusline — the live gauge for the 50% checkpoint rule, plus a tripwire for
# silent model reroutes (if this doesn't say fable, run /model fable).

input=$(cat)

# Resolve a REAL python: project venv first, then python3/python — each
# verified runnable (the Windows Store ships a fake python3 stub that
# exists on PATH but fails when executed).
PYBIN=""
for c in ./.venv/Scripts/python ./.venv/bin/python python3 python; do
  command -v "$c" >/dev/null 2>&1 && "$c" -c "" >/dev/null 2>&1 && { PYBIN="$c"; break; }
done
[ -z "$PYBIN" ] && { echo "claude"; exit 0; }
"$PYBIN" - "$input" <<'PY'
import json, subprocess, sys

try:
    d = json.loads(sys.argv[1])
except Exception:
    print("claude"); sys.exit(0)

model = d.get("model", {}).get("display_name") or "?"

p = d.get("context_window", {}).get("used_percentage")
if isinstance(p, (int, float)):
    ctx = f"{p:.0f}%" + (" !! CHECKPOINT" if p >= 50 else "")
else:
    ctx = "?"

branch = ""
cwd = d.get("cwd") or d.get("workspace", {}).get("current_dir")
if cwd:
    try:
        branch = subprocess.run(["git", "-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"],
                                capture_output=True, text=True, timeout=2).stdout.strip()
    except Exception:
        pass

parts = [f"[{model}]", f"ctx {ctx}"]
if branch:
    parts.append(f"({branch})")
print(" ".join(parts))
PY
