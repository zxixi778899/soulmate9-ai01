/**
 * 动态工作流控件提取 — 把 ComfyUI API 格式工作流 JSON 解析成可编辑控件。
 * 「根据完整的功能生成对应的功能」：节点图上有什么输入，控制台就生成什么控件。
 */

export type RawControlKind = 'text' | 'number' | 'seed' | 'image' | 'boolean';

export type RawControl = {
  /** 控件 id：`${node_id}.${input_key}` */
  id: string;
  node_id: string;
  class_type: string;
  input_key: string;
  kind: RawControlKind;
  label: string;
  value: unknown;
};

type GraphNode = {
  class_type?: string;
  inputs?: Record<string, unknown>;
};

const NUMBER_LABELS: Record<string, string> = {
  width: '宽度',
  height: '高度',
  batch_size: '批量数',
  steps: '采样步数',
  cfg: 'CFG',
  denoise: '重绘强度',
  guidance: 'Flux 引导',
  strength_model: 'LoRA 模型强度',
  strength_clip: 'LoRA CLIP 强度',
  weight: '权重',
  num_frames: '帧数',
  fps: '帧率',
  motion_bucket_id: '运动幅度',
};

const TEXT_LABELS: Record<string, string> = {
  ckpt_name: 'Checkpoint',
  lora_name: 'LoRA 文件',
  vae_name: 'VAE',
  sampler_name: '采样器',
  scheduler: '调度器',
  filename_prefix: '文件名前缀',
  model: '模型名',
  upscale_method: '放大方式',
  crop: '裁剪',
};

/** 找到 KSampler 的 negative 连线指向的节点 id（用于区分正/负提示词） */
function findNegativeNodeIds(graph: Record<string, unknown>): Set<string> {
  const ids = new Set<string>();
  for (const node of Object.values(graph)) {
    const n = node as GraphNode;
    const inputs = n?.inputs;
    if (!inputs) continue;
    const cls = String(n?.class_type || '');
    if (!/KSampler/i.test(cls)) continue;
    const neg = inputs.negative;
    if (Array.isArray(neg) && typeof neg[0] === 'string') ids.add(neg[0]);
  }
  return ids;
}

export function extractRawControls(graph: Record<string, unknown> | null | undefined): RawControl[] {
  const controls: RawControl[] = [];
  if (!graph || typeof graph !== 'object') return controls;
  const negativeIds = findNegativeNodeIds(graph);

  for (const [nodeId, raw] of Object.entries(graph)) {
    const node = raw as GraphNode;
    if (!node || typeof node !== 'object' || !node.inputs) continue;
    const cls = String(node.class_type || '');

    for (const [key, value] of Object.entries(node.inputs)) {
      if (Array.isArray(value)) continue; // 节点连线，不是字面量参数
      if (value == null) continue;

      let kind: RawControlKind | null = null;
      let label = `${cls || 'node'} · ${key}`;

      if (key === 'seed' && (typeof value === 'number' || typeof value === 'bigint')) {
        kind = 'seed';
        label = '种子（-1 随机）';
      } else if (/LoadImage/i.test(cls) && key === 'image') {
        kind = 'image';
        label = `参考图（节点 ${nodeId}）`;
      } else if (/CLIPTextEncode/i.test(cls) && key === 'text') {
        kind = 'text';
        label = negativeIds.has(nodeId) ? '负面提示词' : '正面提示词';
      } else if (typeof value === 'boolean') {
        kind = 'boolean';
      } else if (typeof value === 'number') {
        kind = 'number';
        label = NUMBER_LABELS[key] || `${cls || 'node'} · ${key}`;
      } else if (typeof value === 'string') {
        kind = 'text';
        label = TEXT_LABELS[key] || `${cls || 'node'} · ${key}`;
      }

      if (!kind) continue;
      controls.push({
        id: `${nodeId}.${key}`,
        node_id: nodeId,
        class_type: cls,
        input_key: key,
        kind,
        label,
        value,
      });
    }
  }

  // 排序：提示词 → 参考图 → 其它文本 → 数值/种子
  const rank = (c: RawControl): number => {
    if (c.kind === 'text' && /提示词/.test(c.label)) return 0;
    if (c.kind === 'image') return 1;
    if (c.kind === 'text') return 2;
    if (c.kind === 'seed') return 3;
    if (c.kind === 'number') return 4;
    return 5;
  };
  controls.sort((a, b) => rank(a) - rank(b) || a.node_id.localeCompare(b.node_id, undefined, { numeric: true }));
  return controls;
}

/** 把控件值写回工作流图（返回深拷贝，不改原图） */
export function applyRawControlValues(
  graph: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(graph)) as Record<string, { inputs?: Record<string, unknown> }>;
  for (const [id, value] of Object.entries(values)) {
    if (value === undefined) continue;
    const dot = id.indexOf('.');
    if (dot <= 0) continue;
    const nodeId = id.slice(0, dot);
    const inputKey = id.slice(dot + 1);
    const node = clone[nodeId];
    if (!node?.inputs || !(inputKey in node.inputs)) continue;
    node.inputs[inputKey] = value as never;
  }
  return clone as Record<string, unknown>;
}

/** 简单校验是否为 ComfyUI API 格式图 */
export function validateRawGraph(graph: unknown): { ok: boolean; error?: string } {
  if (!graph || typeof graph !== 'object' || Array.isArray(graph)) {
    return { ok: false, error: '工作流必须是 JSON 对象（节点 id → {class_type, inputs}）' };
  }
  const entries = Object.entries(graph as Record<string, unknown>);
  if (!entries.length) return { ok: false, error: '工作流为空' };
  for (const [id, node] of entries) {
    const n = node as GraphNode;
    if (!n || typeof n !== 'object') return { ok: false, error: `节点 ${id} 不是对象` };
    if (!n.class_type) return { ok: false, error: `节点 ${id} 缺少 class_type` };
    if (!n.inputs || typeof n.inputs !== 'object') return { ok: false, error: `节点 ${id} 缺少 inputs` };
  }
  return { ok: true };
}
