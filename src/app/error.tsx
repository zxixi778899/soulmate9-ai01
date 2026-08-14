'use client';

import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="text-6xl">⚠️</div>
        <h2 className="text-2xl font-bold text-white">Something went wrong</h2>
        <p className="text-gray-400 max-w-md">{error.message || 'An unexpected error occurred'}</p>
        <div className="flex gap-3">
          <button
            onClick={() => reset()}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg font-medium transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
