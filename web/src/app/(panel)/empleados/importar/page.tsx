import { redirect } from 'next/navigation';

import { ImportWizard } from '@/components/employees/import-wizard';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Importar empleados' };

export default async function ImportPage() {
  const session = await getSession();
  if (!can(session, 'employees.manage')) redirect('/empleados');
  return <ImportWizard />;
}
