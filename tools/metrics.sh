#!/usr/bin/env bash
# Baseline metrics for AUDIT.md. Re-run to see movement.
#   ./tools/metrics.sh
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
python3 -c "
import io,re
s=io.open('index.html',encoding='utf-8').read()
io.open('$TMP/app.js','w',encoding='utf-8').write(re.search(r'<script>(.*)</script>', s, re.S).group(1))
"
echo "metrics · $(date +%Y-%m-%d) · v$(grep -oE 'APP_VERSION = "[^\"]+"' index.html | head -1 | cut -d'"' -f2)"
printf "  %-34s %s\n" "index.html lines"        "$(wc -l < index.html | tr -d ' ')"
printf "  %-34s %s\n" "script lines"            "$(wc -l < "$TMP/app.js" | tr -d ' ')"
printf "  %-34s %s\n" "top-level functions"     "$(grep -cE '^(async )?function [A-Za-z0-9_]+\(' "$TMP/app.js")"
printf "  %-34s %s\n" "bare catch {} (no comment)" "$(grep -cE 'catch \([e_]*\) *\{ *\}|catch \{ *\}' "$TMP/app.js" || true)"
printf "  %-34s %s\n" "catch blocks total"      "$(grep -c 'catch (e)' "$TMP/app.js" || true)"
printf "  %-34s %s\n" "characterisation tests"  "$(grep -c '^t("' tools/test.mjs || true)"
# Longest function, by distance to the next declaration.
python3 - "$TMP/app.js" <<'PY'
import io,re,sys
src=io.open(sys.argv[1],encoding="utf-8").read().split("\n")
st=[(i,re.sub(r'^(async )?function ','',l).split('(')[0]) for i,l in enumerate(src)
    if re.match(r'^(async )?function [A-Za-z0-9_]+\(', l)]
L=[(st[n+1][0]-i if n+1<len(st) else len(src)-i, nm) for n,(i,nm) in enumerate(st)]
L.sort(reverse=True)
print(f"  {'longest function':34} {L[0][1]} ({L[0][0]} lines)")
print(f"  {'functions over 100 lines':34} {sum(1 for x,_ in L if x>100)}")
PY
if command -v npx >/dev/null; then
  cat > "$TMP/eslint.config.mjs" <<'CFG'
export default [{ files: ["**/*.js"], languageOptions: { ecmaVersion: 2023, sourceType: "script" },
  rules: { complexity: ["warn", 10] } }];
CFG
  ( cd "$TMP" && npx --yes eslint@9 app.js --format json 2>/dev/null > out.json || true )
  python3 - "$TMP/out.json" <<'PY'
import json,sys,re
try: d=json.load(open(sys.argv[1]))
except Exception: raise SystemExit
m=[x for x in (d[0]["messages"] if d else []) if x["ruleId"]=="complexity"]
num=lambda x:int(re.search(r"complexity of (\d+)",x["message"]).group(1))
print(f"  {'functions over complexity 10':34} {len(m)}")
print(f"  {'functions over complexity 20':34} {sum(1 for x in m if num(x)>20)}")
if m: print(f"  {'worst complexity':34} {max(num(x) for x in m)}")
PY
fi
