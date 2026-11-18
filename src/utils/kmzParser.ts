import JSZip from 'jszip';
import type { GeoPoint, KmzFeature } from '../types/geodesy';
import {
  computeCentroid,
  computePerimeterM,
  computePolygonAreaM2,
  haversineMeters,
  latLonToUtm19N,
} from './geodesy';
import { inferDominicanLocationFromCoords } from './osmGeocode';

const SANTO_DOMINGO_BASE = { lat: 18.4861, lon: -69.9312 };

function parseCoordinatesString(raw: string): GeoPoint[] {
  const tokens = raw.trim().split(/\s+/);
  const points: GeoPoint[] = [];
  for (const token of tokens) {
    const parts = token.split(',').map(Number);
    if (parts.length >= 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      const lon = parts[0];
      const lat = parts[1];
      const elev = parts.length >= 3 && !Number.isNaN(parts[2]) ? parts[2] : 18.0;
      points.push(latLonToUtm19N(lat, lon, elev));
    }
  }
  return points;
}

function stripHtmlToText(html: string): string {
  if (!html) return '';
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  } catch {
    return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }
}

function extractKeyValuesFromText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;
  const lines = text.split(/[\n\r;|•]+/);
  for (const line of lines) {
    const match = line.match(/^\s*([^:=-]{2,40})\s*[:=]\s*(.{1,140})$/);
    if (match) {
      const key = match[1].trim().toLowerCase();
      const val = match[2].trim();
      if (val) result[key] = val;
    }
  }
  return result;
}

function extractDateFromText(input: string): string | null {
  if (!input) return null;
  // Match YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = input.match(/\b(20\d{2})[-/](0[1-9]|1[0-2])[-/](0[1-9]|[12]\d|3[01])\b/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  // Match DD-MM-YYYY or DD/MM/YYYY (common in Dominican filenames like 13-11-2026)
  const dmyMatch = input.match(/\b(0[1-9]|[12]\d|3[01])[-/](0[1-9]|1[0-2])[-/](20\d{2})\b/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }
  return null;
}

function findAttributeByKeys(
  attrs: Record<string, string>,
  candidates: string[]
): string | undefined {
  const entries = Object.entries(attrs);
  for (const cand of candidates) {
    for (const [k, v] of entries) {
      if (k.toLowerCase().includes(cand.toLowerCase()) && v.trim()) {
        return v.trim();
      }
    }
  }
  return undefined;
}

export interface KmzExtractedMetadata {
  title: string;
  parcelCode: string;
  client: string;
  province: string;
  municipality?: string;
  surveyor?: string;
  scheduledDate: string;
  notes: string;
  extractedFields: string[];
}

export interface ParsedKmzResult {
  fileName: string;
  documentName: string;
  features: KmzFeature[];
  centroid: GeoPoint;
  totalAreaM2: number;
  totalPerimeterM: number;
  autoMeta: KmzExtractedMetadata;
  estimatedViaticos: {
    distanceFromBaseKm: number;
    estimatedDays: number;
    fuelRD: number;
    perDiemRD: number;
    tollsRD: number;
    lodgingRD: number;
    totalBudgetRD: number;
  };
}

export function estimateViaticosFromKmz(
  features: KmzFeature[],
  centroid: GeoPoint
): ParsedKmzResult['estimatedViaticos'] {
  const distKm = Math.max(
    12,
    Math.round(
      haversineMeters(
        SANTO_DOMINGO_BASE.lat,
        SANTO_DOMINGO_BASE.lon,
        centroid.lat,
        centroid.lon
      ) / 1000
    )
  );
  const totalAreaM2 = features.reduce((sum, f) => sum + f.areaM2, 0);
  const totalVertices = features.reduce((sum, f) => sum + f.points.length, 0);

  const hectares = totalAreaM2 / 10000;
  const estimatedDays = Math.max(1, Math.min(7, Math.ceil(hectares / 18 + totalVertices / 28)));

  const roundTripKm = distKm * 2;
  const fuelRD = Math.round(roundTripKm * 26.5);
  const perDiemRD = estimatedDays * 2200 * 2;
  const tollsRD = distKm > 45 ? Math.round((distKm / 50) * 320) : 0;
  const lodgingRD = distKm > 105 && estimatedDays > 1 ? (estimatedDays - 1) * 4800 : 0;

  return {
    distanceFromBaseKm: distKm,
    estimatedDays,
    fuelRD,
    perDiemRD,
    tollsRD,
    lodgingRD,
    totalBudgetRD: fuelRD + perDiemRD + tollsRD + lodgingRD,
  };
}

export function parseKmlText(kmlXml: string, fileName: string): ParsedKmzResult {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlXml, 'application/xml');
  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('El archivo KML interno no contiene XML válido.');
  }

  const rawDocName = doc.querySelector('Document > name')?.textContent?.trim();
  const rawFolderName = doc.querySelector('Folder > name')?.textContent?.trim();
  const cleanFileBase = fileName.replace(/\.(kmz|kml)$/i, '').trim();
  const documentName = rawDocName || rawFolderName || cleanFileBase;

  const placemarks = Array.from(doc.querySelectorAll('Placemark'));
  const features: KmzFeature[] = [];
  const mergedAttributes: Record<string, string> = {};
  const rawDescriptions: string[] = [];
  let kmlTimestampDate: string | null = null;

  const docDesc = doc.querySelector('Document > description')?.textContent?.trim();
  if (docDesc) {
    const cleanDocDesc = stripHtmlToText(docDesc);
    if (cleanDocDesc) rawDescriptions.push(cleanDocDesc);
    Object.assign(mergedAttributes, extractKeyValuesFromText(cleanDocDesc));
  }

  placemarks.forEach((pm, idx) => {
    const name = pm.querySelector('name')?.textContent?.trim() || `Polígono ${idx + 1}`;
    const rawDesc = pm.querySelector('description')?.textContent?.trim() || '';
    const cleanDesc = stripHtmlToText(rawDesc);
    if (cleanDesc) rawDescriptions.push(cleanDesc);

    const address = pm.querySelector('address')?.textContent?.trim();
    if (address) mergedAttributes['address'] = address;

    const whenText =
      pm.querySelector('TimeStamp > when')?.textContent?.trim() ||
      pm.querySelector('TimeSpan > begin')?.textContent?.trim();
    if (whenText && !kmlTimestampDate) {
      kmlTimestampDate = extractDateFromText(whenText);
    }

    const attrs: Record<string, string> = {
      ...extractKeyValuesFromText(rawDesc.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n')),
    };

    // Parse KML <ExtendedData><Data name="..."><value>...</value></Data>
    pm.querySelectorAll('ExtendedData Data').forEach((d) => {
      const k = d.getAttribute('name')?.trim();
      const v = d.querySelector('value')?.textContent?.trim();
      if (k && v) attrs[k] = v;
    });

    // Parse KML <ExtendedData><SchemaData><SimpleData name="...">...</SimpleData>
    pm.querySelectorAll('ExtendedData SimpleData').forEach((sd) => {
      const k = sd.getAttribute('name')?.trim();
      const v = sd.textContent?.trim();
      if (k && v) attrs[k] = v;
    });

    Object.assign(mergedAttributes, attrs);

    // Extract all polygons (handles single Polygon or MultiGeometry with multiple Polygons)
    const polygonCoordNodes = Array.from(
      pm.querySelectorAll('Polygon outerBoundaryIs LinearRing coordinates')
    );
    if (polygonCoordNodes.length > 0) {
      polygonCoordNodes.forEach((node, polyIdx) => {
        const points = parseCoordinatesString(node.textContent || '');
        if (points.length >= 3) {
          features.push({
            id: `feat-${idx}-${polyIdx}-${Date.now()}`,
            name: polygonCoordNodes.length > 1 ? `${name} (${polyIdx + 1})` : name,
            description: cleanDesc || undefined,
            attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
            geometryType: 'Polygon',
            points,
            areaM2: computePolygonAreaM2(points),
            perimeterM: computePerimeterM(points, true),
          });
        }
      });
      return;
    }

    const lineCoordNodes = Array.from(pm.querySelectorAll('LineString coordinates'));
    if (lineCoordNodes.length > 0) {
      lineCoordNodes.forEach((node, lineIdx) => {
        const points = parseCoordinatesString(node.textContent || '');
        if (points.length >= 2) {
          features.push({
            id: `feat-${idx}-${lineIdx}-${Date.now()}`,
            name,
            description: cleanDesc || undefined,
            attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
            geometryType: 'LineString',
            points,
            areaM2: 0,
            perimeterM: computePerimeterM(points, false),
          });
        }
      });
      return;
    }

    const pointCoords = pm.querySelector('Point coordinates')?.textContent;
    if (pointCoords) {
      const points = parseCoordinatesString(pointCoords);
      if (points.length >= 1) {
        features.push({
          id: `feat-${idx}-${Date.now()}`,
          name,
          description: cleanDesc || undefined,
          attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
          geometryType: 'Point',
          points,
          areaM2: 0,
          perimeterM: 0,
        });
      }
    }
  });

  if (features.length === 0) {
    throw new Error(
      'No se encontraron polígonos, polilíneas o puntos geodésicos dentro del archivo KMZ/KML.'
    );
  }

  const allPoints = features.flatMap((f) => f.points);
  const centroid = computeCentroid(allPoints);
  const totalAreaM2 = features.reduce((sum, f) => sum + f.areaM2, 0);
  const totalPerimeterM = features.reduce((sum, f) => sum + f.perimeterM, 0);
  const estimatedViaticos = estimateViaticosFromKmz(features, centroid);

  // Build auto-filled metadata from KML internals + filename + coordinates
  const extractedFields: string[] = ['Geometría UTM 19N', 'Superficie y Perímetro', 'Presupuesto de Viáticos'];
  const geoLoc = inferDominicanLocationFromCoords(centroid.lat, centroid.lon);

  // Title: prefer Placemark name if Document name is generic/filename
  const primaryFeatureName = features[0]?.name;
  const cleanTitle =
    rawDocName && !rawDocName.toLowerCase().endsWith('.kmz') && !rawDocName.toLowerCase().endsWith('.kml')
      ? rawDocName
      : primaryFeatureName && !/^Polígono \d+$/i.test(primaryFeatureName)
      ? primaryFeatureName
      : cleanFileBase;
  extractedFields.push('Nombre');

  // Date: TimeStamp -> description -> filename -> today
  const fileDate = extractDateFromText(fileName) || extractDateFromText(rawDescriptions.join(' '));
  const scheduledDate = kmlTimestampDate || fileDate || new Date().toISOString().slice(0, 10);
  if (kmlTimestampDate || fileDate) {
    extractedFields.push('Fecha');
  }

  // Parcel code: ExtendedData -> regex in text/title -> deterministic DC code from location
  const attrParcel = findAttributeByKeys(mergedAttributes, [
    'parcela',
    'designacion',
    'dc',
    'codigo',
    'catastral',
    'matricula',
    'solar',
    'parcel',
  ]);
  const combinedText = `${documentName} ${primaryFeatureName ?? ''} ${rawDescriptions.join(' ')}`;
  const dcRegex = combinedText.match(/\b(DC[-\s]?\d{1,2}[-\s]?PARC[-\s]?\d{4}[-\s]?\d{3,5})\b/i);
  const parcNumRegex = combinedText.match(/\b(?:parcela|parc\.?|solar|lote)\s*(?:no\.?|#)?\s*([A-Z0-9-]{2,15})\b/i);

  let parcelCode: string;
  if (attrParcel) {
    parcelCode = attrParcel.toUpperCase();
    extractedFields.push('Código Catastral');
  } else if (dcRegex) {
    parcelCode = dcRegex[1].toUpperCase().replace(/\s+/g, '-');
    extractedFields.push('Código Catastral');
  } else if (parcNumRegex) {
    const year = scheduledDate.slice(0, 4);
    parcelCode = `${geoLoc.dcPrefix}-PARC-${year}-${parcNumRegex[1].toUpperCase()}`;
    extractedFields.push('Código Catastral');
  } else {
    const year = scheduledDate.slice(0, 4);
    const coordSuffix = String(Math.abs(Math.round((centroid.easting + centroid.northing) % 10000))).padStart(
      4,
      '0'
    );
    parcelCode = `${geoLoc.dcPrefix}-PARC-${year}-${coordSuffix}`;
  }

  // Province & Municipality
  const attrProvince = findAttributeByKeys(mergedAttributes, ['provincia', 'province', 'estado', 'region']);
  const attrMunicipio = findAttributeByKeys(mergedAttributes, ['municipio', 'ciudad', 'sector', 'localidad', 'address']);
  const province = attrProvince || geoLoc.province;
  extractedFields.push(attrProvince ? 'Provincia (KML)' : 'Provincia (Coordenadas)');

  // Client / Owner
  const attrClient = findAttributeByKeys(mergedAttributes, [
    'cliente',
    'propietario',
    'titular',
    'solicitante',
    'owner',
    'empresa',
    'razon',
    'dueno',
  ]);
  const client = attrClient || (rawFolderName && rawFolderName !== cleanTitle ? rawFolderName : '');
  if (client) extractedFields.push('Cliente / Propietario');

  // Surveyor
  const attrSurveyor = findAttributeByKeys(mergedAttributes, [
    'agrimensor',
    'topografo',
    'ingeniero',
    'responsable',
    'surveyor',
    'brigada',
  ]);
  if (attrSurveyor) extractedFields.push('Agrimensor');

  // Notes summary
  const attrSummaryParts = Object.entries(mergedAttributes)
    .slice(0, 5)
    .map(([k, v]) => `${k}: ${v}`);
  const notes =
    rawDescriptions[0] ||
    (attrSummaryParts.length > 0 ? attrSummaryParts.join(' · ') : '') ||
    `Polígono extraído de ${fileName} (${features.length} elemento(s), centroide ${centroid.lat.toFixed(
      5
    )}, ${centroid.lon.toFixed(5)}).`;

  return {
    fileName,
    documentName,
    features,
    centroid,
    totalAreaM2,
    totalPerimeterM,
    autoMeta: {
      title: cleanTitle,
      parcelCode,
      client,
      province,
      municipality: attrMunicipio,
      surveyor: attrSurveyor,
      scheduledDate,
      notes,
      extractedFields,
    },
    estimatedViaticos,
  };
}

export async function parseKmzOrKmlFile(file: File): Promise<ParsedKmzResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.kml')) {
    const kmlText = await file.text();
    return parseKmlText(kmlText, file.name);
  }

  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const kmlEntryName = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith('.kml'));

  if (!kmlEntryName) {
    throw new Error('El archivo KMZ comprimido no contiene ningún documento .kml válido.');
  }

  const kmlText = await zip.files[kmlEntryName].async('text');
  return parseKmlText(kmlText, file.name);
}

export interface SampleKmzTemplate {
  key: string;
  label: string;
  province: string;
  parcelCode: string;
  fileName: string;
  kml: string;
}

export const SAMPLE_KMZ_TEMPLATES: SampleKmzTemplate[] = [
  {
    key: 'punta-cana',
    label: 'Deslinde Bávaro · Lotificación Verón',
    province: 'La Altagracia',
    parcelCode: 'DC-10-PARC-2026-1402',
    fileName: 'Deslinde_Veron_Bavaro_19N.kmz',
    kml: `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Deslinde Lotificación Verón Norte</name>
    <Placemark>
      <name>Parcela Matriz 408-A</name>
      <TimeStamp><when>2026-11-21</when></TimeStamp>
      <description>Terreno llano con vegetación media, acceso por Boulevard Turístico del Este</description>
      <ExtendedData>
        <Data name="Codigo"><value>DC-10-PARC-2026-1402</value></Data>
        <Data name="Cliente"><value>Inversiones Territoriales Caribe SRL</value></Data>
        <Data name="Provincia"><value>La Altagracia</value></Data>
        <Data name="Municipio"><value>Higüey · Verón Punta Cana</value></Data>
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -68.42185,18.63410,16.4
              -68.41620,18.63495,18.1
              -68.41510,18.63040,15.8
              -68.41990,18.62965,14.9
              -68.42240,18.63190,15.5
              -68.42185,18.63410,16.4
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
    <Placemark>
      <name>Punto Control GNSS PG-01</name>
      <Point>
        <coordinates>-68.42185,18.63410,16.4</coordinates>
      </Point>
    </Placemark>
  </Document>
</kml>`,
  },
  {
    key: 'constanza',
    label: 'Subdivisión Agrícola Tireo · Constanza',
    province: 'La Vega',
    parcelCode: 'DC-03-PARC-2026-0774',
    fileName: 'Subdivision_Tireo_Constanza.kmz',
    kml: `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Subdivisión Finca Agrícola Tireo</name>
    <Placemark>
      <name>Lote Agrícola Norte</name>
      <TimeStamp><when>2026-11-24</when></TimeStamp>
      <description>Pendiente pronunciada en zona intramontana, requiere estación total + RTK</description>
      <ExtendedData>
        <Data name="Codigo"><value>DC-03-PARC-2026-0774</value></Data>
        <Data name="Propietario"><value>Agropecuaria Valle Nuevo SAS</value></Data>
        <Data name="Provincia"><value>La Vega</value></Data>
        <Data name="Municipio"><value>Constanza · Tireo</value></Data>
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -70.69820,18.92140,1184.2
              -70.69280,18.92230,1208.5
              -70.69150,18.91810,1225.0
              -70.69690,18.91730,1196.4
              -70.69820,18.92140,1184.2
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`,
  },
];

export async function buildRealKmzFileFromTemplate(template: SampleKmzTemplate): Promise<File> {
  const zip = new JSZip();
  zip.file('doc.kml', template.kml);
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  return new File([blob], template.fileName, { type: 'application/vnd.google-earth.kmz' });
}
