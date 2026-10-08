'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Badge, Button, Dialog, Empty, Field, Input, Notice, PageHeader, Spinner, Table, Td, Th } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, call, errorMessage } from '@/lib/api/client';
import { CoordinatesField } from './coordinates-field';

export function StoresList({ canManage }: { canManage: boolean }) {
  const [creating, setCreating] = useState(false);
  const stores = useQuery({
    queryKey: ['stores', 'all'],
    queryFn: () => call(api.GET('/stores', { params: { query: { pageSize: 100 } } })),
  });
  const items = stores.data?.items ?? [];
  const withoutGeofence = items.filter((s) => s.isActive && s.activeGeofences === 0);

  return (
    <>
      <PageHeader
        title="Establecimientos"
        description="Las sedes donde se marca asistencia. Cada una necesita al menos una geocerca activa para que se pueda marcar ahí."
        actions={canManage ? <Button onClick={() => setCreating(true)}>Nuevo establecimiento</Button> : null}
      />
      {stores.isPending ? <Spinner /> : null}
      {stores.error ? <Notice tone="error" title="No se pudo cargar la lista">{errorMessage(stores.error)}</Notice> : null}
      {withoutGeofence.length ? (
        <div className="mb-4">
          <Notice tone="warn" title={`${withoutGeofence.map((s) => s.name).join(', ')}: nadie puede marcar ahí`}>
            No tiene geocercas activas. Ábrelo y agrega una.
          </Notice>
        </div>
      ) : null}
      {stores.data && items.length === 0 ? <Empty title="Aún no hay establecimientos">Crea el primero para poder programar turnos y marcar asistencia.</Empty> : null}
      {items.length ? (
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Código</Th>
              <Th>Ciudad</Th>
              <Th>Geocercas activas</Th>
              <Th>Estado</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id} className="hover:bg-paper/50">
                <Td>
                  <Link href={`/establecimientos/${s.id}`} className="font-semibold underline-offset-4 hover:underline">
                    {s.name}
                  </Link>
                  {s.address ? <p className="text-sm text-muted">{s.address}</p> : null}
                </Td>
                <Td className="whitespace-nowrap">{s.code}</Td>
                <Td>{s.city ?? '—'}</Td>
                <Td>{s.activeGeofences === 0 && s.isActive ? <Badge tone="missing">Ninguna</Badge> : s.activeGeofences}</Td>
                <Td>{s.isActive ? <Badge tone="working">Activo</Badge> : <Badge tone="done">Inactivo</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : null}
      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo establecimiento">
        <CreateStoreForm onDone={() => setCreating(false)} />
      </Dialog>
    </>
  );
}

function CreateStoreForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState(100);
  const create = useMutation({
    mutationFn: () =>
      call(
        api.POST('/stores', {
          body: {
            code,
            name,
            address: address || null,
            city: city || null,
            latitude: coords!.lat,
            longitude: coords!.lng,
            geofenceRadiusMeters: radius,
          },
        }),
      ),
    onSuccess: (s) => {
      toast(`${s.name} quedó creado con una geocerca de ${radius} m`);
      void queryClient.invalidateQueries({ queryKey: ['stores'] });
      onDone();
      router.push(`/establecimientos/${s.id}`);
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (coords) create.mutate();
      }}>
      {create.error ? <Notice tone="error" title={errorMessage(create.error)} /> : null}
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label="Nombre">
          <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tienda Norte" />
        </Field>
        <Field label="Código">
          <Input required maxLength={20} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="NORTE" />
        </Field>
        <Field label="Dirección">
          <Input maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field label="Ciudad">
          <Input maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
        </Field>
      </div>
      <CoordinatesField value={coords} onChange={setCoords} required />
      <Field label="Radio de la geocerca (metros)" hint="Quien esté dentro de este radio podrá marcar. Ajústalo después con una prueba en sitio.">
        <Input type="number" min={20} max={2000} required value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={create.isPending} disabled={!coords}>
          Crear establecimiento
        </Button>
      </div>
    </form>
  );
}
