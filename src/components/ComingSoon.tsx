import { Sparkles, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

interface ComingSoonProps {
  title: string;
  description?: string;
  /** 可选：估计的上线节点描述，如 "Q2 2026" */
  eta?: string;
  /** 可选：返回链接，默认指向 /gallery */
  backHref?: string;
}

/**
 * Coming Soon 占位页（避免暴露未完成功能给用户）
 *
 * 用法：
 *   <ComingSoon title="Voice Messages" description="..." eta="Q2 2026" />
 */
export default function ComingSoon({
  title,
  description,
  eta,
  backHref = '/gallery',
}: ComingSoonProps) {
  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="relative">
        <div className="absolute inset-0 -z-10 animate-pulse rounded-full bg-gradient-to-br from-rose-500/20 to-fuchsia-500/20 blur-2xl" />
        <div className="rounded-full border border-border/40 bg-card/60 p-5 backdrop-blur-xl">
          <Sparkles className="h-10 w-10 text-rose-400" />
        </div>
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">{title}</h1>
      {description ? (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      ) : (
        <p className="max-w-md text-sm text-muted-foreground">
          We&apos;re crafting something special. Stay tuned!
        </p>
      )}
      {eta ? (
        <span className="rounded-full border border-border/40 bg-card/40 px-3 py-1 text-xs text-muted-foreground">
          ETA: {eta}
        </span>
      ) : null}
      <Link
        href={backHref}
        className="mt-2 inline-flex items-center gap-2 rounded-full border border-border/40 bg-card/40 px-4 py-2 text-sm text-foreground transition hover:bg-card/70"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>
    </div>
  );
}
