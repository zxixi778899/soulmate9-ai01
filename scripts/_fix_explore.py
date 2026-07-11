from pathlib import Path
p = Path(r"src/app/(main)/explore/page.tsx")
t = p.read_text(encoding="utf-8")
old = "girl.rarity.toLowerCase()"
new = "String(girl.rarity || 'N').toLowerCase()"
if old not in t:
    raise SystemExit("missing")
p.write_text(t.replace(old, new), encoding="utf-8")
print("explore ok")
