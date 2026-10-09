'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { Button, Field, Input, Notice, PasswordField } from '@/components/ui';
import { accountError } from '@/lib/password';

interface CompanyOption {
  id: string;
  name: string;
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companies, setCompanies] = useState<CompanyOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('vencida') ? 'Tu sesión terminó. Inicia sesión de nuevo.' : null);

  async function submit(companyId?: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, companyId }),
      });
      const body = await res.json();
      if (res.status === 409 && body.code === 'COMPANY_SELECTION_REQUIRED') {
        return setCompanies(body.details.companies as CompanyOption[]);
      }
      if (!res.ok) return setError(accountError(body.code, body.message, body.details) || 'No se pudo iniciar sesión.');
      if (!body.company && !body.user.isPlatformAdmin) return setError('Esta cuenta no pertenece a ninguna empresa.');
      const next = params.get('next');
      router.replace(body.user.mustChangePassword ? '/cambiar-clave' : next?.startsWith('/') ? next : '/');
      router.refresh();
    } catch {
      setError('Sin conexión con el servidor.');
    } finally {
      setBusy(false);
    }
  }

  if (companies) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">¿A qué empresa entras?</h1>
        <p className="text-muted">Tu cuenta tiene acceso a varias.</p>
        {companies.map((c) => (
          <Button key={c.id} variant="secondary" className="justify-start" loading={busy} onClick={() => void submit(c.id)}>
            {c.name}
          </Button>
        ))}
        <Button variant="quiet" onClick={() => setCompanies(null)}>
          Usar otra cuenta
        </Button>
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
      <h1 className="text-2xl font-bold">Iniciar sesión</h1>
      {error ? <Notice tone="error" title={error} /> : null}
      <Field label="Correo">
        <Input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <PasswordField label="Contraseña" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <Button type="submit" loading={busy}>
        Iniciar sesión
      </Button>
      <Link href="/recuperar-clave" className="text-sm underline-offset-4 hover:underline">
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
