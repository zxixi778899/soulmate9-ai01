'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Layers, HardDrive, GitBranch, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ─── 静态数据：与 data/lora-catalog.json + model-lora-routing.ts 同步 ───

const VOLUME_INFO = {
  id: 'p1dup48kuq',
  region: 'US-CA-2',
  path: '/runpod-volume/models/loras',
  totalGb: 30,
  usedGb: 1.5,
};

const INSTALLED_LORAS = [
  { filename: 'flux_realism_xlabs.safetensors', family: 'flux', category: '写实', sizeMb: 21.4, routing: '女性主LoRA' },
  { filename: 'flux_krea_realism.safetensors', family: 'flux', category: '写实', sizeMb: 85.6, routing: '男性主LoRA' },
  { filename: 'flux_hyperrealism_aidma.safetensors', family: 'flux', category: '写实', sizeMb: 73.1, routing: '跨性别主LoRA' },
  { filename: 'flux_add_details.safetensors', family: 'flux', category: '细节', sizeMb: 655.6, routing: '写实辅助(必挂)' },
  { filename: 'flux_detail_enhancer.safetensors', family: 'flux', category: '细节', sizeMb: 164.0, routing: '动漫专用' },
  { filename: 'flux_uncensored.safetensors', family: 'flux', category: '功能', sizeMb: 37.9, routing: '解禁(必挂)' },
  { filename: 'flux_nsfw_klein_v2.safetensors', family: 'flux', category: 'NSFW', sizeMb: 158.0, routing: 'NSFW≥3' },
  { filename: 'pony_detailifier_v5.safetensors', family: 'pony', category: '细节', sizeMb: 18.4, routing: 'Pony万能' },
  { filename: 'AddMicroDetails_Illustrious_v6.safetensors', family: 'illustrious', category: '细节', sizeMb: 217.9, routing: 'Illustrious主' },
  { filename: 'StS-Illustrious-Detail-Slider-v1.0.safetensors', family: 'illustrious', category: '2D', sizeMb: 8.4, routing: '2D滑块' },
];

const PENDING_LORAS = [
  { filename: 'BackgroundDetailerV3-000004.safetensors', family: 'illustrious', category: '背景', sizeMb: 218, reason: 'RunPod serverless故障待恢复' },
];

const ROUTING_TABLE: Record<string, Record<string, string[]>> = {
  flux: {
    '女性 (female)': ['flux_realism_xlabs', 'flux_add_details', 'flux_uncensored'],
    '男性 (male)': ['flux_krea_realism', 'flux_add_details', 'flux_uncensored'],
    '跨性别 (trans)': ['flux_hyperrealism_aidma', 'flux_add_details', 'flux_uncensored'],
    '动漫 (anime)': ['flux_detail_enhancer'],
    'NSFW ≥3': ['flux_nsfw_klein_v2'],
  },
  pony: {
    '所有类别': ['pony_detailifier_v5'],
  },
  illustrious: {
    '写实/动漫': ['AddMicroDetails_Illustrious_v6', 'BackgroundDetailerV3*'],
    '2D 平面': ['StS-Illustrious-Detail-Slider-v1.0'],
  },
};

const GEN_PARAMS = [
  { family: 'FLUX', steps: '22', cfg: '1.0', sampler: 'euler', scheduler: 'simple', clip: '-' },
  { family: 'Pony', steps: '28', cfg: '7.0', sampler: 'euler_ancestral', scheduler: 'normal', clip: '2' },
  { family: 'Illustrious', steps: '26', cfg: '7.0', sampler: 'euler_ancestral', scheduler: 'normal', clip: '2' },
  { family: 'Turbo', steps: '12', cfg: '1.0', sampler: 'euler', scheduler: 'simple', clip: '-' },
];

const FAMILY_COLORS: Record<string, string> = {
  flux: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  pony: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  illustrious: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

export default function LoraPanel() {
  return (
    <div className="space-y-6">
      {/* Volume Status */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-medium text-white">网络卷 LoRA 存储</span>
            </div>
            <Badge variant="outline" className="text-xs border-gray-700 text-gray-400">
              {VOLUME_INFO.id} · {VOLUME_INFO.region}
            </Badge>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <span>路径: <code className="text-gray-300">{VOLUME_INFO.path}</code></span>
            <span>容量: {VOLUME_INFO.usedGb}GB / {VOLUME_INFO.totalGb}GB</span>
            <span>文件: {INSTALLED_LORAS.length} 个已部署</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(VOLUME_INFO.usedGb / VOLUME_INFO.totalGb) * 100}%` }} />
          </div>
        </CardContent>
      </Card>

      {/* Installed LoRAs Table */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">已部署 LoRA 清单</span>
            <Badge variant="outline" className="text-xs border-emerald-500/30 text-emerald-400">{INSTALLED_LORAS.length}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-3 font-medium">文件名</th>
                  <th className="text-left py-2 pr-3 font-medium">族</th>
                  <th className="text-left py-2 pr-3 font-medium">分类</th>
                  <th className="text-right py-2 pr-3 font-medium">大小</th>
                  <th className="text-left py-2 font-medium">路由角色</th>
                </tr>
              </thead>
              <tbody>
                {INSTALLED_LORAS.map((lora) => (
                  <tr key={lora.filename} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="py-2 pr-3">
                      <code className="text-gray-300 text-[11px]">{lora.filename}</code>
                    </td>
                    <td className="py-2 pr-3">
                      <Badge variant="outline" className={`text-[10px] ${FAMILY_COLORS[lora.family]}`}>{lora.family}</Badge>
                    </td>
                    <td className="py-2 pr-3 text-gray-400">{lora.category}</td>
                    <td className="py-2 pr-3 text-right text-gray-400">{lora.sizeMb}MB</td>
                    <td className="py-2 text-gray-300">{lora.routing}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pending */}
          {PENDING_LORAS.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>
                待部署: {PENDING_LORAS.map((p) => p.filename).join(', ')} — {PENDING_LORAS[0].reason}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Routing Table */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-medium text-white">自动路由规则</span>
            <span className="text-xs text-gray-500">resolveModelLoraPlan() · 强度自动递减 · total cap 1.65</span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {Object.entries(ROUTING_TABLE).map(([family, routes]) => (
              <div key={family} className="space-y-2">
                <Badge variant="outline" className={`text-xs ${FAMILY_COLORS[family]}`}>{family.toUpperCase()}</Badge>
                <div className="space-y-1.5">
                  {Object.entries(routes).map(([category, loras]) => (
                    <div key={category} className="text-xs">
                      <span className="text-gray-500">{category}: </span>
                      <span className="text-gray-300">
                        {loras.map((l, i) => (
                          <span key={l}>
                            {i > 0 && <span className="text-gray-600"> + </span>}
                            <code className={`${l.endsWith('*') ? 'text-amber-400' : 'text-gray-300'}`}>{l.replace('*', '')}</code>
                          </span>
                        ))}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">* BackgroundDetailerV3 待部署，缺失时自动回退到仅 MicroDetails</p>
        </CardContent>
      </Card>

      {/* Generation Params */}
      <Card className="bg-[#16161f] border-gray-800">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-white">生成参数配置</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  <th className="text-left py-2 pr-4 font-medium">模型族</th>
                  <th className="text-center py-2 pr-4 font-medium">Steps</th>
                  <th className="text-center py-2 pr-4 font-medium">CFG</th>
                  <th className="text-left py-2 pr-4 font-medium">Sampler</th>
                  <th className="text-left py-2 pr-4 font-medium">Scheduler</th>
                  <th className="text-center py-2 font-medium">Clip Skip</th>
                </tr>
              </thead>
              <tbody>
                {GEN_PARAMS.map((p) => (
                  <tr key={p.family} className="border-b border-gray-800/50">
                    <td className="py-2 pr-4">
                      <Badge variant="outline" className={`text-[10px] ${FAMILY_COLORS[p.family.toLowerCase()] || 'border-gray-700 text-gray-400'}`}>{p.family}</Badge>
                    </td>
                    <td className="py-2 pr-4 text-center text-gray-300">{p.steps}</td>
                    <td className="py-2 pr-4 text-center text-gray-300">{p.cfg}</td>
                    <td className="py-2 pr-4 text-gray-300">{p.sampler}</td>
                    <td className="py-2 pr-4 text-gray-300">{p.scheduler}</td>
                    <td className="py-2 text-center text-gray-300">{p.clip}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
