'use client';

import Image from 'next/image';
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
    <header className="bg-grill border-b-2 border-brand text-cream">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
        <Link href="/plataforma" className="flex items-center gap-4 leading-tight">
          <Image src="/brand/tauras-steakhouse.png" alt="" width={337} height={180} priority className="h-auto w-[84px]" />
          <span>
            <span className="block text-[12px] font-semibold tracking-[0.14em] text-brass uppercase">Plataforma</span>
            <span className="block text-sm text-cream/65">Control de asistencia</span>
          </span>
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-cream/80" aria-label="Cuenta">
          {hasCompany ? (
            <Link href="/" className="underline-offset-4 hover:text-cream hover:underline">
              Ir a mi empresa
            </Link>
          ) : null}
          <span className="font-semibold text-cream">{user}</span>
          <Link href="/cambiar-clave" className="underline-offset-4 hover:text-cream hover:underline">
            Contraseña
          </Link>
          <button onClick={() => void logout()} className="underline-offset-4 hover:text-cream hover:underline">
            Cerrar sesión
          </button>
        </nav>
      </div>
    </header>
  );
}
