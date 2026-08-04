'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import ComfyUiConsole from './ComfyUiConsole';

export default function AdminComfyUiPage(): React.JSX.Element {
  return (
    <Suspense
      fallback={
        <div className="flex h-64 items-center justify-center text-slate-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      }
    >
      <ComfyUiConsole />
    </Suspense>
  );
}
