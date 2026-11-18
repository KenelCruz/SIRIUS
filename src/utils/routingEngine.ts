import { haversineMeters } from './geodesy';

export interface ServiceOption {
  id: string;
  name: string;
  subtitle: string;
  basePriceRD: number;
  perKmCorridorRD?: number;
}

export const SERVICE_CATALOG: ServiceOption[] = [
  {
    id: 'rtk',
    name: 'RTK',
    subtitle: 'Topografía GNSS',
    basePriceRD: 20000,
  },
  {
    id: 'drone_lidar',
    name: 'Dron & LiDAR',
    subtitle: 'Fotogrametría MDT',
    basePriceRD: 35000,
  },
  {
    id: 'deslinde',
    name: 'Deslinde',
    subtitle: 'Catastro y Mensuras',
    basePriceRD: 75000,
  },
  {
    id: 'ingenieria',
    name: 'Ingeniería',
    subtitle: 'Vial y Nivelación',
    basePriceRD: 30000,
    perKmCorridorRD: 10000,
  },
  {
    id: 'arquitectura',
    name: 'Arquitectura',
    subtitle: 'Diseño BIM / Planos',
    basePriceRD: 20000,
  },
];

export type TerrainType = 'Llano' | 'Ondulado' | 'Montañoso';

export const TERRAIN_MULTIPLIER: Record<TerrainType, number> = {
  Llano: 1.0,
  Ondulado: 1.2,
  Montañoso: 1.45,
};

export interface VehiclePreset {
  id: string;
  label: string;
  fuelName: string;
  fuelPricePerGalRD: number;
  kmPerGal: number;
  maintenancePerKmRD: number;
}

export const VEHICLE_CATALOG: VehiclePreset[] = [
  {
    id: 'hilux_diesel',
    label: 'Camioneta 4x4 Doble Cabina · Diésel Óptimo',
    fuelName: 'Diésel Óptimo',
    fuelPricePerGalRD: 239.1,
    kmPerGal: 32,
    maintenancePerKmRD: 15,
  },
  {
    id: 'pickup_regular',
    label: 'Pickup 4x2 Ligera · Gasolina Regular',
    fuelName: 'Gasolina Regular',
    fuelPricePerGalRD: 272.5,
    kmPerGal: 36,
    maintenancePerKmRD: 12,
  },
  {
    id: 'suv_premium',
    label: 'SUV Brigada Técnica · Gasolina Premium',
    fuelName: 'Gasolina Premium',
    fuelPricePerGalRD: 290.1,
    kmPerGal: 34,
    maintenancePerKmRD: 14,
  },
];

export const SANTO_DOMINGO_ORIGIN = {
  lat: 18.4861,
  lon: -69.9312,
  label: 'Base Santo Domingo (Av. 27 de Febrero)',
};

export interface RouteAlternative {
  id: 'economica' | 'rapida';
  badge: string;
  name: string;
  corridorDesc: string;
  distanceOneWayKm: number;
  durationMin: number;
  oneWayTollRD: number;
  tollNote: string;
  coordinates: [number, number][]; // [lat, lon] pairs for Leaflet
  source: 'osrm' | 'offline';
}

function estimateCorridorTolls(
  destLat: number,
  destLon: number,
  distanceKm: number,
  mode: 'economica' | 'rapida'
): { oneWayTollRD: number; tollNote: string; corridorDesc: string } {
  const isEast = destLon > -69.75;
  const isNorth = destLat > 18.72;
  const isSouthWest = destLon < -70.05 && destLat < 18.65;

  if (mode === 'economica') {
    if (distanceKm <= 28) {
      return {
        oneWayTollRD: 0,
        tollNote: 'Sin peajes',
        corridorDesc: 'Av. 27 de Febrero / Vía Urbana Directa (sin peajes)',
      };
    }
    if (isEast) {
      return {
        oneWayTollRD: 100,
        tollNote: '1 estación RD Vial (RD$ 100/vía)',
        corridorDesc: 'Carretera Mella / Autovía del Este (tramo libre)',
      };
    }
    if (isNorth) {
      return {
        oneWayTollRD: 100,
        tollNote: 'Peaje Duarte (RD$ 100/vía)',
        corridorDesc: 'Autopista Duarte · Tramo Nacional',
      };
    }
    return {
      oneWayTollRD: 100,
      tollNote: 'Peaje 6 de Noviembre (RD$ 100/vía)',
      corridorDesc: 'Carretera Sánchez / Vía Regional',
    };
  }

  // Express / Ring Road route
  if (distanceKm <= 28) {
    return {
      oneWayTollRD: 150,
      tollNote: 'Peaje Circunvalación (RD$ 150/vía)',
      corridorDesc: 'Circunvalación Santo Domingo (tránsito fluido)',
    };
  }
  if (isEast) {
    const stations = destLon > -68.8 ? 4 : 2;
    return {
      oneWayTollRD: stations * 100,
      tollNote: `${stations} peajes Autovía / Coral (RD$ ${stations * 100}/vía)`,
      corridorDesc: 'Expreso Las Américas · Autovía del Este / Coral',
    };
  }
  if (isNorth) {
    return {
      oneWayTollRD: 250,
      tollNote: 'Circunvalación + Peaje Duarte (RD$ 250/vía)',
      corridorDesc: 'Circunvalación Norte · Autopista Duarte Expresa',
    };
  }
  if (isSouthWest) {
    return {
      oneWayTollRD: 250,
      tollNote: 'Circunvalación + 6 de Noviembre (RD$ 250/vía)',
      corridorDesc: 'Circunvalación · Autopista 6 de Noviembre',
    };
  }
  return {
    oneWayTollRD: 200,
    tollNote: 'Peajes expresos (RD$ 200/vía)',
    corridorDesc: 'Corredor Expreso RD Vial',
  };
}

function buildOfflinePolyline(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  bendFactor: number
): [number, number][] {
  const midLat = (lat1 + lat2) / 2 + (lon2 - lon1) * bendFactor;
  const midLon = (lon1 + lon2) / 2 - (lat2 - lat1) * bendFactor;
  return [
    [lat1, lon1],
    [(lat1 + midLat) / 2, (lon1 + midLon) / 2],
    [midLat, midLon],
    [(midLat + lat2) / 2, (midLon + lon2) / 2],
    [lat2, lon2],
  ];
}

export async function fetchOptimalRoutesOSM(
  destLat: number,
  destLon: number
): Promise<RouteAlternative[]> {
  const straightKm = Math.max(
    4,
    haversineMeters(SANTO_DOMINGO_ORIGIN.lat, SANTO_DOMINGO_ORIGIN.lon, destLat, destLon) / 1000
  );

  // Offline / fallback routes
  const fallbackDirectKm = Number((straightKm * 1.24).toFixed(1));
  const fallbackFastKm = Number((straightKm * 1.38 + (straightKm < 25 ? 8 : 2)).toFixed(1));

  const econToll = estimateCorridorTolls(destLat, destLon, fallbackDirectKm, 'economica');
  const fastToll = estimateCorridorTolls(destLat, destLon, fallbackFastKm, 'rapida');

  const fallbackRoutes: RouteAlternative[] = [
    {
      id: 'economica',
      badge: 'Menor peaje / Libre',
      name: fallbackDirectKm <= 28 ? 'Corredor Urbano Directo' : 'Ruta Nacional / Menor Peaje',
      corridorDesc: econToll.corridorDesc,
      distanceOneWayKm: fallbackDirectKm,
      durationMin: Math.round(fallbackDirectKm * 1.55),
      oneWayTollRD: econToll.oneWayTollRD,
      tollNote: econToll.tollNote,
      coordinates: buildOfflinePolyline(
        SANTO_DOMINGO_ORIGIN.lat,
        SANTO_DOMINGO_ORIGIN.lon,
        destLat,
        destLon,
        0.04
      ),
      source: 'offline',
    },
    {
      id: 'rapida',
      badge: 'Ruta más rápida',
      name: fallbackFastKm <= 35 ? 'Circunvalación Santo Domingo' : 'Autopista Expresa RD Vial',
      corridorDesc: fastToll.corridorDesc,
      distanceOneWayKm: fallbackFastKm,
      durationMin: Math.round(fallbackFastKm * 0.95),
      oneWayTollRD: fastToll.oneWayTollRD,
      tollNote: fastToll.tollNote,
      coordinates: buildOfflinePolyline(
        SANTO_DOMINGO_ORIGIN.lat,
        SANTO_DOMINGO_ORIGIN.lon,
        destLat,
        destLon,
        -0.09
      ),
      source: 'offline',
    },
  ];

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallbackRoutes;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const url = `https://router.project-osrm.org/route/v1/driving/${SANTO_DOMINGO_ORIGIN.lon},${SANTO_DOMINGO_ORIGIN.lat};${destLon},${destLat}?alternatives=true&overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) return fallbackRoutes;
    const data = await res.json();
    const routes = Array.isArray(data?.routes) ? data.routes : [];
    if (routes.length === 0) return fallbackRoutes;

    const r0 = routes[0];
    const r1 = routes[1] ?? null;

    const d0Km = Number((r0.distance / 1000).toFixed(1));
    const t0Min = Math.max(8, Math.round(r0.duration / 60));
    const coords0: [number, number][] = (r0.geometry?.coordinates || []).map(
      ([lon, lat]: [number, number]) => [lat, lon]
    );

    // If OSRM returns a second alternative, use it; otherwise derive ring-road comparison
    const d1Km = r1 ? Number((r1.distance / 1000).toFixed(1)) : Number((d0Km * 1.15 + 4).toFixed(1));
    const t1Min = r1 ? Math.max(8, Math.round(r1.duration / 60)) : Math.max(8, Math.round(t0Min * 0.85));
    const coords1: [number, number][] = r1
      ? (r1.geometry?.coordinates || []).map(([lon, lat]: [number, number]) => [lat, lon])
      : buildOfflinePolyline(
          SANTO_DOMINGO_ORIGIN.lat,
          SANTO_DOMINGO_ORIGIN.lon,
          destLat,
          destLon,
          -0.08
        );

    const toll0 = estimateCorridorTolls(destLat, destLon, d0Km, 'economica');
    const toll1 = estimateCorridorTolls(destLat, destLon, d1Km, 'rapida');

    return [
      {
        id: 'economica',
        badge: 'Menor peaje / Libre',
        name: d0Km <= 28 ? 'Corredor Urbano Directo' : 'Ruta OSRM Menor Peaje',
        corridorDesc: toll0.corridorDesc,
        distanceOneWayKm: d0Km,
        durationMin: t0Min,
        oneWayTollRD: toll0.oneWayTollRD,
        tollNote: toll0.tollNote,
        coordinates: coords0.length >= 2 ? coords0 : fallbackRoutes[0].coordinates,
        source: 'osrm',
      },
      {
        id: 'rapida',
        badge: 'Ruta más rápida',
        name: d1Km <= 35 ? 'Circunvalación Santo Domingo' : 'Corredor Expreso OSRM',
        corridorDesc: toll1.corridorDesc,
        distanceOneWayKm: d1Km,
        durationMin: t1Min,
        oneWayTollRD: toll1.oneWayTollRD,
        tollNote: toll1.tollNote,
        coordinates: coords1.length >= 2 ? coords1 : fallbackRoutes[1].coordinates,
        source: 'osrm',
      },
    ];
  } catch {
    return fallbackRoutes;
  }
}

export interface ViaticosRouteBreakdown {
  roundTripKm: number;
  gallonsNeeded: number;
  fuelRD: number;
  tollsRD: number;
  perDiemRD: number;
  maintenanceRD: number;
  lodgingRD: number;
  totalViaticosRD: number;
  fieldDays: number;
}

export function computeRouteViaticos(params: {
  distanceOneWayKm: number;
  oneWayTollRD: number;
  includeTolls: boolean;
  includeLodging: boolean;
  fuelPricePerGalRD: number;
  kmPerGal: number;
  maintenancePerKmRD: number;
  areaM2: number;
  terrain: TerrainType;
  serviceCount: number;
}): ViaticosRouteBreakdown {
  const roundTripKm = Number((params.distanceOneWayKm * 2).toFixed(1));
  const safeKmPerGal = Math.max(5, params.kmPerGal);
  const gallonsNeeded = Number((roundTripKm / safeKmPerGal).toFixed(2));
  const fuelRD = Math.round(gallonsNeeded * params.fuelPricePerGalRD);
  const tollsRD = params.includeTolls ? Math.round(params.oneWayTollRD * 2) : 0;

  const hectares = params.areaM2 / 10000;
  const terrainFactor = TERRAIN_MULTIPLIER[params.terrain];
  const serviceComplexity = Math.max(0, params.serviceCount - 1) * 0.35;
  const fieldDays = Math.max(
    1,
    Math.min(7, Math.ceil((hectares / 18 + 0.5 + serviceComplexity) * terrainFactor))
  );

  // If short local distance (< 30km) and 1 day -> half/urban per-diem RD$ 1,200; full field day -> RD$ 2,200/day
  const perDiemRate = params.distanceOneWayKm < 28 && fieldDays === 1 ? 1200 : 2200;
  const perDiemRD = fieldDays * perDiemRate;
  const maintenanceRD = Math.round(roundTripKm * params.maintenancePerKmRD);
  const lodgingRD = params.includeLodging ? Math.max(1, fieldDays) * 4800 : 0;

  return {
    roundTripKm,
    gallonsNeeded,
    fuelRD,
    tollsRD,
    perDiemRD,
    maintenanceRD,
    lodgingRD,
    totalViaticosRD: fuelRD + tollsRD + perDiemRD + maintenanceRD + lodgingRD,
    fieldDays,
  };
}
