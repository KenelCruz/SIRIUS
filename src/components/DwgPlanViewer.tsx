import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Trash2,
  UploadCloud,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildSampleArchitecturalDxfFile,
  parseDwgOrDxfFile,
  renderDwgPlanSvg,
  type CadStrokeMode,
  type CadTheme,
  type DwgViewBox,
  type ParsedDwgPlan,
} from '../utils/dwgParser';

interface DwgPlanViewerProps {
  plan?: ParsedDwgPlan | null;
  onPlanLoaded?: (plan: ParsedDwgPlan | null) => void;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

const THEME_CONFIG: Record<
  CadTheme,
  { label: string; bgHex: string; gridColor: string; textClass: string }
> = {
  dark: {
    label: 'CAD Oscuro',
    bgHex: '#0B1320',
    gridColor: 'rgba(148, 163, 184, 0.12)',
    textClass: 'text-[#E2E8F0]',
  },
  blueprint: {
    label: 'Cianotipo',
    bgHex: '#0C2D48',
    gridColor: 'rgba(125, 211, 252, 0.14)',
    textClass: 'text-[#E0F2FE]',
  },
  light: {
    label: 'Plano Blanco',
    bgHex: '#FFFFFF',
    gridColor: 'rgba(15, 41, 66, 0.08)',
    textClass: 'text-[#0F172A]',
  },
};

export const DwgPlanViewer: React.FC<DwgPlanViewerProps> = ({
  plan: controlledPlan,
  onPlanLoaded,
  compact = false,
  title = 'Visor de Planos Arquitectónicos (.DWG / .DXF)',
  subtitle = 'Renderizado vectorial local (LibreDWG WebAssembly) con control de capas, zoom, paneo y exportación.',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [internalPlan, setInternalPlan] = useState<ParsedDwgPlan | null>(null);
  const activePlan = controlledPlan !== undefined ? controlledPlan : internalPlan;

  const setActivePlan = (next: ParsedDwgPlan | null) => {
    if (controlledPlan === undefined) {
      setInternalPlan(next);
    }
    onPlanLoaded?.(next);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [theme, setTheme] = useState<CadTheme>('dark');
  const [strokeMode, setStrokeMode] = useState<CadStrokeMode>('normal');
  const [showGrid, setShowGrid] = useState(true);
  const [showLayersPanel, setShowLayersPanel] = useState(!compact);
  const [isExpanded, setIsExpanded] = useState(false);

  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(new Set());
  const [renderedSvg, setRenderedSvg] = useState<string>('');
  const [renderedViewBox, setRenderedViewBox] = useState<DwgViewBox>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const [hasGeometry, setHasGeometry] = useState(false);

  // Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);

  // Reset hidden layers & pan/zoom when plan changes
  useEffect(() => {
    if (!activePlan) {
      setHiddenLayers(new Set());
      setRenderedSvg('');
      setHasGeometry(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    // Respect layers marked OFF or FROZEN initially only if drawing has other active layers
    const offByDefault = new Set(
      activePlan.layers.filter((l) => l.off || l.frozen).map((l) => l.name)
    );
    const hasAnyVisible = activePlan.layers.some((l) => !offByDefault.has(l.name));
    setHiddenLayers(hasAnyVisible ? offByDefault : new Set());
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [activePlan]);

  // Re-render SVG whenever plan, hiddenLayers, theme, or strokeMode change
  useEffect(() => {
    let alive = true;
    if (!activePlan) return;

    renderDwgPlanSvg(activePlan, {
      hiddenLayers,
      theme,
      strokeMode,
    })
      .then((res) => {
        if (!alive) return;
        setRenderedSvg(res.svg);
        setRenderedViewBox(res.viewBox);
        setHasGeometry(res.hasGeometry);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Error al renderizar las capas del plano CAD.'
        );
      });

    return () => {
      alive = false;
    };
  }, [activePlan, hiddenLayers, theme, strokeMode]);

  const handleFile = async (file: File) => {
    setErrorMsg(null);
    setIsLoading(true);
    try {
      const parsed = await parseDwgOrDxfFile(file);
      setActivePlan(parsed);
    } catch (err: unknown) {
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo .DWG / .DXF.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadSample = async () => {
    const sampleFile = buildSampleArchitecturalDxfFile();
    await handleFile(sampleFile);
  };

  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomBy = (factor: number) => {
    setZoom((prev) => Math.min(20, Math.max(0.25, Number((prev * factor).toFixed(3)))));
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!activePlan) return;
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 0.88;
    setZoom((prev) => Math.min(20, Math.max(0.25, Number((prev * factor).toFixed(3)))));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!activePlan || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const toggleLayer = (layerName: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerName)) {
        next.delete(layerName);
      } else {
        next.add(layerName);
      }
      return next;
    });
  };

  const buildExportableSvgString = (widthPx = 1800): { svgText: string; width: number; height: number } => {
    const vb = renderedViewBox.width > 0 && renderedViewBox.height > 0
      ? renderedViewBox
      : { x: 0, y: 0, width: 1000, height: 700 };
    const aspect = vb.height / vb.width;
    const heightPx = Math.max(400, Math.min(2800, Math.round(widthPx * aspect)));
    const bgHex = THEME_CONFIG[theme].bgHex;

    let out = renderedSvg
      .replace(/width="100%"/i, `width="${widthPx}"`)
      .replace(/height="100%"/i, `height="${heightPx}"`);

    // Inject background rect right after opening <svg ...> tag
    out = out.replace(
      /(<svg\b[^>]*>)/i,
      `$1\n  <rect x="${vb.x - vb.width * 0.2}" y="${vb.y - vb.height * 0.2}" width="${
        vb.width * 1.4
      }" height="${vb.height * 1.4}" fill="${bgHex}" />`
    );
    return { svgText: out, width: widthPx, height: heightPx };
  };

  const handleExportSvg = () => {
    if (!activePlan || !renderedSvg) return;
    const { svgText } = buildExportableSvgString(1800);
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const baseName = activePlan.fileName.replace(/\.(dwg|dxf)$/i, '');
    a.href = url;
    a.download = `${baseName}_plano.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPng = () => {
    if (!activePlan || !renderedSvg) return;
    const { svgText, width, height } = buildExportableSvgString(1800);
    const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    const img = new window.Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = THEME_CONFIG[theme].bgHex;
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const pngUrl = canvas.toDataURL('image/png');
        const a = document.createElement('a');
        const baseName = activePlan.fileName.replace(/\.(dwg|dxf)$/i, '');
        a.href = pngUrl;
        a.download = `${baseName}_plano.png`;
        a.click();
      }
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrorMsg('No se pudo exportar la imagen PNG del plano.');
    };

    img.src = url;
  };

  const visibleLayerCount = useMemo(() => {
    if (!activePlan) return 0;
    return activePlan.layers.filter((l) => !hiddenLayers.has(l.name)).length;
  }, [activePlan, hiddenLayers]);

  const entityChips = useMemo(() => {
    if (!activePlan) return [];
    return Object.entries(activePlan.entitySummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [activePlan]);

  const themeCfg = THEME_CONFIG[theme];

  return (
    <div className="rounded-md border border-[#CBD5E1] bg-white overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#0F2942] text-white">
            <Compass className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs sm:text-sm font-bold text-[#0F2942] truncate">{title}</h3>
            <p className="text-[11px] text-[#43474D] truncate">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".dwg,.dxf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#0F2942] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-60 transition-colors min-h-[34px]"
          >
            <UploadCloud className="h-3.5 w-3.5" />
            {activePlan ? 'Abrir otro .DWG / .DXF' : 'Cargar plano .DWG / .DXF'}
          </button>

          {!activePlan && (
            <button
              type="button"
              onClick={handleLoadSample}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] disabled:opacity-60 transition-colors min-h-[34px]"
            >
              <FileCode2 className="h-3.5 w-3.5 text-[#0284C7]" />
              Plano de ejemplo
            </button>
          )}

          {activePlan && (
            <button
              type="button"
              onClick={() => {
                setActivePlan(null);
                setErrorMsg(null);
              }}
              className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#64748B] hover:text-[#DC2626] hover:border-[#FCA5A5] min-h-[34px]"
              title="Quitar plano actual"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 border-b border-[#FCA5A5] bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#991B1B]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#DC2626]" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Empty / Dropzone State */}
      {!activePlan && !isLoading && (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
          onClick={() => fileInputRef.current?.click()}
          className="m-4 cursor-pointer rounded-sm border-2 border-dashed border-[#0284C7]/60 bg-[#F8FAFC] p-8 text-center hover:bg-[#EFF4FF] transition-colors"
        >
          <UploadCloud className="mx-auto h-9 w-9 text-[#0284C7]" />
          <div className="mt-2.5 text-sm font-bold text-[#0F2942]">
            Arrastra un plano AutoCAD (.DWG o .DXF) o haz clic para seleccionarlo
          </div>
          <p className="mt-1 text-xs text-[#43474D] max-w-xl mx-auto">
            Compatible con versiones AutoCAD R12 hasta 2018+ (2D arquitectura, plantas, ejes, cotas y linderos). Procesado 100% en tu navegador sin subir archivos a servidores externos.
          </p>
        </div>
      )}

      {/* Loading WASM State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center gap-2.5 py-14 px-4 bg-[#0B1320] text-white">
          <Loader2 className="h-7 w-7 animate-spin text-[#38BDF8]" />
          <div className="text-xs font-semibold">
            Decodificando geometría CAD (.DWG / .DXF)...
          </div>
          <div className="text-[11px] text-[#94A3B8]">
            Inicializando motor vectorial LibreDWG WebAssembly
          </div>
        </div>
      )}

      {/* Active CAD Viewer */}
      {activePlan && !isLoading && (
        <>
          {/* Metadata Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 border-b border-[#E2E8F0] bg-white divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] text-xs">
            <div className="px-3.5 py-2 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Archivo ({activePlan.format})
              </div>
              <div className="mt-0.5 font-bold text-[#0F2942] truncate" title={activePlan.fileName}>
                {activePlan.fileName}
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Versión CAD
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-semibold text-[#0D1C2F] truncate">
                {activePlan.version}
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Dimensiones Dibujo
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-semibold text-[#0284C7] tabular-nums">
                {activePlan.viewBox.width > 0
                  ? `${activePlan.viewBox.width.toFixed(2)} × ${activePlan.viewBox.height.toFixed(2)}`
                  : 'N/D'}{' '}
                <span className="text-[#64748B] font-normal">({activePlan.insUnitsLabel})</span>
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Entidades / Bloques
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-semibold text-[#0D1C2F] tabular-nums">
                {activePlan.totalEntities.toLocaleString('en-US')} ent. · {activePlan.blocksCount} blq.
              </div>
            </div>

            <div className="px-3.5 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                Capas Activas
              </div>
              <div className="mt-0.5 font-mono text-[11px] font-semibold text-[#0D1C2F] tabular-nums">
                {visibleLayerCount} / {activePlan.layers.length} visibles
              </div>
            </div>
          </div>

          {/* Canvas Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E3A5F] bg-[#0F2942] px-3 py-2 text-white text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {/* Theme Switcher */}
              <div className="inline-flex rounded-sm bg-[#091A2C] p-0.5">
                {(['dark', 'blueprint', 'light'] as CadTheme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTheme(t)}
                    className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                      theme === t ? 'bg-[#0284C7] text-white' : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {THEME_CONFIG[t].label}
                  </button>
                ))}
              </div>

              {/* Stroke Weight */}
              <div className="inline-flex rounded-sm bg-[#091A2C] p-0.5">
                {(
                  [
                    { id: 'thin', label: 'Trazo fino' },
                    { id: 'normal', label: 'Normal' },
                    { id: 'thick', label: 'Grueso' },
                  ] as Array<{ id: CadStrokeMode; label: string }>
                ).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStrokeMode(s.id)}
                    className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                      strokeMode === s.id
                        ? 'bg-[#D97706] text-white'
                        : 'text-[#94A3B8] hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setShowGrid((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  showGrid
                    ? 'border-[#38BDF8] bg-[#0284C7]/25 text-[#E0F2FE]'
                    : 'border-[#334155] bg-[#091A2C] text-[#94A3B8]'
                }`}
                title="Mostrar u ocultar cuadrícula de referencia"
              >
                <Grid3X3 className="h-3.5 w-3.5" />
                Cuadrícula
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {/* Zoom & Fit Controls */}
              <div className="inline-flex items-center rounded-sm bg-[#091A2C] border border-[#1E3A5F]">
                <button
                  type="button"
                  onClick={() => handleZoomBy(0.8)}
                  className="px-2 py-1 text-[#CBD5E1] hover:text-white"
                  aria-label="Alejar plano"
                  title="Alejar"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="px-1.5 font-mono text-[11px] text-[#93CCFF] tabular-nums min-w-[46px] text-center">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => handleZoomBy(1.25)}
                  className="px-2 py-1 text-[#CBD5E1] hover:text-white"
                  aria-label="Acercar plano"
                  title="Acercar"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetView}
                  className="border-l border-[#1E3A5F] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white inline-flex items-center gap-1"
                  title="Centrar y ajustar vista"
                >
                  <RotateCcw className="h-3 w-3" />
                  Ajustar
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowLayersPanel((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-sm border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  showLayersPanel
                    ? 'border-[#38BDF8] bg-[#0284C7] text-white'
                    : 'border-[#334155] bg-[#091A2C] text-[#CBD5E1] hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                Capas ({activePlan.layers.length})
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white"
                title={isExpanded ? 'Reducir altura del visor' : 'Ampliar altura del visor'}
              >
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>

              <button
                type="button"
                onClick={handleExportSvg}
                disabled={!hasGeometry}
                className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white disabled:opacity-40"
                title="Descargar SVG vectorial"
              >
                <Download className="h-3.5 w-3.5" />
                SVG
              </button>

              <button
                type="button"
                onClick={handleExportPng}
                disabled={!hasGeometry}
                className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white disabled:opacity-40"
                title="Descargar imagen PNG"
              >
                <ImageIcon className="h-3.5 w-3.5" />
                PNG
              </button>
            </div>
          </div>

          {/* Main Split: CAD Viewport + Optional Layers Drawer */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div
              className={`${
                showLayersPanel ? 'lg:col-span-9' : 'lg:col-span-12'
              } relative overflow-hidden select-none`}
              style={{
                backgroundColor: themeCfg.bgHex,
                backgroundImage: showGrid
                  ? `linear-gradient(to right, ${themeCfg.gridColor} 1px, transparent 1px), linear-gradient(to bottom, ${themeCfg.gridColor} 1px, transparent 1px)`
                  : undefined,
                backgroundSize: showGrid ? '28px 28px' : undefined,
              }}
            >
              <div
                ref={viewportRef}
                onWheel={handleWheel}
                onDoubleClick={handleResetView}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFile(f);
                }}
                className={`w-full flex items-center justify-center overflow-hidden ${
                  isExpanded
                    ? 'h-[540px] sm:h-[640px]'
                    : compact
                    ? 'h-[320px] sm:h-[380px]'
                    : 'h-[400px] sm:h-[500px]'
                } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                {hasGeometry ? (
                  <div
                    className="w-full h-full flex items-center justify-center p-4 transition-transform duration-75"
                    style={{
                      transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                      transformOrigin: 'center center',
                    }}
                    dangerouslySetInnerHTML={{ __html: renderedSvg }}
                  />
                ) : (
                  <div
                    className={`max-w-md mx-auto text-center px-6 py-8 rounded-sm border border-dashed ${
                      theme === 'light'
                        ? 'border-[#CBD5E1] bg-[#F8FAFC]'
                        : 'border-[#334155] bg-[#0F172A]/80'
                    } ${themeCfg.textClass}`}
                  >
                    <AlertTriangle className="mx-auto h-7 w-7 text-[#F59E0B]" />
                    <div className="mt-2 text-xs font-bold">
                      {visibleLayerCount === 0
                        ? 'Todas las capas están ocultas'
                        : 'No hay geometría 2D visible en el Espacio Modelo'}
                    </div>
                    <p className="mt-1 text-[11px] opacity-80">
                      {visibleLayerCount === 0
                        ? 'Activa al menos una capa en el panel lateral para visualizar el plano.'
                        : 'Este archivo podría contener únicamente vistas de Papel (Layout), sólidos 3D o proxies propietarios.'}
                    </p>
                  </div>
                )}
              </div>

              {/* Corner CAD Hint */}
              <div className="pointer-events-none absolute bottom-2.5 left-3 rounded-sm bg-[#0F2942]/90 px-2.5 py-1 font-mono text-[10px] text-[#CBD5E1] shadow">
                Arrastra para mover · Rueda para zoom · Doble clic para centrar
              </div>
            </div>

            {showLayersPanel && (
              <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-[#CBD5E1] bg-[#F8FAFC] flex flex-col max-h-[500px]">
                <div className="flex items-center justify-between border-b border-[#E2E8F0] px-3 py-2.5 bg-white">
                  <span className="text-xs font-bold text-[#0F2942]">Capas del Plano</span>
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setHiddenLayers(new Set())}
                      className="font-semibold text-[#0284C7] hover:underline"
                    >
                      Todas
                    </button>
                    <span className="text-[#CBD5E1]">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setHiddenLayers(new Set(activePlan.layers.map((l) => l.name)))
                      }
                      className="font-semibold text-[#64748B] hover:underline"
                    >
                      Ninguna
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                  {activePlan.layers.map((layer) => {
                    const isHidden = hiddenLayers.has(layer.name);
                    return (
                      <button
                        key={layer.name}
                        type="button"
                        onClick={() => toggleLayer(layer.name)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors ${
                          isHidden
                            ? 'bg-[#F1F5F9] text-[#94A3B8]'
                            : 'bg-white text-[#0D1C2F] hover:bg-[#EFF4FF]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0 border border-black/15"
                            style={{ backgroundColor: layer.colorHex }}
                          />
                          <span className="truncate font-medium">{layer.name}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-mono text-[10px] text-[#64748B] tabular-nums">
                            {layer.entityCount}
                          </span>
                          {isHidden ? (
                            <EyeOff className="h-3.5 w-3.5 text-[#94A3B8]" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-[#0284C7]" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>
            )}
          </div>

          {/* Footer Entity Summary */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2 text-[11px] text-[#43474D]">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-[#0F2942]">Entidades:</span>
              {entityChips.length > 0 ? (
                entityChips.map(([type, count]) => (
                  <span
                    key={type}
                    className="rounded-sm border border-[#CBD5E1] bg-white px-1.5 py-0.5 font-mono text-[10px] text-[#334155]"
                  >
                    {type}: {count}
                  </span>
                ))
              ) : (
                <span>Sin resumen</span>
              )}
              {activePlan.unknownEntityCount > 0 && (
                <span className="font-mono text-[10px] text-[#B45309]">
                  ({activePlan.unknownEntityCount} objetos no estándar omitidos)
                </span>
              )}
            </div>
            <span className="font-mono text-[10px] text-[#64748B]">
              LibreDWG WASM · Procesamiento Local
            </span>
          </div>
        </>
      )}
    </div>
  );
};
