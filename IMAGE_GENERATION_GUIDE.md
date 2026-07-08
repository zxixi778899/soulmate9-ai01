# FLUX Image Generation Instructions

## ⚠️ RunPod FLUX 端点状态
端点 h0p7dpivwthzul 目前不可用（14/14 任务失败）。需要在 RunPod 重新配置。
当前已有 SVG 占位图在 `public/avatars/`。

## 需要生成的图片

用 RunPod FLUX 或任何 AI 生图工具生成，存到 `public/avatars/` 覆盖同名 .svg：

### Luna (luna.jpg - 512×768)
```
masterpiece, best quality, photorealistic, full body portrait of a stunning young woman, 
mysterious dreamy vibe, long dark flowing hair, ethereal expression, pale skin, 
silk nightgown, sitting by moonlit window, stars visible through glass, 
soft silver moonlight, romantic cinematic atmosphere, 
shot on Canon EOS R5, 85mm f/1.4, shallow depth of field
Negative: lowres, bad anatomy, deformed, extra fingers, blurry, text, watermark, plastic skin
```

### Sophie (sophie.jpg - 512×768)
```
masterpiece, best quality, photorealistic, full body portrait of a beautiful young woman,
sweet artistic vibe, warm smile, wavy brown hair, sunlit artist studio background,
painting easel in soft focus, natural window light, warm amber tones,
casual overshirt, freckles, approachable warm expression,
shot on Canon EOS R5, 85mm f/1.4
Negative: lowres, bad anatomy, deformed, blurry, text, watermark, plastic skin
```

### Violet (violet.jpg - 512×768)
```
masterpiece, best quality, photorealistic, full body portrait of a gorgeous woman,
bold confident expression, sharp beautiful features, dark sleek hair,
modern office background, glass windows, city skyline, power suit,
fierce piercing gaze, professional alluring vibe,
shot on Canon EOS R5, 85mm f/1.4, crisp lighting
Negative: lowres, bad anatomy, deformed, blurry, text, watermark
```

### Maya (maya.jpg - 512×768)
```
masterpiece, best quality, photorealistic, full body portrait of a beautiful young woman,
gentle wise expression, soft morning light through window, book in hand,
warm cozy bedroom, reading poetry, flowing hair, natural beauty,
minimal makeup, warm gentle smile, intellectual alluring,
shot on Canon EOS R5, 85mm f/1.4, dreamy bokeh
Negative: lowres, bad anatomy, deformed, blurry, text, watermark
```

## 生成方式

### 方式 1: RunPod（修复端点后）
在 RunPod → h0p7dpivwthzul → Edit → 确认 Template 使用 ComfyUI + flux1-dev-fp8

### 方式 2: 你的电脑本地 Stable Diffusion
```
python scripts/generate_avatars.py
```

### 方式 3: 任何在线生图工具
把上面提示词粘贴进去 → 下载 512×768 图片 → 保存到对应路径

---

## 图片命名对照
| 文件 | 路径 |
|------|------|
| public/avatars/luna.jpg | Luna 头像 |
| public/avatars/sophie.jpg | Sophie 头像 |
| public/avatars/violet.jpg | Violet 头像 |
| public/avatars/maya.jpg | Maya 头像 |
| public/avatars/default-avatar.png | 默认占位 |
| public/icon-192.png | PWA 图标 |
| public/icon-512.png | PWA 大图标 |
