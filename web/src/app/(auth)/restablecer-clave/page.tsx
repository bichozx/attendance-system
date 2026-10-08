'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

import { Button, Field, Input, Notice } from '@/components/ui';
import { accountError, passwordProblem } from '@/lib/password';

/** Destino del enlace del correo: recuperar la contraseña o activar una cuenta invitada. */
function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
    return (
      <Notice tone="error" title="Enlace incompleto">
        Ábrelo directamente desde el correo o <Link href="/recuperar-clave" className="underline">solicita uno nuevo</Link>.
      </Notice>
    );
  }

  async function submit() {
    const problem = passwordProblem(password, confirmation);
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const res = await fetch('/api/backend/auth/password/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword: password }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError('Sin conexión con el servidor.');
    if (!res.ok) {
      const body = await res.json();
      return setError(accountError(body.code, body.message));
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Notice tone="ok" title="Contraseña guardada">Ya puedes iniciar sesión con ella.</Notice>
        <Link href="/login" className="font-semibold underline-offset-4 hover:underline">
          Iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}>
      <h1 className="text-2xl font-bold">Crea tu contraseña</h1>
      {error ? <Notice tone="error" title={error} /> : null}
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres, con al menos una letra y un número.">
        <Input type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="Repítela">
        <Input type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </Field>
      <Button type="submit" loading={busy}>
        Guardar contraseña
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
