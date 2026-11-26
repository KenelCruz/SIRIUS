import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Legend,
  PieChart,
  Pie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowUpRight,
  Calculator,
  Download,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  CATEGORIAS_PRESUPUESTO,
  ETIQUETAS_CATEGORIA_PRESUPUESTO,
  ETIQUETAS_ESTADO_PRESUPUESTO,
  calcularReportePresupuestosDesdeSnapshot,
  obtenerFechaHoyAST,
  puedeGestionarPresupuesto,
  type ComparacionPresupuestoProyecto,
} from '../domain';
import type {
  CategoriaPresupuesto,
  ConfiguracionEmpresa,
  EstadoEmpresaSnapshot,
  EstadoPresupuestoProyecto,
  LineaPresupuestoProyecto,
  RolEmpresa,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';
import { PresupuestoProyectoModal } from './PresupuestoProyectoModal';
import { PresupuestosViewSkeleton } from './Skeletons';

interface PresupuestosViewProps {
  rol: RolEmpresa;
  snapshot: EstadoEmpresaSnapshot;
  configuracion?: ConfiguracionEmpresa | null;
  isLoading?: boolean;
  onCrearVersionPresupuesto: (params: {
    proyectoId: string;
    vigenciaDesde: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
    aprobarInmediatamente?: boolean;
  }) => Promise<void>;
  onEditarBorradorPresupuesto: (params: {
    presupuestoId: string;
    vigenciaDesde?: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
  }) => Promise<void>;
  onTransicionarPresupuesto: (params: {
    presupuestoId: string;
    nuevoEstado: EstadoPresupuestoProyecto;
    motivo?: string;
  }) => Promise<void>;
}

const CATEGORIA_COLORS: Record<CategoriaPresupuesto, string> = {
  viaticos: '#0284C7',
  rentas: '#0F2942',
  personal: '#0D9488',
  vehiculos: '#D97706',
  equipos_gnss: '#6366F1',
  otros: '#64748B',
};

const CATEGORIA_SHORT_LABELS: Record<CategoriaPresupuesto, string> = {
  viaticos: 'Viáticos',
  rentas: 'Rentas',
  personal: 'Personal',
  vehiculos: 'Vehículos',
  equipos_gnss: 'GNSS',
  otros: 'Otros',
};

interface ProjectChartDatum {
  proyectoId: string;
  shortCode: string;
  codigoContrato: string;
  nombre: string;
  planificado: number;
  ejecutado: number;
  margenPlanificado: number;
  margenReal: number;
  excedido: boolean;
  margenNegativo: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    color?: string;
    payload?: ProjectChartDatum;
  }>;
  moneda: string;
  modo: 'costos' | 'margenes';
}

const ProjectBarTooltip: React.FC<CustomTooltipProps> = ({ active, payload, moneda, modo }) => {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const item = payload[0].payload;
  const diffCosto = item.planificado - item.ejecutado;

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xl text-xs min-w-[240px]">
      <div className="font-mono text-[11px] font-bold text-[#0284C7]">{item.codigoContrato}</div>
      <div className="font-semibold text-[#0D1C2F] mt-0.5 truncate max-w-[260px]">
        {item.nombre}
      </div>
      <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
        {modo === 'costos' ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#43474D]">Costo planificado:</span>
              <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                {formatRD(item.planificado, moneda)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#43474D]">Costo ejecutado:</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  item.excedido ? 'text-[#DC2626]' : 'text-[#0284C7]'
                }`}
              >
                {formatRD(item.ejecutado, moneda)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5">
              <span className="text-[#43474D]">
                {diffCosto >= 0 ? 'Saldo disponible:' : 'Excedente:'}
              </span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  diffCosto >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
                }`}
              >
                {formatRD(Math.abs(diffCosto), moneda)}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#43474D]">Margen planificado:</span>
              <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                {formatRD(item.margenPlanificado, moneda)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-[#43474D]">Margen real:</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  item.margenNegativo ? 'text-[#DC2626]' : 'text-[#15803D]'
                }`}
              >
                {formatRD(item.margenReal, moneda)}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

interface CategoryTooltipProps {
  active?: boolean;
  payload?: Array<{
    name?: string;
    value?: number;
    payload?: {
      categoria: CategoriaPresupuesto;
      etiqueta: string;
      planificado: number;
      ejecutado: number;
    };
  }>;
  moneda: string;
}

const CategoryChartTooltip: React.FC<CategoryTooltipProps> = ({ active, payload, moneda }) => {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const item = payload[0].payload;
  const saldo = item.planificado - item.ejecutado;
  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl text-xs min-w-[210px]">
      <div className="font-bold text-[#0D1C2F]">{item.etiqueta}</div>
      <div className="mt-1.5 space-y-1 border-t border-slate-100 pt-1.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#43474D]">Planificado:</span>
          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
            {formatRD(item.planificado, moneda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#43474D]">Ejecutado:</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              saldo < 0 ? 'text-[#DC2626]' : 'text-[#0284C7]'
            }`}
          >
            {formatRD(item.ejecutado, moneda)}
          </span>
        </div>
      </div>
    </div>
  );
};

export const PresupuestosView: React.FC<PresupuestosViewProps> = ({
  rol,
  snapshot,
  configuracion,
  isLoading = false,
  onCrearVersionPresupuesto,
  onEditarBorradorPresupuesto,
  onTransicionarPresupuesto,
}) => {
  const moneda = snapshot.empresa.moneda || 'RD$';
  const canManage = puedeGestionarPresupuesto(rol);

  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoPresupuestoProyecto | 'ALL'>('ALL');
  const [fechaCalculoIso, setFechaCalculoIso] = useState(() => obtenerFechaHoyAST());
  const [soloExcedidos, setSoloExcedidos] = useState(false);

  const [modoGraficoProyectos, setModoGraficoProyectos] = useState<'costos' | 'margenes'>('costos');
  const [modoGraficoCategorias, setModoGraficoCategorias] = useState<'barras' | 'distribucion'>(
    'barras'
  );
  const [focusedProyectoId, setFocusedProyectoId] = useState<string | 'ALL'>('ALL');
  const [modalProyectoId, setModalProyectoId] = useState<string | null>(null);
  const [kpiModalKey, setKpiModalKey] = useState<
    'contrato' | 'planificado' | 'ejecutado' | 'margen' | null
  >(null);

  const reporte = useMemo(
    () =>
      calcularReportePresupuestosDesdeSnapshot(snapshot, {
        fechaCalculoIso,
      }),
    [snapshot, fechaCalculoIso]
  );

  const comparacionesFiltradas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return reporte.comparaciones.filter((c) => {
      if (estadoFiltro !== 'ALL' && c.estadoPresupuesto !== estadoFiltro) return false;
      if (soloExcedidos && !c.excedidoTotal) return false;
      if (!q) return true;
      return (
        c.nombreProyecto.toLowerCase().includes(q) ||
        c.codigoContrato.toLowerCase().includes(q)
      );
    });
  }, [reporte.comparaciones, searchQuery, estadoFiltro, soloExcedidos]);

  const totalesFiltrados = useMemo(() => {
    const valorContratoRD = comparacionesFiltradas.reduce((s, c) => s + c.valorContratoRD, 0);
    const totalPlanificadoRD = comparacionesFiltradas.reduce(
      (s, c) => s + c.totalPlanificadoRD,
      0
    );
    const totalEjecutadoRD = comparacionesFiltradas.reduce((s, c) => s + c.totalEjecutadoRD, 0);
    const margenPlanificadoRD = valorContratoRD - totalPlanificadoRD;
    const margenRealRD = valorContratoRD - totalEjecutadoRD;
    const excedidosCount = comparacionesFiltradas.filter((c) => c.excedidoTotal).length;
    return {
      valorContratoRD,
      totalPlanificadoRD,
      totalEjecutadoRD,
      margenPlanificadoRD,
      margenRealRD,
      margenPlanificadoPct:
        valorContratoRD > 0 ? Number(((margenPlanificadoRD / valorContratoRD) * 100).toFixed(1)) : null,
      margenRealPct:
        valorContratoRD > 0 ? Number(((margenRealRD / valorContratoRD) * 100).toFixed(1)) : null,
      excedidosCount,
    };
  }, [comparacionesFiltradas]);

  const projectChartData: ProjectChartDatum[] = useMemo(
    () =>
      comparacionesFiltradas.map((c) => {
        const shortPart =
          c.codigoContrato.split('-').slice(-1)[0] || c.codigoContrato.slice(0, 8);
        return {
          proyectoId: c.proyectoId,
          shortCode: `P-${shortPart}`,
          codigoContrato: c.codigoContrato,
          nombre: c.nombreProyecto,
          planificado: Math.round(c.totalPlanificadoRD),
          ejecutado: Math.round(c.totalEjecutadoRD),
          margenPlanificado: Math.round(c.margenPlanificadoRD),
          margenReal: Math.round(c.margenRealRD),
          excedido: c.excedidoTotal,
          margenNegativo: c.margenRealRD < 0,
        };
      }),
    [comparacionesFiltradas]
  );

  const focusedComparison: ComparacionPresupuestoProyecto | undefined = useMemo(() => {
    if (focusedProyectoId === 'ALL') return undefined;
    return comparacionesFiltradas.find((c) => c.proyectoId === focusedProyectoId);
  }, [comparacionesFiltradas, focusedProyectoId]);

  const categoryChartData = useMemo(() => {
    const base = new Map<CategoriaPresupuesto, { planificado: number; ejecutado: number }>();
    for (const cat of CATEGORIAS_PRESUPUESTO) {
      base.set(cat, { planificado: 0, ejecutado: 0 });
    }
    const fuente = focusedComparison ? [focusedComparison] : comparacionesFiltradas;
    for (const comp of fuente) {
      for (const f of comp.filas) {
        const acc = base.get(f.categoria);
        if (acc) {
          acc.planificado += f.planificadoRD;
          acc.ejecutado += f.ejecutadoRD;
        }
      }
    }
    return CATEGORIAS_PRESUPUESTO.map((cat) => {
      const vals = base.get(cat) ?? { planificado: 0, ejecutado: 0 };
      return {
        categoria: cat,
        shortLabel: CATEGORIA_SHORT_LABELS[cat],
        etiqueta: ETIQUETAS_CATEGORIA_PRESUPUESTO[cat],
        planificado: Math.round(vals.planificado),
        ejecutado: Math.round(vals.ejecutado),
        color: CATEGORIA_COLORS[cat],
      };
    });
  }, [comparacionesFiltradas, focusedComparison]);

  const pieData = useMemo(
    () => categoryChartData.filter((d) => d.ejecutado > 0),
    [categoryChartData]
  );

  const totalEjecutadoCategoria = useMemo(
    () => categoryChartData.reduce((s, d) => s + d.ejecutado, 0),
    [categoryChartData]
  );

  const borradorPorProyecto = useMemo(() => {
    const mapa = new Map<string, boolean>();
    for (const p of snapshot.presupuestos ?? []) {
      if (p.estado === 'borrador') mapa.set(p.proyectoId, true);
    }
    return mapa;
  }, [snapshot.presupuestos]);

  const handleExportCsv = () => {
    const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const header =
      'Codigo_Contrato,Proyecto,Version,Estado_Presupuesto,Vigencia_Desde,Valor_Contrato_RD,Costo_Planificado_RD,Costo_Ejecutado_RD,Saldo_RD,Margen_Planificado_RD,Margen_Real_RD,Margen_Real_Pct,Excedido\n';
    const rows = comparacionesFiltradas.map((c) =>
      [
        escapeCsv(c.codigoContrato),
        escapeCsv(c.nombreProyecto),
        c.versionVigente ? `v${c.versionVigente}` : 'Base',
        c.estadoPresupuesto ? ETIQUETAS_ESTADO_PRESUPUESTO[c.estadoPresupuesto] : 'Sin versión',
        c.vigenciaDesde ?? '',
        c.valorContratoRD.toFixed(2),
        c.totalPlanificadoRD.toFixed(2),
        c.totalEjecutadoRD.toFixed(2),
        c.diferenciaTotalRD.toFixed(2),
        c.margenPlanificadoRD.toFixed(2),
        c.margenRealRD.toFixed(2),
        c.margenRealPct !== null ? c.margenRealPct.toFixed(1) : 'N/D',
        c.excedidoTotal ? 'SI' : 'NO',
      ].join(',')
    );
    const blob = new Blob(['\uFEFF' + header + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `presupuestos_margenes_sirius_${fechaCalculoIso}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading && snapshot.proyectos.length === 0) {
    return <PresupuestosViewSkeleton />;
  }

  const proyectoModal = modalProyectoId
    ? snapshot.proyectos.find((p) => p.id === modalProyectoId) ?? null
    : null;

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
            Presupuestos y Márgenes
          </h2>
          <p className="text-sm text-[#475569] mt-0.5">
            Control presupuestario por versión vigente, ejecución por categoría y rentabilidad de contratos.
          </p>
        </div>
      </div>

      {/* Filter & Actions Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por código de contrato o nombre de proyecto..."
            className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-10 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[42px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <select
            value={estadoFiltro}
            onChange={(e) =>
              setEstadoFiltro(e.target.value as EstadoPresupuestoProyecto | 'ALL')
            }
            aria-label="Filtrar por estado de presupuesto"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
          >
            <option value="ALL">Todos los estados</option>
            <option value="borrador">En borrador</option>
            <option value="aprobado">Aprobados</option>
            <option value="cerrado">Cerrados</option>
          </select>

          <label className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 min-h-[42px]">
            <span className="text-[11px] font-semibold text-[#475569]">Vigencia al:</span>
            <input
              type="date"
              value={fechaCalculoIso}
              onChange={(e) => setFechaCalculoIso(e.target.value || obtenerFechaHoyAST())}
              className="bg-transparent font-mono text-xs text-[#0F2942] focus:outline-none"
            />
          </label>

          <button
            type="button"
            onClick={() => setSoloExcedidos((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[42px] ${
              soloExcedidos
                ? 'border-[#DC2626] bg-[#FEE2E2] text-[#93000A]'
                : 'border-slate-200 bg-white text-[#334155] hover:bg-slate-50'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Solo excedidos ({totalesFiltrados.excedidosCount})
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
          >
            <Download className="h-3.5 w-3.5 text-[#0284C7]" />
            Exportar CSV
          </button>
        </div>
      </div>

      {/* 4-Column Interactive KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => setKpiModalKey('contrato')}
          className="group text-left rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-5 text-white shadow-sm hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#38BDF8]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-sky-100">
            <span>Valor contratado</span>
            <ArrowUpRight className="h-4 w-4 text-sky-200 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold text-white tabular-nums">
            {formatRD(totalesFiltrados.valorContratoRD, moneda)}
          </div>
          <div className="mt-1 text-[11px] text-sky-100/90 tabular-nums">
            {comparacionesFiltradas.length} proyecto(s) · Ver desglose
          </div>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('planificado')}
          className="group text-left rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-[#0284C7] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#475569]">
            <span>Costo planificado</span>
            <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-[#0284C7] transition-colors" />
          </div>
          <div className="mt-1.5 font-mono text-xl font-bold text-[#0F2942] tabular-nums">
            {formatRD(totalesFiltrados.totalPlanificadoRD, moneda)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#475569] tabular-nums">
            Margen plan:{' '}
            {totalesFiltrados.margenPlanificadoPct !== null
              ? `${totalesFiltrados.margenPlanificadoPct}%`
              : 'N/D'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('ejecutado')}
          className="group text-left rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-[#0284C7] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-[#475569]">
            <span>Costo ejecutado en vivo</span>
            <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-[#0284C7] transition-colors" />
          </div>
          <div
            className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
              totalesFiltrados.totalEjecutadoRD > totalesFiltrados.totalPlanificadoRD
                ? 'text-[#DC2626]'
                : 'text-[#0284C7]'
            }`}
          >
            {formatRD(totalesFiltrados.totalEjecutadoRD, moneda)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#475569] tabular-nums">
            Uso:{' '}
            {totalesFiltrados.totalPlanificadoRD > 0
              ? `${Number(
                  (
                    (totalesFiltrados.totalEjecutadoRD / totalesFiltrados.totalPlanificadoRD) *
                    100
                  ).toFixed(1)
                )}%`
              : 'N/D'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => setKpiModalKey('margen')}
          className="group text-left rounded-2xl border border-slate-200/90 bg-white p-5 hover:border-[#0284C7] hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0284C7]"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Margen real consolidado</span>
            <div className="flex items-center gap-1.5">
              {totalesFiltrados.margenRealRD < 0 ? (
                <TrendingDown className="h-4 w-4 text-[#DC2626]" />
              ) : (
                <TrendingUp className="h-4 w-4 text-[#15803D]" />
              )}
              <ArrowUpRight className="h-4 w-4 text-slate-400 group-hover:text-[#0284C7] transition-colors" />
            </div>
          </div>
          <div
            className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${
              totalesFiltrados.margenRealRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]'
            }`}
          >
            {formatRD(totalesFiltrados.margenRealRD, moneda)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-[#475569] tabular-nums">
            {totalesFiltrados.margenRealPct !== null
              ? `${totalesFiltrados.margenRealPct}% sobre contratos`
              : 'Sin valor contractual'}
          </div>
        </button>
      </div>

      {/* 2 Interactive Charts Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Left Chart: Projects Cost vs Plan OR Margins */}
        <div className="xl:col-span-7 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-bold text-[#0F2942]">
                {modoGraficoProyectos === 'costos'
                  ? 'Presupuesto vs. costo ejecutado por proyecto'
                  : 'Margen planificado vs. margen real por proyecto'}
              </h2>
              <p className="text-xs text-[#475569]">
                Haz clic en una barra para filtrar el desglose por categoría.
              </p>
            </div>

            <div className="inline-flex rounded-2xl border border-slate-200/70 bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => setModoGraficoProyectos('costos')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  modoGraficoProyectos === 'costos'
                    ? 'bg-white text-[#0F2942] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Costos
              </button>
              <button
                type="button"
                onClick={() => setModoGraficoProyectos('margenes')}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  modoGraficoProyectos === 'margenes'
                    ? 'bg-white text-[#0F2942] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Márgenes
              </button>
            </div>
          </div>

          {projectChartData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-slate-200/70 bg-[#F8FAFC] py-12 text-xs text-[#475569]">
              No hay proyectos que coincidan con el filtro actual.
            </div>
          ) : (
            <div className="w-full h-[270px] min-w-0 rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={projectChartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                  barGap={6}
                  onClick={(state) => {
                    const idx = state?.activeTooltipIndex;
                    if (typeof idx === 'number' && projectChartData[idx]) {
                      const clickedId = projectChartData[idx].proyectoId;
                      setFocusedProyectoId((prev) => (prev === clickedId ? 'ALL' : clickedId));
                    }
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="shortCode"
                    tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val: number) =>
                      Math.abs(val) >= 1000 ? `${Math.round(val / 1000)}k` : String(val)
                    }
                    tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={46}
                  />
                  <Tooltip
                    content={<ProjectBarTooltip moneda={moneda} modo={modoGraficoProyectos} />}
                    cursor={{ fill: '#F1F5F9' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    iconType="square"
                    iconSize={9}
                  />
                  {modoGraficoProyectos === 'costos' ? (
                    <>
                      <Bar
                        dataKey="planificado"
                        name="Planificado"
                        fill="#0F2942"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="ejecutado"
                        name="Ejecutado"
                        fill="#0284C7"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      >
                        {projectChartData.map((entry) => (
                          <Cell
                            key={entry.proyectoId}
                            fill={entry.excedido ? '#DC2626' : '#0284C7'}
                          />
                        ))}
                      </Bar>
                    </>
                  ) : (
                    <>
                      <Bar
                        dataKey="margenPlanificado"
                        name="Margen planificado"
                        fill="#0F2942"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      />
                      <Bar
                        dataKey="margenReal"
                        name="Margen real"
                        fill="#15803D"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                      >
                        {projectChartData.map((entry) => (
                          <Cell
                            key={entry.proyectoId}
                            fill={entry.margenNegativo ? '#DC2626' : '#15803D'}
                          />
                        ))}
                      </Bar>
                    </>
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right Chart: Category Breakdown (Bars vs Donut) */}
        <div className="xl:col-span-5 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-[#0F2942] truncate">
                {focusedComparison
                  ? `Categorías · ${focusedComparison.codigoContrato}`
                  : 'Desglose por categoría (consolidado)'}
              </h2>
              <div className="flex items-center gap-2 text-xs text-[#475569]">
                <span>6 categorías de ejecución</span>
                {focusedComparison && (
                  <button
                    type="button"
                    onClick={() => setFocusedProyectoId('ALL')}
                    className="font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
                  >
                    Ver todos
                  </button>
                )}
              </div>
            </div>

            <div className="inline-flex rounded-2xl border border-slate-200/70 bg-[#F1F5F9] p-1 shrink-0">
              <button
                type="button"
                onClick={() => setModoGraficoCategorias('barras')}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  modoGraficoCategorias === 'barras'
                    ? 'bg-white text-[#0F2942] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Plan vs. real
              </button>
              <button
                type="button"
                onClick={() => setModoGraficoCategorias('distribucion')}
                className={`rounded-xl px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  modoGraficoCategorias === 'distribucion'
                    ? 'bg-white text-[#0F2942] shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Distribución
              </button>
            </div>
          </div>

          {modoGraficoCategorias === 'barras' ? (
            <div className="w-full h-[270px] min-w-0 rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={categoryChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  barGap={4}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                  <XAxis
                    dataKey="shortLabel"
                    tick={{ fontSize: 11, fill: '#475569' }}
                    axisLine={{ stroke: '#CBD5E1' }}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(val: number) =>
                      val >= 1000 ? `${Math.round(val / 1000)}k` : String(val)
                    }
                    tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                    axisLine={false}
                    tickLine={false}
                    width={42}
                  />
                  <Tooltip
                    content={<CategoryChartTooltip moneda={moneda} />}
                    cursor={{ fill: '#F1F5F9' }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                    iconType="square"
                    iconSize={9}
                  />
                  <Bar
                    dataKey="planificado"
                    name="Planificado"
                    fill="#0F2942"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  />
                  <Bar
                    dataKey="ejecutado"
                    name="Ejecutado"
                    fill="#0284C7"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={22}
                  >
                    {categoryChartData.map((d) => (
                      <Cell
                        key={d.categoria}
                        fill={d.ejecutado > d.planificado ? '#DC2626' : '#0284C7'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : pieData.length === 0 ? (
            <div className="flex-1 flex items-center justify-center rounded-xl border border-slate-200/70 bg-[#F8FAFC] py-12 text-xs text-[#475569]">
              Aún no hay costos ejecutados en estas categorías.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center h-[270px] rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3">
              <div className="h-[220px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="ejecutado"
                      nameKey="shortLabel"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={2}
                    >
                      {pieData.map((entry) => (
                        <Cell key={entry.categoria} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => formatRD(Number(val) || 0, moneda)}
                      contentStyle={{ fontSize: '11px', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2 text-xs">
                {pieData.map((d) => {
                  const pct =
                    totalEjecutadoCategoria > 0
                      ? ((d.ejecutado / totalEjecutadoCategoria) * 100).toFixed(1)
                      : '0.0';
                  return (
                    <div
                      key={d.categoria}
                      className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="h-2.5 w-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: d.color }}
                        />
                        <span className="text-[#0D1C2F] font-medium truncate">
                          {d.shortLabel}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] font-semibold text-[#0F2942] tabular-nums shrink-0">
                        {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Project Budget Comparison Table */}
      <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F2942]">
              Control presupuestario y margen por proyecto
            </h2>
            <p className="text-xs text-[#475569]">
              Comparación de versión vigente al {fechaCalculoIso} frente a costos en vivo de viáticos, rentas y asignaciones.
            </p>
          </div>
          {focusedComparison && (
            <button
              type="button"
              onClick={() => setFocusedProyectoId('ALL')}
              className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
            >
              Limpiar selección ({focusedComparison.codigoContrato})
            </button>
          )}
        </div>

        {comparacionesFiltradas.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#475569]">
            No hay presupuestos de proyectos que coincidan con los filtros actuales.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200/80 bg-[#F8FAFC] text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
                  <th className="px-4 py-3">Proyecto / Contrato</th>
                  <th className="px-4 py-3">Versión vigente</th>
                  <th className="px-4 py-3 text-right">Contrato</th>
                  <th className="px-4 py-3 text-right">Planificado</th>
                  <th className="px-4 py-3 text-right">Ejecutado</th>
                  <th className="px-4 py-3 text-right">% uso</th>
                  <th className="px-4 py-3 text-right">Margen real</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {comparacionesFiltradas.map((c) => {
                  const tieneBorrador = borradorPorProyecto.get(c.proyectoId) ?? false;
                  const isFocused = focusedProyectoId === c.proyectoId;
                  return (
                    <tr
                      key={c.proyectoId}
                      onClick={() =>
                        setFocusedProyectoId((prev) =>
                          prev === c.proyectoId ? 'ALL' : c.proyectoId
                        )
                      }
                      className={`cursor-pointer transition-colors ${
                        isFocused ? 'bg-sky-50/70' : 'hover:bg-[#F8FAFC]'
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11px] font-bold text-[#0284C7]">
                          {c.codigoContrato}
                        </div>
                        <div className="font-semibold text-[#0D1C2F]">{c.nombreProyecto}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-[#0F2942]">
                          {c.versionVigente ? `v${c.versionVigente}` : 'Base'}
                          {c.estadoPresupuesto && (
                            <span
                              className={`ml-1.5 font-sans text-[11px] ${
                                c.estadoPresupuesto === 'aprobado'
                                  ? 'text-[#15803D]'
                                  : c.estadoPresupuesto === 'cerrado'
                                  ? 'text-[#0F2942]'
                                  : 'text-[#B45309]'
                              }`}
                            >
                              · {ETIQUETAS_ESTADO_PRESUPUESTO[c.estadoPresupuesto]}
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-[11px] text-[#43474D]">
                          {c.vigenciaDesde ? `Desde ${c.vigenciaDesde}` : 'Migración base'}
                          {tieneBorrador ? ' · Borrador abierto' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0D1C2F]">
                        {formatRD(c.valorContratoRD, moneda)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0F2942]">
                        {formatRD(c.totalPlanificadoRD, moneda)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono font-semibold tabular-nums ${
                          c.excedidoTotal ? 'text-[#DC2626]' : 'text-[#0284C7]'
                        }`}
                      >
                        {formatRD(c.totalEjecutadoRD, moneda)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <span
                          className={
                            c.excedidoTotal ? 'font-bold text-[#DC2626]' : 'text-[#334155]'
                          }
                        >
                          {c.porcentajeEjecucionTotalPct !== null
                            ? `${c.porcentajeEjecucionTotalPct}%`
                            : 'N/D'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        <div
                          className={`font-bold ${
                            c.margenRealRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]'
                          }`}
                        >
                          {formatRD(c.margenRealRD, moneda)}
                        </div>
                        <div className="text-[11px] text-[#43474D]">
                          {c.margenRealPct !== null ? `${c.margenRealPct}%` : '—'}
                        </div>
                      </td>
                      <td
                        className="px-4 py-3 text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => setModalProyectoId(c.proyectoId)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                        >
                          <Calculator className="h-3.5 w-3.5 text-[#0284C7]" />
                          {canManage
                            ? tieneBorrador
                              ? 'Editar borrador'
                              : 'Gestionar presupuesto'
                            : 'Ver detalle'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {kpiModalKey && (() => {
        const meta = {
          contrato: {
            titulo: 'Referencia de Valor Contratado',
            subtitulo:
              'Suma de los montos contractuales de los proyectos en la vista actual.',
            total: formatRD(totalesFiltrados.valorContratoRD, moneda),
            metricLabel: 'Contrato',
            rows: [...comparacionesFiltradas].sort((a, b) => b.valorContratoRD - a.valorContratoRD),
          },
          planificado: {
            titulo: 'Referencia de Costo Planificado',
            subtitulo:
              'Presupuesto operativo asignado en versiones aprobadas o borradores vigentes.',
            total: formatRD(totalesFiltrados.totalPlanificadoRD, moneda),
            metricLabel: 'Planificado',
            rows: [...comparacionesFiltradas].sort(
              (a, b) => b.totalPlanificadoRD - a.totalPlanificadoRD
            ),
          },
          ejecutado: {
            titulo: 'Referencia de Costo Ejecutado en Vivo',
            subtitulo:
              'Gasto real acumulado a la fecha de corte (viáticos, nómina, flota, rentas y GNSS).',
            total: formatRD(totalesFiltrados.totalEjecutadoRD, moneda),
            metricLabel: 'Ejecutado',
            rows: [...comparacionesFiltradas].sort(
              (a, b) => b.totalEjecutadoRD - a.totalEjecutadoRD
            ),
          },
          margen: {
            titulo: 'Referencia de Margen Real Consolidado',
            subtitulo:
              'Diferencia entre valor contratado y costo ejecutado en vivo por proyecto.',
            total: formatRD(totalesFiltrados.margenRealRD, moneda),
            metricLabel: 'Margen real',
            rows: [...comparacionesFiltradas].sort((a, b) => a.margenRealRD - b.margenRealRD),
          },
        }[kpiModalKey];

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-label={meta.titulo}
            onClick={() => setKpiModalKey(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[85vh] flex flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#F8FAFC] px-6 py-4">
                <div>
                  <h3 className="text-base font-bold text-[#0F2942]">{meta.titulo}</h3>
                  <p className="mt-0.5 text-xs text-[#475569]">{meta.subtitulo}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setKpiModalKey(null)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-[#475569] hover:text-[#0F2942] hover:bg-slate-50 shrink-0"
                  aria-label="Cerrar referencia"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3.5 bg-white">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-xs font-medium text-[#475569]">Total consolidado:</span>
                  <span className="font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                    {meta.total}
                  </span>
                </div>
                {(kpiModalKey === 'ejecutado' || kpiModalKey === 'margen') &&
                  totalesFiltrados.excedidosCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSoloExcedidos(true);
                        setKpiModalKey(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-[#DC2626] hover:bg-rose-100 whitespace-nowrap"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Filtrar {totalesFiltrados.excedidosCount} excedido(s)
                    </button>
                  )}
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {meta.rows.length === 0 ? (
                  <p className="text-center text-xs text-[#475569] py-8">
                    No hay proyectos que coincidan con los filtros actuales.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {meta.rows.map((c) => {
                      const pctUso =
                        c.totalPlanificadoRD > 0
                          ? Number(((c.totalEjecutadoRD / c.totalPlanificadoRD) * 100).toFixed(1))
                          : 0;
                      const pctPlanSobreContrato =
                        c.valorContratoRD > 0
                          ? Number(((c.totalPlanificadoRD / c.valorContratoRD) * 100).toFixed(1))
                          : null;
                      const estadoLabel = c.estadoPresupuesto
                        ? ETIQUETAS_ESTADO_PRESUPUESTO[c.estadoPresupuesto]
                        : 'Base';
                      let metricValue = formatRD(c.valorContratoRD, moneda);
                      let metricClass = 'text-[#0F2942]';
                      let secondaryNote =
                        pctPlanSobreContrato !== null
                          ? `${pctPlanSobreContrato}% del contrato planificado`
                          : 'Sin valor contractual';

                      if (kpiModalKey === 'planificado') {
                        metricValue = formatRD(c.totalPlanificadoRD, moneda);
                        secondaryNote =
                          c.margenPlanificadoPct !== null
                            ? `Margen plan: ${c.margenPlanificadoPct}% · ${estadoLabel}`
                            : estadoLabel;
                      } else if (kpiModalKey === 'ejecutado') {
                        metricValue = formatRD(c.totalEjecutadoRD, moneda);
                        metricClass = c.excedidoTotal ? 'text-[#DC2626]' : 'text-[#0284C7]';
                        secondaryNote = `${pctUso}% de ${formatRD(c.totalPlanificadoRD, moneda)} planificado`;
                      } else if (kpiModalKey === 'margen') {
                        metricValue = formatRD(c.margenRealRD, moneda);
                        metricClass = c.margenRealRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]';
                        secondaryNote =
                          c.margenRealPct !== null
                            ? `${c.margenRealPct}% sobre contrato (${formatRD(c.valorContratoRD, moneda)})`
                            : 'Sin contrato asignado';
                      }

                      return (
                        <div
                          key={c.proyectoId}
                          className="flex flex-wrap items-center justify-between gap-3 py-3"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-bold text-[#0284C7]">
                                {c.codigoContrato}
                              </span>
                              {c.excedidoTotal && (
                                <span className="text-[10px] font-semibold text-[#DC2626]">
                                  · Excedido
                                </span>
                              )}
                            </div>
                            <div className="text-xs font-semibold text-[#0F2942] truncate">
                              {c.nombreProyecto}
                            </div>
                            <div className="text-[11px] text-[#475569] tabular-nums">
                              {secondaryNote}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right">
                              <div className="text-[10px] font-medium text-[#64748B]">
                                {meta.metricLabel}
                              </div>
                              <div
                                className={`font-mono text-sm font-bold tabular-nums ${metricClass}`}
                              >
                                {metricValue}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setKpiModalKey(null);
                                setModalProyectoId(c.proyectoId);
                              }}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:border-[#0284C7] hover:text-[#0284C7] whitespace-nowrap"
                            >
                              <Calculator className="h-3.5 w-3.5" />
                              {canManage ? 'Gestionar' : 'Ver detalle'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      <PresupuestoProyectoModal
        isOpen={Boolean(proyectoModal)}
        onClose={() => setModalProyectoId(null)}
        rol={rol}
        proyecto={proyectoModal}
        presupuestos={snapshot.presupuestos ?? []}
        rutas={snapshot.rutas}
        asignaciones={snapshot.asignaciones}
        cuadrillas={snapshot.cuadrillas}
        personal={snapshot.personal}
        vehiculos={snapshot.vehiculos}
        viaticos={snapshot.viaticos}
        rentas={snapshot.rentas}
        configuracion={configuracion}
        moneda={moneda}
        onCrearVersion={onCrearVersionPresupuesto}
        onEditarBorrador={onEditarBorradorPresupuesto}
        onTransicionarEstado={onTransicionarPresupuesto}
      />
    </section>
  );
};
