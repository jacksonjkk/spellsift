/* eslint-disable react-refresh/only-export-components -- The context object intentionally shares a module with its provider. */
import React, { createContext, useCallback, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

type ToastTone = 'success' | 'error' | 'warning' | 'info';
type ConfirmTone = 'danger' | 'warning' | 'info';

interface ToastInput {
  title: string;
  message?: string;
  tone?: ToastTone;
  durationMs?: number;
}

interface Toast extends Required<ToastInput> {
  id: number;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface PendingConfirm extends Required<ConfirmOptions> {
  resolve: (confirmed: boolean) => void;
}

interface NotificationContextType {
  toast: (input: ToastInput) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

const toastIcons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 size={18} />,
  error: <XCircle size={18} />,
  warning: <AlertTriangle size={18} />,
  info: <Info size={18} />,
};

const ConfirmDialog: React.FC<{
  pending: PendingConfirm;
  onClose: (confirmed: boolean) => void;
}> = ({ pending, onClose }) => {
  const dialogRef = useDialog<HTMLElement>(true, () => onClose(false));

  return createPortal(
    <div
      className="confirm-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose(false);
      }}
    >
      <section
        ref={dialogRef}
        className={`confirm-dialog confirm-${pending.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-message"
      >
        <div className="confirm-icon" aria-hidden="true">
          {pending.tone === 'danger' ? (
            <XCircle size={24} />
          ) : pending.tone === 'warning' ? (
            <AlertTriangle size={24} />
          ) : (
            <Info size={24} />
          )}
        </div>
        <div className="confirm-copy">
          <h2 id="confirm-title">{pending.title}</h2>
          <p id="confirm-message">{pending.message}</p>
        </div>
        <div className="confirm-actions">
          <button type="button" className="btn btn-outline" onClick={() => onClose(false)}>
            {pending.cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${pending.tone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => onClose(true)}
          >
            {pending.confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = nextToastId.current;
      nextToastId.current += 1;

      const nextToast: Toast = {
        id,
        title: input.title,
        message: input.message || '',
        tone: input.tone || 'info',
        durationMs: input.durationMs ?? 3600,
      };

      setToasts((current) => [...current, nextToast].slice(-4));
      window.setTimeout(() => dismissToast(id), nextToast.durationMs);
    },
    [dismissToast]
  );

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendingConfirm({
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel,
        cancelLabel: options.cancelLabel || 'Cancel',
        tone: options.tone || 'info',
        resolve,
      });
    });
  }, []);

  const closeConfirm = useCallback((confirmed: boolean) => {
    setPendingConfirm((current) => {
      current?.resolve(confirmed);
      return null;
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [confirm, toast]);

  return (
    <NotificationContext.Provider value={value}>
      {children}

      {createPortal(
        <div className="toast-stack" aria-live="polite" aria-relevant="additions">
          {toasts.map((item) => (
            <div key={item.id} className={`toast toast-${item.tone}`} role="status">
              <div className="toast-icon" aria-hidden="true">
                {toastIcons[item.tone]}
              </div>
              <div className="toast-copy">
                <strong>{item.title}</strong>
                {item.message && <span>{item.message}</span>}
              </div>
              <button
                type="button"
                className="toast-close"
                onClick={() => dismissToast(item.id)}
                aria-label="Dismiss notification"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>,
        document.body
      )}

      {pendingConfirm && (
        <ConfirmDialog pending={pendingConfirm} onClose={closeConfirm} />
      )}
    </NotificationContext.Provider>
  );
};
