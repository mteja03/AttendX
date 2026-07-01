import { STATUS_BADGE_CONFIG } from '../../utils/employeeListHelpers.jsx';

export default function StatusBadge({ status }) {
  const label = status || 'Active';
  const c = STATUS_BADGE_CONFIG[label] || STATUS_BADGE_CONFIG.Inactive;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${c.bg} ${c.text}`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: c.dot }}
      />
      {label}
    </span>
  );
}
