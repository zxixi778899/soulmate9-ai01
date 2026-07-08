# SoulMate9 — Image Asset Requirements

**生成时间**: 2026-07-08  
**图片格式**: WebP（推荐）或 JPG/PNG  
**存放路径**: `public/` 目录

---

## 🎭 角色头像 (Character Avatars)

### 推荐角色 (Featured Girlfriends)
路径: `public/avatars/`

| 文件名 | 角色 | 尺寸 | 说明 |
|--------|------|------|------|
| `luna.jpg` | Luna | 512×768 (3:4) | 神秘梦幻女郎，深色长发，月光背景 |
| `sophie.jpg` | Sophie | 512×768 (3:4) | 甜美艺术女孩，温暖阳光，画室场景 |
| `violet.jpg` | Violet | 512×768 (3:4) | 职场女王，自信凌厉，现代办公室 |
| `maya.jpg` | Maya | 512×768 (3:4) | 温柔诗人，清晨窗边，书卷气 |

### 默认占位头像
| 文件名 | 尺寸 | 说明 |
|--------|------|------|
| `default-avatar.png` | 256×256 | 默认女性剪影 |

---

## 🏠 首页 (Landing Page)

### Hero 区域
路径: `public/landing/`

| 文件名 | 尺寸 | 说明 |
|--------|------|------|
| `hero-bg.webp` | 1920×1080 | 首页背景，暗色调+粉色光晕 |
| `hero-character-1.webp` | 800×1200 | 首页立绘角色1，全身 |
| `hero-character-2.webp` | 800×1200 | 首页立绘角色2 |

### 场景图 (Marketing Characters)
路径: `public/scenes/`

每个角色需要对应场景图（用于 /girlfriend/[slug] 页面）：

| 文件夹 | 文件名 | 尺寸 | 说明 |
|--------|--------|------|------|
| `moonlit-bedroom/` | `luna.webp` | 800×1200 | 月光卧室场景 |
| `infinity-pool-night/` | `ruby.webp` | 800×1200 | 无边泳池夜景 |
| `cozy-reading-nook/` | `aria.webp` | 800×1200 | 温馨书房 |
| `tokyo-rooftop/` | `sera.webp` | 800×1200 | 东京天台 |
| `paris-boudoir/` | `celeste.webp` | 800×1200 | 巴黎闺房 |
| `coffee-shop/` | `hanna.webp` | 800×1200 | 咖啡厅 |
| `gym-mirror/` | `mira.webp` | 800×1200 | 健身房 |
| `rainy-window/` | `noelle.webp` | 800×1200 | 雨窗 |
| `sunset-beach/` | `kaiya.webp` | 800×1200 | 日落沙滩 |
| `neon-alley/` | `raven.webp` | 800×1200 | 霓虹巷 |

---

## 🛍️ 商城 (Shop)

### 装扮预览
路径: `public/outfits/`

| 文件名 | 装扮 | 尺寸 | 说明 |
|--------|------|------|------|
| `classic-dress.webp` | Classic Dress | 512×768 | 优雅连衣裙 |
| `beach-bikini.webp` | Beach Bikini | 512×768 | 海滩比基尼 |
| `yoga-set.webp` | Yoga Activewear | 512×768 | 瑜伽运动装 |
| `evening-gown.webp` | Evening Gown | 512×768 | 晚宴礼服 |
| `silk-lingerie.webp` | Silk Lingerie | 512×768 | 丝质内衣 |
| `nurse-costume.webp` | Nurse Costume | 512×768 | 护士制服 |
| `maid-costume.webp` | French Maid | 512×768 | 法式女仆 |

### 礼物图标
路径: `public/gifts/`

| 文件名 | 礼物 | 尺寸 | 说明 |
|--------|------|------|------|
| `rose-bouquet.png` | Rose Bouquet | 128×128 | 玫瑰花束 |
| `chocolate-box.png` | Chocolate Box | 128×128 | 巧克力礼盒 |
| `teddy-bear.png` | Teddy Bear | 128×128 | 泰迪熊 |
| `perfume-bottle.png` | Perfume | 128×128 | 香水瓶 |

---

## 🏆 成就图标

路径: `public/achievements/`

| 文件名 | 成就 | 尺寸 | 说明 |
|--------|------|------|------|
| `first-chat.png` | First Words | 64×64 | 聊天气泡+星 |
| `chat-master.png` | Chat Master | 64×64 | 多个气泡+火焰 |
| `photographer.png` | Photographer | 64×64 | 相机图标 |
| `romantic-heart.png` | Romantic Heart | 64×64 | 发光心形 |
| `wardrobe-icon.png` | Fashion Icon | 64×64 | 衣架图标 |
| `soulmate-badge.png` | Eternal Bond | 64×64 | 金质徽章 |

---

## 🎯 大奖系统

路径: `public/prizes/`

| 文件名 | 尺寸 | 说明 |
|--------|------|------|
| `iphone-prize.webp` | 256×256 | iPhone 16 Pro 产品图 |
| `airpods-prize.webp` | 256×256 | AirPods Pro 产品图 |
| `giftcard-prize.webp` | 256×256 | App Store 礼品卡 |

---

## 🎨 通用 UI

| 文件名 | 尺寸 | 说明 |
|--------|------|------|
| `public/icon-192.png` | 192×192 | PWA 图标 |
| `public/icon-512.png` | 512×512 | PWA 大图标 |
| `public/og-image.webp` | 1200×630 | Open Graph 分享图 |
| `public/favicon.ico` | 32×32 | 网站图标 |

---

## 📊 总计

| 类别 | 数量 | 建议工具 |
|------|------|---------|
| 角色头像 | 14 | Stable Diffusion / RunPod FLUX |
| 装扮预览 | 7 | Stable Diffusion / RunPod FLUX |
| 礼物图标 | 4 | AI 或 免费图标库 |
| 成就图标 | 6 | AI 或 免费图标库 |
| 大奖图片 | 3 | 产品官网图 |
| UI 图标 | 4 | 免费图标工具 |
| **总计** | **~38** | |

---

## 🎨 生图提示词建议

角色头像使用 RunPod FLUX 端点生成，提示词模板：

```
Full body portrait of a stunning young woman, [character description], 
[pose], [lighting], [background]. Shot on Canon EOS R5, 85mm f/1.4, 
shallow depth of field with creamy bokeh. Skin texture visible, 
natural beauty, no retouching. [mood keyword], [style keyword].
Negative: blurry, low quality, deformed, bad anatomy, watermark, text,
plastic skin, airbrushed
```

装扮预览提示词模板：
```
Full body portrait of the same woman wearing [outfit description], 
[same character appearance]. [pose], [scene]. Consistent face and 
body with character reference. Shot on Canon EOS R5, 85mm f/1.4.
```

---

## ⚡ 优先级

```
P0 (立即需要):
  ✗ public/avatars/luna.jpg
  ✗ public/avatars/sophie.jpg
  ✗ public/default-avatar.png
  ✗ public/icon-192.png / icon-512.png

P1 (本周):
  ✗ public/scenes/ (10 folder images)
  ✗ public/outfits/ (7 outfit images)

P2 (后续):
  ✗ public/gifts/ (4 gift icons)
  ✗ public/achievements/ (6 icons)
  ✗ public/prizes/ (3 prize images)
```