import { redirect } from 'next/navigation';

import { RolesView } from '@/components/roles/roles-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Roles y permisos' };

export default async function RolesPage() {
  const session = await getSession();
  if (!can(session, 'roles.read')) redirect('/');
  return <RolesView canManage={can(session, 'roles.manage')} />;
}
