'use client';

import { useState, useEffect } from 'react';
import { logger } from '@/lib/logger';

interface GenerateResult {
  slug: string;
  status: 'ok' | 'failed' | 'pending' | 'partial' | 'skipped';
  url?: string;
  error?: string;
  note?: string;
}

const BATCH_SIZE = 5;
const BATCH_PAUSE_MS = 5000; //  5s  Vercel 

export default function AdminGenerateCardsPage() {
  const [running, setRunning] = useState(false);
  const [slugs, setSlugs] = useState<string[]>([]);
  const [results, setResults] = useState<Record<string, GenerateResult>>({});
  const [currentSlug, setCurrentSlug] = useState<string | null>(null);
  const [currentBatch, setCurrentBatch] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/generate-cards', { credentials: 'include' })
      .then((r) => r.json())
      .then((data) => setSlugs(data.slugs ?? []))
      .catch((e) => logger.error('fetch slugs failed', { data: e }));
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

  //  5 3  14 5+5+4
  const startGeneration = async () => {
    setRunning(true);
    setResults({});
    const totalBatches = Math.ceil(slugs.length / BATCH_SIZE);

    for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
      setCurrentBatch(batchIdx + 1);
      const start = batchIdx * BATCH_SIZE;
      const end = Math.min(start + BATCH_SIZE, slugs.length);
      const batch = slugs.slice(start, end);

      for (const slug of batch) {
        const result = await generateOne(slug);
        setResults((prev) => ({ ...prev, [slug]: result }));
      }

      // 
      if (batchIdx < totalBatches - 1) {
        for (let s = BATCH_PAUSE_MS / 1000; s > 0; s--) {
          setCurrentBatch(batchIdx + 1);
          await new Promise((r) => setTimeout(r, 1000));
        }
      }
    }
    setCurrentSlug(null);
    setCurrentBatch(null);
    setRunning(false);
  };

  const succeeded = Object.values(results).filter((r) => r.status === 'ok').length;
  const failed = Object.values(results).filter((r) => r.status === 'failed').length;
  const partial = Object.values(results).filter((r) => r.status === 'partial').length;
  const done = succeeded + failed + partial;

  //  slugs  3 
  const batches: string[][] = [];
  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    batches.push(slugs.slice(i, i + BATCH_SIZE));
  }

  return (
    <div className="p-8 max-w-4xl mx-auto text-white">
      <h1 className="text-2xl font-bold mb-4">  3 </h1>

      <div className="bg-yellow-900/30 border border-yellow-600/40 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-yellow-300 mb-2"> </h3>
        <ul className="text-sm text-yellow-200/80 space-y-1 list-disc pl-5">
          <li>14  3 5 + 5 + 4   2.5-5 </li>
          <li> 5  Vercel </li>
          <li> Vercel function  30-60sPro 60s timeout </li>
          <li>  7-10 </li>
          <li>Vercel env RUNPOD_API_KEY, RUNPOD_ENDPOINT_ID, COZE_SUPABASE_URL, COZE_SUPABASE_SERVICE_ROLE_KEY</li>
        </ul>
      </div>

      <div className="bg-zinc-900/50 border border-zinc-700 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-zinc-400">
              {done} / {slugs.length}
              {currentBatch && <span className="ml-3 text-pink-400"> {currentBatch} / {batches.length} </span>}
            </p>
            {currentSlug && (
              <p className="text-sm text-pink-400"> : {currentSlug}</p>
            )}
          </div>
          <button
            onClick={startGeneration}
            disabled={running || slugs.length === 0}
            className="px-6 py-3 bg-pink-600 hover:bg-pink-500 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold rounded-lg transition"
          >
            {running ? `  (${done}/${slugs.length})` : `  ${slugs.length}  3 `}
          </button>
        </div>

        {slugs.length > 0 && (
          <div className="w-full bg-zinc-800 rounded-full h-2 mb-4 overflow-hidden">
            <div
              className="bg-pink-500 h-full transition-all duration-300"
              style={{ width: `${slugs.length > 0 ? (done / slugs.length) * 100 : 0}%` }}
            />
          </div>
        )}

        {done > 0 && (
          <div className="text-sm mb-4">
            <span className="text-green-400"> {succeeded}</span>
            {partial > 0 && <> <span className="text-yellow-400 ml-3"> {partial}</span></>}
            {failed > 0 && <> <span className="text-red-400 ml-3"> {failed}</span></>}
          </div>
        )}

        {/*  */}
        <div className="space-y-3 max-h-[500px] overflow-y-auto">
          {batches.map((batch, bIdx) => (
            <div key={bIdx} className="border border-zinc-700/50 rounded p-2">
              <div className="text-xs text-zinc-500 mb-1">
                 {bIdx + 1}{batch.length} 
                {currentBatch === bIdx + 1 && <span className="ml-2 text-pink-400"> </span>}
              </div>
              <div className="space-y-0.5">
                {batch.map((slug) => {
                  const r = results[slug];
                  const status = r?.status ?? 'pending';
                  const emoji = status === 'ok' ? '' : status === 'failed' ? '' : status === 'partial' ? '' : status === 'skipped' ? '' : '';
                  return (
                    <div
                      key={slug}
                      className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-zinc-800/50"
                    >
                      <span>{emoji}</span>
                      <span className="font-mono w-24">{slug}</span>
                      <span className="text-zinc-400 text-xs flex-1 truncate">
                        {r?.url ?? r?.error ?? r?.note ?? (currentSlug === slug ? '...' : '')}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 text-sm text-zinc-400">
        <h3 className="font-bold mb-2"> </h3>
        <p>  cards/&#123;slug&#125;.png page.tsx </p>
        <p> partial  storage    Supabase Storage </p>
      </div>
    </div>
  );
}