'use client';

import { useState, useEffect } from 'react';

interface GenerateResult {
  slug: string;
  status: 'ok' | 'failed' | 'pending' | 'partial';
  url?: string;
  error?: string;
  note?: string;
}

export default function AdminGenerateCardsPage() {
  const [running, setRunning] = useState(false);
  const [slugs, setSlugs] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, GenerateResult>>({});
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);

  // 启动时拉取所有 slug
  useEffect(() => {
    fetch('/api/admin/generate-cards', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setSlugs(data.slugs ?? []))
      .catch((e) => console.error('fetch slugs failed', e));
  }, []);

  const generateOne = async (slug: string): Promise<GenerateResult> => {
    setCurrentSlug(slug);
    setResults((prev) => ({
      ...prev,
      [slug]: { slug, status: 'pending' },
    }));
    try {
      const res = await fetch('/api/admin/generate-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug }),
      });
      const data = await res.json();
      return { slug, ...data };
    } catch (e: any) {
      return { slug, status: 'failed', error: e?.message };
    }
  };

  const startGeneration = async () => {
    setRunning(true);
    setResults({});
    for (const slug of slugs) {
      const result = await generateOne(slug);
      setResults((prev) => ({ ...prev, [slug]: result }));
    }
    setCurrentSlug(null);
    setRunning(false);
  };

  const succeeded = Object.values(results).filter((r) => r.status === 'ok').length;
  const failed = Object.values(results).filter((r) => r.status === 'failed').length;
  const partial = Object.values(results).filter((r) => r.status === 'partial').length;
  const done = succeeded + failed + partial;

  return (
    <div className="p-8 max-w-4xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">🎨 批量生成女友卡图（单张模式）</h1>

      <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-yellow-300 mb-2">⚠️ 重要前提</h3>
        <ul className="text-sm text-yellow-200/80 space-y-1 list-disc pl-5">
          <li>每次调用生成 1 张（30-60s），Vercel Pro 60s timeout 够</li>
          <li>14 张连续跑 ≈ 7-10 分钟（请保持页面打开）</li>
          <li>Vercel env 必须有：RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, COZE_SUPABASE_URL, COZE_SUPABASE_SERVICE_ROLE_KEY</li>
          <li>生成后自动重命名为 cards/&#123;slug&#125;.png（page.tsx 直接用）</li>
        </ul>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-zinc-400">状态：{done} / {slugs.length}</p>
            {currentSlug && (
              <p className="text-sm text-pink-400">⏳ 正在生成: {currentSlug}</p>
            )}
          </div>
          <button
            onClick={startGeneration}
            disabled={running || slugs.length === 0}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
          >
            {running ? `⏳ 生成中 (${done}/${slugs.length})` : `🚀 开始生成 ${slugs.length} 张`}
          </button>
        </div>

        {/* 进度条 */}
        {slugs.length > 0 && (
          <div className="w-full bg-zinc-800 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-pink-500 h-full transition-all duration-300"
              style={{ width: `${slugs.length > 0 ? (done / slugs.length) * 100 : 0}%` }}
            />
          </div>
        )}

        {/* 结果统计 */}
        {done > 0 && (
          <div className="text-sm mb-4">
            <span className="text-green-400">✅ {succeeded}</span>
            {partial > 0 && <> <span className="text-yellow-400 ml-3">⚠️ {partial}</span></>}
            {failed > 0 && <> <span className="text-red-400 ml-3">❌ {failed}</span></>}
          </div>
        )}

        {/* 每个 slug 的状态 */}
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {slugs.map((slug) => {
            const r = results[slug];
            const status = r?.status ?? 'pending';
            const emoji = status === 'ok' ? '✅' : status === 'failed' ? '❌' : status === 'partial' ? '⚠️' : '⏳';
            return (
              <div
                key={slug}
                className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-zinc-800/50"
              >
                <span>{emoji}</span>
                <span className="font-mono w-24">{slug}</span>
                <span className="text-zinc-400 text-xs flex-1 truncate">
                  {r?.url ?? r?.error ?? r?.note ?? (currentSlug === slug ? '生成中...' : '等待')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 text-sm text-zinc-400">
        <h3 className="font-bold mb-2">📝 完成后</h3>
        <p>✅ 状态表示 cards/&#123;slug&#125;.png 已就绪，page.tsx 自动加载。</p>
        <p>⚠️ partial 状态表示生成成功但 storage 重命名失败 — 需到 Supabase Storage 手动重命名。</p>
      </div>
    </div>
  );
}