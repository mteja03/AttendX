export function SkeletonRow({ cols = 6 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white border rounded-2xl p-4">
      <div className="h-8 w-16 bg-gray-100 rounded mb-2" />
      <div className="h-3 w-24 bg-gray-100 rounded" />
    </div>
  );
}
