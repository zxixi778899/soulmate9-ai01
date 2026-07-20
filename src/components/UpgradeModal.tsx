'use client';

/**
 * Paywall modal — shown when a user hits a daily limit (messages / photos).
 * Highest-intent upgrade moment on the site; keeps copy honest and
 * consistent with server-side tier limits (see useMembership).
 */

import { useRouter } from 'next/navigation';
import { Crown, X, Zap, Infinity as InfinityIcon } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';

export type UpgradeReason = 'message_limit' | 'image_limit' | 'generic';

export default function UpgradeModal({
  open,
  reason,
  onClose,
}: {
  open: boolean;
  reason: UpgradeReason;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();

  if (!open) return null;

  const isImage = reason === 'image_limit';
  const title = isImage ? t('upgrade.imgTitle') : t('upgrade.msgTitle');
  const desc = isImage ? t('upgrade.imgDesc') : t('upgrade.msgDesc');

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#ff2e88]/25 bg-[#140b1d] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 shadow-[0_-8px_60px_rgba(255,45,120,0.25)] animate-in fade-in slide-in-from-bottom-4 duration-200">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 h-8 w-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/50 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-[#FF2D78] to-[#C026D3] flex items-center justify-center shadow-[0_4px_24px_rgba(255,45,120,0.5)]">
          <Crown className="h-7 w-7 text-white" />
        </div>

        <h3 className="mt-4 text-xl font-black text-center">{title}</h3>
        <p className="mt-2 text-sm text-white/55 text-center leading-relaxed">{desc}</p>

        <div className="mt-5 space-y-2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-purple-300" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Pro</span>
                <span className="text-xs text-white/40">$19.99/mo</span>
              </div>
              <p className="text-xs text-white/50 truncate">{t('upgrade.proPerks')}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#ff2e88]/35 bg-gradient-to-r from-[#FF2D78]/[0.12] to-[#C026D3]/[0.12] p-4 flex items-center gap-3 relative overflow-hidden">
            <span className="absolute top-0 right-0 text-[9px] font-black bg-gradient-to-r from-[#FF2D78] to-[#C026D3] px-2 py-0.5 rounded-bl-lg">
              BEST
            </span>
            <div className="h-10 w-10 rounded-xl bg-[#ff2e88]/20 flex items-center justify-center shrink-0">
              <InfinityIcon className="h-5 w-5 text-[#ff6ba6]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">Unlimited</span>
                <span className="text-xs text-white/40">$29.99/mo</span>
              </div>
              <p className="text-xs text-white/50 truncate">{t('upgrade.unlPerks')}</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => {
            onClose();
            router.push('/pricing');
          }}
          className="mt-5 w-full h-12 rounded-2xl bg-gradient-to-r from-[#FF2D78] to-[#C026D3] font-bold text-sm shadow-[0_4px_20px_rgba(255,45,120,0.45)] hover:opacity-90 active:scale-[0.98] transition-all"
        >
          {t('upgrade.cta')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full h-10 text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('upgrade.later')}
        </button>
      </div>
    </div>
  );
}
