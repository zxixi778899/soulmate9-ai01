'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { logger } from '@/lib/logger';

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error('chat page error boundary', {
      message: error?.message,
      digest: error?.digest,
    });
  }, [error]);

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <h2 className="text-lg font-semibold text-white">Chat failed to load</h2>
      <p className="text-sm text-white/50 max-w-md">
        Something went wrong opening this conversation. You can retry or go back to your companions.
      </p>
      <div className="flex flex-wrap gap-3 justify-center">
        <button
          type="button"
          onClick={reset}
          className="h-10 px-5 rounded-full bg-gradient-to-r from-[#FF2D78] to-[#8b5cf6] text-sm font-medium"
        >
          Try again
        </button>
        <Link
          href="/chats"
          className="h-10 px-5 rounded-full border border-white/15 text-sm flex items-center"
        >
          Back to chats
        </Link>
      </div>
    </div>
  );
}
