import { describe, expect, it } from 'vitest';
import {
  adaptCadSvg,
  buildSampleArchitecturalDxfContent,
  detectCadFormat,
  parseCadViewBox,
  parseDwgOrDxfBuffer,
  renderDwgPlanSvg,
  unionViewBoxes,
  type DwgParseProgress,
} from '../../utils/dwgParser';

describe('Visor CAD DWG/DXF (Arquitectura)', () => {
  it('detecta formatos DWG y DXF y rechaza extensiones no soportadas', () => {
    expect(detectCadFormat('Planta_Nivel1.dwg')).toBe('DWG');
    expect(detectCadFormat('ESQUEMA_VIAL.DXF')).toBe('DXF');
    expect(() => detectCadFormat('parcela.kmz')).toThrow(/Formato no compatible/);
    expect(() => detectCadFormat('plano.pdf')).toThrow(/Formato no compatible/);
  });

  it('une múltiples viewBox válidos e ignora los vacíos', () => {
    const merged = unionViewBoxes([
      { x: 0, y: 0, width: 0, height: 0 },
      { x: 2, y: -10, width: 8, height: 6 },
      { x: -1, y: -15, width: 15, height: 20 },
    ]);
    expect(merged).toEqual({ x: -1, y: -15, width: 15, height: 20 });
  });

  it('adapta colores y grosores de SVG CAD segun tema oscuro, cianotipo y blanco', () => {
    const sampleSvg =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50" width="100%" height="100%">' +
      '<g stroke="#000000" stroke-width="0.1%" fill="none" transform="matrix(1,0,0,-1,0,0)">' +
      '<g id="1" stroke="rgb(255,255,255)" fill="none"><line x1="0" y1="0" x2="100" y2="50" /></g>' +
      '<g id="2" stroke="rgb(0,0,0)" fill="none"><line x1="0" y1="50" x2="100" y2="0" /></g>' +
      '</g></svg>';

    const darkRes = adaptCadSvg(sampleSvg, { theme: 'dark', strokeMode: 'thick' });
    expect(darkRes.hasGeometry).toBe(true);
    expect(darkRes.svg).toContain('stroke-width="0.26%"');
    expect(darkRes.svg).toContain('#E2E8F0');
    expect(darkRes.svg).toContain('#F8FAFC');

    const lightRes = adaptCadSvg(sampleSvg, { theme: 'light', strokeMode: 'thin' });
    expect(lightRes.hasGeometry).toBe(true);
    expect(lightRes.svg).toContain('stroke-width="0.06%"');
    expect(lightRes.svg).toContain('#0F172A');

    const bpRes = adaptCadSvg(sampleSvg, { theme: 'blueprint', strokeMode: 'normal' });
    expect(bpRes.hasGeometry).toBe(true);
    expect(bpRes.svg).toContain('#E0F2FE');

    const vb = parseCadViewBox(darkRes.svg);
    expect(vb.width).toBeCloseTo(108, 4);
    expect(vb.height).toBeCloseTo(54, 4);
  });

  it('decodifica progresivamente por capas via LibreDWG WASM, emite parciales y permite toggle/encuadre instantaneo', async () => {
    const dxfContent = buildSampleArchitecturalDxfContent();
    const buffer = new TextEncoder().encode(dxfContent);
    const progressEvents: DwgParseProgress[] = [];

    const parsed = await parseDwgOrDxfBuffer(buffer, 'Planta_Arquitectonica_Ejemplo.dxf', {
      wasmBasePath: './public/wasm',
      onProgress: (ev) => progressEvents.push(ev),
    });

    expect(progressEvents.some((e) => e.stage === 'reading')).toBe(true);
    expect(progressEvents.some((e) => e.stage === 'decoding')).toBe(true);
    expect(progressEvents.some((e) => e.stage === 'indexing' && Boolean(e.partialSvg))).toBe(true);
    expect(progressEvents[progressEvents.length - 1]?.stage).toBe('done');
    expect(progressEvents[progressEvents.length - 1]?.percent).toBe(100);

    expect(parsed.format).toBe('DXF');
    expect(parsed.version).toBeTruthy();
    expect(parsed.insUnitsLabel).toContain('Metros');
    expect(parsed.hasRenderableGeometry).toBe(true);
    expect(parsed.viewBox.width).toBeGreaterThan(10);
    expect(parsed.viewBox.height).toBeGreaterThan(10);
    expect(parsed.totalEntities).toBeGreaterThan(20);
    expect(Object.keys(parsed.layerBuckets)).toContain('MUROS');
    expect(Object.keys(parsed.layerBuckets)).toContain('TEXTOS');

    const layerNames = parsed.layers.map((l) => l.name);
    expect(layerNames).toContain('MUROS');
    expect(layerNames).toContain('PUERTAS_VENTANAS');
    expect(layerNames).toContain('EJES');
    expect(layerNames).toContain('TEXTOS');

    const fullRender = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(),
      theme: 'dark',
      strokeMode: 'normal',
      wasmBasePath: './public/wasm',
    });
    expect(fullRender.hasGeometry).toBe(true);
    expect(fullRender.svg).toContain('SALA / COMEDOR');
    expect(fullRender.svg).toContain('data-cad-layer="MUROS"');

    // Ocultando capa TEXTOS ya no aparecen los rótulos de texto
    const noTextRender = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(['TEXTOS']),
      theme: 'light',
      strokeMode: 'normal',
      wasmBasePath: './public/wasm',
    });
    expect(noTextRender.hasGeometry).toBe(true);
    expect(noTextRender.svg).not.toContain('SALA / COMEDOR');

    // Aislando solo MUROS con fitToVisibleLayers encuadra al tamaño exacto de muros (14m < 16m de lindero)
    const murosOnly = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(layerNames.filter((n) => n !== 'MUROS')),
      fitToVisibleLayers: true,
      theme: 'dark',
    });
    expect(murosOnly.hasGeometry).toBe(true);
    expect(murosOnly.viewBox.width).toBeLessThan(fullRender.viewBox.width);

    // Ocultando todas las capas queda sin geometría renderizable
    const allHiddenRender = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(layerNames),
      theme: 'dark',
      strokeMode: 'normal',
      wasmBasePath: './public/wasm',
    });
    expect(allHiddenRender.hasGeometry).toBe(false);
  });

  it('permite cancelar la carga progresiva mediante AbortSignal', async () => {
    const controller = new AbortController();
    controller.abort();
    const dxfContent = buildSampleArchitecturalDxfContent();
    const buffer = new TextEncoder().encode(dxfContent);

    await expect(
      parseDwgOrDxfBuffer(buffer, 'Planta_Arquitectonica_Ejemplo.dxf', {
        wasmBasePath: './public/wasm',
        signal: controller.signal,
      })
    ).rejects.toThrow(/cancelada/);
  });

  it('rechaza archivos DWG vacios o corruptos con mensaje claro', async () => {
    await expect(
      parseDwgOrDxfBuffer(new Uint8Array(0), 'vacio.dwg', { wasmBasePath: './public/wasm' })
    ).rejects.toThrow(/vacío/);

    const corruptBytes = new TextEncoder().encode('ESTO NO ES UN ARCHIVO DWG VALIDO');
    await expect(
      parseDwgOrDxfBuffer(corruptBytes, 'corrupto.dwg', { wasmBasePath: './public/wasm' })
    ).rejects.toThrow(/no contiene entidades CAD|No se pudo decodificar/);
  });
});
