import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

const ConfirmContext = createContext(null);

// A styled stand-in for window.confirm() -- the browser's native dialog
// doesn't match the app's look at all (different font, no rounding, stark
// black background) and can't be restyled. This renders a modal instead,
// but keeps the same "await it, get a boolean back" shape so call sites
// barely change: `if (!confirm(msg)) return;` becomes
// `if (!(await confirmDialog(msg))) return;`.
export function ConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const resolveRef = useRef(null);

  const confirmDialog = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setDialog({
        message,
        confirmLabel: options.confirmLabel || 'Delete',
        cancelLabel: options.cancelLabel || 'Cancel',
      });
    });
  }, []);

  function close(result) {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setDialog(null);
  }

  useEffect(() => {
    if (!dialog) return;
    function onKeyDown(e) {
      if (e.key === 'Escape') close(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialog]);

  return (
    <ConfirmContext.Provider value={confirmDialog}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
          onClick={() => close(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-slate-700 leading-relaxed">{dialog.message}</p>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => close(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg px-4 py-2 transition"
              >
                {dialog.cancelLabel}
              </button>
              <button
                autoFocus
                onClick={() => close(true)}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition"
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}
