import { redirect } from 'next/navigation';

import { DashboardView } from '@/components/dashboard/dashboard-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Hoy' };

export default async function TodayPage() {
  const session = await getSession();
  if (!can(session, 'reports.read')) redirect('/aprobaciones');
  return <DashboardView canFilterStores={can(session, 'stores.read')} />;
}
