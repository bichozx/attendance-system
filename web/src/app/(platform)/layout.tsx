import { redirect } from 'next/navigation';

import { PlatformHeader } from '@/components/platform/platform-header';
import { getSession } from '@/lib/server/session';

/** Consola del superadministrador: empresas de la plataforma. */
export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/cambiar-clave');
  if (!session.user.isPlatformAdmin) redirect('/');
  return (
    <div className="min-h-dvh">
      <PlatformHeader user={`${session.user.firstName} ${session.user.lastName}`} hasCompany={!!session.company} />
      <main className="mx-auto max-w-6xl px-5 py-6 sm:px-8">{children}</main>
    </div>
  );
}
