from pathlib import Path
p = Path(r"src/app/(main)/admin/comfy/ComfyConsole.tsx")
t = p.read_text(encoding="utf-8")
old = """  }, []);

  const loadAssets = useCallback(async () => {"""
# find loadConfig closing
idx = t.find("const loadConfig = useCallback")
print("loadConfig at", idx)
# show end of loadConfig
chunk = t[idx:idx+900]
print(chunk)
