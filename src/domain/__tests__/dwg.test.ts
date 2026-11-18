import { describe, expect, it } from 'vitest';
import {
  adaptCadSvg,
  buildSampleArchitecturalDxfContent,
  detectCadFormat,
  parseDwgOrDxfBuffer,
  renderDwgPlanSvg,
} from '../../utils/dwgParser';

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -10 100 50" width="100%" height="100%"><g stroke="#000000" stroke-width="0.1%" fill="none" transform="matrix(1,0,0,-1,0,0)"><g stroke="rgb(255,255,255)" fill="none"><line x1="0" y1="0" x2="100" y2="0" /></g></g></svg>`;

describe('Visor de Planos Arquitectónicos (.DWG / .DXF)', () => {
  it('detecta formatos válidos .dwg y .dxf y rechaza otros', () => {
    expect(detectCadFormat('planta_nivel_1.DWG')).toBe('DWG');
    expect(detectCadFormat('fachada_norte.dxf')).toBe('DXF');
    expect(() => detectCadFormat('parcela.kmz')).toThrow(/Formato no compatible/i);
  });

  it('adapta colores y grosor de trazo del SVG según tema CAD', () => {
    const dark = adaptCadSvg(SAMPLE_SVG, { theme: 'dark', strokeMode: 'thick' });
    expect(dark.hasGeometry).toBe(true);
    expect(dark.svg).toContain('stroke-width="0.26%"');
    expect(dark.svg).toContain('#F8FAFC');

    const light = adaptCadSvg(SAMPLE_SVG, { theme: 'light', strokeMode: 'thin' });
    expect(light.hasGeometry).toBe(true);
    expect(light.svg).toContain('stroke-width="0.06%"');
    expect(light.svg).toContain('#0F172A');

    const empty = adaptCadSvg('<svg viewBox="0 0 0 0"></svg>');
    expect(empty.hasGeometry).toBe(false);
  });

  it('decodifica un plano arquitectónico DXF completo con LibreDWG WASM, capas y filtrado', async () => {
    const dxfContent = buildSampleArchitecturalDxfContent();
    const bytes = new TextEncoder().encode(dxfContent);

    const parsed = await parseDwgOrDxfBuffer(bytes, 'Planta_Arquitectonica_Ejemplo.dxf', {
      wasmBasePath: './public/wasm',
    });

    expect(parsed.format).toBe('DXF');
    expect(parsed.insUnitsLabel).toBe('Metros (m)');
    expect(parsed.hasRenderableGeometry).toBe(true);
    expect(parsed.totalEntities).toBeGreaterThan(20);
    expect(parsed.viewBox.width).toBeGreaterThan(10);
    expect(parsed.viewBox.height).toBeGreaterThan(10);

    const layerNames = parsed.layers.map((l) => l.name);
    expect(layerNames).toEqual(
      expect.arrayContaining(['LINDERO', 'EJES', 'MUROS', 'PUERTAS_VENTANAS', 'COTAS', 'TEXTOS'])
    );

    const fullRender = await renderDwgPlanSvg(parsed, {
      theme: 'blueprint',
      strokeMode: 'normal',
      wasmBasePath: './public/wasm',
    });
    expect(fullRender.hasGeometry).toBe(true);
    expect(fullRender.svg).toContain('SALA / COMEDOR');

    // Ocultar capa TEXTOS debe excluir los textos pero conservar la geometría constructiva
    const withoutTexts = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(['TEXTOS']),
      theme: 'dark',
      wasmBasePath: './public/wasm',
    });
    expect(withoutTexts.hasGeometry).toBe(true);
    expect(withoutTexts.svg).not.toContain('SALA / COMEDOR');

    // Ocultar todas las capas debe informar sin geometría visible
    const allHidden = await renderDwgPlanSvg(parsed, {
      hiddenLayers: new Set(layerNames),
      wasmBasePath: './public/wasm',
    });
    expect(allHidden.hasGeometry).toBe(false);
  });

  it('rechaza archivos .dwg corruptos o vacíos con error claro', async () => {
    await expect(
      parseDwgOrDxfBuffer(new Uint8Array(0), 'vacio.dwg', {
        wasmBasePath: './public/wasm',
      })
    ).rejects.toThrow(/vacío/i);

    const garbage = new TextEncoder().encode('ESTO_NO_ES_UN_DWG_BINARIO_VALIDO');
    await expect(
      parseDwgOrDxfBuffer(garbage, 'corrupto.dwg', {
        wasmBasePath: './public/wasm',
      })
    ).rejects.toThrow(/No se pudo decodificar/i);
  });
});
