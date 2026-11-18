import type { DwgDatabase, LibreDwgEx } from '@mlightcad/libredwg-web';

export type CadTheme = 'dark' | 'light' | 'blueprint';
export type CadStrokeMode = 'thin' | 'normal' | 'thick';

export interface DwgLayerInfo {
  name: string;
  entityCount: number;
  colorHex: string;
  off: boolean;
  frozen: boolean;
}

export interface DwgViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedDwgPlan {
  fileName: string;
  format: 'DWG' | 'DXF';
  version: string;
  insUnitsLabel: string;
  db: DwgDatabase;
  rawSvg: string;
  viewBox: DwgViewBox;
  layers: DwgLayerInfo[];
  entitySummary: Record<string, number>;
  totalEntities: number;
  unknownEntityCount: number;
  blocksCount: number;
  hasRenderableGeometry: boolean;
}

const INSUNITS_LABELS: Record<number, string> = {
  0: 'Sin unidades',
  1: 'Pulgadas (in)',
  2: 'Pies (ft)',
  3: 'Millas (mi)',
  4: 'Milímetros (mm)',
  5: 'Centímetros (cm)',
  6: 'Metros (m)',
  7: 'Kilómetros (km)',
  10: 'Yardas (yd)',
  14: 'Decímetros (dm)',
};

const VERSION_LABELS: Record<string, string> = {
  AC1006: 'R10 (AC1006)',
  AC1009: 'R11/R12 (AC1009)',
  AC1012: 'R13 (AC1012)',
  AC1014: 'R14 (AC1014)',
  AC1015: 'AutoCAD 2000 (AC1015)',
  AC1018: 'AutoCAD 2004 (AC1018)',
  AC1021: 'AutoCAD 2007 (AC1021)',
  AC1024: 'AutoCAD 2010 (AC1024)',
  AC1027: 'AutoCAD 2013 (AC1027)',
  AC1032: 'AutoCAD 2018+ (AC1032)',
};

const ACI_SWATCH_MAP: Record<number, string> = {
  1: '#EF4444',
  2: '#EAB308',
  3: '#22C55E',
  4: '#06B6D4',
  5: '#3B82F6',
  6: '#EC4899',
  7: '#64748B',
  8: '#94A3B8',
  9: '#CBD5E1',
};

const libredwgCache = new Map<string, Promise<LibreDwgEx>>();

async function getLibreDwgInstance(wasmBasePath = '/wasm'): Promise<LibreDwgEx> {
  const normalizedBase = wasmBasePath.replace(/\/+$/, '') || '/wasm';
  const existing = libredwgCache.get(normalizedBase);
  if (existing) {
    return existing;
  }

  const loaderPromise = (async () => {
    const mod = await import('@mlightcad/libredwg-web');
    const instance = await mod.LibreDwg.create(normalizedBase);
    return instance;
  })().catch((err) => {
    libredwgCache.delete(normalizedBase);
    throw err;
  });

  libredwgCache.set(normalizedBase, loaderPromise);
  return loaderPromise;
}

export function detectCadFormat(fileName: string): 'DWG' | 'DXF' {
  const lower = fileName.trim().toLowerCase();
  if (lower.endsWith('.dwg')) return 'DWG';
  if (lower.endsWith('.dxf')) return 'DXF';
  throw new Error('Formato no compatible. Sube un plano AutoCAD .DWG o .DXF.');
}

export function parseCadViewBox(svg: string): DwgViewBox {
  const match = svg.match(/viewBox="([^"]+)"/i);
  if (!match) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const parts = match[1]
    .trim()
    .split(/[\s,]+/)
    .map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

function aciOrRgbToSwatchHex(colorIndex?: number, rgbNumber?: number): string {
  if (typeof colorIndex === 'number') {
    const abs = Math.abs(colorIndex);
    if (ACI_SWATCH_MAP[abs]) return ACI_SWATCH_MAP[abs];
  }
  if (typeof rgbNumber === 'number' && rgbNumber > 0 && rgbNumber <= 0xffffff) {
    const hex = rgbNumber.toString(16).padStart(6, '0');
    return `#${hex}`;
  }
  return '#64748B';
}

export function adaptCadSvg(
  rawSvg: string,
  options: { theme?: CadTheme; strokeMode?: CadStrokeMode } = {}
): { svg: string; viewBox: DwgViewBox; hasGeometry: boolean } {
  const theme = options.theme ?? 'dark';
  const strokeMode = options.strokeMode ?? 'normal';
  const viewBox = parseCadViewBox(rawSvg);

  const strokeWidthPct =
    strokeMode === 'thin' ? '0.06%' : strokeMode === 'thick' ? '0.26%' : '0.13%';

  let svg = rawSvg;

  // Replace root SVG group stroke width and add clean line caps/joins
  svg = svg.replace(
    /(<g\b[^>]*stroke=")([^"]+)("[^>]*stroke-width=")([^"]+)(")/i,
    (_m, p1, _defaultStroke, p3, _defaultWidth, p5) => {
      const rootColor =
        theme === 'dark' ? '#E2E8F0' : theme === 'blueprint' ? '#E0F2FE' : '#0F172A';
      return `${p1}${rootColor}${p3}${strokeWidthPct}${p5} stroke-linecap="round" stroke-linejoin="round"`;
    }
  );

  if (theme === 'dark') {
    svg = svg
      .replace(/rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, '#E2E8F0')
      .replace(/stroke="black"/gi, 'stroke="#E2E8F0"')
      .replace(/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/gi, '#F8FAFC')
      .replace(/rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/gi, '#60A5FA');
  } else if (theme === 'blueprint') {
    svg = svg
      .replace(/rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)/gi, '#E0F2FE')
      .replace(/stroke="black"/gi, 'stroke="#E0F2FE"')
      .replace(/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/gi, '#F0F9FF')
      .replace(/rgb\(\s*0\s*,\s*0\s*,\s*255\s*\)/gi, '#7DD3FC')
      .replace(/rgb\(\s*0\s*,\s*255\s*,\s*255\s*\)/gi, '#38BDF8');
  } else {
    // light / white architectural paper
    svg = svg
      .replace(/rgb\(\s*255\s*,\s*255\s*,\s*255\s*\)/gi, '#0F172A')
      .replace(/#ffffff\b/gi, '#0F172A')
      .replace(/rgb\(\s*255\s*,\s*255\s*,\s*0\s*\)/gi, '#B45309')
      .replace(/rgb\(\s*0\s*,\s*255\s*,\s*255\s*\)/gi, '#0369A1')
      .replace(/rgb\(\s*0\s*,\s*255\s*,\s*0\s*\)/gi, '#15803D');
  }

  // Pad viewBox slightly (4%) so outer boundary walls/frames aren't clipped at edges
  if (viewBox.width > 0 && viewBox.height > 0) {
    const padX = viewBox.width * 0.04;
    const padY = viewBox.height * 0.04;
    const padded = {
      x: viewBox.x - padX,
      y: viewBox.y - padY,
      width: viewBox.width + padX * 2,
      height: viewBox.height + padY * 2,
    };
    svg = svg.replace(
      /viewBox="[^"]+"/i,
      `viewBox="${padded.x} ${padded.y} ${padded.width} ${padded.height}"`
    );
  }

  const hasGeometry =
    viewBox.width > 0 &&
    viewBox.height > 0 &&
    /<(line|path|circle|ellipse|text|use)\b/i.test(svg);

  return { svg, viewBox, hasGeometry };
}

function filterDatabaseByHiddenLayers(
  db: DwgDatabase,
  hiddenLayers: Set<string>
): DwgDatabase {
  if (hiddenLayers.size === 0) return db;

  const filteredEntries = db.tables.BLOCK_RECORD.entries.map((block) => {
    if (block.name?.toUpperCase() !== '*MODEL_SPACE') {
      return block;
    }
    return {
      ...block,
      entities: (block.entities || []).filter(
        (entity) => !hiddenLayers.has(entity.layer || '0')
      ),
    };
  });

  return {
    ...db,
    entities: (db.entities || []).filter(
      (entity) => !hiddenLayers.has(entity.layer || '0')
    ),
    tables: {
      ...db.tables,
      BLOCK_RECORD: {
        ...db.tables.BLOCK_RECORD,
        entries: filteredEntries,
      },
    },
  };
}

export async function renderDwgPlanSvg(
  plan: ParsedDwgPlan,
  options: {
    hiddenLayers?: Set<string>;
    theme?: CadTheme;
    strokeMode?: CadStrokeMode;
    wasmBasePath?: string;
  } = {}
): Promise<{ svg: string; viewBox: DwgViewBox; hasGeometry: boolean }> {
  const hidden = options.hiddenLayers ?? new Set<string>();
  let targetRawSvg = plan.rawSvg;

  if (hidden.size > 0) {
    const libredwg = await getLibreDwgInstance(options.wasmBasePath);
    const filteredDb = filterDatabaseByHiddenLayers(plan.db, hidden);
    targetRawSvg = libredwg.dwg_to_svg(filteredDb);
  }

  return adaptCadSvg(targetRawSvg, {
    theme: options.theme ?? 'dark',
    strokeMode: options.strokeMode ?? 'normal',
  });
}

export async function parseDwgOrDxfBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string,
  options: { wasmBasePath?: string } = {}
): Promise<ParsedDwgPlan> {
  const format = detectCadFormat(fileName);
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.byteLength === 0) {
    throw new Error('El archivo CAD está vacío.');
  }

  const libredwgMod = await import('@mlightcad/libredwg-web');
  const libredwg = await getLibreDwgInstance(options.wasmBasePath);

  const fileType =
    format === 'DWG'
      ? libredwgMod.Dwg_File_Type.DWG
      : libredwgMod.Dwg_File_Type.DXF;

  const exactArrayBuffer =
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
      ? (bytes.buffer as ArrayBuffer)
      : bytes.slice().buffer;

  const dataPtr = libredwg.dwg_read_data(exactArrayBuffer, fileType);
  if (!dataPtr) {
    throw new Error(
      `No se pudo decodificar "${fileName}". Verifica que sea un archivo ${format} válido y no esté corrupto.`
    );
  }

  try {
    const versionObj = libredwg.dwg_get_version_type(dataPtr);
    const { database: db, stats } = libredwg.convertEx(dataPtr);

    const modelSpaceBlock = db.tables?.BLOCK_RECORD?.entries?.find(
      (b) => b.name?.toUpperCase() === '*MODEL_SPACE'
    );
    const modelEntities = modelSpaceBlock?.entities?.length
      ? modelSpaceBlock.entities
      : db.entities || [];

    if (
      modelEntities.length === 0 &&
      (db.tables?.LAYER?.entries?.length ?? 0) === 0 &&
      (db.tables?.BLOCK_RECORD?.entries?.length ?? 0) === 0
    ) {
      throw new Error(
        `El archivo "${fileName}" no contiene entidades CAD reconocibles.`
      );
    }

    const layerCounts = new Map<string, number>();
    const entitySummary: Record<string, number> = {};

    for (const entity of modelEntities) {
      const layerName = entity.layer || '0';
      layerCounts.set(layerName, (layerCounts.get(layerName) ?? 0) + 1);
      const typeName = entity.type || 'OTRO';
      entitySummary[typeName] = (entitySummary[typeName] ?? 0) + 1;
    }

    const layerTableEntries = db.tables?.LAYER?.entries || [];
    const seenLayers = new Set<string>();
    const layers: DwgLayerInfo[] = [];

    for (const layerEntry of layerTableEntries) {
      const name = layerEntry.name || '0';
      if (seenLayers.has(name)) continue;
      seenLayers.add(name);
      layers.push({
        name,
        entityCount: layerCounts.get(name) ?? 0,
        colorHex: aciOrRgbToSwatchHex(layerEntry.colorIndex, layerEntry.color),
        off: Boolean(layerEntry.off),
        frozen: Boolean(layerEntry.frozen),
      });
    }

    for (const [layerName, count] of layerCounts.entries()) {
      if (!seenLayers.has(layerName)) {
        layers.push({
          name: layerName,
          entityCount: count,
          colorHex: '#64748B',
          off: false,
          frozen: false,
        });
      }
    }

    layers.sort((a, b) => b.entityCount - a.entityCount || a.name.localeCompare(b.name));

    const rawSvg = libredwg.dwg_to_svg(db);
    const viewBox = parseCadViewBox(rawSvg);
    const hasRenderableGeometry =
      viewBox.width > 0 &&
      viewBox.height > 0 &&
      /<(line|path|circle|ellipse|text|use)\b/i.test(rawSvg);

    const acadVer = db.header?.ACADVER || (typeof versionObj === 'string' ? versionObj : '');
    const version = VERSION_LABELS[acadVer] || acadVer || format;
    const insUnitsCode = Number(db.header?.INSUNITS ?? 0);
    const insUnitsLabel = INSUNITS_LABELS[insUnitsCode] || 'Unidades CAD';

    return {
      fileName,
      format,
      version,
      insUnitsLabel,
      db,
      rawSvg,
      viewBox,
      layers,
      entitySummary,
      totalEntities: modelEntities.length,
      unknownEntityCount: stats?.unknownEntityCount ?? 0,
      blocksCount: Math.max(0, (db.tables?.BLOCK_RECORD?.entries?.length ?? 1) - 1),
      hasRenderableGeometry,
    };
  } finally {
    libredwg.dwg_free(dataPtr);
  }
}

export async function parseDwgOrDxfFile(
  file: File,
  options: { wasmBasePath?: string } = {}
): Promise<ParsedDwgPlan> {
  const buffer = await file.arrayBuffer();
  return parseDwgOrDxfBuffer(buffer, file.name, options);
}

/**
 * Genera una planta arquitectónica de ejemplo en DXF ASCII válida (14.00m x 10.50m)
 * con capas reales: LINDERO, EJES, MUROS, PUERTAS_VENTANAS, COTAS y TEXTOS.
 */
export function buildSampleArchitecturalDxfContent(): string {
  const lines: Array<[number, string | number]> = [];
  const push = (code: number, value: string | number) => {
    lines.push([code, value]);
  };

  // HEADER
  push(0, 'SECTION');
  push(2, 'HEADER');
  push(9, '$ACADVER');
  push(1, 'AC1015');
  push(9, '$INSUNITS');
  push(70, 6); // Metros
  push(0, 'ENDSEC');

  // TABLES (LAYERS)
  push(0, 'SECTION');
  push(2, 'TABLES');
  push(0, 'TABLE');
  push(2, 'LAYER');
  push(70, 7);

  const addLayer = (name: string, aci: number) => {
    push(0, 'LAYER');
    push(2, name);
    push(70, 0);
    push(62, aci);
    push(6, 'CONTINUOUS');
  };
  addLayer('0', 7);
  addLayer('LINDERO', 1);
  addLayer('EJES', 8);
  addLayer('MUROS', 7);
  addLayer('PUERTAS_VENTANAS', 4);
  addLayer('COTAS', 2);
  addLayer('TEXTOS', 3);

  push(0, 'ENDTAB');
  push(0, 'ENDSEC');

  // ENTITIES
  push(0, 'SECTION');
  push(2, 'ENTITIES');

  const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number, aci?: number) => {
    push(0, 'LINE');
    push(8, layer);
    if (aci !== undefined) push(62, aci);
    push(10, x1);
    push(20, y1);
    push(30, 0);
    push(11, x2);
    push(21, y2);
    push(31, 0);
  };

  const addRect = (layer: string, x1: number, y1: number, x2: number, y2: number, aci?: number) => {
    addLine(layer, x1, y1, x2, y1, aci);
    addLine(layer, x2, y1, x2, y2, aci);
    addLine(layer, x2, y2, x1, y2, aci);
    addLine(layer, x1, y2, x1, y1, aci);
  };

  const addArc = (
    layer: string,
    cx: number,
    cy: number,
    r: number,
    startDeg: number,
    endDeg: number,
    aci?: number
  ) => {
    push(0, 'ARC');
    push(8, layer);
    if (aci !== undefined) push(62, aci);
    push(10, cx);
    push(20, cy);
    push(30, 0);
    push(40, r);
    push(50, startDeg);
    push(51, endDeg);
  };

  const addCircle = (layer: string, cx: number, cy: number, r: number, aci?: number) => {
    push(0, 'CIRCLE');
    push(8, layer);
    if (aci !== undefined) push(62, aci);
    push(10, cx);
    push(20, cy);
    push(30, 0);
    push(40, r);
  };

  const addText = (
    layer: string,
    x: number,
    y: number,
    height: number,
    value: string,
    aci?: number
  ) => {
    push(0, 'TEXT');
    push(8, layer);
    if (aci !== undefined) push(62, aci);
    push(10, x);
    push(20, y);
    push(30, 0);
    push(40, height);
    push(1, value);
  };

  // Lindero de parcela (16m x 13m)
  addRect('LINDERO', -1, -1.5, 15, 11.5, 1);

  // Ejes estructurales
  for (const x of [0, 6.5, 14]) {
    addLine('EJES', x, -0.8, x, 11, 8);
    addCircle('EJES', x, 11.25, 0.25, 8);
  }
  for (const y of [0, 5.2, 10.5]) {
    addLine('EJES', -0.8, y, 14.5, y, 8);
    addCircle('EJES', -1.05, y, 0.25, 8);
  }

  // Muros perimetrales exteriores (espesor 0.20m)
  addRect('MUROS', 0, 0, 14, 10.5, 7);
  addRect('MUROS', 0.2, 0.2, 13.8, 10.3, 7);

  // Muro divisorio central vertical (Sala/Cocina vs Dormitorios)
  addLine('MUROS', 6.5, 0.2, 6.5, 6.2, 7);
  addLine('MUROS', 6.65, 0.2, 6.65, 6.2, 7);
  addLine('MUROS', 6.5, 7.2, 6.5, 10.3, 7);
  addLine('MUROS', 6.65, 7.2, 6.65, 10.3, 7);

  // Muro horizontal cocina/terraza y bano/dormitorio
  addLine('MUROS', 0.2, 5.2, 3.8, 5.2, 7);
  addLine('MUROS', 0.2, 5.35, 3.8, 5.35, 7);
  addLine('MUROS', 6.65, 4.4, 10.2, 4.4, 7);
  addLine('MUROS', 6.65, 4.55, 10.2, 4.55, 7);
  addLine('MUROS', 11.2, 4.4, 13.8, 4.4, 7);
  addLine('MUROS', 11.2, 4.55, 13.8, 4.55, 7);

  // Puertas (arco + hoja) y Ventanas
  addLine('PUERTAS_VENTANAS', 6.65, 6.2, 7.55, 6.2, 4);
  addArc('PUERTAS_VENTANAS', 6.65, 6.2, 0.9, 0, 90, 4);
  addLine('PUERTAS_VENTANAS', 10.2, 4.4, 10.2, 3.5, 4);
  addArc('PUERTAS_VENTANAS', 10.2, 4.4, 0.9, 270, 360, 4);
  // Ventana frontal Sala
  addRect('PUERTAS_VENTANAS', 1.8, 0.05, 4.8, 0.15, 4);
  // Ventana Dormitorio
  addRect('PUERTAS_VENTANAS', 8.5, 10.35, 11.8, 10.45, 4);

  // Cotas generales
  addLine('COTAS', 0, -0.5, 14, -0.5, 2);
  addLine('COTAS', 0, -0.7, 0, -0.3, 2);
  addLine('COTAS', 14, -0.7, 14, -0.3, 2);
  addLine('COTAS', 14.5, 0, 14.5, 10.5, 2);
  addLine('COTAS', 14.3, 0, 14.7, 0, 2);
  addLine('COTAS', 14.3, 10.5, 14.7, 10.5, 2);

  // Textos / Etiquetas
  addText('TEXTOS', 1.1, 2.6, 0.38, 'SALA / COMEDOR', 3);
  addText('TEXTOS', 1.2, 7.8, 0.35, 'COCINA + TERRAZA', 3);
  addText('TEXTOS', 8.1, 7.4, 0.36, 'DORMITORIO PRINCIPAL', 3);
  addText('TEXTOS', 8.4, 2.2, 0.34, 'BANO + ESTUDIO', 3);
  addText('TEXTOS', 6.1, -0.95, 0.3, '14.00 m', 2);
  addText('TEXTOS', 14.8, 5.1, 0.3, '10.50 m', 2);
  addText('TEXTOS', 0.2, 12.1, 0.42, 'PLANTA ARQUITECTONICA NIVEL 1 (EJEMPLO SIRIUS)', 3);

  push(0, 'ENDSEC');
  push(0, 'EOF');

  return lines.map(([code, val]) => `${code}\n${val}`).join('\n') + '\n';
}

export function buildSampleArchitecturalDxfFile(): File {
  const dxf = buildSampleArchitecturalDxfContent();
  return new File([dxf], 'Planta_Arquitectonica_Ejemplo.dxf', {
    type: 'application/dxf',
  });
}
