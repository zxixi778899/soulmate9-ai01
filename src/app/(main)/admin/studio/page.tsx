'use client';

/**
 * 创作工作台：SD 式布局（参数左 / 预览右），说明沉底
 * 增量：顶部 "批量营销卡" 按钮 → 调 /api/admin/generate-cards 的批量模式
 */
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Library, FolderOpen, ArrowRight, UserRound, Loader2, Sparkles, X } from 'lucide-react';
import ComfyConsole from '../comfy/ComfyConsole';

interface BatchResult {
  slug: string;
  status: 'ok' | 'partial' | 'failed' | 'pending';
  url?: string;
  error?: string;
}

function StudioInner() {
  const sp = useSearchParams();
  const girlfriendId = (sp.get('girlfriendId') || sp.get('girlfriend_id') || '').trim();

  // 批量营销卡 dialog state
  const [showBatch, setShowBatch] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResults, setBatchResults] = useState<Record<string, BatchResult>>({});
  const [batchError, setBatchError] = useState<string | null>(null);

  const startBatch = async () => {
    setBatchRunning(true);
    setBatchError(null);
    setBatchResults({});
    try {
      // 拿 slugs
      const metaRes = await fetch('/api/admin/generate-cards', { credentials: 'include' });
      if (!metaRes.ok) {
        setBatchError(`无法获取角色列表：HTTP ${metaRes.status}`);
        setBatchRunning(false);
        return;
      }
      const { slugs } = (await metaRes.json()) as { slugs: string[] };
      // 全部置为 pending
      const initial: Record<string, BatchResult> = {};
      for (const s of slugs) initial[s] = { slug: s, status: 'pending' };
      setBatchResults(initial);

      // 逐张 POST（避免 Vercel 60s timeout 累积超时）
      for (const slug of slugs) {
        try {
          const r = await fetch('/api/admin/generate-cards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ slug }),
          });
          const data = await r.json();
          setBatchResults((prev) => ({
            ...prev,
            [slug]: {
              slug,
              status: data.status === 'ok' ? 'ok' : data.status === 'partial' ? 'partial' : 'failed',
              url: data.url,
              error: data.error || data.note,
            },
          }));
        } catch (e: any) {
          setBatchResults((prev) => ({
            ...prev,
            [slug]: { slug, status: 'failed', error: e?.message ?? 'Network error' },
          }));
        }
      }
    } finally {
      setBatchRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0b0b12] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0b0b12]/95 backdrop-blur px-3 py-2.5 md:px-4">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white md:text-lg">创作工作台</h1>
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-slate-400">
                FLUX · RunPod Comfy
              </span>
            </div>
            {girlfriendId ? (
              <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-violet-300">
                <UserRound className="h-3 w-3 shrink-0" />
                女友卡模式 · 资产写入 girlfriends/{girlfriendId}/
              </p>
            ) : (
              <p className="mt-0.5 text-[11px] text-slate-500">公共创作 · 结果进公共资产库</p>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setShowBatch(true)}
              className="inline-flex items-center gap-1 rounded-md bg-pink-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-pink-500"
            >
              <Sparkles className="h-3.5 w-3.5" /> 批量营销卡
            </button>
            <Link
              href="/admin/model-library"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
            >
              <Library className="h-3.5 w-3.5" /> 模型与 LoRA
            </Link>
            <Link
              href="/admin/assets"
              className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10"
            >
              <FolderOpen className="h-3.5 w-3.5" /> 公共资产
            </Link>
            <Link
              href="/admin/girlfriends"
              className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-violet-500"
            >
              女友与媒体 <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px]">
        <ComfyConsole girlfriendId={girlfriendId || undefined} embedded />
      </div>

      {/* 批量营销卡 dialog */}
      {showBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-[#0b0b12] p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-pink-400" />
                <h2 className="text-lg font-bold">批量营销角色卡 (14 张)</h2>
              </div>
              <button
                onClick={() => !batchRunning && setShowBatch(false)}
                className="rounded p-1 text-slate-400 hover:bg-white/10 disabled:opacity-30"
                disabled={batchRunning}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {batchError && (
              <div className="mb-3 rounded border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-300">
                {batchError}
              </div>
            )}

            {!batchRunning && Object.keys(batchResults).length === 0 && (
              <div className="mb-3 rounded border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                <p className="mb-2">将依次生成 14 个 marketing 角色（luna、ruby、summer、scarlet、mira、aria、nova、kira、lyra、sage、ember、jasmine、morgana、wren）的卡图：</p>
                <ul className="ml-4 list-disc space-y-0.5 text-slate-400">
                  <li>每张 ~30-60s · 总计约 7-10 分钟</li>
                  <li>使用 FLUX-safe DSL prompt（避免「同一站姿」模板失败）</li>
                  <li>结果写入 storage <code className="text-pink-300">cards/&#123;slug&#125;.png</code></li>
                  <li>24h 内同名 prompt 命中 cache 直接复用（节省 GPU）</li>
                </ul>
              </div>
            )}

            {Object.keys(batchResults).length > 0 && (
              <div className="mb-3 max-h-80 overflow-y-auto rounded border border-white/10 bg-white/5 p-2 text-xs">
                {Object.values(batchResults).map((r) => (
                  <div
                    key={r.slug}
                    className="flex items-center gap-2 py-1 px-2"
                  >
                    <span className="w-4 shrink-0 text-center">
                      {r.status === 'ok' ? '✅' : r.status === 'partial' ? '⚠️' : r.status === 'failed' ? '❌' : '⏳'}
                    </span>
                    <span className="font-mono w-20 shrink-0">{r.slug}</span>
                    <span className="flex-1 truncate text-slate-400">
                      {r.error ?? r.url ?? '等待中…'}
                    </span>
                    {r.url && r.status === 'ok' && (
                      <a
                        href={r.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 text-pink-400 hover:underline"
                      >
                        查看
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowBatch(false)}
                disabled={batchRunning}
                className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-30"
              >
                {batchRunning ? '请等待…' : '关闭'}
              </button>
              <button
                onClick={startBatch}
                disabled={batchRunning}
                className="inline-flex items-center gap-1 rounded bg-pink-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-pink-500 disabled:opacity-30"
              >
                {batchRunning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> 生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" /> 开始生成 14 张
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminStudioPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <StudioInner />
    </Suspense>
  );
}