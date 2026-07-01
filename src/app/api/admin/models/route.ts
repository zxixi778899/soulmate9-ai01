import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/require-admin';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CONFIG_PATH = '/tmp/llm_router_config.json';

const AVAILABLE_MODELS = [
  { value: 'doubao-seed-2-0-pro-260215', label: 'Doubao Pro 2.0 (旗舰) — 复杂推理/长链路' },
  { value: 'doubao-seed-2-0-lite-260215', label: 'Doubao Lite 2.0 (均衡) — 日常聊天' },
  { value: 'doubao-seed-2-0-mini-260215', label: 'Doubao Mini 2.0 (轻量) — 高并发/低成本' },
  { value: 'deepseek-v3-2-251201', label: 'DeepSeek V3' },
  { value: 'kimi-k2-5-260127', label: 'Kimi K2-5 (多模态)' },
  { value: 'glm-5-0-260211', label: 'GLM-5 (智能体)' },
  { value: 'minimax-m2-5-260212', label: 'MiniMax M2-5 (编码/智能体)' },
  { value: 'qwen-3-5-plus-260215', label: 'Qwen 3.5 Plus (多模态)' },
];

const DEFAULT_CONFIG: Record<string, { value: string; label: string; type: string; options?: { label: string; value: string }[] }> = {
  chat_model: {
    value: 'doubao-seed-2-0-pro-260215',
    label: '主聊天模型',
    type: 'select',
    options: AVAILABLE_MODELS,
  },
  chat_temperature: {
    value: '0.85',
    label: '聊天温度 (0-2, 越高越随机)',
    type: 'number',
  },
  prompt_optimizer_model: {
    value: 'doubao-seed-2-0-lite-260215',
    label: '提示词优化模型',
    type: 'select',
    options: AVAILABLE_MODELS,
  },
  emotion_detection_model: {
    value: 'doubao-seed-2-0-mini-260215',
    label: '情绪识别模型 (低延迟)',
    type: 'select',
    options: AVAILABLE_MODELS,
  },
  metadata_generation_model: {
    value: 'doubao-seed-2-0-pro-260215',
    label: '元数据生成模型 (名称/简介/标签)',
    type: 'select',
    options: AVAILABLE_MODELS,
  },
};

function loadConfig(): Record<string, string> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {}
  // Default values
  return Object.fromEntries(
    Object.entries(DEFAULT_CONFIG).map(([key, cfg]) => [key, cfg.value])
  );
}

function saveConfig(config: Record<string, string>) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

export async function GET() {
  const config = loadConfig();

  const settings = Object.entries(DEFAULT_CONFIG).map(([key, cfg]) => ({
    key,
    label: cfg.label,
    type: cfg.type,
    value: config[key] || cfg.value,
    options: cfg.options,
  }));

  return NextResponse.json({ settings });
}

export async function PATCH(request: NextRequest) {
  const adminCheck = await requireAdmin(request);
  if (adminCheck.error) return adminCheck.error;

  try {
    const body = await request.json();
    const updates: { key: string; value: string }[] = body;

    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'updates array is required' }, { status: 400 });
    }

    const current = loadConfig();
    for (const { key, value } of updates) {
      if (DEFAULT_CONFIG[key]) {
        current[key] = value;
      }
    }
    saveConfig(current);

    return NextResponse.json({ success: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}