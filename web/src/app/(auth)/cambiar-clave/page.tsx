import { redirect } from 'next/navigation';

import { getSession } from '@/lib/server/session';
import { ChangePasswordForm } from './form';

export const metadata = { title: 'Cambiar contraseña' };

export default async function ChangePasswordPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  return <ChangePasswordForm name={session.user.firstName} forced={session.user.mustChangePassword} />;
}
