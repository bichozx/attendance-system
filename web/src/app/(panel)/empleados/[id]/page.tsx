import { redirect } from 'next/navigation';

import { EmployeeDetail } from '@/components/employees/employee-detail';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Ficha del empleado' };

export default async function EmployeePage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const session = await getSession();
  if (!can(session, 'employees.read')) redirect('/');
  return (
    <EmployeeDetail
      id={id}
      can={{
        manage: can(session, 'employees.manage'),
        access: can(session, 'users.manage'),
        readContracts: can(session, 'contracts.read'),
        manageContracts: can(session, 'contracts.manage'),
      }}
    />
  );
}
