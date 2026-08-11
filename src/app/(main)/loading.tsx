export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="h-64 bg-gray-800 rounded-lg mb-4"></div>
      <div className="space-y-3">
        <div className="h-4 bg-gray-800 rounded w-3/4"></div>
        <div className="h-4 bg-gray-800 rounded w-1/2"></div>
      </div>
    </div>
  );
}
