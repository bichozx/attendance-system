'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function PlatformHeader({ user, hasCompany }: { user: string; hasCompany: boolean }) {
  const router = useRouter();
  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/plataforma" className="leading-tight">
          <span className="block font-bold">Plataforma</span>
          <span className="block text-sm text-muted">Control de asistencia</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm" aria-label="Cuenta">
          {hasCompany ? (
            <Link href="/" className="underline-offset-4 hover:underline">
              Ir a mi empresa
            </Link>
          ) : null}
          <span className="font-semibold">{user}</span>
          <Link href="/cambiar-clave" className="underline-offset-4 hover:underline">
            Contraseña
          </Link>
          <button onClick={() => void logout()} className="underline-offset-4 hover:underline">
            Cerrar sesión
          </button>
        </nav>
      </div>
    </header>
  );
}
