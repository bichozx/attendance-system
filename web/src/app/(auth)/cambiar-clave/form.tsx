'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, Input, Notice } from '@/components/ui';
import { accountError, passwordProblem } from '@/lib/password';

export function ChangePasswordForm({ name, forced }: { name: string; forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const problem = passwordProblem(password, confirmation);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    // El BFF guarda el access token nuevo en la cookie: la sesión sigue sin volver a entrar
    const res = await fetch('/api/backend/auth/password', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ currentPassword: current, newPassword: password }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError('Sin conexión con el servidor.');
    const body = await res.json();
    if (!res.ok) return setError(accountError(body.code, body.message));
    router.replace('/');
    router.refresh();
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}>
      <h1 className="text-2xl font-bold">{forced ? `Hola, ${name}` : 'Cambiar contraseña'}</h1>
      {forced ? (
        <Notice tone="neutral" title="Crea tu propia contraseña">
          Te dieron una contraseña temporal. Cámbiala para empezar a usar el panel.
        </Notice>
      ) : null}
      {error ? <Notice tone="error" title={error} /> : null}
      <Field label={forced ? 'Contraseña temporal' : 'Contraseña actual'}>
        <Input type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, con al menos una letra y un número.">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repite la nueva">
        <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </Field>
      <Button type="submit" loading={busy}>
        Guardar contraseña
      </Button>
      {forced ? null : (
        <Link href="/" className="text-sm underline-offset-4 hover:underline">
          Cancelar
        </Link>
      )}
    </form>
  );
}
