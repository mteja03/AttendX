import { useState, useEffect } from 'react';

export default function IdleWarningBanner({ onStaySignedIn, onSignOut, visible }) {
  const [countdown, setCountdown] = useState(300);

  useEffect(() => {
    if (!visible) {
      setCountdown(300);
      return undefined;
    }

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:bottom-6 md:left-1/2 md:-translate-x-1/2 md:w-auto">
      <div className="bg-gray-900 text-white rounded-2xl shadow-2xl p-5 md:min-w-96 border border-gray-700">
        <div className="flex items-start gap-4">
          <div className="text-2xl flex-shrink-0">⏰</div>
          <div className="flex-1">
            <p className="font-semibold text-sm mb-1">Session expiring soon</p>
            <p className="text-gray-400 text-xs mb-3">
              You will be signed out in{' '}
              <span className="text-amber-400 font-bold text-sm">
                {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
              </span>{' '}
              due to inactivity.
            </p>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onStaySignedIn}
                className="flex-1 py-2 bg-[#1B6B6B] text-white rounded-xl text-xs font-semibold hover:bg-[#155858]"
              >
                Stay Signed In
              </button>
              <button
                type="button"
                onClick={onSignOut}
                className="px-4 py-2 border border-gray-600 text-gray-300 rounded-xl text-xs hover:bg-gray-800"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-400 rounded-full transition-all duration-1000"
            style={{ width: `${(countdown / 300) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
