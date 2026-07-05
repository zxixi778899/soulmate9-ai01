import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/context';
import { LOCALES, Locale } from '@/lib/i18n/types';
import { Globe } from 'lucide-react';

export function LanguageSwitcher({ variant = 'default' }: { variant?: 'default' | 'compact' | 'sidebar' }) {
  const { locale, setLocale } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = LOCALES.find((l) => l.code === locale);

  if (variant === 'sidebar') {
    return (
      <div className="px-3 py-2">
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Language
        </div>
        <div className="flex flex-wrap gap-1">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLocale(l.code as Locale)}
              className={`rounded-md px-2 py-1 text-xs transition-colors ${
                locale === l.code
                  ? 'bg-primary/20 text-primary font-semibold'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {l.nativeLabel}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>{current?.nativeLabel || 'EN'}</span>
        </button>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-border/40 bg-[#0a0a0f]/95 backdrop-blur-xl p-1 shadow-lg">
              {LOCALES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs transition-colors ${
                    locale === l.code
                      ? 'bg-primary/20 text-primary font-semibold'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                >
                  <span className="text-sm">{l.code === 'en' ? '🇬🇧' : l.code === 'zh' ? '🇨🇳' : l.code === 'ja' ? '🇯🇵' : l.code === 'ko' ? '🇰🇷' : l.code === 'es' ? '🇪🇸' : l.code === 'fr' ? '🇫🇷' : '🇩🇪'}</span>
                  <span>{l.nativeLabel}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
      >
        <Globe className="h-4 w-4" />
        <span>{current?.nativeLabel || 'English'}</span>
        <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border border-border/40 bg-[#0a0a0f]/95 backdrop-blur-xl p-2 shadow-xl">
            {LOCALES.map((l) => (
              <button
                key={l.code}
                onClick={() => { setLocale(l.code as Locale); setOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  locale === l.code
                    ? 'bg-primary/20 text-primary font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                }`}
              >
                <span className="text-base">{l.code === 'en' ? '🇬🇧' : l.code === 'zh' ? '🇨🇳' : l.code === 'ja' ? '🇯🇵' : l.code === 'ko' ? '🇰🇷' : l.code === 'es' ? '🇪🇸' : l.code === 'fr' ? '🇫🇷' : '🇩🇪'}</span>
                <div className="flex flex-col">
                  <span>{l.nativeLabel}</span>
                  <span className="text-[10px] text-muted-foreground">{l.label}</span>
                </div>
                {locale === l.code && (
                  <span className="ml-auto text-primary">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}