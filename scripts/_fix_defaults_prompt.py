from pathlib import Path

p = Path(r"src/lib/comfy-console/defaults.ts")
text = p.read_text(encoding="utf-8")

old_pos = (
    "'three-quarter body portrait of a beautiful young adult woman, natural soft smile, "
    "fair luminous skin, well-lit face, bright clean exposure, lively eyes with catchlights, "
    "looking at viewer, photorealistic, natural proportions, bright soft key light'"
)
new_pos = (
    "'stunning beautiful young woman, pretty balanced face, refined natural glam makeup, "
    "clear healthy skin, attractive feminine figure, three-quarter body preferred "
    "(chest and hips visible) or full body long legs, facing viewer, eye contact, "
    "natural flirty pose, soft bright beauty lighting on face, photorealistic, sharp focus'"
)

old_neg = (
    "'blurry, deformed, bad anatomy, child, underage, watermark, text, logo, flat chest'"
)
new_neg = (
    "'stiff mannequin pose, face-only close-up, underexposed, exaggerated plastic body, "
    "from behind, blurry, deformed, child, underage, watermark'"
)

c1 = text.count(old_pos)
c2 = text.count(old_neg)
print("pos matches", c1, "neg matches", c2)
text2 = text.replace(old_pos, new_pos).replace(old_neg, new_neg)

# also fix description if needed
text2 = text2.replace(
    "性感女友卡：3/4 构图 + 固定体态词，可挂身材/动作/服装 LoRA",
    "性感女友卡：特征+动作+环境+质量；3/4 身材展示；明亮面部光；可挂身材/质感 LoRA",
)

p.write_text(text2, encoding="utf-8")
print("defaults updated")

# verify resolveGirlfriendLoraPlan signature
g = Path(r"src/lib/prompt/girlfriend.ts").read_text(encoding="utf-8")
i = g.find("export function resolveGirlfriendLoraPlan(")
print(g[i:i+400])
