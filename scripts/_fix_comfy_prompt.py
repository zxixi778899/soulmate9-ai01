from pathlib import Path
import re

p = Path(r"src/app/(main)/admin/comfy/ComfyConsole.tsx")
text = p.read_text(encoding="utf-8")

new_presets = r'''/** Civitai-style generation presets (中文说明 + 可一键应用) */
const CIVITAI_PRESETS = [
  {
    id: 'portrait-soft',
    name: '窗边人像',
    desc: '3/4 构图 · 明亮侧光 · 适合主页卡',
    prompt:
      'stunning beautiful young woman, refined face, glam makeup, fair luminous skin, three-quarter body chest and hips visible, leaning by a bright window, soft side sunlight on face, looking at viewer, flirty soft smile, photorealistic, sharp eyes, natural proportions',
    negative: 'blurry, deformed, underexposed, from behind, face-only close-up, plastic skin, child, underage, watermark, text',
    width: 832, height: 1216, steps: 28, cfg: 3.5,
  },
  {
    id: 'fullbody-glam',
    name: '夜景全身',
    desc: '大长腿 · 站姿变化 · 城市夜景',
    prompt:
      'stunning beautiful young woman, full body long legs, weight on one hip, rooftop railing, city skyline bokeh, fitted evening dress, bright key light on face, cool ambient rim, looking at viewer, photorealistic, attractive figure',
    negative: 'blurry, cropped head, bad anatomy, underexposed, from behind, same face, watermark, child, underage',
    width: 768, height: 1344, steps: 28, cfg: 3.5,
  },
  {
    id: 'nsfw-intimate',
    name: '卧室私密',
    desc: '3/4 身材展示 · 暧昧光 · 成人氛围',
    prompt:
      'stunning beautiful young woman, three-quarter body on bed, arched posture facing camera, soft lingerie, pink LED plus warm lamp on face, seductive eye contact, fair luminous skin, photorealistic, detailed skin texture',
    negative: 'gore, violence, child, underage, blurry, deformed, underexposed, from behind only, watermark',
    width: 832, height: 1216, steps: 28, cfg: 3.2,
  },
  {
    id: 'selfie-flash',
    name: '镜面自拍',
    desc: '自拍角度 · 闪光 · 自然身体语言',
    prompt:
      'stunning beautiful young woman, bathroom mirror selfie, phone in hand, hip popped, direct flash plus vanity light on face, casual crop top, candid playful expression, three-quarter to full body, photorealistic, natural skin texture',
    negative: 'studio softbox only, plastic skin, underexposed, face-only, child, underage, watermark',
    width: 832, height: 1216, steps: 26, cfg: 3.5,
  },
  {
    id: 'cafe-day',
    name: '咖啡馆日景',
    desc: '日常甜美 · 明亮 · 表情生动',
    prompt:
      'stunning beautiful young woman at cafe window seat, chin on hand, bright daylight on face, coffee cup, casual stylish outfit, easy smile looking at viewer, three-quarter body, 50mm candid, photorealistic, detailed eyes',
    negative: 'blurry, deformed, plastic skin, underexposed, from behind, watermark, text, child, underage',
    width: 832, height: 1216, steps: 26, cfg: 3.5,
  },
];
'''

text2, n = re.subn(
    r"/\*\* Civitai-style generation presets[\s\S]*?\];\n",
    new_presets + "\n",
    text,
    count=1,
)
print("presets replaced", n)

imp = "import Link from 'next/link';\n"
if "from '@/lib/prompt/girlfriend'" not in text2:
    text2 = text2.replace(
        imp,
        imp
        + "import {\n"
        + "  assembleGirlfriendFromRow,\n"
        + "  GIRLFRIEND_NEGATIVE_FLUX,\n"
        + "  resolveGirlfriendLoraPlan,\n"
        + "  subjectFromGirlfriendRow,\n"
        + "} from '@/lib/prompt/girlfriend';\n",
    )
    print("import added")
else:
    print("import exists")

old_apply = """  function applyWorkflow(wf: Any, cfg?: Any) {
    const c = cfg || config;
    setWorkflowId(wf.id);
    setKind(wf.kind || 'custom');
    setEndpointKey(wf.defaults?.endpoint_key || 'comfy-default');
    setCkptId(wf.defaults?.ckpt_id || 'flux-fp8');
    setLoraId(wf.defaults?.lora_id || 'none');
    setLoraStrength(wf.defaults?.lora_strength ?? 0.8);
    setWidth(wf.defaults?.width || 832);
    setHeight(wf.defaults?.height || 1216);
    setSteps(wf.defaults?.steps || 28);
    setCfg(wf.defaults?.cfg || 3.5);
    setDenoise(wf.defaults?.denoise ?? 0.55);
    setPrompt(wf.defaults?.positive || '');
    setNegative(wf.defaults?.negative || '');
    void c;
  }"""

new_apply = """  function applyWorkflow(wf: Any, cfg?: Any, opts?: { preservePrompt?: boolean }) {
    const c = cfg || config;
    setWorkflowId(wf.id);
    setKind(wf.kind || 'custom');
    setEndpointKey(wf.defaults?.endpoint_key || 'comfy-default');
    setCkptId(wf.defaults?.ckpt_id || 'flux-fp8');
    setLoraId(wf.defaults?.lora_id || 'none');
    setLoraStrength(wf.defaults?.lora_strength ?? 0.8);
    setWidth(wf.defaults?.width || 832);
    setHeight(wf.defaults?.height || 1216);
    setSteps(wf.defaults?.steps || 28);
    setCfg(wf.defaults?.cfg || 3.5);
    setDenoise(wf.defaults?.denoise ?? 0.55);
    if (!opts?.preservePrompt) {
      setPrompt(wf.defaults?.positive || '');
      setNegative(wf.defaults?.negative || '');
    }
    void c;
  }

  /** 用已调试的女友卡提示词配方（特征+动作+环境+质量），覆盖通用工作流默认句 */
  function fillPromptFromGirlfriend(row: Any, opts?: { force?: boolean; toastOn?: boolean }) {
    if (!row) return false;
    try {
      const assembled = assembleGirlfriendFromRow(row as Record<string, unknown>, '', {
        useEmptyNegative: false,
      });
      const nextPrompt = String(assembled.positive || '').trim();
      const nextNeg = String(assembled.negative || GIRLFRIEND_NEGATIVE_FLUX).trim();
      if (!nextPrompt) return false;
      if (opts?.force) {
        setPrompt(nextPrompt);
        setNegative(nextNeg || GIRLFRIEND_NEGATIVE_FLUX);
      } else {
        setPrompt((prev: string) => {
          const p = (prev || '').trim();
          const isGeneric =
            !p ||
            p.startsWith('three-quarter body portrait of a beautiful young adult woman') ||
            p === String((config as Any)?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')?.defaults?.positive || '').trim();
          return isGeneric ? nextPrompt : p;
        });
        setNegative((prev: string) => {
          const n = (prev || '').trim();
          if (!n || n.includes('flat chest') || n.startsWith('blurry, deformed, bad anatomy, child')) {
            return nextNeg || GIRLFRIEND_NEGATIVE_FLUX;
          }
          return n;
        });
      }

      try {
        const plan = resolveGirlfriendLoraPlan(subjectFromGirlfriendRow(row as Record<string, unknown>));
        if (plan?.lora_name) {
          const match = (config?.loras || []).find((l: Any) =>
            String(l.filename || '') === plan.lora_name || String(l.id || '') === plan.lora_name,
          );
          if (match) {
            setLoraId((cur: string) => (cur && cur !== 'none' ? cur : match.id));
            setLoraStrength((s: number) => (s > 0 ? s : plan.lora_strength_model || match.default_strength || 0.75));
          }
        }
      } catch {
        /* ignore lora plan */
      }

      if (opts?.toastOn !== false) {
        toast.success(`已套用女友卡提示词配方：${row.name || 'girlfriend'}`);
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '提示词组装失败');
      return false;
    }
  }"""

if old_apply in text2:
    text2 = text2.replace(old_apply, new_apply)
    print("applyWorkflow replaced")
else:
    print("applyWorkflow NOT found")

text2 = text2.replace(
    """      const wf = data.config?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')
        || data.config?.workflows?.[0];
      if (wf) applyWorkflow(wf, data.config);""",
    """      const wf = data.config?.workflows?.find((w: Any) => w.id === 'wf-girlfriend')
        || data.config?.workflows?.[0];
      // 有女友卡时只套参数，不写死通用 positive（避免盖住已调试提示词）
      if (wf) applyWorkflow(wf, data.config, { preservePrompt: Boolean(girlfriendId) });""",
)
print("loadConfig patch done")

pat2 = re.compile(
    r"if \(one\) \{\s*// fill prompt from card fields if empty[\s\S]*?toast\.message\(`[^`]+`\);\s*\}"
)
m = pat2.search(text2)
print("gf block found", bool(m))
if m:
    repl = """if (one) {
          // 强制使用已调试的 assembleGirlfriendFromRow，而不是字段逗号拼接
          fillPromptFromGirlfriend(one, { force: true, toastOn: true });
          toast.message(`已载入女友：${one.name || girlfriendId}`);
        }"""
    text2 = text2[: m.start()] + repl + text2[m.end() :]
    print("gf block replaced")

pat3 = re.compile(
    r"onClick=\{\(\) => \{\s*if \(!scopedGirlfriend\) return;\s*const bits = \[[\s\S]*?toast\.success\([^)]*\);\s*\}\}"
)
m3 = pat3.search(text2)
print("button found", bool(m3))
if m3:
    text2 = (
        text2[: m3.start()]
        + """onClick={() => {
              if (!scopedGirlfriend) return;
              fillPromptFromGirlfriend(scopedGirlfriend, { force: true, toastOn: true });
            }}"""
        + text2[m3.end() :]
    )
    print("button replaced")

p.write_text(text2, encoding="utf-8")
print("written bytes", p.stat().st_size)
