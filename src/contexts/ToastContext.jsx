import { createContext, useContext, useCallback, useState } from 'react';

const ToastContext = createContext(null);

const AUTO_DISMISS_MS = 3000;

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

  return (
    <ToastContext.Provider value={{ show, success, error }}>
      {children}
      <div
        className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
              t.type === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-green-200 bg-green-50 text-green-800'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  return ctx || { show: () => {}, success: () => {}, error: () => {} };
}
