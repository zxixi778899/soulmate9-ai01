'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { HardDrive, Layers, ShieldCheck, ShieldAlert } from 'lucide-react';
import { authedFetch } from '@/lib/supabase';

type VolumeInfo = {
  inventory_source?: string;
  installed_loras?: string[];
  region?: string;
  target_volume?: string;
  paths?: { loras?: string };
};

type LoraInfo = {
  id: string;
  label: string;
  filename: string;
  category?: string;
  base_model?: string;
  default_strength: number;
};

export default function LoraPanel() {
  const [volume, setVolume] = useState<VolumeInfo | null>(null);
  const [loras, setLoras] = useState<LoraInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      authedFetch('/api/admin/comfy?view=volume').then((response) => response.json()),
      authedFetch('/api/admin/comfy?view=loras').then((response) => response.json()),
    ]).then(([volumeData, loraData]) => {
      if (!active) return;
      setVolume(volumeData as VolumeInfo);
      setLoras(((loraData as { loras?: LoraInfo[] }).loras || []).filter((item) => item.filename));
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const verified = volume?.inventory_source === 'runtime-volume';
  return (
    <div className="space-y-6">
      <Card className="border-gray-800 bg-[#16161f]">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-medium text-white">
              <HardDrive className="h-4 w-4 text-purple-400" /> RunPod LoRA 运行卷
            </div>
            <Badge variant="outline" className={verified ? 'border-emerald-500/30 text-emerald-400' : 'border-amber-500/30 text-amber-400'}>
              {loading ? '读取中' : verified ? '运行卷已验证' : '清单不可用'}
            </Badge>
          </div>
          <div className="grid gap-2 text-xs text-gray-400 sm:grid-cols-3">
            <span>卷：{volume?.target_volume || '-'}</span>
            <span>区域：{volume?.region || '-'}</span>
            <span>路径：{volume?.paths?.loras || 'models/loras'}</span>
          </div>
          <div className="flex items-start gap-2 rounded-md bg-black/20 p-3 text-xs text-gray-300">
            {verified ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />}
            {verified
              ? `后台和生成链路仅使用以下 ${loras.length} 个已验证文件。`
              : '没有取得真实挂载卷清单，系统已安全禁用全部 LoRA；静态目录不会被当作已安装文件。'}
          </div>
        </CardContent>
      </Card>

      <Card className="border-gray-800 bg-[#16161f]">
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <Layers className="h-4 w-4 text-cyan-400" /> 当前可用 LoRA
            <Badge variant="outline" className="border-gray-700 text-gray-400">{loras.length}</Badge>
          </div>
          {loras.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-gray-800 text-left text-gray-400"><th className="py-2">文件</th><th>模型</th><th>分类</th><th>默认强度</th></tr></thead>
                <tbody>{loras.map((lora) => (
                  <tr key={lora.id} className="border-b border-gray-800/50 text-gray-300">
                    <td className="py-2 font-mono">{lora.filename}</td><td>{lora.base_model || '-'}</td><td>{lora.category || '-'}</td><td>{lora.default_strength}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : <p className="rounded-md border border-dashed border-gray-800 p-6 text-center text-xs text-gray-400">暂无经过运行卷验证的 LoRA。</p>}
          <p className="text-[11px] text-gray-400">头像和三视图：基础模型零 LoRA。立绘和相册：参考图/IP-Adapter 保持人物一致性，LoRA 只补充明确风格、动作或服装。</p>
        </CardContent>
      </Card>
    </div>
  );
}