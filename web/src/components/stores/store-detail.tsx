'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Badge, Button, Dialog, Field, Input, Notice, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { api, ApiError, call, errorMessage, type Schemas } from '@/lib/api/client';
import { mapsLink } from '@/lib/geo';
import { CoordinatesField } from './coordinates-field';
import { GeofenceDiagram, type TestedPoint } from './geofence-diagram';

type Store = Schemas['StoreDetailResponseDto'];
type Geofence = Schemas['GeofenceResponseDto'];

const GEOFENCE_ERRORS: Record<string, string> = {
  LAST_ACTIVE_GEOFENCE: 'Es la única geocerca activa: sin ella nadie podría marcar aquí. Crea otra antes de desactivarla.',
  GEOFENCE_IN_USE: 'Tiene marcaciones registradas, así que no se puede eliminar. Desactívala en su lugar.',
  GEOFENCE_TOO_FAR: 'El centro está a más de 2 km del establecimiento. Revisa las coordenadas.',
};
const geofenceError = (e: unknown) => (e instanceof ApiError && GEOFENCE_ERRORS[e.code]) || errorMessage(e);

export function StoreDetail({ id, canManage }: { id: string; canManage: boolean }) {
  const queryClient = useQueryClient();
  const store = useQuery({ queryKey: ['store', id], queryFn: () => call(api.GET('/stores/{id}', { params: { path: { id } } })) });
  const [tested, setTested] = useState<TestedPoint | null>(null);
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['store', id] });
    void queryClient.invalidateQueries({ queryKey: ['stores'] });
  };

  if (store.isPending) return <Spinner />;
  if (store.error) return <Notice tone="error" title="No se encontró el establecimiento">{errorMessage(store.error)}</Notice>;
  const s = store.data;

  return (
    <>
      <Link href="/establecimientos" className="text-sm text-muted underline-offset-4 hover:underline">
        Establecimientos
      </Link>
      <header className="mt-1 mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] leading-tight font-bold">{s.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-muted">
            {s.isActive ? <Badge tone="working">Activo</Badge> : <Badge tone="done">Inactivo</Badge>}
            {s.code}
            {s.city ? ` · ${s.city}` : ''} ·{' '}
            <a className="underline underline-offset-4" href={mapsLink(s.latitude, s.longitude)} target="_blank" rel="noreferrer">
              Ver en el mapa
            </a>
          </p>
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-10">
          <GeofencesSection store={s} canManage={canManage} onChanged={refresh} />
          <LocationTest store={s} onResult={setTested} />
          {canManage ? <StoreDataForm key={s.updatedAt} store={s} onSaved={refresh} /> : null}
        </div>
        <aside className="xl:sticky xl:top-6 xl:self-start">
          <h2 className="mb-3 text-lg font-bold">Vista desde arriba</h2>
          <GeofenceDiagram store={{ lat: s.latitude, lng: s.longitude }} geofences={s.geofences} point={tested} />
        </aside>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Geocercas
// ---------------------------------------------------------------------------

function GeofencesSection({ store, canManage, onChanged }: { store: Store; canManage: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState<Geofence | 'new' | null>(null);
  const toggle = useMutation({
    mutationFn: (g: Geofence) =>
      call(api.PATCH('/stores/{id}/geofences/{geofenceId}', { params: { path: { id: store.id, geofenceId: g.id } }, body: { isActive: !g.isActive } })),
    onSuccess: (g) => {
      toast(g.isActive ? `${g.name} activada` : `${g.name} desactivada`);
      onChanged();
    },
    onError: (e) => toast(geofenceError(e), 'error'),
  });
  const active = store.geofences.filter((g) => g.isActive).length;

  return (
    <section aria-labelledby="geocercas">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 id="geocercas" className="text-lg font-bold">
          Geocercas
        </h2>
        {canManage ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing('new')}>
            Nueva geocerca
          </Button>
        ) : null}
      </div>
      {active === 0 ? (
        <div className="mb-3">
          <Notice tone="error" title="Nadie puede marcar aquí">
            No hay geocercas activas.
          </Notice>
        </div>
      ) : null}
      <ul className="divide-y divide-line rounded-ui border border-line bg-surface">
        {store.geofences.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
            <div>
              <p className="font-semibold">
                {g.name} {g.isActive ? null : <Badge tone="done">Inactiva</Badge>}
              </p>
              <p className="text-[15px] text-muted">
                Radio de {g.radiusMeters} m · acepta GPS con margen de hasta {g.maxAccuracyMeters} m
              </p>
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(g)}>
                  Editar
                </Button>
                <Button size="sm" variant="quiet" loading={toggle.isPending && toggle.variables?.id === g.id} onClick={() => toggle.mutate(g)}>
                  {g.isActive ? 'Desactivar' : 'Activar'}
                </Button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Nueva geocerca' : 'Editar geocerca'}>
        {editing ? (
          <GeofenceForm
            store={store}
            geofence={editing === 'new' ? null : editing}
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
          />
        ) : null}
      </Dialog>
    </section>
  );
}

function GeofenceForm({ store, geofence, onDone }: { store: Store; geofence: Geofence | null; onDone: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(geofence?.name ?? 'Entrada principal');
  const [radius, setRadius] = useState(geofence?.radiusMeters ?? 100);
  const [accuracy, setAccuracy] = useState(geofence?.maxAccuracyMeters ?? 50);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    geofence ? { lat: geofence.centerLatitude, lng: geofence.centerLongitude } : { lat: store.latitude, lng: store.longitude },
  );
  const save = useMutation({
    mutationFn: () => {
      const body = { name, radiusMeters: radius, maxAccuracyMeters: accuracy, centerLatitude: center!.lat, centerLongitude: center!.lng };
      return geofence
        ? call(api.PATCH('/stores/{id}/geofences/{geofenceId}', { params: { path: { id: store.id, geofenceId: geofence.id } }, body }))
        : call(api.POST('/stores/{id}/geofences', { params: { path: { id: store.id } }, body }));
    },
    onSuccess: (g) => {
      toast(geofence ? `${g.name} actualizada` : `${g.name} creada`);
      onDone();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (center) save.mutate();
      }}>
      {save.error ? <Notice tone="error" title={geofenceError(save.error)} /> : null}
      <Field label="Nombre">
        <Input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <CoordinatesField label="Centro" value={center} onChange={setCenter} required />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Radio (metros)" hint="Entre 20 y 2.000.">
          <Input type="number" min={20} max={2000} required value={radius} onChange={(e) => setRadius(Number(e.target.value))} />
        </Field>
        <Field label="Margen de GPS aceptado (m)" hint="Lecturas menos precisas se rechazan.">
          <Input type="number" min={5} max={500} required value={accuracy} onChange={(e) => setAccuracy(Number(e.target.value))} />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" loading={save.isPending} disabled={!center}>
          {geofence ? 'Guardar geocerca' : 'Crear geocerca'}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Probar una ubicación (calibración)
// ---------------------------------------------------------------------------

const REJECTION: Record<string, string> = {
  OUTSIDE_GEOFENCE: 'Fuera de la geocerca',
  LOW_GPS_ACCURACY: 'GPS demasiado impreciso',
  NO_ACTIVE_GEOFENCE: 'No hay geocercas activas',
};

function LocationTest({ store, onResult }: { store: Store; onResult: (p: TestedPoint | null) => void }) {
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState(10);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const check = useMutation({
    mutationFn: (p: { lat: number; lng: number; accuracy: number }) =>
      call(api.POST('/stores/{id}/location-check', { params: { path: { id: store.id } }, body: { latitude: p.lat, longitude: p.lng, accuracyMeters: p.accuracy } })),
    onSuccess: (r, p) => onResult({ lat: p.lat, lng: p.lng, accuracyMeters: p.accuracy, accepted: r.accepted }),
  });

  function locateMe() {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError('Este navegador no comparte la ubicación.');
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.max(1, Math.round(pos.coords.accuracy)) };
        setPoint(p);
        setAccuracy(p.accuracy);
        check.mutate(p);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED ? 'El navegador no dio permiso para usar la ubicación.' : 'No se pudo obtener la ubicación.');
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  const r = check.data;
  return (
    <section aria-labelledby="probar">
      <h2 id="probar" className="mb-1 text-lg font-bold">
        Probar una ubicación
      </h2>
      <p className="mb-3 max-w-prose text-muted">
        Comprueba si alguien en un punto podría marcar, sin registrar nada. Lo ideal es hacerlo desde el lugar con un celular.
      </p>
      <form
        className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (point) check.mutate({ ...point, accuracy });
        }}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
          <CoordinatesField label="Punto a probar" value={point} onChange={setPoint} />
          <Field label="Margen del GPS (m)">
            <Input type="number" min={1} max={5000} value={accuracy} onChange={(e) => setAccuracy(Number(e.target.value))} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!point} loading={check.isPending && !locating}>
            Probar
          </Button>
          <Button type="button" variant="secondary" loading={locating} onClick={locateMe}>
            Usar mi ubicación actual
          </Button>
        </div>
        {geoError ? <Notice tone="warn" title={geoError} /> : null}
        {check.error ? <Notice tone="error" title={errorMessage(check.error)} /> : null}
        {r ? (
          r.accepted ? (
            <Notice tone="ok" title="Podría marcar desde aquí">
              A {Math.round(r.distanceMeters ?? 0)} m del centro (radio de {r.radiusMeters} m).
            </Notice>
          ) : (
            <Notice tone="error" title={REJECTION[r.rejection ?? ''] ?? 'No podría marcar desde aquí'}>
              {r.rejection === 'OUTSIDE_GEOFENCE' && r.distanceMeters !== null && r.radiusMeters !== null
                ? `Está a ${Math.round(r.distanceMeters)} m del centro; el radio es de ${r.radiusMeters} m. Le faltan ${Math.ceil(r.distanceMeters - r.radiusMeters)} m.`
                : r.rejection === 'LOW_GPS_ACCURACY'
                  ? `El GPS tiene un margen de ${r.accuracyMeters} m, más de lo que acepta la geocerca. Afuera o cerca de una ventana el GPS mejora.`
                  : 'Activa o crea una geocerca.'}
            </Notice>
          )
        ) : null}
      </form>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Datos del establecimiento
// ---------------------------------------------------------------------------

function StoreDataForm({ store, onSaved }: { store: Store; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address ?? '');
  const [city, setCity] = useState(store.city ?? '');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>({ lat: store.latitude, lng: store.longitude });
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const save = useMutation({
    mutationFn: (extra: { isActive?: boolean } = {}) =>
      call(
        api.PATCH('/stores/{id}', {
          params: { path: { id: store.id } },
          body: { name, address: address || null, city: city || null, latitude: coords!.lat, longitude: coords!.lng, ...extra },
        }),
      ),
    onSuccess: (_s, extra) => {
      toast(extra?.isActive === false ? 'Establecimiento desactivado' : extra?.isActive ? 'Establecimiento activado' : 'Cambios guardados');
      setConfirmDeactivate(false);
      onSaved();
    },
  });
  return (
    <section aria-labelledby="datos">
      <h2 id="datos" className="mb-3 text-lg font-bold">
        Datos
      </h2>
      <form
        className="flex flex-col gap-4 rounded-ui border border-line bg-surface p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (coords) save.mutate({});
        }}>
        {save.error ? <Notice tone="error" title={errorMessage(save.error)} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <Input required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Ciudad">
            <Input maxLength={80} value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label="Dirección">
            <Input maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
          </Field>
          <CoordinatesField label="Ubicación de la sede" value={coords} onChange={setCoords} required />
        </div>
        <div className="flex flex-wrap justify-between gap-2">
          <Button type="submit" loading={save.isPending && !confirmDeactivate} disabled={!coords}>
            Guardar cambios
          </Button>
          {store.isActive ? (
            <Button type="button" variant="quiet" onClick={() => setConfirmDeactivate(true)}>
              Desactivar establecimiento
            </Button>
          ) : (
            <Button type="button" variant="secondary" onClick={() => save.mutate({ isActive: true })}>
              Activar establecimiento
            </Button>
          )}
        </div>
      </form>
      <Dialog open={confirmDeactivate} onClose={() => setConfirmDeactivate(false)} title="Desactivar establecimiento">
        <div className="flex flex-col gap-4">
          <p>
            Nadie podrá marcar en <strong>{store.name}</strong> ni se le podrán programar turnos nuevos. Su historial se conserva y puedes
            activarlo de nuevo cuando quieras.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirmDeactivate(false)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={save.isPending} onClick={() => save.mutate({ isActive: false })}>
              Desactivar
            </Button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
