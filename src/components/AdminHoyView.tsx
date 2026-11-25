import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Camera,
  CheckCircle2,
  Compass,
  FolderKanban,
  Plus,
  Search,
  Sparkles,
  Truck,
  X,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  calcularReportePresupuestosEmpresa,
  obtenerFechaHoyAST,
  obtenerRentasVencidasSinDevolucion,
  obtenerResumenOnboarding,
} from '../domain';
import type {
  Asignacion,
  ConfiguracionEmpresa,
  Cuadrilla,
  Empresa,
  EstadoAprobacionViatico,
  EstadoOnboardingEmpresa,
  OnboardingPasoId,
  Personal,
  PresupuestoProyecto,
  Proyecto,
  Renta,
  Ruta,
  Servicio,
  ServicioCatalogoConfig,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';
import { AdminHoySkeleton } from './Skeletons';

interface AdminHoyViewProps {
  empresa: Empresa;
  personal: Personal[];
  proyectos: Proyecto[];
  presupuestos?: PresupuestoProyecto[];
  configuracion?: ConfiguracionEmpresa | null;
  serviciosConfig: ServicioCatalogoConfig[];
  rutas: Ruta[];
  servicios: Servicio[];
  asignaciones: Asignacion[];
  cuadrillas: Cuadrilla[];
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  rentas?: Renta[];
  onboarding: EstadoOnboardingEmpresa;
  isDemo: boolean;
  isLoading?: boolean;
  usuarioNombre?: string;
  onIrAPasoOnboarding: (pasoId: OnboardingPasoId) => void;
  onAbrirOnboarding: () => void;
  onCerrarTarjetaOnboarding: () => Promise<void>;
  onAbrirModalViatico?: () => void;
  onAbrirKmzModal?: () => void;
  onIrATab: (
    tab: 'proyectos' | 'presupuestos' | 'agenda' | 'viaticos' | 'catalogos' | 'configuracion'
  ) => void;
}

interface HoyBarTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload?: {
      codigo: string;
      nombre: string;
      planificado: number;
      ejecutado: number;
    };
  }>;
  moneda: string;
}

const HoyBarTooltip: React.FC<HoyBarTooltipProps> = ({ active, payload, moneda }) => {
  if (!active || !payload || payload.length === 0 || !payload[0].payload) return null;
  const item = payload[0].payload;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-lg text-xs min-w-[190px]">
      <div className="font-mono text-[11px] font-bold text-[#0284C7]">{item.codigo}</div>
      <div className="font-semibold text-[#0F2942] truncate max-w-[200px]">{item.nombre}</div>
      <div className="mt-2 space-y-1 border-t border-slate-100 pt-1.5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Planificado:</span>
          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
            {formatRD(item.planificado, moneda)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Ejecutado:</span>
          <span className="font-mono font-bold text-[#0284C7] tabular-nums">
            {formatRD(item.ejecutado, moneda)}
          </span>
        </div>
      </div>
    </div>
  );
};

const ETIQUETA_ESTADO_VIATICO: Record<EstadoAprobacionViatico, string> = {
  aprobado: 'Aprobado',
  pendiente: 'Pendiente',
  rechazado: 'Rechazado',
};

export const AdminHoyView: React.FC<AdminHoyViewProps> = ({
  empresa,
  personal,
  proyectos,
  presupuestos = [],
  configuracion,
  serviciosConfig,
  rutas,
  servicios,
  asignaciones,
  cuadrillas,
  vehiculos,
  viaticos,
  rentas = [],
  onboarding,
  isDemo,
  isLoading = false,
  usuarioNombre,
  onIrAPasoOnboarding,
  onAbrirOnboarding,
  onCerrarTarjetaOnboarding,
  onAbrirModalViatico,
  onAbrirKmzModal,
  onIrATab,
}) => {
  const [actividadTab, setActividadTab] = useState<'comprobantes' | 'brigadas'>('comprobantes');
  const [busquedaActividad, setBusquedaActividad] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoAprobacionViatico | 'ALL'>('ALL');

  const hoyIso = obtenerFechaHoyAST();
  const moneda = empresa.moneda || 'RD$';

  const reportePresupuestos = useMemo(
    () =>
      calcularReportePresupuestosEmpresa({
        proyectos,
        presupuestos,
        rutas,
        asignaciones,
        cuadrillas,
        personal,
        vehiculos,
        viaticos,
        rentas,
        configuracion: configuracion ?? undefined,
        fechaCalculoIso: hoyIso,
      }),
    [
      proyectos,
      presupuestos,
      rutas,
      asignaciones,
      cuadrillas,
      personal,
      vehiculos,
      viaticos,
      rentas,
      configuracion,
      hoyIso,
    ]
  );

  const chartData = useMemo(
    () =>
      reportePresupuestos.comparaciones.slice(0, 6).map((c) => ({
        codigo: c.codigoContrato.replace(/^CT-\d{4}-/, '#'),
        nombre: c.nombreProyecto,
        planificado: Math.round(c.totalPlanificadoRD),
        ejecutado: Math.round(c.totalEjecutadoRD),
      })),
    [reportePresupuestos]
  );

  const actividadesFiltradas = useMemo(() => {
    const q = busquedaActividad.trim().toLowerCase();
    return [...viaticos]
      .sort((a, b) => {
        const cmp = b.fechaIso.localeCompare(a.fechaIso);
        return cmp !== 0 ? cmp : b.timestampAST.localeCompare(a.timestampAST);
      })
      .filter((v) => {
        if (estadoFiltro !== 'ALL' && v.estadoAprobacion !== estadoFiltro) return false;
        if (!q) return true;
        return (
          v.comercio.toLowerCase().includes(q) ||
          v.creadoPorNombre.toLowerCase().includes(q) ||
          v.categoria.toLowerCase().includes(q) ||
          (v.ncf || '').toLowerCase().includes(q)
        );
      })
      .slice(0, 6);
  }, [viaticos, busquedaActividad, estadoFiltro]);

  if (isLoading) {
    return <AdminHoySkeleton />;
  }

  const resumenOnboarding = obtenerResumenOnboarding(onboarding, isDemo, {
    empresa,
    personal,
    vehiculos,
    serviciosConfig,
    proyectos,
    esDemo: isDemo,
  });

  const asignacionesHoy = asignaciones.filter(
    (a) => a.fechaInicio <= hoyIso && a.fechaFin >= hoyIso
  );
  const cuadrillasActivasHoyIds = new Set(asignacionesHoy.map((a) => a.cuadrillaId));
  const cuadrillasDisponibles = cuadrillas.filter((c) => c.activa).length;

  const viaticosPendientes = viaticos.filter((v) => v.estadoAprobacion === 'pendiente');
  const totalPendientesRD = viaticosPendientes.reduce((acc, v) => acc + v.montoRD, 0);
  const totalAprobadosRD = viaticos
    .filter((v) => v.estadoAprobacion === 'aprobado')
    .reduce((acc, v) => acc + (v.montoAprobadoEmpresaRD ?? v.montoRD), 0);

  const rentasActivas = rentas.filter(
    (r) => r.estado === 'activa' || r.estado === 'reservada'
  );
  const totalRentasActivasRD = rentasActivas.reduce((acc, r) => acc + r.costoTotalRD, 0);

  const vehiculosDisponibles = vehiculos.filter((v) => v.estado !== 'en_mantenimiento').length;
  const vehiculosMantenimiento = vehiculos.filter((v) => v.estado === 'en_mantenimiento');
  const serviciosEnCampo = servicios.filter((s) => s.estado === 'en_campo');
  const rentasVencidas = obtenerRentasVencidasSinDevolucion(rentas, hoyIso);

  const { totales } = reportePresupuestos;
  const ejecucionPct =
    totales.totalPlanificadoRD > 0
      ? Math.round((totales.totalEjecutadoRD / totales.totalPlanificadoRD) * 100)
      : 0;
  const ejecucionBarraPct = Math.min(100, Math.max(0, ejecucionPct));
  const excedePresupuestoGlobal =
    totales.totalPlanificadoRD > 0 && totales.totalEjecutadoRD > totales.totalPlanificadoRD;

  const primerNombre = usuarioNombre ? usuarioNombre.split(' ')[0] : '';
  const saludoTitulo = primerNombre ? `Resumen ejecutivo, ${primerNombre}` : `Hoy en ${empresa.nombre}`;

  return (
    <div className="space-y-6">
      {/* Greeting Header — clean typographic anchor directly on canvas */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl sm:text-[28px] font-bold tracking-tight text-[#0F2942] text-balance leading-tight">
            {saludoTitulo}
          </h2>
          <p className="text-xs sm:text-sm text-[#475569] mt-1">
            Supervisa contratos activos, ejecución presupuestaria y cuadrillas en{' '}
            <span className="font-semibold text-[#0F2942]">{empresa.nombre}</span> ·{' '}
            <span className="font-mono">{hoyIso}</span> (AST)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onIrATab('presupuestos')}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#0F2942] whitespace-nowrap shrink-0 transition-colors"
          >
            Ver presupuestos
          </button>
          <button
            type="button"
            onClick={() => onIrATab('configuracion')}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-[#475569] hover:text-[#0F2942] whitespace-nowrap shrink-0 transition-colors"
          >
            Configuración
          </button>
        </div>
      </div>

      {/* Tarjeta opcional de Onboarding */}
      {resumenOnboarding.debeMostrarTarjetaHoy && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                <Sparkles className="w-4 h-4 text-[#0284C7] shrink-0" />
                <span>
                  Puesta en marcha de la empresa ({resumenOnboarding.pasosCompletados.length}/
                  {resumenOnboarding.totalPasos} completos reales)
                </span>
              </div>
              <p className="text-xs text-[#475569]">
                Faltan {resumenOnboarding.pasosPendientes.length} de {resumenOnboarding.totalPasos}{' '}
                pasos opcionales para dejar lista la operación de {empresa.nombre}
                {resumenOnboarding.pasosCompletadosManuales.length > 0
                  ? ` · ${resumenOnboarding.pasosCompletadosManuales.length} completado(s) manualmente sin datos.`
                  : '.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onAbrirOnboarding}
                className="min-h-[40px] px-4 py-2 bg-[#0F2942] hover:bg-[#0284C7] text-white text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors"
              >
                Continuar asistente
              </button>
              <button
                type="button"
                onClick={() => {
                  onCerrarTarjetaOnboarding().catch(() => {});
                }}
                title="Ocultar tarjeta de configuración en Hoy"
                aria-label="Ocultar tarjeta de configuración en Hoy"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#15803D] transition-all"
              style={{ width: `${resumenOnboarding.porcentajeReal}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumenOnboarding.detallePasos.map(({ paso, estado, etiquetaEstado }) => {
              const isPending = estado === 'pendiente';
              const isManual = estado === 'completo_manual';
              return (
                <button
                  key={paso.id}
                  type="button"
                  onClick={() => onIrAPasoOnboarding(paso.id)}
                  className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border text-left text-xs transition-colors min-h-[44px] ${
                    isPending
                      ? 'bg-[#F8FAFC] hover:bg-slate-100 border-slate-200 text-[#0F2942]'
                      : isManual
                      ? 'bg-amber-50/70 hover:bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        estado === 'completo'
                          ? 'text-[#15803D]'
                          : isManual
                          ? 'text-[#B45309]'
                          : estado === 'saltado'
                          ? 'text-slate-400'
                          : 'text-slate-300'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {paso.numero}. {paso.titulo}
                      </div>
                      {isManual && (
                        <div className="text-[11px] font-semibold text-[#B45309] truncate">
                          {etiquetaEstado}
                        </div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerta de rentas vencidas sin devolución */}
      {rentasVencidas.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-[#B45309] shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950">
              <div className="font-bold">
                {rentasVencidas.length} renta(s) vencida(s) sin devolución registrada
              </div>
              <div className="text-amber-900">
                {rentasVencidas
                  .map(
                    (r) =>
                      `${r.recursoEtiqueta || r.recursoId} (${r.proveedor}, venció ${r.fechaFin})`
                  )
                  .join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onIrATab('catalogos')}
            className="min-h-[40px] px-4 py-2 bg-[#B45309] hover:bg-amber-900 text-white text-xs font-semibold rounded-xl whitespace-nowrap shrink-0 transition-colors"
          >
            Revisar rentas
          </button>
        </div>
      )}

      {/* Top 3-Column Bento Row (Portfolio + 2x2 Metrics + Comparison Bar Chart) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Col 1: Valor en Contratos + Acciones rápidas + Carteras operativas */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between gap-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#475569]">
                Valor Total en Contratos
              </span>
              <span className="font-mono text-[11px] font-semibold text-[#0284C7]">
                {moneda} · {proyectos.length} proy.
              </span>
            </div>

            <div>
              <div className="font-mono text-3xl font-bold tracking-tight text-[#0F2942] tabular-nums">
                {formatRD(totales.valorContratoRD, moneda)}
              </div>
              <p className="mt-1 text-xs text-[#475569]">
                <span className="font-semibold text-[#15803D]">{serviciosEnCampo.length}</span>{' '}
                {serviciosEnCampo.length === 1 ? 'servicio activo' : 'servicios activos'} en campo
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => (onAbrirModalViatico ? onAbrirModalViatico() : onIrATab('viaticos'))}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#0F2942] px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[42px] whitespace-nowrap"
              >
                <Camera className="h-3.5 w-3.5 shrink-0" />
                Registrar viático
              </button>
              <button
                type="button"
                onClick={() => (onAbrirKmzModal ? onAbrirKmzModal() : onIrATab('proyectos'))}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-[#F8FAFC] px-3.5 py-2.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 transition-colors min-h-[42px] whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                Importar KMZ
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 space-y-2.5">
            <div className="flex items-center justify-between text-[11px] text-[#475569]">
              <span className="font-semibold text-[#0F2942]">Cartera operativa</span>
              <span>{viaticos.length} comprobantes</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => onIrATab('viaticos')}
                className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2.5 text-left hover:border-[#0284C7] transition-colors"
              >
                <div className="text-[11px] font-medium text-[#475569]">Aprobados</div>
                <div className="mt-1 font-mono text-xs font-bold text-[#0F2942] tabular-nums truncate">
                  {formatRD(totalAprobadosRD, moneda)}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-[#15803D]">Empresa</div>
              </button>
              <button
                type="button"
                onClick={() => onIrATab('viaticos')}
                className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2.5 text-left hover:border-[#0284C7] transition-colors"
              >
                <div className="text-[11px] font-medium text-[#475569]">Por revisar</div>
                <div className="mt-1 font-mono text-xs font-bold text-[#0F2942] tabular-nums truncate">
                  {formatRD(totalPendientesRD, moneda)}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-[#B45309]">
                  {viaticosPendientes.length} pend.
                </div>
              </button>
              <button
                type="button"
                onClick={() => onIrATab('catalogos')}
                className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2.5 text-left hover:border-[#0284C7] transition-colors"
              >
                <div className="text-[11px] font-medium text-[#475569]">Rentas</div>
                <div className="mt-1 font-mono text-xs font-bold text-[#0F2942] tabular-nums truncate">
                  {formatRD(totalRentasActivasRD, moneda)}
                </div>
                <div className="mt-0.5 text-[10px] font-semibold text-[#0284C7]">
                  {rentasActivas.length} act.
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Col 2: 2x2 Bento Metric Grid with focal Navy-to-Sky brand tile */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-4 grid grid-cols-2 gap-3">
          {/* Focal Brand Tile */}
          <button
            type="button"
            onClick={() => onIrATab('presupuestos')}
            className="rounded-xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-4 text-left text-white flex flex-col justify-between hover:opacity-95 transition-opacity min-h-[126px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-white/90">Planificado</span>
              <ArrowUpRight className="h-4 w-4 text-white/80 shrink-0" />
            </div>
            <div>
              <div className="font-mono text-lg sm:text-xl font-bold tabular-nums tracking-tight">
                {formatRD(totales.totalPlanificadoRD, moneda)}
              </div>
              <div className="mt-1 text-[11px] text-white/80">
                {reportePresupuestos.comparaciones.length} proyecto(s)
              </div>
            </div>
          </button>

          {/* Ejecutado Real */}
          <button
            type="button"
            onClick={() => onIrATab('presupuestos')}
            className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4 text-left flex flex-col justify-between hover:border-[#0284C7] transition-colors min-h-[126px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#475569]">Ejecutado Real</span>
              <FolderKanban className="h-4 w-4 text-[#0284C7] shrink-0" />
            </div>
            <div>
              <div className="font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums tracking-tight">
                {formatRD(totales.totalEjecutadoRD, moneda)}
              </div>
              <div
                className={`mt-1 text-[11px] font-semibold tabular-nums ${
                  excedePresupuestoGlobal ? 'text-[#DC2626]' : 'text-[#0284C7]'
                }`}
              >
                {ejecucionPct}% del planificado
              </div>
            </div>
          </button>

          {/* Margen Proyectado */}
          <button
            type="button"
            onClick={() => onIrATab('presupuestos')}
            className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4 text-left flex flex-col justify-between hover:border-[#0284C7] transition-colors min-h-[126px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#475569]">Margen Real</span>
              <Compass className="h-4 w-4 text-[#15803D] shrink-0" />
            </div>
            <div>
              <div
                className={`font-mono text-lg sm:text-xl font-bold tabular-nums tracking-tight ${
                  totales.margenRealRD < 0 ? 'text-[#DC2626]' : 'text-[#0F2942]'
                }`}
              >
                {formatRD(totales.margenRealRD, moneda)}
              </div>
              <div className="mt-1 text-[11px] text-[#15803D] font-semibold tabular-nums">
                {totales.margenRealPct !== null ? `${totales.margenRealPct}% margen` : 'Sin contrato'}
              </div>
            </div>
          </button>

          {/* Cuadrillas Hoy */}
          <button
            type="button"
            onClick={() => onIrATab('agenda')}
            className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4 text-left flex flex-col justify-between hover:border-[#0284C7] transition-colors min-h-[126px]"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#475569]">Cuadrillas Hoy</span>
              <Truck className="h-4 w-4 text-[#0F2942] shrink-0" />
            </div>
            <div>
              <div className="font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums tracking-tight">
                {cuadrillasActivasHoyIds.size} / {cuadrillasDisponibles}
              </div>
              <div className="mt-1 text-[11px] text-[#475569] tabular-nums">
                {asignacionesHoy.length} ruta(s) en agenda hoy
              </div>
            </div>
          </button>
        </div>

        {/* Col 3: Comparativa por Proyecto (Planificado vs Ejecutado) */}
        <div className="lg:col-span-4 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#0F2942]">Ejecución por Proyecto</h3>
              <p className="text-[11px] text-[#475569]">
                Planificado vs. ejecutado real ({moneda})
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-[#475569] shrink-0">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#0F2942]" />
                Plan
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#0284C7]" />
                Real
              </span>
            </div>
          </div>

          <div className="flex-1 min-h-[210px] rounded-xl border border-slate-100 bg-[#F8FAFC] p-2.5">
            {chartData.length === 0 ? (
              <div className="h-full min-h-[190px] flex flex-col items-center justify-center text-center px-4 text-xs text-[#475569]">
                <p>No hay proyectos con presupuesto registrado todavía.</p>
                <button
                  type="button"
                  onClick={() => onIrATab('presupuestos')}
                  className="mt-2 font-semibold text-[#0284C7] hover:text-[#0F2942]"
                >
                  Configurar primer presupuesto &rarr;
                </button>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 8, right: 6, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis
                    dataKey="codigo"
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#64748B' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)
                    }
                  />
                  <Tooltip
                    content={<HoyBarTooltip moneda={moneda} />}
                    cursor={{ fill: 'rgba(2, 132, 199, 0.06)' }}
                  />
                  <Bar
                    dataKey="planificado"
                    name="Planificado"
                    fill="#0F2942"
                    radius={[5, 5, 0, 0]}
                    barSize={14}
                  />
                  <Bar
                    dataKey="ejecutado"
                    name="Ejecutado"
                    fill="#0284C7"
                    radius={[5, 5, 0, 0]}
                    barSize={14}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Bottom 2-Column Asymmetric Bento Row (4 cols Limits & Fleet + 8 cols Recent Activity Table) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left Column: Budget Utilization Progress + Fleet & Operations Visual Cards */}
        <div className="lg:col-span-4 flex flex-col gap-5">
          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0F2942]">Límite de Ejecución Global</h3>
              <span
                className={`font-mono text-xs font-bold tabular-nums ${
                  excedePresupuestoGlobal ? 'text-[#DC2626]' : 'text-[#0284C7]'
                }`}
              >
                {ejecucionPct}%
              </span>
            </div>

            <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  excedePresupuestoGlobal ? 'bg-[#DC2626]' : 'bg-[#0284C7]'
                }`}
                style={{ width: `${ejecucionBarraPct}%` }}
              />
            </div>

            <div className="flex items-center justify-between gap-2 text-xs text-[#475569] tabular-nums">
              <span>
                <strong className="font-mono text-[#0F2942]">
                  {formatRD(totales.totalEjecutadoRD, moneda)}
                </strong>{' '}
                ejecutado de
              </span>
              <span className="font-mono font-semibold text-[#0F2942]">
                {formatRD(totales.totalPlanificadoRD, moneda)}
              </span>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex-1 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0F2942]">Flota y Control en Campo</h3>
              <button
                type="button"
                onClick={() => onIrATab('catalogos')}
                className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-100 whitespace-nowrap shrink-0 transition-colors"
              >
                Ver catálogos
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onIrATab('catalogos')}
                className="rounded-xl bg-[#0F2942] p-4 text-left text-white flex flex-col justify-between min-h-[118px] hover:bg-[#163a5c] transition-colors"
              >
                <div className="flex items-center justify-between text-[11px] text-[#93CCFF] font-semibold">
                  <span>Flota Vehicular</span>
                  <Truck className="h-4 w-4 text-[#93CCFF]" />
                </div>
                <div className="mt-3">
                  <div className="font-mono text-xl font-bold tabular-nums">
                    {vehiculosDisponibles} / {vehiculos.length}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-300">
                    {vehiculosMantenimiento.length} en mantenimiento
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onIrATab('viaticos')}
                className="rounded-xl bg-gradient-to-br from-[#0284C7] to-[#0369A1] p-4 text-left text-white flex flex-col justify-between min-h-[118px] hover:opacity-95 transition-opacity"
              >
                <div className="flex items-center justify-between text-[11px] text-sky-100 font-semibold">
                  <span>Control Viáticos</span>
                  <ArrowUpRight className="h-4 w-4 text-white" />
                </div>
                <div className="mt-3">
                  <div className="font-mono text-xl font-bold tabular-nums">
                    {viaticosPendientes.length} pend.
                  </div>
                  <div className="mt-0.5 text-[11px] text-sky-100 tabular-nums">
                    {formatRD(totalPendientesRD, moneda)} por decidir
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Actividad Reciente y Brigadas */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-bold text-[#0F2942]">Actividad Reciente</h3>
              <div className="inline-flex rounded-xl bg-[#F1F5F9] p-1 border border-slate-200/70">
                <button
                  type="button"
                  onClick={() => setActividadTab('comprobantes')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    actividadTab === 'comprobantes'
                      ? 'bg-white text-[#0F2942] shadow-sm'
                      : 'text-[#475569] hover:text-[#0F2942]'
                  }`}
                >
                  Comprobantes ({viaticos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setActividadTab('brigadas')}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap ${
                    actividadTab === 'brigadas'
                      ? 'bg-white text-[#0F2942] shadow-sm'
                      : 'text-[#475569] hover:text-[#0F2942]'
                  }`}
                >
                  Brigadas hoy ({asignacionesHoy.length})
                </button>
              </div>
            </div>

            {actividadTab === 'comprobantes' ? (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 sm:w-48">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="search"
                    value={busquedaActividad}
                    onChange={(e) => setBusquedaActividad(e.target.value)}
                    placeholder="Buscar comercio..."
                    aria-label="Buscar comprobante reciente"
                    className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#0F2942] min-h-[36px] focus:border-[#0284C7] focus:bg-white focus:outline-none"
                  />
                </div>
                <select
                  value={estadoFiltro}
                  onChange={(e) =>
                    setEstadoFiltro(e.target.value as EstadoAprobacionViatico | 'ALL')
                  }
                  aria-label="Filtrar estado de actividad"
                  className="rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-1.5 text-xs font-medium text-[#0F2942] min-h-[36px]"
                >
                  <option value="ALL">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="aprobado">Aprobados</option>
                  <option value="rechazado">Rechazados</option>
                </select>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onIrATab('agenda')}
                className="text-xs font-semibold text-[#0284C7] hover:text-[#0F2942] whitespace-nowrap self-start sm:self-auto"
              >
                Abrir agenda completa &rarr;
              </button>
            )}
          </div>

          {actividadTab === 'comprobantes' ? (
            actividadesFiltradas.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] py-10 px-4 text-center">
                <p className="text-xs font-medium text-[#475569]">
                  No hay comprobantes que coincidan con el filtro actual.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    onAbrirModalViatico ? onAbrirModalViatico() : onIrATab('viaticos')
                  }
                  className="mt-3 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap"
                >
                  Registrar primer viático
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200/80">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-[11px] font-semibold text-[#475569]">
                      <th className="px-4 py-3">Fecha / Cat.</th>
                      <th className="px-4 py-3">Comercio / Responsable</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {actividadesFiltradas.map((v) => {
                      const colorEstado =
                        v.estadoAprobacion === 'aprobado'
                          ? 'text-[#15803D]'
                          : v.estadoAprobacion === 'rechazado'
                          ? 'text-[#DC2626]'
                          : 'text-[#B45309]';
                      return (
                        <tr key={v.id} className="hover:bg-[#F8FAFC] transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="font-mono font-semibold text-[#0F2942]">
                              {v.fechaIso}
                            </div>
                            <div className="text-[11px] text-[#475569]">{v.categoria}</div>
                          </td>
                          <td className="px-4 py-3 max-w-[240px]">
                            <div className="font-semibold text-[#0F2942] truncate">
                              {v.comercio}
                            </div>
                            <div className="text-[11px] text-[#475569] truncate">
                              {v.creadoPorNombre}
                              {v.ncf ? ` · NCF ${v.ncf}` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-[#0F2942] tabular-nums whitespace-nowrap">
                            {formatRD(v.montoRD, moneda)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`font-semibold ${colorEstado}`}>
                              {ETIQUETA_ESTADO_VIATICO[v.estadoAprobacion]}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => onIrATab('viaticos')}
                              className="text-xs font-semibold text-[#0284C7] hover:text-[#0F2942]"
                            >
                              Revisar
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : asignacionesHoy.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-[#F8FAFC] py-10 px-4 text-center">
              <p className="text-xs font-medium text-[#475569]">
                No hay cuadrillas asignadas para hoy ({hoyIso}).
              </p>
              <button
                type="button"
                onClick={() => onIrATab('agenda')}
                className="mt-3 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap"
              >
                Programar cuadrilla
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-[11px] font-semibold text-[#475569]">
                    <th className="px-4 py-3">Ruta / Parcela</th>
                    <th className="px-4 py-3">Cuadrilla</th>
                    <th className="px-4 py-3">Vigencia</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asignacionesHoy.map((a) => {
                    const ruta = rutas.find((r) => r.id === a.rutaId);
                    const cuadrilla = cuadrillas.find((c) => c.id === a.cuadrillaId);
                    return (
                      <tr key={a.id} className="hover:bg-[#F8FAFC] transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#0F2942]">
                            {ruta?.nombre ?? 'Ruta asignada'}
                          </div>
                          {ruta?.codigoParcela && (
                            <div className="font-mono text-[11px] text-[#0284C7]">
                              {ruta.codigoParcela}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 font-medium text-[#0F2942]">
                          {cuadrilla?.nombre ?? 'Cuadrilla'}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11px] text-[#475569] whitespace-nowrap">
                          {a.fechaInicio} → {a.fechaFin}
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onIrATab('agenda')}
                            className="text-xs font-semibold text-[#0284C7] hover:text-[#0F2942]"
                          >
                            Ver agenda
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
      </div>
    </div>
  );
};
