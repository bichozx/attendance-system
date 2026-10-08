import { redirect } from 'next/navigation';

import { AuditView } from '@/components/audit/audit-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Auditoría' };

export default async function AuditPage() {
  const session = await getSession();
  if (!can(session, 'audit.read')) redirect('/');
  return <AuditView canListUsers={can(session, 'users.read')} />;
}
