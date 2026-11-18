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
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const lon = parts[0];
      const lat = parts[1];
      const elev = parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : 18.0;
      points.push(latLonToUtm19N(lat, lon, elev));
    }
  }
  return points;
}

function parseGxCoordNodes(nodes: Element[]): GeoPoint[] {
  const points: GeoPoint[] = [];
  for (const node of nodes) {
    const parts = (node.textContent || '').trim().split(/\s+/).map(Number);
    if (parts.length >= 2 && Number.isFinite(parts[0]) && Number.isFinite(parts[1])) {
      const lon = parts[0];
      const lat = parts[1];
      const elev = parts.length >= 3 && Number.isFinite(parts[2]) ? parts[2] : 18.0;
      points.push(latLonToUtm19N(lat, lon, elev));
    }
  }
  return points;
}

function elementsByLocalName(root: Document | Element, localName: string): Element[] {
  const target = localName.toLowerCase();
  const byNs = Array.from(root.getElementsByTagNameNS('*', localName));
  if (byNs.length > 0) return byNs;
  const all = Array.from(root.getElementsByTagName('*'));
  return all.filter((el) => (el.localName || el.tagName.split(':').pop() || '').toLowerCase() === target);
}

function firstDirectChildByLocalName(parent: Element, localName: string): Element | null {
  const target = localName.toLowerCase();
  for (const child of Array.from(parent.children)) {
    const name = (child.localName || child.tagName.split(':').pop() || '').toLowerCase();
    if (name === target) return child;
  }
  return null;
}

function firstDescendantByLocalName(root: Document | Element, localName: string): Element | null {
  return elementsByLocalName(root, localName)[0] ?? null;
}

function sanitizeKmlXml(raw: string): string {
  const withoutBom = raw.replace(/^\uFEFF/, '').trimStart();
  return withoutBom.replace(
    /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g,
    '&amp;'
  );
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
  const cleanedRaw = kmlXml.replace(/^\uFEFF/, '').trimStart();
  const parser = new DOMParser();
  let doc = parser.parseFromString(cleanedRaw, 'application/xml');
  if (doc.querySelector('parsererror')) {
    const sanitized = sanitizeKmlXml(cleanedRaw);
    doc = parser.parseFromString(sanitized, 'application/xml');
    if (doc.querySelector('parsererror')) {
      const htmlDoc = parser.parseFromString(sanitized, 'text/html');
      if (elementsByLocalName(htmlDoc, 'coordinates').length === 0 && elementsByLocalName(htmlDoc, 'coord').length === 0) {
        throw new Error('El archivo KML interno no contiene XML válido.');
      }
      doc = htmlDoc;
    }
  }

  const docEl = firstDescendantByLocalName(doc, 'Document');
  const folderEl = firstDescendantByLocalName(doc, 'Folder');
  const rawDocName = docEl ? firstDirectChildByLocalName(docEl, 'name')?.textContent?.trim() : undefined;
  const rawFolderName = folderEl ? firstDirectChildByLocalName(folderEl, 'name')?.textContent?.trim() : undefined;
  const cleanFileBase = fileName.replace(/\.(kmz|kml)$/i, '').trim();
  const documentName = rawDocName || rawFolderName || cleanFileBase;

  const rawPlacemarks = elementsByLocalName(doc, 'Placemark');
  const placemarks: Element[] =
    rawPlacemarks.length > 0
      ? rawPlacemarks
      : doc.documentElement
      ? [doc.documentElement]
      : [];

  const features: KmzFeature[] = [];
  const mergedAttributes: Record<string, string> = {};
  const rawDescriptions: string[] = [];
  let kmlTimestampDate: string | null = null;

  const docDesc = docEl ? firstDirectChildByLocalName(docEl, 'description')?.textContent?.trim() : undefined;
  if (docDesc) {
    const cleanDocDesc = stripHtmlToText(docDesc);
    if (cleanDocDesc) rawDescriptions.push(cleanDocDesc);
    Object.assign(mergedAttributes, extractKeyValuesFromText(cleanDocDesc));
  }

  placemarks.forEach((pm, idx) => {
    const directName = firstDirectChildByLocalName(pm, 'name')?.textContent?.trim();
    const name = directName || (rawPlacemarks.length === 0 ? documentName : `Polígono ${idx + 1}`);
    const rawDesc = firstDirectChildByLocalName(pm, 'description')?.textContent?.trim() || '';
    const cleanDesc = stripHtmlToText(rawDesc);
    if (cleanDesc) rawDescriptions.push(cleanDesc);

    const address = firstDirectChildByLocalName(pm, 'address')?.textContent?.trim();
    if (address) mergedAttributes['address'] = address;

    const whenText =
      firstDescendantByLocalName(pm, 'when')?.textContent?.trim() ||
      firstDescendantByLocalName(pm, 'begin')?.textContent?.trim();
    if (whenText && !kmlTimestampDate) {
      kmlTimestampDate = extractDateFromText(whenText);
    }

    const attrs: Record<string, string> = {
      ...extractKeyValuesFromText(rawDesc.replace(/<br\s*\/?>/gi, '\n').replace(/<\/tr>/gi, '\n')),
    };

    // Parse KML <ExtendedData><Data name="..."><value>...</value></Data>
    elementsByLocalName(pm, 'Data').forEach((d) => {
      const k = d.getAttribute('name')?.trim();
      const v = firstDirectChildByLocalName(d, 'value')?.textContent?.trim() || d.textContent?.trim();
      if (k && v) attrs[k] = v;
    });

    // Parse KML <ExtendedData><SchemaData><SimpleData name="...">...</SimpleData>
    elementsByLocalName(pm, 'SimpleData').forEach((sd) => {
      const k = sd.getAttribute('name')?.trim();
      const v = sd.textContent?.trim();
      if (k && v) attrs[k] = v;
    });

    Object.assign(mergedAttributes, attrs);

    // Extract Polygons (outerBoundaryIs preferred to avoid treating holes as separate polygons)
    const polygonEls = elementsByLocalName(pm, 'Polygon');
    polygonEls.forEach((polyEl, polyIdx) => {
      const outer = firstDirectChildByLocalName(polyEl, 'outerBoundaryIs') ?? polyEl;
      const coordNode = firstDescendantByLocalName(outer, 'coordinates');
      if (!coordNode) return;
      const points = parseCoordinatesString(coordNode.textContent || '');
      if (points.length >= 3) {
        features.push({
          id: `feat-${idx}-poly-${polyIdx}-${Date.now()}`,
          name: polygonEls.length > 1 ? `${name} (${polyIdx + 1})` : name,
          description: cleanDesc || undefined,
          attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
          geometryType: 'Polygon',
          points,
          areaM2: computePolygonAreaM2(points),
          perimeterM: computePerimeterM(points, true),
        });
      }
    });

    // Extract LineStrings (also kept when inside MultiGeometry alongside Polygons)
    const lineEls = elementsByLocalName(pm, 'LineString');
    lineEls.forEach((lineEl, lineIdx) => {
      const coordNode = firstDescendantByLocalName(lineEl, 'coordinates');
      if (!coordNode) return;
      const points = parseCoordinatesString(coordNode.textContent || '');
      if (points.length >= 2) {
        features.push({
          id: `feat-${idx}-line-${lineIdx}-${Date.now()}`,
          name: lineEls.length > 1 ? `${name} (Tramo ${lineIdx + 1})` : name,
          description: cleanDesc || undefined,
          attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
          geometryType: 'LineString',
          points,
          areaM2: 0,
          perimeterM: computePerimeterM(points, false),
        });
      }
    });

    // Extract gx:Track GPS tracks from Google Earth KML/KMZ
    const trackEls = elementsByLocalName(pm, 'Track');
    trackEls.forEach((trackEl, trackIdx) => {
      const gxCoords = elementsByLocalName(trackEl, 'coord');
      const points = parseGxCoordNodes(gxCoords);
      if (points.length >= 2) {
        features.push({
          id: `feat-${idx}-track-${trackIdx}-${Date.now()}`,
          name: trackEls.length > 1 ? `${name} (Track ${trackIdx + 1})` : name,
          description: cleanDesc || undefined,
          attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
          geometryType: 'LineString',
          points,
          areaM2: 0,
          perimeterM: computePerimeterM(points, false),
        });
      }
    });

    // Extract Points (also kept when inside MultiGeometry)
    const pointEls = elementsByLocalName(pm, 'Point');
    pointEls.forEach((ptEl, ptIdx) => {
      const coordNode = firstDescendantByLocalName(ptEl, 'coordinates');
      if (!coordNode) return;
      const points = parseCoordinatesString(coordNode.textContent || '');
      if (points.length >= 1) {
        features.push({
          id: `feat-${idx}-pt-${ptIdx}-${Date.now()}`,
          name: pointEls.length > 1 ? `${name} (${ptIdx + 1})` : name,
          description: cleanDesc || undefined,
          attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
          geometryType: 'Point',
          points,
          areaM2: 0,
          perimeterM: 0,
        });
      }
    });
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

export function parseGeoJsonText(jsonText: string, fileName: string): ParsedKmzResult {
  let geo: unknown;
  try {
    geo = JSON.parse(jsonText);
  } catch {
    throw new Error('El archivo GeoJSON no contiene JSON válido.');
  }

  const obj = geo as {
    type?: string;
    name?: string;
    features?: Array<{
      type?: string;
      properties?: Record<string, unknown> | null;
      geometry?: { type?: string; coordinates?: unknown } | null;
    }>;
    geometry?: { type?: string; coordinates?: unknown } | null;
    properties?: Record<string, unknown> | null;
  };

  const rawList =
    obj?.type === 'FeatureCollection' && Array.isArray(obj.features)
      ? obj.features
      : obj?.type === 'Feature'
      ? [obj]
      : obj?.type && obj.geometry === undefined
      ? [{ type: 'Feature', properties: {}, geometry: obj as { type?: string; coordinates?: unknown } }]
      : [];

  if (rawList.length === 0) {
    throw new Error('El GeoJSON no contiene un FeatureCollection, Feature o geometría válida.');
  }

  const features: KmzFeature[] = [];
  const mergedAttributes: Record<string, string> = {};

  const toPoints = (ring: unknown): GeoPoint[] => {
    if (!Array.isArray(ring)) return [];
    const pts: GeoPoint[] = [];
    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length >= 2) {
        const lon = Number(coord[0]);
        const lat = Number(coord[1]);
        const elev = coord.length >= 3 && Number.isFinite(Number(coord[2])) ? Number(coord[2]) : 18;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          pts.push(latLonToUtm19N(lat, lon, elev));
        }
      }
    }
    return pts;
  };

  rawList.forEach((feat, idx) => {
    const geom = feat?.geometry;
    if (!geom || !geom.type) return;
    const props: Record<string, string> = {};
    if (feat.properties && typeof feat.properties === 'object') {
      for (const [k, v] of Object.entries(feat.properties)) {
        if (v !== null && v !== undefined && String(v).trim()) {
          props[k] = String(v).trim();
          mergedAttributes[k] = String(v).trim();
        }
      }
    }
    const baseName = props.name || props.nombre || props.title || `Geometría ${idx + 1}`;

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates)) {
      const points = toPoints(geom.coordinates[0]);
      if (points.length >= 3) {
        features.push({
          id: `gj-${idx}-${Date.now()}`,
          name: baseName,
          attributes: Object.keys(props).length ? props : undefined,
          geometryType: 'Polygon',
          points,
          areaM2: computePolygonAreaM2(points),
          perimeterM: computePerimeterM(points, true),
        });
      }
    } else if (geom.type === 'MultiPolygon' && Array.isArray(geom.coordinates)) {
      geom.coordinates.forEach((poly, pIdx) => {
        if (Array.isArray(poly)) {
          const points = toPoints(poly[0]);
          if (points.length >= 3) {
            features.push({
              id: `gj-${idx}-${pIdx}-${Date.now()}`,
              name: `${baseName} (${pIdx + 1})`,
              attributes: Object.keys(props).length ? props : undefined,
              geometryType: 'Polygon',
              points,
              areaM2: computePolygonAreaM2(points),
              perimeterM: computePerimeterM(points, true),
            });
          }
        }
      });
    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
      const points = toPoints(geom.coordinates);
      if (points.length >= 2) {
        features.push({
          id: `gj-${idx}-${Date.now()}`,
          name: baseName,
          attributes: Object.keys(props).length ? props : undefined,
          geometryType: 'LineString',
          points,
          areaM2: 0,
          perimeterM: computePerimeterM(points, false),
        });
      }
    } else if (geom.type === 'Point' && Array.isArray(geom.coordinates)) {
      const points = toPoints([geom.coordinates]);
      if (points.length >= 1) {
        features.push({
          id: `gj-${idx}-${Date.now()}`,
          name: baseName,
          attributes: Object.keys(props).length ? props : undefined,
          geometryType: 'Point',
          points,
          areaM2: 0,
          perimeterM: 0,
        });
      }
    }
  });

  if (features.length === 0) {
    throw new Error('No se encontraron polígonos, líneas o puntos válidos en el GeoJSON.');
  }

  const allPoints = features.flatMap((f) => f.points);
  const centroid = computeCentroid(allPoints);
  const totalAreaM2 = features.reduce((sum, f) => sum + f.areaM2, 0);
  const totalPerimeterM = features.reduce((sum, f) => sum + f.perimeterM, 0);
  const estimatedViaticos = estimateViaticosFromKmz(features, centroid);
  const geoLoc = inferDominicanLocationFromCoords(centroid.lat, centroid.lon);
  const scheduledDate =
    extractDateFromText(fileName) ||
    findAttributeByKeys(mergedAttributes, ['fecha', 'date']) ||
    new Date().toISOString().slice(0, 10);
  const cleanBase = fileName.replace(/\.(geojson|json)$/i, '').trim();
  const title = obj?.name || features[0]?.name || cleanBase;
  const province =
    findAttributeByKeys(mergedAttributes, ['provincia', 'province']) || geoLoc.province;
  const client =
    findAttributeByKeys(mergedAttributes, ['cliente', 'propietario', 'owner']) || '';
  const attrParcel = findAttributeByKeys(mergedAttributes, ['parcela', 'codigo', 'dc', 'lote']);
  const coordSuffix = String(
    Math.abs(Math.round((centroid.easting + centroid.northing) % 10000))
  ).padStart(4, '0');
  const parcelCode = attrParcel
    ? attrParcel.toUpperCase()
    : `${geoLoc.dcPrefix}-PARC-${scheduledDate.slice(0, 4)}-${coordSuffix}`;

  return {
    fileName,
    documentName: title,
    features,
    centroid,
    totalAreaM2,
    totalPerimeterM,
    autoMeta: {
      title,
      parcelCode,
      client,
      province,
      municipality: findAttributeByKeys(mergedAttributes, ['municipio', 'ubicacion', 'sector']),
      surveyor: findAttributeByKeys(mergedAttributes, ['agrimensor', 'tecnico']),
      scheduledDate,
      notes: `Geometría importada desde GeoJSON (${features.length} elemento(s)).`,
      extractedFields: ['GeoJSON UTM 19N', 'Superficie y Perímetro', 'Presupuesto de Viáticos'],
    },
    estimatedViaticos,
  };
}

export async function parseKmzOrKmlFile(file: File): Promise<ParsedKmzResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.geojson') || lower.endsWith('.json')) {
    const text = await file.text();
    return parseGeoJsonText(text, file.name);
  }
  if (lower.endsWith('.kml')) {
    const kmlText = await file.text();
    return parseKmlText(kmlText, file.name);
  }
  if (!lower.endsWith('.kmz')) {
    throw new Error('Formato no soportado. Sube un archivo .kmz, .kml o .geojson.');
  }

  let zip: JSZip;
  try {
    const buffer = await file.arrayBuffer();
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new Error('El archivo .kmz está corrupto o no es un paquete ZIP válido.');
  }
  const kmlCandidates = Object.keys(zip.files).filter(
    (name) => !zip.files[name].dir && name.toLowerCase().endsWith('.kml')
  );
  const kmlEntryName =
    kmlCandidates.find((name) => name.toLowerCase() === 'doc.kml') ?? kmlCandidates[0];

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
