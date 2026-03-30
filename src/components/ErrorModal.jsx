import React from 'react';
import { ERROR_MESSAGES } from '../utils/errorHandler';

export default function ErrorModal({
  errorType,
  customMessage,
  onRetry,
  onDismiss,
  onSignOut,
}) {
  if (!errorType) return null;

  const config = ERROR_MESSAGES[errorType] || ERROR_MESSAGES.unknown_error;

  const handleAction = () => {
    if (config.actionType === 'signout') onSignOut?.();
    else if (config.actionType === 'retry') onRetry?.();
    else onDismiss?.();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-4">
          <div className="text-4xl mb-3">{config.icon}</div>
          <h3 className="text-base font-semibold text-gray-800 mb-1">{config.title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed">{customMessage || config.message}</p>
        </div>

        {errorType === 'auth_expired' && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-amber-700 text-center">
              This usually happens after leaving AttendX open for a long time. Signing out and back in takes less than
              30 seconds.
            </p>
          </div>
        )}

        {errorType === 'network_error' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-xs text-blue-700 text-center">
              Your work is safe. AttendX saves automatically once connection is restored.
            </p>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleAction}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white ${
              errorType === 'auth_expired'
                ? 'bg-amber-500 hover:bg-amber-600'
                : errorType === 'network_error'
                  ? 'bg-blue-500 hover:bg-blue-600'
                  : 'bg-[#1B6B6B] hover:bg-[#155858]'
            }`}
          >
            {config.action}
          </button>
        </div>
      </div>
    </div>
  );
}
