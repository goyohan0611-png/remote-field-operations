import React, { useRef } from 'react';

export type AppDialogTone = 'default' | 'danger';

export type AppDialogOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  tone?: AppDialogTone;
};

export type AppDialogRequest = AppDialogOptions & {
  mode: 'alert' | 'confirm';
  resolve: (value: boolean) => void;
};

export type AppDialogApi = {
  alert: (options: AppDialogOptions | string) => Promise<void>;
  confirm: (options: AppDialogOptions | string) => Promise<boolean>;
};

export const AppDialogContext = React.createContext<AppDialogApi | null>(null);

export function normalizeDialogOptions(options: AppDialogOptions | string): AppDialogOptions {
  return typeof options === 'string' ? { title: options } : options;
}

export function useModalBackdrop(onClose: () => void, disabled = false) {
  const pointerStartedOnBackdropRef = useRef(false);

  return {
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => {
      pointerStartedOnBackdropRef.current = event.target === event.currentTarget;
    },
    onClick: (event: React.MouseEvent<HTMLDivElement>) => {
      const shouldClose = pointerStartedOnBackdropRef.current && event.target === event.currentTarget;
      pointerStartedOnBackdropRef.current = false;
      if (!disabled && shouldClose) onClose();
    },
  };
}

export function useAppDialog() {
  const dialog = React.useContext(AppDialogContext);
  if (!dialog) {
    return {
      alert: async (options: AppDialogOptions | string) => {
        const normalized = normalizeDialogOptions(options);
        window.alert(normalized.message || normalized.title);
      },
      confirm: async (options: AppDialogOptions | string) => {
        const normalized = normalizeDialogOptions(options);
        return window.confirm(normalized.message || normalized.title);
      },
    };
  }

  return dialog;
}

export function AppDialogHost({
  request,
  onResolve,
}: {
  request: AppDialogRequest | null;
  onResolve: (value: boolean) => void;
}) {
  if (!request) return null;

  return (
    <div className="app-dialog-backdrop" onClick={() => onResolve(false)}>
      <section className={`app-dialog ${request.tone === 'danger' ? 'danger' : ''}`} onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>{request.title}</strong>
          {request.message && <p>{request.message}</p>}
        </header>
        <footer>
          {request.mode === 'confirm' && (
            <button type="button" onClick={() => onResolve(false)}>
              {request.cancelText || '취소'}
            </button>
          )}
          <button type="button" className={request.tone === 'danger' ? 'danger' : 'primary'} onClick={() => onResolve(true)}>
            {request.confirmText || '확인'}
          </button>
        </footer>
      </section>
    </div>
  );
}
