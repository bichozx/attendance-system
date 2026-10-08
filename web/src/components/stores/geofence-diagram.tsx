'use client';

import type { Schemas } from '@/lib/api/client';
import { toMeters } from '@/lib/geo';

type Geofence = Schemas['GeofenceResponseDto'];

export interface TestedPoint {
  lat: number;
  lng: number;
  accuracyMeters: number;
  accepted: boolean;
}

const SIZE = 320;
const PAD = 24;

/** Escala "redonda" para la barra (10, 20, 50, 100, 200, 500 m...). */
function niceScale(metersAcross: number) {
  const target = metersAcross / 4;
  const pow = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * pow).reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best));
}

/**
 * Las geocercas vistas desde arriba, a escala. Sirve para calibrar: muestra el radio de cada
 * geocerca, el punto probado con su margen de error del GPS y la distancia al borde.
 */
export function GeofenceDiagram({ store, geofences, point }: { store: { lat: number; lng: number }; geofences: Geofence[]; point: TestedPoint | null }) {
  const circles = geofences.map((g) => ({ ...g, ...toMeters(store, { lat: g.centerLatitude, lng: g.centerLongitude }) }));
  const p = point ? { ...toMeters(store, point), r: point.accuracyMeters } : null;

  // Encuadre: todo lo dibujado cabe con margen
  const extents = [
    ...circles.map((c) => Math.max(Math.abs(c.x), Math.abs(c.y)) + c.radiusMeters),
    p ? Math.max(Math.abs(p.x), Math.abs(p.y)) + Math.min(p.r, 400) : 0,
    50,
  ];
  const half = Math.max(...extents) * 1.12;
  const k = (SIZE / 2 - PAD) / half; // píxeles por metro
  const sx = (x: number) => SIZE / 2 + x * k;
  const sy = (y: number) => SIZE / 2 - y * k; // el norte arriba
  const scale = niceScale(half * 2);

  const nearest = p
    ? circles
        .filter((c) => c.isActive)
        .map((c) => ({ c, d: Math.hypot(p.x - c.x, p.y - c.y) }))
        .sort((a, b) => a.d - b.d)[0]
    : null;

  return (
    <figure className="rounded-ui border border-line bg-surface p-3">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="mx-auto block w-full max-w-[320px]" role="img" aria-label="Diagrama de las geocercas">
        <defs>
          <pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <path d="M16 0H0V16" fill="none" stroke="var(--color-line)" strokeWidth="0.6" />
          </pattern>
        </defs>
        <rect width={SIZE} height={SIZE} fill="url(#grid)" />
        <text x={SIZE - 10} y={18} textAnchor="end" fontSize="11" fill="var(--color-muted)">
          N ↑
        </text>

        {circles.map((c) => (
          <g key={c.id}>
            <circle
              cx={sx(c.x)}
              cy={sy(c.y)}
              r={c.radiusMeters * k}
              fill={c.isActive ? 'color-mix(in oklab, var(--color-working) 12%, transparent)' : 'none'}
              stroke={c.isActive ? 'var(--color-working)' : 'var(--color-upcoming)'}
              strokeWidth="1.5"
              strokeDasharray={c.isActive ? undefined : '4 4'}
            />
            <text x={sx(c.x)} y={sy(c.y) - c.radiusMeters * k - 5} textAnchor="middle" fontSize="11" fill="var(--color-muted)">
              {c.name} · {c.radiusMeters} m
            </text>
          </g>
        ))}

        {/* La sede */}
        <rect x={SIZE / 2 - 5} y={SIZE / 2 - 5} width="10" height="10" fill="var(--color-ink)" transform={`rotate(45 ${SIZE / 2} ${SIZE / 2})`} />

        {p && nearest ? (
          <line x1={sx(nearest.c.x)} y1={sy(nearest.c.y)} x2={sx(p.x)} y2={sy(p.y)} stroke="var(--color-ink)" strokeWidth="1" strokeDasharray="2 3" />
        ) : null}
        {p ? (
          <g>
            <circle cx={sx(p.x)} cy={sy(p.y)} r={Math.max(4, p.r * k)} fill="color-mix(in oklab, var(--color-ink) 10%, transparent)" />
            <circle cx={sx(p.x)} cy={sy(p.y)} r="5" fill={point!.accepted ? 'var(--color-working)' : 'var(--color-missing)'} stroke="white" strokeWidth="2" />
          </g>
        ) : null}

        {/* Escala */}
        <g transform={`translate(${PAD}, ${SIZE - 14})`}>
          <line x1="0" x2={scale * k} y1="0" y2="0" stroke="var(--color-ink)" strokeWidth="2" />
          <line x1="0" x2="0" y1="-4" y2="4" stroke="var(--color-ink)" strokeWidth="2" />
          <line x1={scale * k} x2={scale * k} y1="-4" y2="4" stroke="var(--color-ink)" strokeWidth="2" />
          <text x={scale * k + 6} y="4" fontSize="11" fill="var(--color-ink)">
            {scale >= 1000 ? `${scale / 1000} km` : `${scale} m`}
          </text>
        </g>
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
        <span>◆ La sede</span>
        <span>
          <span className="text-working">◯</span> Geocerca activa
        </span>
        {p ? <span>● Punto probado (sombra = margen del GPS)</span> : null}
      </figcaption>
    </figure>
  );
}
