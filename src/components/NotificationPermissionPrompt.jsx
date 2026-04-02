import { useState } from 'react';

export default function NotificationPermissionPrompt({ onAllow, onDismiss }) {
  const [loading, setLoading] = useState(false);

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-full max-w-sm px-4">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#E8F5F5] flex items-center justify-center flex-shrink-0 text-xl">
            🔔
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-800">Enable notifications</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Get notified about leave requests, birthdays, and important HR updates.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-500 hover:bg-gray-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onAllow();
              } finally {
                setLoading(false);
              }
            }}
            className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-sm font-semibold hover:bg-[#155858] disabled:opacity-50"
          >
            {loading ? 'Enabling...' : '🔔 Enable'}
          </button>
        </div>
      </div>
    </div>
  );
}
