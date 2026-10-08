'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type Tone = 'ok' | 'error';
interface ToastItem {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

/** Confirmación breve de una acción ("Novedad aprobada"). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const show = useCallback((text: string, tone: Tone = 'ok') => {
    const id = Date.now() + Math.random();
    setItems((list) => [...list, { id, text, tone }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), 4500);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" className="fixed bottom-5 right-5 z-50 flex flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded-ui px-4 py-2.5 text-sm text-white shadow-lg ${t.tone === 'ok' ? 'bg-ink' : 'bg-missing'}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
