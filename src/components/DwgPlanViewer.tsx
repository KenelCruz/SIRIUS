import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Compass,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  Grid3X3,
  Image as ImageIcon,
  Layers,
  Loader2,
  Map as MapIcon,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
  Trash2,
  UploadCloud,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  adaptCadSvg,
  buildSampleArchitecturalDxfFile,
  parseDwgOrDxfFile,
  renderDwgPlanSvg,
  type CadStrokeMode,
  type CadTheme,
  type DwgParseProgress,
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

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 40;
const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4, 8];

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

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value.toFixed(4))));
}

export const DwgPlanViewer: React.FC<DwgPlanViewerProps> = ({
  plan: controlledPlan,
  onPlanLoaded,
  compact = false,
  title = 'Visor de Planos Arquitectónicos (.DWG / .DXF)',
  subtitle = 'Carga progresiva WebAssembly con zoom de precisión, paneo táctil/ratón y control de capas.',
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [internalPlan, setInternalPlan] = useState<ParsedDwgPlan | null>(null);
  const activePlan = controlledPlan !== undefined ? controlledPlan : internalPlan;

  const setActivePlan = (next: ParsedDwgPlan | null) => {
    if (controlledPlan === undefined) {
      setInternalPlan(next);
    }
    onPlanLoaded?.(next);
  };

  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<DwgParseProgress | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [theme, setTheme] = useState<CadTheme>('dark');
  const [strokeMode, setStrokeMode] = useState<CadStrokeMode>('normal');
  const [showGrid, setShowGrid] = useState(true);
  const [showLayersPanel, setShowLayersPanel] = useState(!compact);
  const [showMinimap, setShowMinimap] = useState(true);
  const [fitToVisibleLayers, setFitToVisibleLayers] = useState(false);
  const [layerSearch, setLayerSearch] = useState('');
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

  // Enhanced Pan & Zoom state
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  // Multi-pointer tracking (1 pointer = pan, 2 pointers = pinch-zoom + pan)
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStateRef = useRef<{
    initialDistance: number;
    initialZoom: number;
    initialMidpoint: { x: number; y: number };
    initialPan: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Reset layers & view when a new plan finishes loading
  useEffect(() => {
    if (!activePlan) {
      setHiddenLayers(new Set());
      setRenderedSvg('');
      setHasGeometry(false);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setLayerSearch('');
      return;
    }

    const offByDefault = new Set(
      activePlan.layers.filter((l) => l.off || l.frozen).map((l) => l.name)
    );
    const hasAnyVisible = activePlan.layers.some((l) => !offByDefault.has(l.name));
    setHiddenLayers(hasAnyVisible ? offByDefault : new Set());
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLayerSearch('');
  }, [activePlan]);

  // Progressive partial SVG adaptation while loading heavy drawings
  const livePartialAdapted = useMemo(() => {
    if (!isLoading || !loadProgress?.partialSvg) return null;
    return adaptCadSvg(loadProgress.partialSvg, { theme, strokeMode });
  }, [isLoading, loadProgress?.partialSvg, theme, strokeMode]);

  // Instant layer/theme/stroke SVG assembly once loaded
  useEffect(() => {
    let alive = true;
    if (!activePlan) return;

    renderDwgPlanSvg(activePlan, {
      hiddenLayers,
      theme,
      strokeMode,
      fitToVisibleLayers,
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
  }, [activePlan, hiddenLayers, theme, strokeMode, fitToVisibleLayers]);

  const handleFile = async (file: File) => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setErrorMsg(null);
    setIsLoading(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLoadProgress({
      stage: 'reading',
      percent: 4,
      message: `Leyendo ${file.name}...`,
      processedEntities: 0,
      totalEntities: 0,
    });

    try {
      const parsed = await parseDwgOrDxfFile(file, {
        signal: controller.signal,
        onProgress: (prog) => {
          if (!controller.signal.aborted) {
            setLoadProgress(prog);
          }
        },
      });
      if (!controller.signal.aborted) {
        setActivePlan(parsed);
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      setErrorMsg(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo .DWG / .DXF.'
      );
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoading(false);
        setLoadProgress(null);
      }
    }
  };

  const handleCancelLoading = () => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsLoading(false);
    setLoadProgress(null);
  };

  const handleLoadSample = async () => {
    const sampleFile = buildSampleArchitecturalDxfFile();
    await handleFile(sampleFile);
  };

  const handleResetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Cursor/anchor-aware zoom helper
  const zoomAnchoredAtViewportPoint = useCallback(
    (nextZoomRaw: number, clientX?: number, clientY?: number) => {
      const nextZoom = clampZoom(nextZoomRaw);
      const prevZoom = zoomRef.current;
      if (Math.abs(nextZoom - prevZoom) < 1e-6) return;

      const el = viewportRef.current;
      if (!el || clientX === undefined || clientY === undefined) {
        const ratio = nextZoom / prevZoom;
        setPan((prev) => ({
          x: prev.x * ratio,
          y: prev.y * ratio,
        }));
        setZoom(nextZoom);
        return;
      }

      const rect = el.getBoundingClientRect();
      const px = clientX - (rect.left + rect.width / 2);
      const py = clientY - (rect.top + rect.height / 2);
      const ratio = nextZoom / prevZoom;

      setPan((prev) => ({
        x: px - (px - prev.x) * ratio,
        y: py - (py - prev.y) * ratio,
      }));
      setZoom(nextZoom);
    },
    []
  );

  const handleZoomBy = (factor: number) => {
    zoomAnchoredAtViewportPoint(zoomRef.current * factor);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (!activePlan && !livePartialAdapted) return;
    e.preventDefault();
    const intensity = e.ctrlKey ? 0.01 : 0.0018;
    const factor = Math.exp(-e.deltaY * intensity);
    zoomAnchoredAtViewportPoint(zoomRef.current * factor, e.clientX, e.clientY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((!activePlan && !livePartialAdapted) || (e.pointerType === 'mouse' && e.button !== 0)) {
      return;
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore synthetic events
    }

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 1) {
      setIsDragging(true);
      pinchStateRef.current = null;
    } else if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      pinchStateRef.current = {
        initialDistance: Math.max(10, dist),
        initialZoom: zoomRef.current,
        initialMidpoint: mid,
        initialPan: { ...panRef.current },
      };
      setIsDragging(true);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const prevPt = activePointersRef.current.get(e.pointerId);
    if (!prevPt) return;

    const nextPt = { x: e.clientX, y: e.clientY };
    activePointersRef.current.set(e.pointerId, nextPt);

    if (activePointersRef.current.size === 1) {
      const dx = nextPt.x - prevPt.x;
      const dy = nextPt.y - prevPt.y;
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (activePointersRef.current.size === 2 && pinchStateRef.current) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const { initialDistance, initialZoom, initialMidpoint, initialPan } = pinchStateRef.current;

      const scaleFactor = dist / initialDistance;
      const targetZoom = clampZoom(initialZoom * scaleFactor);
      const ratio = targetZoom / initialZoom;

      const el = viewportRef.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const anchorX = initialMidpoint.x - (rect.left + rect.width / 2);
        const anchorY = initialMidpoint.y - (rect.top + rect.height / 2);
        const panDeltaX = mid.x - initialMidpoint.x;
        const panDeltaY = mid.y - initialMidpoint.y;

        setPan({
          x: anchorX - (anchorX - initialPan.x) * ratio + panDeltaX,
          y: anchorY - (anchorY - initialPan.y) * ratio + panDeltaY,
        });
      }
      setZoom(targetZoom);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    activePointersRef.current.delete(e.pointerId);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    if (activePointersRef.current.size < 2) {
      pinchStateRef.current = null;
    }
    if (activePointersRef.current.size === 0) {
      setIsDragging(false);
    }
  };

  const handleMinimapNavigate = (e: React.MouseEvent<HTMLDivElement>) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = (e.clientX - rect.left) / rect.width - 0.5;
    const relY = (e.clientY - rect.top) / rect.height - 0.5;
    const vpRect = vp.getBoundingClientRect();
    setPan({
      x: -relX * vpRect.width * zoomRef.current,
      y: -relY * vpRect.height * zoomRef.current,
    });
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

  const isolateLayer = (layerName: string) => {
    if (!activePlan) return;
    setHiddenLayers(
      new Set(activePlan.layers.filter((l) => l.name !== layerName).map((l) => l.name))
    );
    setFitToVisibleLayers(true);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const invertLayers = () => {
    if (!activePlan) return;
    setHiddenLayers((prev) => {
      const next = new Set<string>();
      for (const l of activePlan.layers) {
        if (!prev.has(l.name)) {
          next.add(l.name);
        }
      }
      return next;
    });
  };

  const showAllLayers = () => {
    setHiddenLayers(new Set());
  };

  const hideAllLayers = () => {
    if (!activePlan) return;
    setHiddenLayers(new Set(activePlan.layers.map((l) => l.name)));
  };

  const buildExportableSvgString = (widthPx = 1800): { svgText: string; width: number; height: number } => {
    const vb =
      renderedViewBox.width > 0 && renderedViewBox.height > 0
        ? renderedViewBox
        : { x: 0, y: 0, width: 1000, height: 700 };
    const aspect = vb.height / vb.width;
    const heightPx = Math.max(400, Math.min(2800, Math.round(widthPx * aspect)));
    const bgHex = THEME_CONFIG[theme].bgHex;

    let out = renderedSvg
      .replace(/width="100%"/i, `width="${widthPx}"`)
      .replace(/height="100%"/i, `height="${heightPx}"`);

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

  const filteredLayers = useMemo(() => {
    if (!activePlan) return [];
    const q = layerSearch.trim().toLowerCase();
    if (!q) return activePlan.layers;
    return activePlan.layers.filter((l) => l.name.toLowerCase().includes(q));
  }, [activePlan, layerSearch]);

  const entityChips = useMemo(() => {
    if (!activePlan) return [];
    return Object.entries(activePlan.entitySummary)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [activePlan]);

  const displaySvg = isLoading ? livePartialAdapted?.svg ?? '' : renderedSvg;
  const displayHasGeometry = isLoading
    ? Boolean(livePartialAdapted?.hasGeometry)
    : hasGeometry;

  const themeCfg = THEME_CONFIG[theme];

  // Minimap viewport indicator math
  const minimapBoxStyle = useMemo(() => {
    const vp = viewportRef.current;
    const widthPct = Math.min(100, Math.max(8, 100 / zoom));
    const heightPct = Math.min(100, Math.max(8, 100 / zoom));
    const vpW = vp?.clientWidth || 800;
    const vpH = vp?.clientHeight || 500;
    const offsetXPct = (-pan.x / (vpW * zoom)) * 100;
    const offsetYPct = (-pan.y / (vpH * zoom)) * 100;
    const leftPct = Math.min(100 - widthPct, Math.max(0, 50 - widthPct / 2 + offsetXPct));
    const topPct = Math.min(100 - heightPct, Math.max(0, 50 - heightPct / 2 + offsetYPct));
    return {
      left: `${leftPct}%`,
      top: `${topPct}%`,
      width: `${widthPct}%`,
      height: `${heightPct}%`,
    };
  }, [zoom, pan]);

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

          {!activePlan && !isLoading && (
            <button
              type="button"
              onClick={handleLoadSample}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF4FF] transition-colors min-h-[34px]"
            >
              <FileCode2 className="h-3.5 w-3.5 text-[#0284C7]" />
              Plano de ejemplo
            </button>
          )}

          {isLoading && (
            <button
              type="button"
              onClick={handleCancelLoading}
              className="inline-flex items-center gap-1 rounded-sm border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1.5 text-xs font-semibold text-[#991B1B] hover:bg-[#FEE2E2] min-h-[34px]"
            >
              <X className="h-3.5 w-3.5" />
              Cancelar carga
            </button>
          )}

          {activePlan && !isLoading && (
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

      {/* Progressive Loading Bar */}
      {isLoading && loadProgress && (
        <div className="border-b border-[#1E3A5F] bg-[#0F2942] px-4 py-2.5 text-white space-y-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#38BDF8] shrink-0" />
              <span className="font-semibold truncate">{loadProgress.message}</span>
            </div>
            <span className="font-mono text-[11px] font-bold text-[#FBBF24] tabular-nums shrink-0">
              {loadProgress.percent}%
              {loadProgress.totalEntities > 0 &&
                ` · ${loadProgress.processedEntities.toLocaleString('en-US')}/${loadProgress.totalEntities.toLocaleString('en-US')}`}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[#091A2C] overflow-hidden">
            <div
              className="h-full bg-[#38BDF8] transition-all duration-150"
              style={{ width: `${Math.min(100, Math.max(4, loadProgress.percent))}%` }}
            />
          </div>
        </div>
      )}

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
            Compatible con versiones AutoCAD R12 hasta 2018+ (2D arquitectura, plantas, ejes, cotas y linderos). Carga progresiva por capas 100% en tu navegador.
          </p>
        </div>
      )}

      {/* Active or Progressively Rendering CAD Viewer */}
      {(activePlan || isLoading) && (
        <>
          {/* Metadata Strip */}
          {activePlan && !isLoading && (
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
          )}

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
                  onClick={() => handleZoomBy(0.75)}
                  className="px-2 py-1 text-[#CBD5E1] hover:text-white"
                  aria-label="Alejar plano"
                  title="Alejar"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <select
                  aria-label="Nivel de zoom del plano"
                  value={ZOOM_PRESETS.includes(zoom) ? String(zoom) : '__custom__'}
                  onChange={(e) => {
                    if (e.target.value !== '__custom__') {
                      zoomAnchoredAtViewportPoint(Number(e.target.value));
                    }
                  }}
                  className="bg-transparent px-1 py-1 font-mono text-[11px] text-[#93CCFF] tabular-nums focus:outline-none cursor-pointer"
                >
                  {!ZOOM_PRESETS.includes(zoom) && (
                    <option value="__custom__" className="text-[#0D1C2F]">
                      {Math.round(zoom * 100)}%
                    </option>
                  )}
                  {ZOOM_PRESETS.map((z) => (
                    <option key={z} value={String(z)} className="text-[#0D1C2F]">
                      {Math.round(z * 100)}%
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => handleZoomBy(1.3333)}
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
                  title="Centrar y ajustar vista completa"
                >
                  <RotateCcw className="h-3 w-3" />
                  Ajustar
                </button>
              </div>

              {activePlan && (
                <button
                  type="button"
                  onClick={() => {
                    setFitToVisibleLayers((prev) => !prev);
                    handleResetView();
                  }}
                  className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition-colors ${
                    fitToVisibleLayers
                      ? 'border-[#38BDF8] bg-[#0284C7]/25 text-[#E0F2FE]'
                      : 'border-[#334155] bg-[#091A2C] text-[#CBD5E1] hover:text-white'
                  }`}
                  title="Encuadrar automáticamente según las capas visibles"
                >
                  <Crosshair className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Encuadrar visibles</span>
                </button>
              )}

              {activePlan && (
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
                  Capas ({visibleLayerCount}/{activePlan.layers.length})
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowMinimap((prev) => !prev)}
                className={`inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-[11px] font-semibold transition-colors ${
                  showMinimap
                    ? 'border-[#38BDF8] bg-[#0284C7]/25 text-[#E0F2FE]'
                    : 'border-[#334155] bg-[#091A2C] text-[#94A3B8]'
                }`}
                title="Mostrar u ocultar miniatura de navegación"
              >
                <MapIcon className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setIsExpanded((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white"
                title={isExpanded ? 'Reducir altura del visor' : 'Ampliar altura del visor'}
              >
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>

              {activePlan && (
                <>
                  <button
                    type="button"
                    onClick={handleExportSvg}
                    disabled={!hasGeometry || isLoading}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white disabled:opacity-40"
                    title="Descargar SVG vectorial con capas visibles"
                  >
                    <Download className="h-3.5 w-3.5" />
                    SVG
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPng}
                    disabled={!hasGeometry || isLoading}
                    className="inline-flex items-center gap-1 rounded-sm border border-[#334155] bg-[#091A2C] px-2.5 py-1 text-[11px] font-semibold text-[#CBD5E1] hover:text-white disabled:opacity-40"
                    title="Descargar imagen PNG con capas visibles"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    PNG
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Main Split: CAD Viewport + Collapsible Toggleable Layers Drawer */}
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div
              className={`${
                showLayersPanel && activePlan ? 'lg:col-span-9' : 'lg:col-span-12'
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
                onDoubleClick={(e) => {
                  if (zoomRef.current < 1.8) {
                    zoomAnchoredAtViewportPoint(2.2, e.clientX, e.clientY);
                  } else {
                    handleResetView();
                  }
                }}
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
                className={`w-full flex items-center justify-center overflow-hidden touch-none ${
                  isExpanded
                    ? 'h-[540px] sm:h-[640px]'
                    : compact
                    ? 'h-[320px] sm:h-[380px]'
                    : 'h-[420px] sm:h-[520px]'
                } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
              >
                {displayHasGeometry ? (
                  <div
                    className="w-full h-full flex items-center justify-center p-4 pointer-events-none"
                    style={{
                      transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                      transformOrigin: 'center center',
                      willChange: 'transform',
                    }}
                    dangerouslySetInnerHTML={{ __html: displaySvg }}
                  />
                ) : isLoading ? (
                  <div className={`text-center px-6 py-8 ${themeCfg.textClass}`}>
                    <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#38BDF8]" />
                    <div className="mt-2.5 text-xs font-semibold">
                      {loadProgress?.message || 'Preparando geometría CAD...'}
                    </div>
                  </div>
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

              {/* Interactive Corner Minimap (shown when zoomed in) */}
              {showMinimap && activePlan && displayHasGeometry && zoom > 1.25 && (
                <div
                  onClick={handleMinimapNavigate}
                  title="Haz clic para saltar a esta zona del plano"
                  className="absolute bottom-3 right-3 z-20 w-36 h-24 rounded-sm border border-[#38BDF8]/60 shadow-lg overflow-hidden cursor-crosshair"
                  style={{ backgroundColor: themeCfg.bgHex }}
                >
                  <div
                    className="w-full h-full p-1 pointer-events-none opacity-85"
                    dangerouslySetInnerHTML={{ __html: displaySvg }}
                  />
                  <div
                    className="absolute border-2 border-[#38BDF8] bg-[#38BDF8]/15 pointer-events-none"
                    style={minimapBoxStyle}
                  />
                </div>
              )}

              {/* Corner CAD Hint */}
              <div className="pointer-events-none absolute bottom-2.5 left-3 rounded-sm bg-[#0F2942]/90 px-2.5 py-1 font-mono text-[10px] text-[#CBD5E1] shadow">
                Arrastra / pellizca para mover · Rueda para zoom al cursor · Doble clic para ampliar/ajustar
              </div>
            </div>

            {showLayersPanel && activePlan && (
              <aside className="lg:col-span-3 border-t lg:border-t-0 lg:border-l border-[#CBD5E1] bg-[#F8FAFC] flex flex-col max-h-[520px]">
                <div className="border-b border-[#E2E8F0] px-3 py-2.5 bg-white space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-[#0F2942]">
                      Capas ({visibleLayerCount}/{activePlan.layers.length})
                    </span>
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <button
                        type="button"
                        onClick={showAllLayers}
                        className="font-semibold text-[#0284C7] hover:underline"
                      >
                        Todas
                      </button>
                      <span className="text-[#CBD5E1]">|</span>
                      <button
                        type="button"
                        onClick={hideAllLayers}
                        className="font-semibold text-[#64748B] hover:underline"
                      >
                        Ninguna
                      </button>
                      <span className="text-[#CBD5E1]">|</span>
                      <button
                        type="button"
                        onClick={invertLayers}
                        className="font-semibold text-[#0F2942] hover:underline"
                      >
                        Invertir
                      </button>
                    </div>
                  </div>

                  {activePlan.layers.length > 5 && (
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[#64748B]" />
                      <input
                        type="text"
                        value={layerSearch}
                        onChange={(e) => setLayerSearch(e.target.value)}
                        placeholder="Filtrar capa..."
                        aria-label="Filtrar capa del plano"
                        className="w-full rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] pl-6 pr-6 py-1 text-[11px] text-[#0D1C2F] placeholder:text-[#94A3B8]"
                      />
                      {layerSearch && (
                        <button
                          type="button"
                          onClick={() => setLayerSearch('')}
                          aria-label="Limpiar filtro de capas"
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F2942]"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[#E2E8F0]">
                  {filteredLayers.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[11px] text-[#64748B]">
                      No hay capas que coincidan con "{layerSearch}".
                    </div>
                  ) : (
                    filteredLayers.map((layer) => {
                      const isHidden = hiddenLayers.has(layer.name);
                      return (
                        <div
                          key={layer.name}
                          className={`group flex items-center justify-between gap-1.5 px-2.5 py-2 text-xs transition-colors ${
                            isHidden
                              ? 'bg-[#F1F5F9] text-[#94A3B8]'
                              : 'bg-white text-[#0D1C2F] hover:bg-[#EFF4FF]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => toggleLayer(layer.name)}
                            aria-pressed={!isHidden}
                            aria-label={`${isHidden ? 'Mostrar' : 'Ocultar'} capa ${layer.name}`}
                            className="flex flex-1 items-center gap-2 min-w-0 text-left"
                          >
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0 border border-black/15"
                              style={{ backgroundColor: layer.colorHex }}
                            />
                            <span className="truncate font-medium">{layer.name}</span>
                          </button>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => isolateLayer(layer.name)}
                              title={`Mostrar solo la capa ${layer.name}`}
                              className="rounded-sm border border-[#CBD5E1] bg-white px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#475569] hover:border-[#0284C7] hover:text-[#0284C7] opacity-70 group-hover:opacity-100"
                            >
                              Solo
                            </button>
                            <span className="font-mono text-[10px] text-[#64748B] tabular-nums min-w-[24px] text-right">
                              {layer.entityCount}
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleLayer(layer.name)}
                              aria-label={`${isHidden ? 'Activar' : 'Desactivar'} capa ${layer.name}`}
                              className="p-0.5"
                            >
                              {isHidden ? (
                                <EyeOff className="h-3.5 w-3.5 text-[#94A3B8]" />
                              ) : (
                                <Eye className="h-3.5 w-3.5 text-[#0284C7]" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </aside>
            )}
          </div>

          {/* Footer Entity Summary */}
          {activePlan && (
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
                LibreDWG WASM · Carga Progresiva por Capas
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
};
