'use client';

import { useEffect, useCallback, useState } from 'react';
import { authedFetch } from '@/lib/supabase';
import { readResponseJson } from '@/lib/safe-json';
import { StudioProvider, useStudio } from './StudioContext';
import { ModeSelector } from './panels/ModeSelector';
import { InputPanel } from './panels/InputPanel';
import { OutputPanel } from './panels/OutputPanel';
import { CompanionSelector } from './companion/CompanionSelector';
import { PipelineRunner } from './pipeline/PipelineRunner';
import { BatchGenerator } from './pipeline/BatchGenerator';
import type { Any } from './StudioWorkbench.types';

function StudioInner({ girlfriendId }: { girlfriendId?: string }) {
  const { state, dispatch, loadConfig } = useStudio();
  const [girlfriends, setGirlfriends] = useState<Any[]>([]);

  // Load config on mount
  useEffect(() => { void loadConfig(); }, [loadConfig]);

  // Load girlfriend list
  const loadGirlfriends = useCallback(async () => {
    try {
      const res = await authedFetch('/api/admin/girlfriends?limit=200');
      const data = await readResponseJson(res).catch(() => ({} as Any));
      const list = data.girlfriends || data.items || [];
      setGirlfriends(list);

      // Auto-select if girlfriendId is passed
      if (girlfriendId && !state.companionId) {
        const gf = list.find((g: Any) => String(g.id) === girlfriendId);
        if (gf) {
          dispatch({ type: 'SET_COMPANION', id: girlfriendId, girlfriend: gf, assets: [] });
          // Load companion assets
          void loadCompanionAssets(girlfriendId);
        }
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only run on mount
  }, []);

  useEffect(() => { void loadGirlfriends(); }, [loadGirlfriends]);

  const loadCompanionAssets = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const params = new URLSearchParams({ view: 'assets', girlfriend_id: id, limit: '120' });
      const [libraryRes, generatedRes] = await Promise.all([
        authedFetch(`/api/companion/${encodeURIComponent(id)}/assets`),
        authedFetch(`/api/admin/comfy?${params.toString()}`),
      ]);
      const libraryData = await readResponseJson(libraryRes).catch(() => ({} as Any));
      const generatedData = await readResponseJson(generatedRes).catch(() => ({} as Any));
      const libraryAssets: Any[] = Array.isArray(libraryData.assets) ? libraryData.assets : [];
      const generatedAssets: Any[] = Array.isArray(generatedData.assets) ? generatedData.assets : [];
      const knownUrls = new Set(libraryAssets.map((a) => String(a.url || '')));
      const merged = [
        ...libraryAssets,
        ...generatedAssets.filter((a) => a.url && !knownUrls.has(String(a.url))),
      ].filter((item, idx, all) =>
        all.findIndex((c) => String(c.id || c.url) === String(item.id || item.url)) === idx,
      );
      dispatch({ type: 'SET_COMPANION_ASSETS', assets: merged });
    } catch { /* ignore */ }
  }, [dispatch]);

  const selectCompanion = useCallback((id: string) => {
    const gf = girlfriends.find((g) => String(g.id) === id) || null;
    dispatch({ type: 'SET_COMPANION', id, girlfriend: gf, assets: [] });
    void loadCompanionAssets(id);
  }, [dispatch, girlfriends, loadCompanionAssets]);

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-100">
      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0f]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <ModeSelector />
          <CompanionSelector
            girlfriends={girlfriends}
            selectedId={state.companionId}
            onSelect={selectCompanion}
          />
        </div>
      </header>

      {/* Main workspace: left input + right output */}
      <main className="mx-auto max-w-[1600px] px-4 py-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
          <InputPanel />
          <OutputPanel />
        </div>

        {/* Pipeline + Batch */}
        {state.companionId && (
          <div className="mt-4 space-y-4">
            <PipelineRunner
              companionId={state.companionId}
              companion={state.scopedGirlfriend}
              animeStyle={state.animeRenderStyle}
              nsfwIntensity={state.nsfwIntensity}
              onComplete={() => { /* refresh assets if needed */ }}
            />
            {girlfriends.length > 0 && <BatchGenerator girlfriends={girlfriends} />}
          </div>
        )}
      </main>
    </div>
  );
}

export default function StudioWorkbench({ girlfriendId, embedded = false }: { girlfriendId?: string; embedded?: boolean }) {
  return (
    <StudioProvider girlfriendId={girlfriendId}>
      <div className={embedded ? '' : 'min-h-screen'}>
        <StudioInner girlfriendId={girlfriendId} />
      </div>
    </StudioProvider>
  );
}

export { StudioWorkbench };
