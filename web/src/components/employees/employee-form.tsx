'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { Field, Input, Select } from '@/components/ui';
import { api, call, type Schemas } from '@/lib/api/client';
import { DOCUMENT_TYPES } from '@/lib/labels';
import { localToday } from '@/lib/time';
import { PositionSelect } from './position-select';

export type EmployeeDraft = Schemas['CreateEmployeeDto'];

/** Campos de un empleado (alta y edición). */
export function EmployeeFields({
  value,
  onChange,
  isNew,
  currentPosition,
  canCreatePosition = false,
}: {
  value: EmployeeDraft;
  onChange: (v: EmployeeDraft) => void;
  isNew: boolean;
  /** Cargo guardado del empleado: se muestra aunque esté desactivado. */
  currentPosition?: { id: string; name: string } | null;
  canCreatePosition?: boolean;
}) {
  const set = <K extends keyof EmployeeDraft>(k: K, v: EmployeeDraft[K]) => onChange({ ...value, [k]: v });
  const stores = useQuery({ queryKey: ['stores', 'all'], queryFn: () => call(api.GET('/stores', { params: { query: { pageSize: 100 } } })) });

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Nombres">
        <Input required maxLength={80} value={value.firstName} onChange={(e) => set('firstName', e.target.value)} />
      </Field>
      <Field label="Apellidos">
        <Input required maxLength={80} value={value.lastName} onChange={(e) => set('lastName', e.target.value)} />
      </Field>
      <Field label="Tipo de documento">
        <Select value={value.documentType} onChange={(e) => set('documentType', e.target.value as EmployeeDraft['documentType'])}>
          {DOCUMENT_TYPES.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Número de documento">
        <Input required minLength={3} maxLength={20} value={value.documentNumber} onChange={(e) => set('documentNumber', e.target.value.toUpperCase())} />
      </Field>
      <Field label="Código interno" hint={isNew ? 'Único en la empresa. Ej: EMP-120' : 'Único en la empresa.'}>
        <Input required maxLength={30} value={value.code} onChange={(e) => set('code', e.target.value.toUpperCase())} />
      </Field>
      <Field label="Fecha de ingreso">
        <Input type="date" required value={value.hireDate} onChange={(e) => set('hireDate', e.target.value)} />
      </Field>
      <Field label="Fecha de nacimiento">
        <Input type="date" value={value.birthDate ?? ''} onChange={(e) => set('birthDate', e.target.value || null)} />
      </Field>
      <Field label="Correo" hint="Necesario para darle acceso a la app.">
        <Input type="email" value={value.email ?? ''} onChange={(e) => set('email', e.target.value || null)} />
      </Field>
      <Field label="Celular">
        <Input type="tel" value={value.phone ?? ''} onChange={(e) => set('phone', e.target.value || null)} />
      </Field>
      <PositionSelect value={value.positionId ?? null} onChange={(id) => set('positionId', id)} current={currentPosition} canCreate={canCreatePosition} />
      <Field label="Sede principal">
        <Select value={value.defaultStoreId ?? ''} onChange={(e) => set('defaultStoreId', e.target.value || null)}>
          <option value="">Sin sede</option>
          {(stores.data?.items ?? []).map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
    </div>
  );
}

export function emptyDraft(): EmployeeDraft {
  return {
    code: '',
    documentType: 'CC',
    documentNumber: '',
    firstName: '',
    lastName: '',
    email: null,
    phone: null,
    hireDate: localToday(),
    birthDate: null,
    positionId: null,
    defaultStoreId: null,
  };
}

export function useDraft(initial: EmployeeDraft) {
  return useState<EmployeeDraft>(initial);
}
