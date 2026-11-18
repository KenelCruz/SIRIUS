import { haversineMeters } from './geodesy';

interface ProvinceReference {
  province: string;
  dcPrefix: string;
  lat: number;
  lon: number;
}

// Reference centroids and cadastral district codes for Dominican Republic provinces
const DR_PROVINCES: ProvinceReference[] = [
  { province: 'Distrito Nacional', dcPrefix: 'DC-01', lat: 18.4861, lon: -69.9312 },
  { province: 'Santo Domingo', dcPrefix: 'DC-01', lat: 18.5122, lon: -69.8548 },
  { province: 'San Cristóbal', dcPrefix: 'DC-05', lat: 18.4167, lon: -70.1095 },
  { province: 'Peravia', dcPrefix: 'DC-05', lat: 18.2796, lon: -70.3319 },
  { province: 'San José de Ocoa', dcPrefix: 'DC-05', lat: 18.5466, lon: -70.5063 },
  { province: 'Monte Plata', dcPrefix: 'DC-12', lat: 18.807, lon: -69.784 },
  { province: 'San Pedro de Macorís', dcPrefix: 'DC-04', lat: 18.4539, lon: -69.3086 },
  { province: 'La Romana', dcPrefix: 'DC-04', lat: 18.4273, lon: -68.9728 },
  { province: 'La Altagracia', dcPrefix: 'DC-10', lat: 18.6167, lon: -68.7079 },
  { province: 'Hato Mayor', dcPrefix: 'DC-14', lat: 18.7628, lon: -69.2568 },
  { province: 'El Seibo', dcPrefix: 'DC-14', lat: 18.7656, lon: -69.0389 },
  { province: 'Santiago', dcPrefix: 'DC-08', lat: 19.4517, lon: -70.697 },
  { province: 'Espaillat', dcPrefix: 'DC-08', lat: 19.3935, lon: -70.526 },
  { province: 'Puerto Plata', dcPrefix: 'DC-07', lat: 19.7934, lon: -70.6884 },
  { province: 'La Vega', dcPrefix: 'DC-03', lat: 19.2221, lon: -70.5296 },
  { province: 'Monseñor Nouel', dcPrefix: 'DC-03', lat: 18.9389, lon: -70.4094 },
  { province: 'Sánchez Ramírez', dcPrefix: 'DC-06', lat: 19.0527, lon: -70.1492 },
  { province: 'Duarte', dcPrefix: 'DC-06', lat: 19.3009, lon: -70.2526 },
  { province: 'Hermanas Mirabal', dcPrefix: 'DC-06', lat: 19.3747, lon: -70.358 },
  { province: 'María Trinidad Sánchez', dcPrefix: 'DC-09', lat: 19.3832, lon: -69.8474 },
  { province: 'Samaná', dcPrefix: 'DC-09', lat: 19.2056, lon: -69.3369 },
  { province: 'Valverde', dcPrefix: 'DC-11', lat: 19.5519, lon: -71.0781 },
  { province: 'Santiago Rodríguez', dcPrefix: 'DC-11', lat: 19.4713, lon: -71.3413 },
  { province: 'Montecristi', dcPrefix: 'DC-11', lat: 19.8483, lon: -71.646 },
  { province: 'Dajabón', dcPrefix: 'DC-11', lat: 19.5488, lon: -71.7083 },
  { province: 'Azua', dcPrefix: 'DC-02', lat: 18.4532, lon: -70.7349 },
  { province: 'San Juan', dcPrefix: 'DC-02', lat: 18.8059, lon: -71.2299 },
  { province: 'Elías Piña', dcPrefix: 'DC-02', lat: 18.8775, lon: -71.7044 },
  { province: 'Barahona', dcPrefix: 'DC-13', lat: 18.2085, lon: -71.1008 },
  { province: 'Baoruco', dcPrefix: 'DC-13', lat: 18.4876, lon: -71.4182 },
  { province: 'Independencia', dcPrefix: 'DC-13', lat: 18.4859, lon: -71.8559 },
  { province: 'Pedernales', dcPrefix: 'DC-13', lat: 18.0384, lon: -71.744 },
];

export interface OsmLocationInfo {
  province: string;
  municipality?: string;
  locality?: string;
  displayAddress?: string;
  dcPrefix: string;
  source: 'osm' | 'offline-centroid';
}

export function inferDominicanLocationFromCoords(lat: number, lon: number): OsmLocationInfo {
  let closest = DR_PROVINCES[0];
  let bestDist = Infinity;
  for (const ref of DR_PROVINCES) {
    const d = haversineMeters(lat, lon, ref.lat, ref.lon);
    if (d < bestDist) {
      bestDist = d;
      closest = ref;
    }
  }
  return {
    province: closest.province,
    dcPrefix: closest.dcPrefix,
    source: 'offline-centroid',
  };
}

export function findDcPrefixForProvince(provinceName: string): string {
  const norm = provinceName.toLowerCase();
  const match = DR_PROVINCES.find((p) => norm.includes(p.province.toLowerCase()));
  return match?.dcPrefix ?? 'DC-01';
}

export async function reverseGeocodeOSM(lat: number, lon: number): Promise<OsmLocationInfo> {
  const fallback = inferDominicanLocationFromCoords(lat, lon);
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return fallback;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1&accept-language=es`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });
    clearTimeout(timer);

    if (!res.ok) return fallback;
    const data = await res.json();
    const addr = data?.address ?? {};
    const rawProvince: string =
      addr.state || addr.province || addr.region || fallback.province;
    const cleanProvince = rawProvince.replace(/^Provincia\s+(de\s+)?/i, '').trim();
    const municipality: string | undefined =
      addr.city || addr.town || addr.municipality || addr.county || undefined;
    const locality: string | undefined =
      addr.suburb || addr.neighbourhood || addr.village || addr.hamlet || undefined;

    return {
      province: cleanProvince || fallback.province,
      municipality,
      locality,
      displayAddress: data?.display_name,
      dcPrefix: findDcPrefixForProvince(cleanProvince || fallback.province),
      source: 'osm',
    };
  } catch {
    return fallback;
  }
}
