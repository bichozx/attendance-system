import { redirect } from 'next/navigation';

import { CompanySettings } from '@/components/company/company-settings';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Empresa' };

export default async function CompanyPage() {
  const session = await getSession();
  if (!can(session, 'companies.read')) redirect('/');
  return <CompanySettings canUpdate={can(session, 'companies.update')} />;
}
