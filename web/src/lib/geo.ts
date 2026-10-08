/** Geometría para el diagrama de geocercas (mismas fórmulas que usa el backend). */

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Distancia en metros entre dos coordenadas (Haversine). */
export function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Posición en metros (x hacia el este, y hacia el norte) respecto a un origen.
 * A escala de una tienda (cientos de metros) el error de la proyección es despreciable.
 */
export function toMeters(origin: { lat: number; lng: number }, p: { lat: number; lng: number }) {
  return {
    x: rad(p.lng - origin.lng) * EARTH_RADIUS_M * Math.cos(rad(origin.lat)),
    y: rad(p.lat - origin.lat) * EARTH_RADIUS_M,
  };
}

/**
 * Lee coordenadas pegadas desde Google Maps u otra fuente:
 * "4.6097, -74.0817", "4.6097 -74.0817" o "4,6097; -74,0817".
 */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const cleaned = text.trim().replace(/[()°]/g, '');
  let parts = cleaned.split(/\s*;\s*|\s*,\s+|\s+/).filter(Boolean);
  if (parts.length !== 2) parts = cleaned.split(',').map((s) => s.trim());
  if (parts.length !== 2) return null;
  const [lat, lng] = parts.map((s) => Number(s.replace(',', '.')));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

export function mapsLink(lat: number, lng: number) {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
