from pathlib import Path
import re

p = Path(r"src/app/(main)/admin/images/page.tsx")
t = p.read_text(encoding="utf-8")

if "readResponseJson" not in t:
    needle = "from '@/lib/logger'"
    if needle in t:
        t = t.replace(needle, needle + "\nimport { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json'", 1)
    else:
        t = "import { readResponseJson, errorMessageFromUnknown } from '@/lib/safe-json';\n" + t

pat_meta = re.compile(
    r"if \(!res\.ok\) \{\s*const err = await res\.text\(\);\s*throw new Error\(`[^`]*`\);\s*\}\s*"
    r"const data = await res\.json\(\);\s*if \(!data\.metadata\) throw new Error\('[^']*'\);",
    re.M,
)
repl_meta = (
    "const data = await readResponseJson<{ metadata?: any; error?: string }>(res);\n"
    "      if (!res.ok) {\n"
    "        throw new Error(data.error || `Metadata generation failed (${res.status})`);\n"
    "      }\n"
    "      if (!data.metadata) throw new Error(data.error || 'No metadata returned');"
)
t2, n1 = pat_meta.subn(repl_meta, t, count=1)
print("meta replacements", n1)
t = t2

pat_img = re.compile(
    r"if \(!res\.ok\) \{\s*const err = await res\.text\(\);\s*throw new Error\(`[^`]*`\);\s*\}\s*"
    r"const data = await res\.json\(\);\s*if \(!data\.success\) throw new Error\(data\.error \|\| '[^']*'\);",
    re.M,
)
repl_img = (
    "const data = await readResponseJson<{ success?: boolean; error?: string; images?: unknown[] }>(res);\n"
    "      if (!res.ok) {\n"
    "        throw new Error(data.error || `Image generation failed (${res.status})`);\n"
    "      }\n"
    "      if (!data.success) throw new Error(data.error || 'Image generation failed');"
)
t2, n2 = pat_img.subn(repl_img, t, count=1)
print("img replacements", n2)
t = t2

p.write_text(t, encoding="utf-8")
print("write ok", "readResponseJson" in t)
