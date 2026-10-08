import { redirect } from 'next/navigation';

import { EmployeesList } from '@/components/employees/employees-list';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Empleados' };

export default async function EmployeesPage() {
  const session = await getSession();
  if (!can(session, 'employees.read')) redirect('/');
  return <EmployeesList canManage={can(session, 'employees.manage')} />;
}
