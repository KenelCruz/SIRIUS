import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  BellRing,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  FilterX,
  History,
  Info,
  Layers,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  clasificarEventoAuditoria,
  ENTIDAD_TIPO_LABELS,
  mapEntidadAModuloAuditoria,
  mapEntidadATabAdmin,
  MODULOS_AUDITORIA_LABELS,
  parseFechaAstToIso,
  parseFechaAstToTimestamp,
  type AdminTabDestino,
  type AlertaOperativa,
  type CategoriaAccionAuditoria,
  type ModuloAlerta,
  type ModuloAuditoria,
  type SeveridadAlerta,
} from '../domain';
import type { HistorialEvento } from '../types/domain';
import { AuditoriaViewSkeleton } from './Skeletons';

interface AuditoriaViewProps {
  historial: HistorialEvento[];
  isLoading?: boolean;
  alertas?: AlertaOperativa[];
  alertasLeidasIds?: Set<string>;
  onMarcarAlertaLeida?: (alertaId: string) => void;
  onMarcarTodasAlertasLeidas?: () => void;
  onIrAModulo?: (tab: AdminTabDestino) => void;
  initialViewMode?: 'bitacora' | 'alertas';
}

const ITEMS_POR_PAGINA = 15;

const MODULOS_ORDENADOS: ModuloAuditoria[] = [
  'todos',
  'proyectos_rutas',
  'presupuestos',
  'agenda_misiones',
  'servicios',
  'viaticos',
  'flota_rentas',
  'catalogos',
  'empresa',
];

const CATEGORIAS_LABELS: Record<CategoriaAccionAuditoria, string> = {
  todas: 'Todas las acciones',
  overrides: 'Overrides y excepciones',
  rechazos_alertas: 'Rechazos y alertas',
  cambios_valor: 'Cambios de estado / valor',
  aprobaciones: 'Aprobaciones y cierres',
  creaciones: 'Creaciones y registros',
};

const SEVERIDAD_ALERTA_UI: Record<
  SeveridadAlerta,
  {
    label: string;
    icon: React.FC<{ className?: string }>;
    textClass: string;
    iconBoxClass: string;
    rowBgClass: string;
  }
> = {
  critica: {
    label: 'Crítica',
    icon: AlertOctagon,
    textClass: 'text-[#DC2626]',
    iconBoxClass: 'bg-rose-50 text-[#DC2626]',
    rowBgClass: 'bg-rose-50/30',
  },
  advertencia: {
    label: 'Advertencia',
    icon: AlertTriangle,
    textClass: 'text-[#B45309]',
    iconBoxClass: 'bg-amber-50 text-[#B45309]',
    rowBgClass: 'bg-amber-50/20',
  },
  informativa: {
    label: 'Aviso',
    icon: Info,
    textClass: 'text-[#0284C7]',
    iconBoxClass: 'bg-sky-50 text-[#0284C7]',
    rowBgClass: 'bg-white',
  },
};

function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/"/g, '""');
  return `"${sanitized}"`;
}

export const AuditoriaView: React.FC<AuditoriaViewProps> = ({
  historial,
  isLoading = false,
  alertas = [],
  alertasLeidasIds = new Set<string>(),
  onMarcarAlertaLeida,
  onMarcarTodasAlertasLeidas,
  onIrAModulo,
  initialViewMode = 'bitacora',
}) => {
  const [viewMode, setViewMode] = useState<'bitacora' | 'alertas'>(initialViewMode);

  // Filtros de Bitácora
  const [moduloFiltro, setModuloFiltro] = useState<ModuloAuditoria>('todos');
  const [entidadFiltro, setEntidadFiltro] = useState<HistorialEvento['entidadTipo'] | 'ALL'>('ALL');
  const [categoriaFiltro, setCategoriaFiltro] = useState<CategoriaAccionAuditoria>('todas');
  const [usuarioFiltro, setUsuarioFiltro] = useState<string>('ALL');
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [ordenFecha, setOrdenFecha] = useState<'recientes' | 'antiguos'>('recientes');
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  // Filtros de Alertas
  const [severidadAlertaFiltro, setSeveridadAlertaFiltro] = useState<'todas' | SeveridadAlerta>(
    'todas'
  );
  const [moduloAlertaFiltro, setModuloAlertaFiltro] = useState<'todos' | ModuloAlerta>('todos');
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);

  useEffect(() => {
    setViewMode(initialViewMode);
  }, [initialViewMode]);

  const historialEnriquecido = useMemo(() => {
    return historial.map((ev) => ({
      evento: ev,
      clasificacion: clasificarEventoAuditoria(ev),
      fechaIso: parseFechaAstToIso(ev.fechaAST),
      timestamp: parseFechaAstToTimestamp(ev.fechaAST),
    }));
  }, [historial]);

  const usuariosDisponibles = useMemo(() => {
    const nombres = new Set<string>();
    for (const h of historial) {
      if (h.usuarioNombre?.trim()) nombres.add(h.usuarioNombre.trim());
    }
    return Array.from(nombres).sort((a, b) => a.localeCompare(b, 'es'));
  }, [historial]);

  const conteosPorModulo = useMemo(() => {
    const counts: Record<ModuloAuditoria, number> = {
      todos: historial.length,
      proyectos_rutas: 0,
      presupuestos: 0,
      agenda_misiones: 0,
      servicios: 0,
      viaticos: 0,
      flota_rentas: 0,
      catalogos: 0,
      empresa: 0,
    };
    for (const item of historialEnriquecido) {
      counts[item.clasificacion.modulo] += 1;
    }
    return counts;
  }, [historial.length, historialEnriquecido]);

  const kpis = useMemo(() => {
    let overrides = 0;
    let rechazosOAlertas = 0;
    const modulosActivos = new Set<ModuloAuditoria>();
    for (const item of historialEnriquecido) {
      if (item.clasificacion.esOverride) overrides += 1;
      if (item.clasificacion.esRechazoOAlerta) rechazosOAlertas += 1;
      modulosActivos.add(item.clasificacion.modulo);
    }
    const alertasCriticas = alertas.filter((a) => a.severidad === 'critica').length;
    const alertasNoLeidas = alertas.filter((a) => !alertasLeidasIds.has(a.id)).length;
    return {
      totalEventos: historial.length,
      overrides,
      rechazosOAlertas,
      usuariosActivos: usuariosDisponibles.length,
      modulosActivos: modulosActivos.size,
      totalAlertas: alertas.length,
      alertasCriticas,
      alertasNoLeidas,
    };
  }, [historial.length, historialEnriquecido, usuariosDisponibles.length, alertas, alertasLeidasIds]);

  const eventosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const filtrados = historialEnriquecido.filter(({ evento, clasificacion, fechaIso }) => {
      if (moduloFiltro !== 'todos' && clasificacion.modulo !== moduloFiltro) return false;
      if (entidadFiltro !== 'ALL' && evento.entidadTipo !== entidadFiltro) return false;
      if (categoriaFiltro !== 'todas' && clasificacion.categoria !== categoriaFiltro) return false;
      if (usuarioFiltro !== 'ALL' && evento.usuarioNombre !== usuarioFiltro) return false;
      if (fechaDesde && (!fechaIso || fechaIso < fechaDesde)) return false;
      if (fechaHasta && (!fechaIso || fechaIso > fechaHasta)) return false;

      if (!q) return true;
      const valAnt = (
        evento.valorAnterior ?? String(evento.metadata?.valorAnterior ?? '')
      ).toLowerCase();
      const valNvo = (
        evento.valorNuevo ?? String(evento.metadata?.valorNuevo ?? '')
      ).toLowerCase();
      const motivoOv = String(evento.metadata?.overrideMotivo ?? '').toLowerCase();
      const metadataStr = evento.metadata
        ? Object.entries(evento.metadata)
            .map(([k, v]) => `${k} ${String(v)}`)
            .join(' ')
            .toLowerCase()
        : '';

      return (
        evento.accion.toLowerCase().includes(q) ||
        evento.detalle.toLowerCase().includes(q) ||
        evento.usuarioNombre.toLowerCase().includes(q) ||
        evento.entidadId.toLowerCase().includes(q) ||
        evento.entidadTipo.toLowerCase().includes(q) ||
        clasificacion.moduloEtiqueta.toLowerCase().includes(q) ||
        valAnt.includes(q) ||
        valNvo.includes(q) ||
        motivoOv.includes(q) ||
        metadataStr.includes(q)
      );
    });

    if (ordenFecha === 'antiguos') {
      return [...filtrados].sort((a, b) => a.timestamp - b.timestamp);
    }
    return filtrados;
  }, [
    historialEnriquecido,
    moduloFiltro,
    entidadFiltro,
    categoriaFiltro,
    usuarioFiltro,
    fechaDesde,
    fechaHasta,
    busqueda,
    ordenFecha,
  ]);

  useEffect(() => {
    setPaginaActual(1);
  }, [
    moduloFiltro,
    entidadFiltro,
    categoriaFiltro,
    usuarioFiltro,
    fechaDesde,
    fechaHasta,
    busqueda,
    ordenFecha,
  ]);

  const totalPaginas = Math.max(1, Math.ceil(eventosFiltrados.length / ITEMS_POR_PAGINA));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const eventosPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * ITEMS_POR_PAGINA;
    return eventosFiltrados.slice(inicio, inicio + ITEMS_POR_PAGINA);
  }, [eventosFiltrados, paginaSegura]);

  const hayFiltrosActivos =
    moduloFiltro !== 'todos' ||
    entidadFiltro !== 'ALL' ||
    categoriaFiltro !== 'todas' ||
    usuarioFiltro !== 'ALL' ||
    Boolean(fechaDesde) ||
    Boolean(fechaHasta) ||
    Boolean(busqueda.trim()) ||
    ordenFecha !== 'recientes';

  const limpiarFiltros = () => {
    setModuloFiltro('todos');
    setEntidadFiltro('ALL');
    setCategoriaFiltro('todas');
    setUsuarioFiltro('ALL');
    setFechaDesde('');
    setFechaHasta('');
    setBusqueda('');
    setOrdenFecha('recientes');
  };

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportarCsv = () => {
    const headers = [
      'Fecha AST',
      'Módulo',
      'Entidad',
      'ID Entidad',
      'Categoría',
      'Acción',
      'Detalle',
      'Valor Anterior',
      'Valor Nuevo',
      'Usuario',
      'Motivo Override',
    ];
    const rows = eventosFiltrados.map(({ evento, clasificacion }) => {
      const valAnt =
        evento.valorAnterior ??
        (evento.metadata?.valorAnterior !== undefined ? String(evento.metadata.valorAnterior) : '');
      const valNvo =
        evento.valorNuevo ??
        (evento.metadata?.valorNuevo !== undefined ? String(evento.metadata.valorNuevo) : '');
      const motivo = evento.metadata?.overrideMotivo ? String(evento.metadata.overrideMotivo) : '';
      return [
        evento.fechaAST,
        clasificacion.moduloEtiqueta,
        ENTIDAD_TIPO_LABELS[evento.entidadTipo] ?? evento.entidadTipo,
        evento.entidadId,
        CATEGORIAS_LABELS[clasificacion.categoria],
        evento.accion,
        evento.detalle,
        valAnt,
        valNvo,
        evento.usuarioNombre,
        motivo,
      ]
        .map(escapeCsvCell)
        .join(',');
    });

    const csvContent = '\uFEFF' + [headers.map(escapeCsvCell).join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sirius_auditoria_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const modulosAlertaDisponibles = useMemo(() => {
    const mapa = new Map<ModuloAlerta, string>();
    for (const a of alertas) {
      if (!mapa.has(a.modulo)) mapa.set(a.modulo, a.moduloEtiqueta);
    }
    return Array.from(mapa.entries());
  }, [alertas]);

  const alertasFiltradas = useMemo(() => {
    return alertas.filter((a) => {
      if (severidadAlertaFiltro !== 'todas' && a.severidad !== severidadAlertaFiltro) return false;
      if (moduloAlertaFiltro !== 'todos' && a.modulo !== moduloAlertaFiltro) return false;
      if (soloNoLeidas && alertasLeidasIds.has(a.id)) return false;
      return true;
    });
  }, [alertas, severidadAlertaFiltro, moduloAlertaFiltro, soloNoLeidas, alertasLeidasIds]);

  const conteosAlertas = useMemo(() => {
    let criticas = 0;
    let advertencias = 0;
    let informativas = 0;
    for (const a of alertas) {
      if (a.severidad === 'critica') criticas++;
      else if (a.severidad === 'advertencia') advertencias++;
      else informativas++;
    }
    return { total: alertas.length, criticas, advertencias, informativas };
  }, [alertas]);

  if (isLoading) {
    return <AuditoriaViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      {/* Header & View Mode Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
            Auditoría, Excepciones y Alertas
          </h2>
          <p className="text-sm text-[#475569] mt-0.5">
            Trazabilidad completa por módulo, usuario y cambios de estado, junto al centro de advertencias operativas.
          </p>
        </div>

        <div className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 self-start">
          <button
            type="button"
            onClick={() => setViewMode('bitacora')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
              viewMode === 'bitacora'
                ? 'bg-[#0F2942] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#0F2942]'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Bitácora de Auditoría</span>
            <span className="font-mono text-[11px] tabular-nums opacity-80">
              ({historial.length})
            </span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode('alertas')}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[38px] ${
              viewMode === 'alertas'
                ? 'bg-[#0F2942] text-white shadow-sm'
                : 'text-[#475569] hover:text-[#0F2942]'
            }`}
          >
            <BellRing className="h-3.5 w-3.5" />
            <span>Alertas y Advertencias</span>
            <span
              className={`font-mono text-[11px] tabular-nums ${
                viewMode === 'alertas'
                  ? 'text-white/90'
                  : kpis.alertasCriticas > 0
                  ? 'text-[#DC2626] font-bold'
                  : 'text-[#0284C7] font-bold'
              }`}
            >
              ({kpis.alertasNoLeidas > 0 ? `${kpis.alertasNoLeidas} nuevas` : alertas.length})
            </span>
          </button>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#475569]">Eventos registrados</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-50 text-[#0284C7]">
              <History className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
            {kpis.totalEventos}
          </div>
          <div className="mt-1 text-[11px] text-[#64748B]">
            {kpis.modulosActivos} módulo(s) con trazabilidad
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#475569]">Overrides y rechazos</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-[#DC2626]">
              <ShieldAlert className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
            {kpis.overrides + kpis.rechazosOAlertas}
          </div>
          <div className="mt-1 text-[11px] text-[#64748B] font-mono tabular-nums">
            {kpis.overrides} override(s) · {kpis.rechazosOAlertas} alerta(s)
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#475569]">Usuarios auditados</span>
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-[#0F2942]">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
            {kpis.usuariosActivos}
          </div>
          <div className="mt-1 text-[11px] text-[#64748B]">
            Responsables distintos en bitácora
          </div>
        </div>

        <button
          type="button"
          onClick={() => setViewMode('alertas')}
          className="rounded-2xl border border-slate-200/90 bg-white p-4 text-left hover:border-[#0284C7] transition-colors"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-[#475569]">Alertas operativas</span>
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                kpis.alertasCriticas > 0
                  ? 'bg-rose-50 text-[#DC2626]'
                  : kpis.totalAlertas > 0
                  ? 'bg-amber-50 text-[#B45309]'
                  : 'bg-emerald-50 text-[#15803D]'
              }`}
            >
              <BellRing className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
            {kpis.totalAlertas}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[#64748B] font-mono tabular-nums">
            {kpis.alertasCriticas} crítica(s) · {kpis.alertasNoLeidas} sin leer
          </div>
        </button>
      </div>

      {viewMode === 'bitacora' ? (
        <div className="space-y-4">
          {/* Module Filter Tabs */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
                <Layers className="h-4 w-4 text-[#0284C7]" />
                <span>Filtrar por módulo operativo</span>
              </div>
              <div className="flex items-center gap-2">
                {hayFiltrosActivos && (
                  <button
                    type="button"
                    onClick={limpiarFiltros}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#475569] hover:text-[#0F2942] hover:bg-slate-50 transition-colors whitespace-nowrap"
                  >
                    <FilterX className="h-3.5 w-3.5" />
                    <span>Limpiar filtros</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleExportarCsv}
                  disabled={eventosFiltrados.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Exportar CSV</span>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {MODULOS_ORDENADOS.map((mod) => {
                const activo = moduloFiltro === mod;
                const count = conteosPorModulo[mod];
                return (
                  <button
                    key={mod}
                    type="button"
                    onClick={() => {
                      setModuloFiltro(mod);
                      if (
                        mod !== 'todos' &&
                        entidadFiltro !== 'ALL' &&
                        mapEntidadAModuloAuditoria(entidadFiltro) !== mod
                      ) {
                        setEntidadFiltro('ALL');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      activo
                        ? 'border-[#0F2942] bg-[#0F2942] text-white'
                        : 'border-slate-200 bg-[#F8FAFC] text-[#475569] hover:border-slate-300 hover:text-[#0F2942]'
                    }`}
                  >
                    <span>{MODULOS_AUDITORIA_LABELS[mod]}</span>
                    <span
                      className={`font-mono text-[11px] tabular-nums ${
                        activo ? 'text-white/80' : 'text-[#64748B]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Secondary Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-1 border-t border-slate-100">
              <div className="relative lg:col-span-2">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar acción, ID, usuario, motivo..."
                  className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-9 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[40px]"
                />
              </div>

              <select
                value={entidadFiltro}
                onChange={(e) =>
                  setEntidadFiltro(e.target.value as HistorialEvento['entidadTipo'] | 'ALL')
                }
                aria-label="Filtrar por entidad"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="ALL">Entidad: Todas</option>
                {(Object.keys(ENTIDAD_TIPO_LABELS) as Array<HistorialEvento['entidadTipo']>).map(
                  (tipo) => (
                    <option key={tipo} value={tipo}>
                      {ENTIDAD_TIPO_LABELS[tipo]}
                    </option>
                  )
                )}
              </select>

              <select
                value={categoriaFiltro}
                onChange={(e) => setCategoriaFiltro(e.target.value as CategoriaAccionAuditoria)}
                aria-label="Filtrar por tipo de acción"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
              >
                {(Object.keys(CATEGORIAS_LABELS) as CategoriaAccionAuditoria[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORIAS_LABELS[cat]}
                  </option>
                ))}
              </select>

              <select
                value={usuarioFiltro}
                onChange={(e) => setUsuarioFiltro(e.target.value)}
                aria-label="Filtrar por usuario"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="ALL">Usuario: Todos</option>
                {usuariosDisponibles.map((nombre) => (
                  <option key={nombre} value={nombre}>
                    {nombre}
                  </option>
                ))}
              </select>

              <select
                value={ordenFecha}
                onChange={(e) => setOrdenFecha(e.target.value as 'recientes' | 'antiguos')}
                aria-label="Orden cronológico"
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="recientes">Más recientes</option>
                <option value="antiguos">Más antiguos</option>
              </select>
            </div>

            {/* Date range row */}
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex flex-wrap items-center gap-2.5">
                <label className="inline-flex items-center gap-2 text-[#475569]">
                  <span className="font-medium">Desde:</span>
                  <input
                    type="date"
                    value={fechaDesde}
                    onChange={(e) => setFechaDesde(e.target.value)}
                    aria-label="Fecha desde"
                    className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#0F2942] font-mono focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[36px]"
                  />
                </label>
                <label className="inline-flex items-center gap-2 text-[#475569]">
                  <span className="font-medium">Hasta:</span>
                  <input
                    type="date"
                    value={fechaHasta}
                    onChange={(e) => setFechaHasta(e.target.value)}
                    aria-label="Fecha hasta"
                    className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-2.5 py-1.5 text-xs text-[#0F2942] font-mono focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[36px]"
                  />
                </label>
              </div>

              <div className="text-xs text-[#475569] font-mono tabular-nums">
                {eventosFiltrados.length} registro(s) encontrado(s)
              </div>
            </div>
          </div>

          {/* Event Feed */}
          <div className="rounded-2xl border border-slate-200/90 bg-white divide-y divide-slate-100 overflow-hidden">
            {eventosPaginados.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="text-sm font-bold text-[#0F2942]">
                  No hay eventos de auditoría que coincidan con el filtro
                </div>
                <p className="text-xs text-[#64748B]">
                  Ajusta el módulo, rango de fechas o términos de búsqueda para ver más registros.
                </p>
              </div>
            ) : (
              eventosPaginados.map(({ evento: ev, clasificacion }) => {
                const esOverride = clasificacion.esOverride;
                const esAlerta = clasificacion.esRechazoOAlerta;
                const valorAnterior =
                  ev.valorAnterior ??
                  (ev.metadata?.valorAnterior !== undefined
                    ? String(ev.metadata.valorAnterior)
                    : undefined);
                const valorNuevo =
                  ev.valorNuevo ??
                  (ev.metadata?.valorNuevo !== undefined
                    ? String(ev.metadata.valorNuevo)
                    : undefined);
                const metadataEntries = ev.metadata
                  ? Object.entries(ev.metadata).filter(
                      ([k]) =>
                        k !== 'valorAnterior' &&
                        k !== 'valorNuevo' &&
                        k !== 'overrideMotivo' &&
                        k !== 'overrideFecha'
                    )
                  : [];
                const isExpanded = expandedIds.has(ev.id);

                return (
                  <div
                    key={ev.id}
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs ${
                      esOverride
                        ? 'bg-rose-50/35'
                        : esAlerta
                        ? 'bg-amber-50/25'
                        : 'hover:bg-[#F8FAFC]/70 transition-colors'
                    }`}
                  >
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className="font-semibold text-[#0284C7]">
                          {clasificacion.moduloEtiqueta}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-mono text-[11px] text-[#64748B] uppercase">
                          {ENTIDAD_TIPO_LABELS[ev.entidadTipo] ?? ev.entidadTipo} #{ev.entidadId}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span className="font-bold text-[#0F2942]">{ev.accion}</span>

                        {esOverride && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#DC2626]">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span>Override autorizado</span>
                          </span>
                        )}
                        {!esOverride && esAlerta && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#B45309]">
                            <AlertOctagon className="h-3.5 w-3.5" />
                            <span>Alerta / Rechazo</span>
                          </span>
                        )}
                        {!esOverride && !esAlerta && clasificacion.categoria === 'aprobaciones' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-[#15803D]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>Validado</span>
                          </span>
                        )}
                      </div>

                      <p className="text-[#334155] leading-relaxed">{ev.detalle}</p>

                      {(valorAnterior || valorNuevo) && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200/70 bg-[#F8FAFC] px-3 py-2 font-mono text-[11px]">
                          {valorAnterior && (
                            <span className="text-[#475569]">
                              Anterior: <span className="text-[#334155]">{valorAnterior}</span>
                            </span>
                          )}
                          {valorAnterior && valorNuevo && (
                            <span className="text-[#0284C7]">→</span>
                          )}
                          {valorNuevo && (
                            <span className="text-[#0F2942] font-semibold">
                              Nuevo: {valorNuevo}
                            </span>
                          )}
                        </div>
                      )}

                      {ev.metadata?.overrideMotivo && (
                        <div className="font-mono text-[11px] text-[#DC2626]">
                          Motivo: "{String(ev.metadata.overrideMotivo)}" · Autorizó:{' '}
                          {ev.usuarioNombre} ({String(ev.metadata.overrideFecha || ev.fechaAST)})
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-3 pt-1">
                        {metadataEntries.length > 0 && (
                          <button
                            type="button"
                            onClick={() => toggleExpanded(ev.id)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#475569] hover:text-[#0F2942] transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronUp className="h-3.5 w-3.5" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {isExpanded ? 'Ocultar metadatos' : `Ver metadatos (${metadataEntries.length})`}
                            </span>
                          </button>
                        )}
                        {onIrAModulo && (
                          <button
                            type="button"
                            onClick={() => onIrAModulo(mapEntidadATabAdmin(ev.entidadTipo))}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0284C7] hover:text-[#0F2942] transition-colors"
                          >
                            <span>Ir al módulo</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      {isExpanded && metadataEntries.length > 0 && (
                        <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-3">
                          {metadataEntries.map(([k, v]) => (
                            <div key={k} className="min-w-0">
                              <div className="text-[10px] font-semibold uppercase tracking-wide text-[#64748B]">
                                {k}
                              </div>
                              <div className="font-mono text-[11px] text-[#0F2942] break-all">
                                {String(v)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="sm:text-right shrink-0">
                      <div className="font-semibold text-[#0F2942]">{ev.usuarioNombre}</div>
                      <div className="font-mono text-[11px] text-[#475569] tabular-nums mt-0.5">
                        {ev.fechaAST}
                      </div>
                    </div>
                  </div>
                );
              })
            )}

            {/* Pagination Footer */}
            {eventosFiltrados.length > ITEMS_POR_PAGINA && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#F8FAFC] px-4 py-3 text-xs">
                <span className="text-[#475569] font-mono tabular-nums">
                  Mostrando {(paginaSegura - 1) * ITEMS_POR_PAGINA + 1}–
                  {Math.min(paginaSegura * ITEMS_POR_PAGINA, eventosFiltrados.length)} de{' '}
                  {eventosFiltrados.length}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                    disabled={paginaSegura <= 1}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Anterior</span>
                  </button>
                  <span className="font-mono text-xs font-semibold text-[#0F2942] tabular-nums px-2">
                    Página {paginaSegura} / {totalPaginas}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                    disabled={paginaSegura >= totalPaginas}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-40"
                  >
                    <span>Siguiente</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Alertas y Advertencias Sub-view */
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSeveridadAlertaFiltro('todas')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  severidadAlertaFiltro === 'todas'
                    ? 'border-[#0F2942] bg-[#0F2942] text-white'
                    : 'border-slate-200 bg-[#F8FAFC] text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Todas ({conteosAlertas.total})
              </button>
              <button
                type="button"
                onClick={() => setSeveridadAlertaFiltro('critica')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  severidadAlertaFiltro === 'critica'
                    ? 'border-[#DC2626] bg-[#DC2626] text-white'
                    : 'border-slate-200 bg-[#F8FAFC] text-[#475569] hover:text-[#DC2626]'
                }`}
              >
                Críticas ({conteosAlertas.criticas})
              </button>
              <button
                type="button"
                onClick={() => setSeveridadAlertaFiltro('advertencia')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  severidadAlertaFiltro === 'advertencia'
                    ? 'border-[#B45309] bg-[#B45309] text-white'
                    : 'border-slate-200 bg-[#F8FAFC] text-[#475569] hover:text-[#B45309]'
                }`}
              >
                Advertencias ({conteosAlertas.advertencias})
              </button>
              <button
                type="button"
                onClick={() => setSeveridadAlertaFiltro('informativa')}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                  severidadAlertaFiltro === 'informativa'
                    ? 'border-[#0284C7] bg-[#0284C7] text-white'
                    : 'border-slate-200 bg-[#F8FAFC] text-[#475569] hover:text-[#0284C7]'
                }`}
              >
                Avisos ({conteosAlertas.informativas})
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={moduloAlertaFiltro}
                onChange={(e) => setModuloAlertaFiltro(e.target.value as 'todos' | ModuloAlerta)}
                aria-label="Filtrar alertas por módulo"
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs text-[#334155] min-h-[36px] focus:border-[#0284C7] focus:outline-none"
              >
                <option value="todos">Módulo: Todos</option>
                {modulosAlertaDisponibles.map(([modId, label]) => (
                  <option key={modId} value={modId}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={() => setSoloNoLeidas((prev) => !prev)}
                className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-colors min-h-[36px] whitespace-nowrap ${
                  soloNoLeidas
                    ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]'
                    : 'border-slate-200 bg-white text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Solo no leídas
              </button>

              {onMarcarTodasAlertasLeidas && kpis.alertasNoLeidas > 0 && (
                <button
                  type="button"
                  onClick={onMarcarTodasAlertasLeidas}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[36px] whitespace-nowrap"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Marcar todas leídas</span>
                </button>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white divide-y divide-slate-100 overflow-hidden">
            {alertasFiltradas.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-[#15803D]">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="text-sm font-bold text-[#0F2942]">
                  {alertas.length === 0
                    ? 'Operación sin alertas ni advertencias pendientes'
                    : 'Ninguna alerta coincide con el filtro aplicado'}
                </div>
                <p className="text-xs text-[#64748B]">
                  {alertas.length === 0
                    ? 'Los presupuestos, rentas, flota, viáticos y asignaciones están en orden.'
                    : 'Cambia la severidad o desactiva el filtro de no leídas para revisar todo el historial.'}
                </p>
              </div>
            ) : (
              alertasFiltradas.map((alerta) => {
                const ui = SEVERIDAD_ALERTA_UI[alerta.severidad];
                const Icono = ui.icon;
                const leida = alertasLeidasIds.has(alerta.id);

                return (
                  <div
                    key={alerta.id}
                    className={`p-4 sm:p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4 ${
                      leida ? 'bg-white opacity-80' : ui.rowBgClass
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${ui.iconBoxClass}`}
                      >
                        <Icono className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                          <span className={`font-bold uppercase tracking-wide ${ui.textClass}`}>
                            {ui.label}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-semibold text-[#0F2942]">
                            {alerta.moduloEtiqueta}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                            {alerta.fechaIso}
                          </span>
                          {!leida && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-semibold text-[#0284C7]">Sin leer</span>
                            </>
                          )}
                        </div>
                        <div className="text-sm font-bold text-[#0F2942]">{alerta.titulo}</div>
                        <p className="text-xs text-[#475569] leading-relaxed">{alerta.detalle}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-col sm:items-end justify-end gap-2 shrink-0">
                      {onIrAModulo && alerta.tabDestinoAdmin && (
                        <button
                          type="button"
                          onClick={() => {
                            if (!leida && onMarcarAlertaLeida) onMarcarAlertaLeida(alerta.id);
                            onIrAModulo(alerta.tabDestinoAdmin!);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap"
                        >
                          <span>{alerta.accionEtiqueta}</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {onMarcarAlertaLeida && !leida && (
                        <button
                          type="button"
                          onClick={() => onMarcarAlertaLeida(alerta.id)}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#475569] hover:text-[#0F2942] hover:bg-slate-50 transition-colors whitespace-nowrap"
                        >
                          <Check className="h-3 w-3" />
                          <span>Marcar leída</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </section>
  );
};
