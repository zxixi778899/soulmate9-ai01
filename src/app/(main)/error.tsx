'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        <h2 className="text-xl font-bold text-white mb-2">Page error</h2>
        <p className="text-gray-400 mb-4 text-sm">{error.message}</p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
