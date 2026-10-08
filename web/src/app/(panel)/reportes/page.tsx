import { redirect } from 'next/navigation';

import { ReportsView } from '@/components/reports/reports-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Reportes' };

export default async function ReportsPage() {
  const session = await getSession();
  if (!can(session, 'reports.read')) redirect('/');
  return <ReportsView canExport={can(session, 'reports.export')} canFilterStores={can(session, 'stores.read')} />;
}
