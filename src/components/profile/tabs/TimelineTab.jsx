const TIMELINE_COLORS = {
  green: {
    dot: 'bg-green-500',
    bg: 'bg-green-50',
    border: 'border-green-100',
    text: 'text-green-700',
  },
  blue: {
    dot: 'bg-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    text: 'text-blue-700',
  },
  purple: {
    dot: 'bg-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-100',
    text: 'text-purple-700',
  },
  amber: {
    dot: 'bg-amber-500',
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    text: 'text-amber-700',
  },
  orange: {
    dot: 'bg-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-100',
    text: 'text-orange-700',
  },
  teal: {
    dot: 'bg-[#1B6B6B]',
    bg: 'bg-[#E8F5F5]',
    border: 'border-[#4ECDC4]/30',
    text: 'text-[#1B6B6B]',
  },
  red: {
    dot: 'bg-red-500',
    bg: 'bg-red-50',
    border: 'border-red-100',
    text: 'text-red-700',
  },
  gray: {
    dot: 'bg-gray-400',
    bg: 'bg-gray-50',
    border: 'border-gray-100',
    text: 'text-gray-500',
  },
};

export default function TimelineTab({ timelineEvents, toDisplayDate }) {
  return (
    <div>
      {timelineEvents.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-sm">No timeline events yet</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-100" aria-hidden />
          <div className="space-y-3">
            {timelineEvents.map((event) => {
              const colors = TIMELINE_COLORS[event.color] || TIMELINE_COLORS.gray;
              return (
                <div key={event.id} className="relative flex gap-4">
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm ${colors.bg} border-2 ${colors.border}`}
                  >
                    <span className="text-base leading-none">{event.icon}</span>
                  </div>
                  <div className={`flex-1 p-3 rounded-xl border mb-1 ${colors.bg} ${colors.border}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{event.title}</p>
                        {event.description ? (
                          <p className="text-xs text-gray-500 mt-0.5 break-words">{event.description}</p>
                        ) : null}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs text-gray-400">
                          {event.date instanceof Date && !Number.isNaN(event.date.getTime())
                            ? toDisplayDate(event.date)
                            : '—'}
                        </p>
                        {event.by ? (
                          <p className="text-xs text-gray-300 mt-0.5">
                            by {(event.by || '').split('@')[0]}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
