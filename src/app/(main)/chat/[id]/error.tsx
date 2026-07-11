"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";

export default function ChatError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Chat route error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[#08040e] px-6 text-center">
      <p className="text-white/70 text-sm max-w-sm">
        Chat failed to load. You can retry or go back to messages.
      </p>
      <div className="flex gap-2">
        <Button onClick={reset} className="bg-gradient-to-r from-[#FF2D78] to-[#C026D3] border-0">
          Retry
        </Button>
        <Button
          variant="outline"
          className="border-white/15 text-white"
          onClick={() => {
            window.location.href = "/chats";
          }}
        >
          Messages
        </Button>
      </div>
    </div>
  );
}
