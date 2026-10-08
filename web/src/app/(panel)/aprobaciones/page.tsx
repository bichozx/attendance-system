import { ApprovalsView } from '@/components/approvals/approvals-view';
import { can, getSession } from '@/lib/server/session';

export const metadata = { title: 'Aprobaciones' };

export default async function ApprovalsPage() {
  const session = await getSession();
  return (
    <ApprovalsView
      can={{
        attendance: can(session, 'attendance.adjust'),
        incidents: can(session, 'incidents.approve'),
        shiftChanges: can(session, 'shift_changes.approve'),
      }}
    />
  );
}
