export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="flex flex-col items-center gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-2 border-purple-500 border-t-pink-500"></div>
        <p className="text-gray-400 text-sm animate-pulse">Loading...</p>
      </div>
    </div>
  );
}
