import { createContext, useCallback, useContext, useState } from 'react';

const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const toast = useCallback((message, { action, duration = 4000, icon } = {}) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t.slice(-2), { id, message, action, icon }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);
  return (
    <ToastCtx.Provider value={{ toast, dismiss }}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className="toast">
            {t.icon && <span aria-hidden>{t.icon}</span>}
            <span className="grow">{t.message}</span>
            {t.action && (
              <button className="btn sm" onClick={() => { t.action.onClick(); dismiss(t.id); }}>{t.action.label}</button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
