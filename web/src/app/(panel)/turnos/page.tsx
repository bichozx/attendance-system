import { redirect } from 'next/navigation';

import { ShiftsView } from '@/components/shifts/shifts-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Turnos' };

export default async function ShiftsPage() {
  const session = await getSession();
  if (!can(session, 'shifts.read')) redirect('/');
  return <ShiftsView canManage={can(session, 'shifts.manage')} canPublish={can(session, 'shifts.publish')} />;
}
