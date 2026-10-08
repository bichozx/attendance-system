import { redirect } from 'next/navigation';

import { Sidebar } from '@/components/panel/sidebar';
import { APPROVAL_PERMISSIONS, NAV } from '@/lib/nav';
import { can, getSession } from '@/lib/server/session';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.user.mustChangePassword) redirect('/cambiar-clave');
  if (!session.company) {
    if (session.user.isPlatformAdmin) redirect('/plataforma');
    return (
      <main className="mx-auto max-w-lg px-6 py-20">
        <h1 className="text-2xl font-bold">Sin empresa asignada</h1>
        <p className="mt-2 text-muted">Esta cuenta no tiene acceso activo a ninguna empresa. Pídele al administrador de tu empresa que revise tu acceso.</p>
      </main>
    );
  }

  const items = NAV.filter((item) =>
    item.permission ? can(session, item.permission) : APPROVAL_PERMISSIONS.some((p) => can(session, p)),
  ).map(({ href, label, badge, group }) => ({ href, label, badge, group }));

  return (
    <div className="min-h-dvh md:grid md:grid-cols-[232px_minmax(0,1fr)]">
      <Sidebar
        company={session.company.name}
        user={`${session.user.firstName} ${session.user.lastName}`}
        role={session.company.role.name}
        items={items}
        showCounts={can(session, 'reports.read')}
        platformAdmin={session.user.isPlatformAdmin}
      />
      <main className="min-w-0 px-5 py-6 sm:px-8 lg:px-10">{children}</main>
    </div>
  );
}
