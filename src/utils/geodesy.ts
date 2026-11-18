import type { AreaUnit, GeoPoint } from '../types/geodesy';

const WGS84_A = 6378137.0;
const WGS84_E2 = 0.00669437999014;
const UTM_K0 = 0.9996;

/**
 * Converts WGS84 geographic coordinates (lat, lon) to UTM Zone 19N (Dominican Republic, EPSG:32619).
 */
export function latLonToUtm19N(lat: number, lon: number, elev = 0): GeoPoint {
  const zoneNumber = 19;
  const lonOrigin = (zoneNumber - 1) * 6 - 180 + 3; // -69 deg for Zone 19N

  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const lonOriginRad = (lonOrigin * Math.PI) / 180;

  const eccPrimeSquared = WGS84_E2 / (1 - WGS84_E2);
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(latRad) * Math.sin(latRad));
  const T = Math.tan(latRad) * Math.tan(latRad);
  const C = eccPrimeSquared * Math.cos(latRad) * Math.cos(latRad);
  const A = Math.cos(latRad) * (lonRad - lonOriginRad);

  const M =
    WGS84_A *
    ((1 - WGS84_E2 / 4 - (3 * WGS84_E2 * WGS84_E2) / 64 - (5 * Math.pow(WGS84_E2, 3)) / 256) * latRad -
      ((3 * WGS84_E2) / 8 + (3 * WGS84_E2 * WGS84_E2) / 32 + (45 * Math.pow(WGS84_E2, 3)) / 1024) *
        Math.sin(2 * latRad) +
      ((15 * WGS84_E2 * WGS84_E2) / 256 + (45 * Math.pow(WGS84_E2, 3)) / 1024) * Math.sin(4 * latRad) -
      ((35 * Math.pow(WGS84_E2, 3)) / 3072) * Math.sin(6 * latRad));

  const easting =
    UTM_K0 *
      N *
      (A +
        ((1 - T + C) * Math.pow(A, 3)) / 6 +
        ((5 - 18 * T + T * T + 72 * C - 58 * eccPrimeSquared) * Math.pow(A, 5)) / 120) +
    500000.0;

  let northing =
    UTM_K0 *
    (M +
      N *
        Math.tan(latRad) *
        ((A * A) / 2 +
          ((5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4)) / 24 +
          ((61 - 58 * T + T * T + 600 * C - 330 * eccPrimeSquared) * Math.pow(A, 6)) / 720));

  if (lat < 0) {
    northing += 10000000.0;
  }

  return {
    lat: Number(lat.toFixed(6)),
    lon: Number(lon.toFixed(6)),
    elev: Number(elev.toFixed(2)),
    easting: Number(easting.toFixed(2)),
    northing: Number(northing.toFixed(2)),
    zone: '19Q',
  };
}

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computePolygonAreaM2(points: GeoPoint[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].easting * points[j].northing;
    area -= points[j].easting * points[i].northing;
  }
  return Math.abs(area / 2);
}

export function computePerimeterM(points: GeoPoint[], closed: boolean): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineMeters(points[i].lat, points[i].lon, points[i + 1].lat, points[i + 1].lon);
  }
  if (closed && points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat !== last.lat || first.lon !== last.lon) {
      total += haversineMeters(last.lat, last.lon, first.lat, first.lon);
    }
  }
  return total;
}

export function computeCentroid(points: GeoPoint[]): GeoPoint {
  if (points.length === 0) {
    return latLonToUtm19N(18.4861, -69.9312, 14);
  }
  const sum = points.reduce(
    (acc, p) => ({
      lat: acc.lat + p.lat,
      lon: acc.lon + p.lon,
      elev: acc.elev + p.elev,
    }),
    { lat: 0, lon: 0, elev: 0 }
  );
  return latLonToUtm19N(sum.lat / points.length, sum.lon / points.length, sum.elev / points.length);
}

export const TAREA_IN_M2 = 628.86;

export function formatArea(areaM2: number, unit: AreaUnit): string {
  if (unit === 'ha') {
    return `${(areaM2 / 10000).toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ha`;
  }
  if (unit === 'tareas') {
    return `${(areaM2 / TAREA_IN_M2).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Ta`;
  }
  return `${areaM2.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

export function formatPerimeter(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`;
  }
  return `${meters.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} m`;
}

export function formatRD(amount: number): string {
  return `RD$ ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatSantoDomingoAST(dateInput: Date | string = new Date()): string {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (Number.isNaN(date.getTime())) {
    return '17/11/2026 00:00:00 AST';
  }
  const formatter = new Intl.DateTimeFormat('es-DO', {
    timeZone: 'America/Santo_Domingo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  return `${formatter.format(date).replace(',', '')} AST`;
}
