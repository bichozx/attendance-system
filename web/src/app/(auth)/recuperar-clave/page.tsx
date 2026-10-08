'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button, Field, Input, Notice } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/backend/auth/password/forgot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError('Sin conexión con el servidor.');
    const body = await res.json();
    if (!res.ok) return setError(res.status === 429 ? 'Demasiados intentos. Espera un minuto.' : body.message);
    setSent(body.message);
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Recuperar contraseña</h1>
      {sent ? (
        <Notice tone="ok" title="Revisa tu correo">
          {sent} El enlace vence en 30 minutos.
        </Notice>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}>
          <p className="text-muted">Te enviaremos un enlace para crear una contraseña nueva.</p>
          {error ? <Notice tone="error" title={error} /> : null}
          <Field label="Correo">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" loading={busy}>
            Enviar enlace
          </Button>
        </form>
      )}
      <Link href="/login" className="text-sm underline-offset-4 hover:underline">
        Volver a iniciar sesión
      </Link>
    </div>
  );
}
