import { redirect } from 'next/navigation';

import { UsersList } from '@/components/users/users-list';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Usuarios' };

export default async function UsersPage() {
  const session = await getSession();
  if (!session || !can(session, 'users.read')) redirect('/');
  return <UsersList currentUserId={session.user.id} canManage={can(session, 'users.manage')} />;
}
