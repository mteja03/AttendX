import { useState, useEffect } from 'react';

export default function NotificationBanner({ notification, onClose, onClick }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) return undefined;
    setVisible(true);
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300);
    }, 5000);
    return () => clearTimeout(timer);
  }, [notification, onClose]);

  if (!notification) return null;

  const ICONS = {
    leave: '🏖️',
    birthday: '🎂',
    anniversary: '🎉',
    onboarding: '🎯',
    offboarding: '🚪',
    document: '📄',
    asset: '📦',
    default: '🔔',
  };

  const icon = ICONS[notification.data?.type] || ICONS.default;

  return (
    <div
      className={`fixed bottom-6 right-6 z-[200] transition-all duration-300 ${
        visible ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
      }`}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick?.();
        }}
        className="bg-white border border-gray-200 rounded-2xl shadow-xl p-4 w-80 cursor-pointer hover:shadow-2xl transition-shadow"
      >
        <div className="flex items-start gap-3">
          <div className="text-2xl flex-shrink-0">{icon}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{notification.title}</p>
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.body}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setVisible(false);
              setTimeout(onClose, 300);
            }}
            className="text-gray-300 hover:text-gray-500 flex-shrink-0 text-lg leading-none"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1B6B6B] rounded-full"
            style={{
              animation: visible ? 'shrink 5s linear forwards' : 'none',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
