'use client';

/**
 * CompanionGrid — "pick your character" hero shown before a companion is
 * selected. ourdream-style full-bleed cards with uppercase display names,
 * plus category tabs (All / Female / Male / Trans / Anime).
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Loader2, Plus } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';
import type { TranslationKey } from '@/lib/i18n/types';
import { cn } from '@/lib/utils';
import {
  girlAvatarUrl,
  girlMatchesCategory,
  type CompanionCategory,
  type Girl,
} from './types';

const CATEGORY_TABS: { id: CompanionCategory; key: TranslationKey }[] = [
  { id: 'all', key: 'generate.allCompanions' },
  { id: 'female', key: 'studio.genderFemale' },
  { id: 'male', key: 'studio.genderMale' },
  { id: 'trans', key: 'studio.genderTrans' },
  { id: 'anime', key: 'studio.styleAnime' },
];

export function CompanionGrid(props: {
  girls: Girl[];
  loading: boolean;
  onSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [category, setCategory] = useState<CompanionCategory>('all');

  const visibleGirls = useMemo(
    () => props.girls.filter((g) => girlMatchesCategory(g, category)),
    [props.girls, category],
  );

  return (
    <section className="mx-auto max-w-4xl pt-6">
      <h1 className="text-center text-3xl sm:text-5xl font-extrabold uppercase tracking-tight">
        <span className="bg-gradient-to-r from-[#FF1CAC] via-[#FD5FC2] to-[#FF79D1] bg-clip-text text-transparent">
          {t('generate.chooseCompanion')}
        </span>
      </h1>
      <p className="mt-2 text-center text-sm text-white/45">{t('generate.companionHint')}</p>

      {/* Category tabs */}
      <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setCategory(tab.id)}
            className={cn(
              'h-8 px-4 rounded-full border text-[11px] font-semibold transition-all',
              category === tab.id
                ? 'border-[#FD5FC2]/70 bg-[#FD5FC2]/15 text-white'
                : 'border-white/10 text-white/55 hover:text-white hover:border-white/25',
            )}
          >
            {t(tab.key)}
          </button>
        ))}
      </div>

      {props.loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-[#FD5FC2]" />
        </div>
      ) : props.girls.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-white/45">{t('generate.noCompanions')}</p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full px-6 h-11 text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(0deg, #FF1CAC, #FD5FC2 50%, #FF79D1)',
              boxShadow: '0 0 24px rgba(253,95,194,0.35)',
            }}
          >
            <Plus className="h-4 w-4" /> {t('generate.goCreate')}
          </Link>
        </div>
      ) : visibleGirls.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-white/45">{t('generate.noCompanions')}</p>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-full px-6 h-11 text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(0deg, #FF1CAC, #FD5FC2 50%, #FF79D1)',
              boxShadow: '0 0 24px rgba(253,95,194,0.35)',
            }}
          >
            <Plus className="h-4 w-4" /> {t('generate.goCreate')}
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-2">
          {visibleGirls.map((girl) => (
            <button
              key={girl.id}
              type="button"
              onClick={() => props.onSelect(girl.id)}
              className="group relative aspect-[172/214] overflow-hidden rounded-lg border border-white/10 text-left transition-all hover:border-[#FD5FC2]/60 hover:shadow-[0_0_28px_rgba(253,95,194,0.3)] active:scale-[0.98]"
            >
              {girlAvatarUrl(girl) ? (
                // eslint-disable-next-line @next/next/no-img-element -- dynamic companion portrait
                <img
                  src={girlAvatarUrl(girl) || ''}
                  alt={girl.name}
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <span className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2a0f22] to-[#12081a] text-2xl font-bold text-white/30">
                  {girl.name.slice(0, 1)}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2.5 pt-8">
                <span className="block text-sm font-extrabold uppercase tracking-wide text-white truncate">
                  {girl.name}
                </span>
                <span className="mt-1 inline-block rounded-full bg-white px-3 py-0.5 text-[10px] font-bold uppercase tracking-wide text-black opacity-0 transition-opacity group-hover:opacity-100">
                  {t('generate.select')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
