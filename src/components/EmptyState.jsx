export default function EmptyState({
  illustration,
  title,
  description,
  action,
  actionLabel,
  actionColor = '#1B6B6B',
  secondaryAction,
  secondaryLabel,
  hint,
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      {illustration && <div className="mb-5">{illustration}</div>}

      <h3 className="text-sm font-medium text-gray-800 mb-1.5">{title}</h3>
      {description && (
        <p className="text-xs text-gray-400 leading-relaxed max-w-xs mb-5">{description}</p>
      )}
      {!description && action && <div className="mb-5" />}

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {action && (
            <button
              type="button"
              onClick={action}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-xl text-white transition-colors"
              style={{ background: actionColor }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 2v8M2 6h8" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {actionLabel}
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-4 py-2.5 rounded-xl border transition-colors hover:bg-gray-50"
              style={{ color: actionColor, borderColor: actionColor }}
            >
              {secondaryLabel}
            </button>
          )}
        </div>
      )}

      {hint && <p className="text-xs text-gray-300 mt-3">{hint}</p>}
    </div>
  );
}
