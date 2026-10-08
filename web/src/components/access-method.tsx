'use client';

import { Button, Input } from '@/components/ui';

export type AccessMethod = 'invite' | 'password';

/** Contraseña temporal legible y fuerte: sin caracteres ambiguos (0/O, 1/l). */
export function temporaryPassword() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(11));
  const s = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}7`;
}

/**
 * Cómo entra la persona por primera vez. Por defecto, invitación por correo: nadie más conoce
 * su contraseña. La clave temporal queda para quien no puede abrir el correo en el momento.
 */
export function AccessMethodField({
  method,
  onMethod,
  password,
  onPassword,
}: {
  method: AccessMethod;
  onMethod: (m: AccessMethod) => void;
  password: string;
  onPassword: (p: string) => void;
}) {
  const options: { value: AccessMethod; title: string; text: string }[] = [
    { value: 'invite', title: 'Enviar invitación por correo (recomendado)', text: 'Le llega un enlace para crear su propia contraseña. Vale 72 horas.' },
    { value: 'password', title: 'Darle una contraseña temporal', text: 'Se la entregas en persona y la cambia al entrar por primera vez.' },
  ];
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-semibold">Primer ingreso</legend>
      {options.map((o) => (
        <label
          key={o.value}
          className={`flex cursor-pointer gap-3 rounded-ui border px-3 py-2.5 ${method === o.value ? 'border-ink bg-paper' : 'border-line hover:bg-paper'}`}>
          <input
            type="radio"
            name="access-method"
            className="mt-1 size-4 accent-ink"
            checked={method === o.value}
            onChange={() => {
              onMethod(o.value);
              if (o.value === 'password' && !password) onPassword(temporaryPassword());
            }}
          />
          <span>
            <span className="block font-semibold">{o.title}</span>
            <span className="block text-sm text-muted">{o.text}</span>
          </span>
        </label>
      ))}
      {method === 'password' ? (
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={password} className="min-w-40 flex-1 font-mono font-semibold" aria-label="Contraseña temporal" />
          <Button type="button" variant="secondary" onClick={() => onPassword(temporaryPassword())}>
            Generar otra
          </Button>
          <Button type="button" variant="secondary" onClick={() => void navigator.clipboard?.writeText(password)}>
            Copiar
          </Button>
        </div>
      ) : null}
    </fieldset>
  );
}
