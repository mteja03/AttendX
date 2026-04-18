/* eslint-disable react-refresh/only-export-components */
// Context files intentionally export multiple values — fast refresh limitation accepted for provider files.
import { createContext, useContext, useCallback, useState } from 'react';

const ToastContext = createContext(null);

const AUTO_DISMISS_MS = 3000;

const TOAST_CONFIG = {
  success: {
    bar: '#639922',
    iconBg: '#EAF3DE',
    text: '#27500A',
    border: 'border-green-100',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" fill="#EAF3DE" />
        <path
          d="M5 8l2 2 4-4"
          stroke="#3B6D11"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  error: {
    bar: '#E24B4A',
    iconBg: '#FCEBEB',
    text: '#791F1F',
    border: 'border-red-100',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" fill="#FCEBEB" />
        <path d="M6 6l4 4M10 6l-4 4" stroke="#A32D2D" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  warning: {
    bar: '#EF9F27',
    iconBg: '#FAEEDA',
    text: '#633806',
    border: 'border-amber-100',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" fill="#FAEEDA" />
        <path d="M8 5.5v3M8 10.5v.5" stroke="#854F0B" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  info: {
    bar: '#378ADD',
    iconBg: '#E6F1FB',
    text: '#0C447C',
    border: 'border-blue-100',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" fill="#E6F1FB" />
        <path d="M8 7v4M8 5.5v.5" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const show = useCallback((message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const success = useCallback((msg) => show(msg, 'success'), [show]);
  const error = useCallback((msg) => show(msg, 'error'), [show]);
  const warning = useCallback((msg) => show(msg, 'warning'), [show]);
  const info = useCallback((msg) => show(msg, 'info'), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, warning, info }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-sm w-full"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const c = TOAST_CONFIG[t.type] || TOAST_CONFIG.success;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto rounded-xl border ${c.border} bg-white overflow-hidden flex items-stretch`}
              style={{ boxShadow: '0 2px 12px 0 rgba(0,0,0,0.08)' }}
            >
              <div className="w-1 flex-shrink-0" style={{ background: c.bar }} />
              <div className="flex items-center gap-3 px-3 py-3 flex-1 min-w-0">
                <div
                  className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ background: c.iconBg }}
                >
                  {c.icon}
                </div>
                <p
                  className="text-sm font-medium flex-1 min-w-0 leading-snug"
                  style={{ color: c.text }}
                >
                  {t.message}
                </p>
                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
                  className="w-5 h-5 flex items-center justify-center rounded flex-shrink-0 opacity-40 hover:opacity-70 transition-opacity"
                  style={{ color: c.text }}
                  aria-label="Dismiss"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return (
    ctx || {
      show: () => {},
      success: () => {},
      error: () => {},
      warning: () => {},
      info: () => {},
    }
  );
}
