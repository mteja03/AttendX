import { memo } from 'react';

/** Table `<tbody>` row skeleton (legacy). */
export const SkeletonTableRow = memo(function SkeletonTableRow({ cols = 6 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-100 rounded w-full" />
        </td>
      ))}
    </tr>
  );
});

export { SkeletonRow, SkeletonCard, SkeletonTable } from './Skeleton';
