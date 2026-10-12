import { redirect } from 'next/navigation';

import { PositionsView } from '@/components/positions/positions-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Cargos' };

export default async function PositionsPage() {
  const session = await getSession();
  if (!can(session, 'employees.read')) redirect('/');
  return <PositionsView canManage={can(session, 'employees.manage')} />;
}
