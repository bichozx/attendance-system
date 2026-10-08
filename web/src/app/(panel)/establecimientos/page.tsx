import { redirect } from 'next/navigation';

import { StoresList } from '@/components/stores/stores-list';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Establecimientos' };

export default async function StoresPage() {
  const session = await getSession();
  if (!can(session, 'stores.read')) redirect('/');
  return <StoresList canManage={can(session, 'stores.manage')} />;
}
