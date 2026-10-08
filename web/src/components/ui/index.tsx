'use client';

import { forwardRef, useEffect, useId, useRef } from 'react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------------------------------------------------------------------
// Botones
// ---------------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'quiet';
  size?: 'sm' | 'md';
  loading?: boolean;
};

export function Button({ variant = 'primary', size = 'md', loading, disabled, className, children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-ui font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-[15px]',
        variant === 'primary' && 'bg-ink text-white hover:bg-ink-soft',
        variant === 'secondary' && 'border border-line-strong bg-surface text-ink hover:bg-paper',
        variant === 'danger' && 'bg-missing text-white hover:brightness-95',
        variant === 'quiet' && 'text-ink underline-offset-4 hover:underline',
        className,
      )}>
      {loading ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" /> : null}
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Formularios
// ---------------------------------------------------------------------------

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">{label}</span>
      {children}
      {error ? <span className="text-sm text-missing">{error}</span> : hint ? <span className="text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

const inputClass =
  'h-10 rounded-ui border border-line-strong bg-surface px-3 text-[15px] placeholder:text-upcoming focus:border-ink focus:outline-none aria-[invalid=true]:border-missing';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return <input ref={ref} {...props} className={cx(inputClass, className)} />;
});

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputClass, 'pr-8', className)} />;
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputClass, 'h-auto min-h-20 py-2', className)} />;
}

// ---------------------------------------------------------------------------
// Estado y mensajes
// ---------------------------------------------------------------------------

export type Tone = 'working' | 'missing' | 'warn' | 'leave' | 'done' | 'neutral';

const TONES: Record<Tone, string> = {
  working: 'bg-working/10 text-working',
  missing: 'bg-missing/10 text-missing',
  warn: 'bg-warn/12 text-[#94650a]',
  leave: 'bg-leave/10 text-leave',
  done: 'bg-done/10 text-done',
  neutral: 'bg-line text-ink-soft',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold whitespace-nowrap', TONES[tone])}>{children}</span>;
}

export function Notice({ tone = 'neutral', title, children }: { tone?: 'neutral' | 'error' | 'ok' | 'warn'; title: string; children?: React.ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx(
        'rounded-ui border-l-4 bg-surface px-4 py-3',
        tone === 'error' && 'border-missing',
        tone === 'ok' && 'border-working',
        tone === 'warn' && 'border-warn',
        tone === 'neutral' && 'border-ink',
      )}>
      <p className="font-semibold">{title}</p>
      {children ? <div className="mt-0.5 text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-ui border border-dashed border-line-strong px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Cargando' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 py-8 text-muted" role="status">
      <span className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> {label}…
    </p>
  );
}

// ---------------------------------------------------------------------------
// Página y tablas
// ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-ui border border-line bg-surface">
      <table className="w-full border-collapse text-left text-[15px]">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cx('border-b border-line bg-paper/60 px-4 py-2.5 text-sm font-semibold text-muted', className)}>{children}</th>;
}

export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cx('border-b border-line px-4 py-3 align-top', className)}>{children}</td>;
}

// ---------------------------------------------------------------------------
// Diálogo (elemento nativo: foco atrapado y Esc para cerrar sin librerías)
// ---------------------------------------------------------------------------

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(560px,calc(100vw-2rem))] rounded-ui border border-line bg-surface p-0 text-ink shadow-2xl backdrop:bg-ink/40">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 id={titleId} className="text-lg font-bold">
          {title}
        </h2>
        <button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-muted hover:text-ink">
          ✕
        </button>
      </div>
      <div className="px-5 py-4">{open ? children : null}</div>
    </dialog>
  );
}
