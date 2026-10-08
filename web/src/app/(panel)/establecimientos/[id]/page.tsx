import { redirect } from 'next/navigation';

import { StoreDetail } from '@/components/stores/store-detail';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Establecimiento' };

export default async function StorePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!can(session, 'stores.read')) redirect('/');
  return <StoreDetail id={id} canManage={can(session, 'stores.manage')} />;
}
