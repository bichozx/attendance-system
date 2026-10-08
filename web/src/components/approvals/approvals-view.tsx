'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/ui';
import { api, call } from '@/lib/api/client';
import { AttendanceInbox } from './attendance-inbox';
import { IncidentsInbox } from './incidents-inbox';
import { ShiftChangesInbox } from './shift-changes-inbox';

type Tab = 'attendance' | 'incidents' | 'shiftChanges';

function lastDays(days: number) {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  return { from: iso(new Date(now.getTime() - days * 86_400_000)), to: iso(new Date(now.getTime() + 86_400_000)) };
}

export function ApprovalsView({ can }: { can: Record<Tab, boolean> }) {
  // Conteos para las pestañas (las mismas consultas que usa cada bandeja)
  const attendance = useQuery({
    queryKey: ['approvals', 'attendance'],
    // Revisión pendiente de los últimos 60 días (lo anterior ya cerró nómina)
    queryFn: () => call(api.GET('/attendance', { params: { query: { needsReview: true, pageSize: 100, ...lastDays(60) } } })),
    enabled: can.attendance,
  });
  const incidents = useQuery({
    queryKey: ['approvals', 'incidents'],
    queryFn: () => call(api.GET('/incidents', { params: { query: { status: 'PENDING', pageSize: 100 } } })),
    enabled: can.incidents,
  });
  const changes = useQuery({
    queryKey: ['approvals', 'shift-changes'],
    queryFn: () => call(api.GET('/shift-changes', { params: { query: { stage: 'AWAITING_APPROVAL', pageSize: 100 } } })),
    enabled: can.shiftChanges,
  });

  const tabs = (
    [
      { id: 'incidents', label: 'Novedades', count: incidents.data?.total },
      { id: 'attendance', label: 'Marcaciones por revisar', count: attendance.data?.total },
      { id: 'shiftChanges', label: 'Cambios de turno', count: changes.data?.total },
    ] as const
  ).filter((t) => can[t.id]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.id ?? 'incidents');

  return (
    <>
      <PageHeader title="Aprobaciones" description="Lo que espera tu decisión. Cada respuesta le llega a la persona en la app." />
      {tabs.length === 0 ? <p className="text-muted">Tu rol no aprueba solicitudes.</p> : null}

      <div role="tablist" aria-label="Bandejas" className="mb-5 flex flex-wrap gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[15px] ${
              tab === t.id ? 'border-ink font-semibold' : 'border-transparent text-muted hover:text-ink'
            }`}>
            {t.label}
            {t.count ? <span className="rounded-full bg-warn px-2 text-[13px] font-bold text-white">{t.count}</span> : null}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'attendance' ? <AttendanceInbox query={attendance} /> : null}
        {tab === 'incidents' ? <IncidentsInbox query={incidents} /> : null}
        {tab === 'shiftChanges' ? <ShiftChangesInbox query={changes} /> : null}
      </div>
    </>
  );
}
