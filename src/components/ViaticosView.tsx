import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Camera,
  CheckCircle2,
  Compass,
  FileSpreadsheet,
  MapPin,
  Plus,
  Split,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  CATEGORIAS_VIATICO,
  calcularReporteViaticosPorMision,
  calcularReporteViaticosPorProyecto,
  completarRepartoConSinAsignar,
  generarCsvReporteMisiones,
  puedeAprobarViatico,
  resolverEtiquetaCargo,
  validarRepartoViatico,
} from '../domain';
import type {
  CargoConfig,
  CategoriaViatico,
  ConfiguracionEmpresa,
  DecisionExcedenteViatico,
  EstadoAprobacionViatico,
  Mision,
  Proyecto,
  Renta,
  RepartoProyecto,
  RolEmpresa,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';
import { MediaThumb } from './MediaThumb';
import { ViaticosViewSkeleton } from './Skeletons';

interface ViaticosViewProps {
  rol: RolEmpresa;
  viaticos: Viatico[];
  proyectos: Array<Pick<Proyecto, 'id' | 'nombre' | 'codigoContrato' | 'presupuestoViaticosRD'>>;
  misiones?: Mision[];
  rentas?: Renta[];
  cargos?: CargoConfig[];
  configuracion?: ConfiguracionEmpresa;
  moneda?: string;
  isLoading?: boolean;
  onAbrirModalNuevo: () => void;
  onDecidirViatico: (params: {
    viaticoId: string;
    nuevoEstado: EstadoAprobacionViatico;
    motivoRechazo?: string;
    motivoDecision?: string;
    decisionExcedente?: DecisionExcedenteViatico;
  }) => Promise<void>;
  onActualizarReparto: (viaticoId: string, repartos: RepartoProyecto[]) => Promise<void>;
  onEliminarViatico: (viaticoId: string) => Promise<void>;
}

export const ViaticosView: React.FC<ViaticosViewProps> = ({
  rol,
  viaticos,
  proyectos,
  misiones = [],
  rentas = [],
  cargos = [],
  configuracion,
  moneda = 'RD$',
  isLoading = false,
  onAbrirModalNuevo,
  onDecidirViatico,
  onActualizarReparto,
  onEliminarViatico,
}) => {
  const canDecide = puedeAprobarViatico(rol);
  const [filtroCat, setFiltroCat] = useState<CategoriaViatico | 'ALL'>('ALL');
  const [filtroEstado, setFiltroEstado] = useState<EstadoAprobacionViatico | 'ALL'>('ALL');

  // Modal aprobación con motivo opcional (obligatorio si excede tope)
  const [aprobacionTarget, setAprobacionTarget] = useState<Viatico | null>(null);
  const [motivoAprobacion, setMotivoAprobacion] = useState('');
  const [decisionExcedente, setDecisionExcedente] =
    useState<DecisionExcedenteViatico>('aprobado_empresa');

  // Modal rechazo (motivo obligatorio)
  const [rechazoTarget, setRechazoTarget] = useState<Viatico | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal reparto exacto
  const [repartoTarget, setRepartoTarget] = useState<Viatico | null>(null);
  const [repartoEdicion, setRepartoEdicion] = useState<RepartoProyecto[]>([]);

  const viaticosFiltrados = useMemo(
    () =>
      viaticos.filter((v) => {
        if (filtroCat !== 'ALL' && v.categoria !== filtroCat) return false;
        if (filtroEstado !== 'ALL' && v.estadoAprobacion !== filtroEstado) return false;
        return true;
      }),
    [viaticos, filtroCat, filtroEstado]
  );

  const resumen = useMemo(() => {
    let aprobado = 0;
    let pendiente = 0;
    let rechazado = 0;
    let sinAsignar = 0;
    for (const v of viaticos) {
      if (v.estadoAprobacion === 'aprobado') {
        aprobado += v.montoAprobadoEmpresaRD ?? v.montoRD;
      } else if (v.estadoAprobacion === 'rechazado') {
        rechazado += v.montoRD;
      } else {
        pendiente += v.montoRD;
      }

      if (v.estadoAprobacion !== 'rechazado') {
        for (const r of v.repartos) {
          if (r.proyectoId === 'sin_asignar') sinAsignar += r.montoRD;
        }
      }
    }
    return { aprobado, pendiente, rechazado, sinAsignar };
  }, [viaticos]);

  const reportePorProyecto = useMemo(
    () => calcularReporteViaticosPorProyecto(proyectos, viaticos),
    [proyectos, viaticos]
  );

  const reportePorMision = useMemo(
    () =>
      calcularReporteViaticosPorMision({
        misiones,
        viaticos,
        rentas,
        cargos,
        config: configuracion,
      }),
    [misiones, viaticos, rentas, cargos, configuracion]
  );

  const proyectoNombre = (proyectoId: string) => {
    if (proyectoId === 'sin_asignar') return 'Sin asignar';
    const p = proyectos.find((x) => x.id === proyectoId);
    return p ? p.codigoContrato : proyectoId;
  };

  const proyectoNombreCompleto = (proyectoId: string) => {
    if (proyectoId === 'sin_asignar') return 'Sin asignar';
    const p = proyectos.find((x) => x.id === proyectoId);
    return p ? p.nombre : proyectoId;
  };

  const escapeCsv = (val: string) => `"${val.replace(/"/g, '""')}"`;

  // F12/F13: Exportación CSV con una fila por cada línea de reparto exacto a proyecto
  const handleExportCsv = () => {
    const header =
      'Viatico_ID,Fecha,Hora_AST,Registrado_Por,Categoria,Comercio,NCF,ITBIS_RD,Monto_Total_Viatico_RD,Proyecto_Codigo,Proyecto_Nombre,Monto_Reparto_RD,Metodo,Estado,Motivo_Decision\n';
    const rows: string[] = [];
    for (const v of viaticosFiltrados) {
      const lineas =
        v.repartos.length > 0 ? v.repartos : [{ proyectoId: 'sin_asignar', montoRD: v.montoRD }];
      const motivo = v.motivoRechazo || v.motivoDecision || '';
      for (const r of lineas) {
        rows.push(
          [
            v.id,
            v.fechaIso,
            escapeCsv(v.timestampAST),
            escapeCsv(v.creadoPorNombre),
            v.categoria,
            escapeCsv(v.comercio),
            v.ncf || '',
            v.itbisRD.toFixed(2),
            v.montoRD.toFixed(2),
            escapeCsv(proyectoNombre(r.proyectoId)),
            escapeCsv(proyectoNombreCompleto(r.proyectoId)),
            r.montoRD.toFixed(2),
            escapeCsv(v.metodo),
            v.estadoAprobacion,
            escapeCsv(motivo),
          ].join(',')
        );
      }
    }
    const blob = new Blob(['\uFEFF' + header + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viaticos_reparto_sirius_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportReporteProyectosCsv = () => {
    const header =
      'Codigo_Contrato,Proyecto,Presupuesto_RD,Aprobado_RD,Pendiente_RD,Ejecutado_Total_RD,Saldo_RD,Estado_Presupuesto\n';
    const rows = reportePorProyecto.filas.map((f) =>
      [
        escapeCsv(f.codigoContrato),
        escapeCsv(f.nombre),
        f.presupuestoRD.toFixed(2),
        f.aprobadoRD.toFixed(2),
        f.pendienteRD.toFixed(2),
        f.ejecutadoRD.toFixed(2),
        f.saldoRD.toFixed(2),
        f.excedido ? 'EXCEDIDO' : 'EN_PRESUPUESTO',
      ].join(',')
    );
    if (reportePorProyecto.sinAsignar.ejecutadoRD > 0) {
      rows.push(
        [
          'SIN_ASIGNAR',
          'Gastos sin asignar a proyecto',
          '0.00',
          reportePorProyecto.sinAsignar.aprobadoRD.toFixed(2),
          reportePorProyecto.sinAsignar.pendienteRD.toFixed(2),
          reportePorProyecto.sinAsignar.ejecutadoRD.toFixed(2),
          (-reportePorProyecto.sinAsignar.ejecutadoRD).toFixed(2),
          'SIN_ASIGNAR',
        ].join(',')
      );
    }
    const blob = new Blob(['\uFEFF' + header + rows.join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_viaticos_proyectos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportReporteMisionesCsv = () => {
    const csv = generarCsvReporteMisiones(reportePorMision);
    const blob = new Blob(['\uFEFF' + csv], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_viaticos_misiones_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmAprobacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aprobacionTarget) return;
    setModalError(null);
    const tieneExcedente = (aprobacionTarget.excedenteRD ?? 0) > 0;
    if (tieneExcedente && motivoAprobacion.trim().length < 4) {
      setModalError(
        'Debes indicar el motivo de la decisión sobre el excedente (mínimo 4 caracteres).'
      );
      return;
    }
    try {
      await onDecidirViatico({
        viaticoId: aprobacionTarget.id,
        nuevoEstado: 'aprobado',
        motivoDecision: motivoAprobacion.trim() || undefined,
        decisionExcedente: tieneExcedente ? decisionExcedente : undefined,
      });
      setAprobacionTarget(null);
      setMotivoAprobacion('');
      setDecisionExcedente('aprobado_empresa');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo aprobar el viático.');
    }
  };

  const handleConfirmRechazo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechazoTarget) return;
    setModalError(null);
    try {
      await onDecidirViatico({
        viaticoId: rechazoTarget.id,
        nuevoEstado: 'rechazado',
        motivoRechazo,
      });
      setRechazoTarget(null);
      setMotivoRechazo('');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo rechazar el viático.');
    }
  };

  const montoObjetivoReparto = repartoTarget
    ? repartoTarget.montoAprobadoEmpresaRD ?? repartoTarget.montoRD
    : 0;

  const handleConfirmReparto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repartoTarget) return;
    setModalError(null);
    const check = validarRepartoViatico(montoObjetivoReparto, repartoEdicion);
    if (!check.valido) {
      setModalError(check.error || 'La suma del reparto debe igualar el gasto aprobado.');
      return;
    }
    try {
      await onActualizarReparto(repartoTarget.id, repartoEdicion);
      setRepartoTarget(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo guardar el reparto.');
    }
  };

  const estadoStyle = (estado: EstadoAprobacionViatico) => {
    if (estado === 'aprobado') return 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]';
    if (estado === 'rechazado') return 'border-[#FCA5A5] bg-[#FEE2E2] text-[#93000A]';
    return 'border-[#FDE047] bg-[#FEF9C3]/60 text-[#A16207]';
  };

  const sumaRepartoActual = repartoEdicion.reduce((acc, item) => acc + (Number(item.montoRD) || 0), 0);

  if (isLoading && viaticos.length === 0) {
    return <ViaticosViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      {/* KPI Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-[#43474D]">Aprobados</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#15803D] tabular-nums">
            {formatRD(resumen.aprobado)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-[#43474D]">Pendientes</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#D97706] tabular-nums">
            {formatRD(resumen.pendiente)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-[#43474D]">Sin Asignar a Proyecto</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#0284C7] tabular-nums">
            {formatRD(resumen.sinAsignar)}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-[#43474D]">Rechazados</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#DC2626] tabular-nums">
            {formatRD(resumen.rechazado)}
          </div>
        </div>
      </div>

      {/* F13: Reporte General por Proyecto (Presupuesto, Ejecutado y Saldo) */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#0284C7] shrink-0" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-[#0F2942]">
                Reporte General por Proyecto: Presupuesto, Ejecutado y Saldo (F13)
              </h2>
              <p className="text-[11px] text-[#43474D]">
                Incluye líneas de reparto aprobadas y pendientes; excluye viáticos rechazados.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportReporteProyectosCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF6FF] min-h-[38px] whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exportar Resumen Proyectos CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-white text-[11px] font-semibold text-[#43474D]">
                <th className="px-4 py-2.5">Proyecto / Contrato</th>
                <th className="px-4 py-2.5 text-right">Presupuesto</th>
                <th className="px-4 py-2.5 text-right">Aprobado</th>
                <th className="px-4 py-2.5 text-right">Pendiente</th>
                <th className="px-4 py-2.5 text-right">Ejecutado Total</th>
                <th className="px-4 py-2.5 text-right">Saldo Disponible</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {reportePorProyecto.filas.map((f) => (
                <tr key={f.proyectoId} className="hover:bg-[#F8FAFC]">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[11px] font-bold text-[#0284C7]">
                      {f.codigoContrato}
                    </div>
                    <div className="font-medium text-[#0D1C2F]">{f.nombre}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(f.presupuestoRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#15803D]">
                    {formatRD(f.aprobadoRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#D97706]">
                    {formatRD(f.pendienteRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#0F2942]">
                    {formatRD(f.ejecutadoRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums">
                    <span className={f.excedido ? 'text-[#DC2626]' : 'text-[#15803D]'}>
                      {formatRD(f.saldoRD)}
                    </span>
                    {f.excedido && (
                      <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#DC2626]">
                        · Excedido
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {reportePorProyecto.sinAsignar.ejecutadoRD > 0 && (
                <tr className="bg-[#FEF9C3]/35">
                  <td className="px-4 py-2.5 font-semibold text-[#A16207]">
                    Sin asignar a proyecto
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#43474D]">
                    {formatRD(0)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(reportePorProyecto.sinAsignar.aprobadoRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(reportePorProyecto.sinAsignar.pendienteRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums text-[#A16207]">
                    {formatRD(reportePorProyecto.sinAsignar.ejecutadoRD)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#A16207]">
                    Pendiente repartir
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC] font-bold text-[#0F2942]">
                <td className="px-4 py-2.5">Total General</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatRD(reportePorProyecto.totales.presupuestoRD)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#15803D]">
                  {formatRD(reportePorProyecto.totales.aprobadoRD)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#D97706]">
                  {formatRD(reportePorProyecto.totales.pendienteRD)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatRD(reportePorProyecto.totales.ejecutadoRD)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                    reportePorProyecto.totales.saldoRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]'
                  }`}
                >
                  {formatRD(reportePorProyecto.totales.saldoRD)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* B5: Reporte de Viáticos y Rentas por Misión + CSV */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#0284C7] shrink-0" />
            <div>
              <h2 className="text-xs sm:text-sm font-bold text-[#0F2942]">
                Reporte por Misión: Viáticos vs Topes por Cargo y Costo de Rentas
              </h2>
              <p className="text-[11px] text-[#43474D]">
                Los excedentes a cargo del colaborador se muestran aparte y quedan excluidos de los totales de la empresa.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExportReporteMisionesCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-[#EFF6FF] min-h-[38px] whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Exportar Reporte Misiones CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-white text-[11px] font-semibold text-[#43474D]">
                <th className="px-4 py-2.5">Misión / Zona</th>
                <th className="px-4 py-2.5 text-right">Aprobado Empresa</th>
                <th className="px-4 py-2.5 text-right">Cargo Colaborador</th>
                <th className="px-4 py-2.5 text-right">Pendiente</th>
                <th className="px-4 py-2.5 text-right">Rentas Misión</th>
                <th className="px-4 py-2.5 text-right">Costo Total Empresa</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {reportePorMision.misiones.map((m) => (
                <React.Fragment key={m.misionId}>
                  <tr className="bg-white hover:bg-[#F8FAFC]">
                    <td className="px-4 py-2.5">
                      <div className="font-bold text-[#0D1C2F]">{m.nombre}</div>
                      <div className="text-[11px] text-[#43474D]">
                        {m.zona} · {m.provincia} · {m.fechaInicio} → {m.fechaFin}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#15803D]">
                      {formatRD(m.aprobadoEmpresaRD, moneda)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#93000A]">
                      {formatRD(m.cargoColaboradorRD, moneda)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#D97706]">
                      {formatRD(m.pendienteRD, moneda)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0F2942]">
                      {formatRD(m.costoRentasRD, moneda)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[#0F2942]">
                      {formatRD(m.totalCostoEmpresaRD, moneda)}
                    </td>
                  </tr>
                  {m.desglose.length > 0 && (
                    <tr className="bg-[#F8FAFC]">
                      <td colSpan={6} className="px-4 py-2">
                        <div className="flex flex-wrap gap-2">
                          {m.desglose.map((d) => (
                            <span
                              key={`${m.misionId}-${d.cargoCodigo}-${d.categoria}`}
                              className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[11px] ${
                                d.excedenteRD > 0
                                  ? 'border-[#FCA5A5] bg-[#FEE2E2]/60 text-[#93000A]'
                                  : 'border-[#E2E8F0] bg-white text-[#334155]'
                              }`}
                            >
                              <strong>{d.cargoEtiqueta}</strong> · {d.categoria}:{' '}
                              <span className="font-mono font-semibold">
                                {formatRD(d.gastoTotalRD, moneda)}
                              </span>
                              {typeof d.topeRD === 'number' && (
                                <span className="font-mono text-[10px] text-[#43474D]">
                                  (tope {formatRD(d.topeRD, moneda)})
                                </span>
                              )}
                              {d.excedenteRD > 0 && (
                                <span className="font-mono font-bold">
                                  · Exc {formatRD(d.excedenteRD, moneda)}
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {reportePorMision.sinMision.cantidadViaticos > 0 && (
                <tr className="bg-[#FEF9C3]/35">
                  <td className="px-4 py-2.5 font-semibold text-[#A16207]">
                    Gastos sueltos sin misión ({reportePorMision.sinMision.cantidadViaticos})
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(reportePorMision.sinMision.aprobadoEmpresaRD, moneda)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#43474D]">
                    {formatRD(0, moneda)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(reportePorMision.sinMision.pendienteRD, moneda)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatRD(0, moneda)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                    {formatRD(reportePorMision.sinMision.aprobadoEmpresaRD, moneda)}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#CBD5E1] bg-[#F8FAFC] font-bold text-[#0F2942]">
                <td className="px-4 py-2.5">Total General por Misiones</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#15803D]">
                  {formatRD(reportePorMision.totales.aprobadoEmpresaRD, moneda)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#93000A]">
                  {formatRD(reportePorMision.totales.cargoColaboradorRD, moneda)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#D97706]">
                  {formatRD(reportePorMision.totales.pendienteRD, moneda)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatRD(reportePorMision.totales.costoRentasRD, moneda)}
                </td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                  {formatRD(reportePorMision.totales.totalCostoEmpresaRD, moneda)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value as CategoriaViatico | 'ALL')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs min-h-[40px]"
          >
            <option value="ALL">Todas las categorías</option>
            {CATEGORIAS_VIATICO.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoAprobacionViatico | 'ALL')}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs min-h-[40px]"
          >
            <option value="ALL">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#334155] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar Detalle + Reparto CSV
          </button>
          <button
            type="button"
            onClick={onAbrirModalNuevo}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[40px] whitespace-nowrap shrink-0"
          >
            <Camera className="h-4 w-4" />
            Reportar Viático Móvil
          </button>
        </div>
      </div>

      {/* Desktop Ledger Table */}
      <div className="hidden md:block rounded-lg border border-slate-200 bg-white overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#0F2942] text-white uppercase tracking-wide text-[11px] font-semibold">
              <th className="px-4 py-3">Fecha / AST</th>
              <th className="px-4 py-3">Comercio / Método</th>
              <th className="px-4 py-3">Reparto a Proyectos</th>
              <th className="px-4 py-3 text-right">ITBIS / NCF</th>
              <th className="px-4 py-3 text-right">Monto RD$</th>
              <th className="px-4 py-3">Aprobación</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {viaticosFiltrados.map((v, idx) => {
              const mision = v.misionId ? misiones.find((m) => m.id === v.misionId) : undefined;
              const cargoLabel = v.cargoUsado
                ? resolverEtiquetaCargo(v.cargoUsado, cargos)
                : undefined;
              return (
                <tr key={v.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}>
                  <td className="px-4 py-2.5 align-top font-mono">
                    <div className="font-semibold text-[#0D1C2F]">{v.fechaIso}</div>
                    <div className="text-[11px] text-[#43474D]">{v.timestampAST}</div>
                    <div className="mt-0.5 font-sans text-[11px] text-[#43474D]">
                      {v.creadoPorNombre}
                      {cargoLabel ? ` · ${cargoLabel}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-start gap-3">
                      {v.receiptThumbnail && (
                        <MediaThumb
                          src={v.receiptThumbnail}
                          alt={`Comprobante ${v.comercio}`}
                          caption={`${v.comercio} · ${formatRD(v.montoRD, moneda)}`}
                          sizeClass="h-12 w-12 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold text-[#0D1C2F]">{v.comercio}</div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#43474D]">
                          <span className="font-medium text-[#0F2942]">{v.categoria}</span>
                          <span>·</span>
                          <span>{v.metodo}</span>
                          {mision && (
                            <span className="font-semibold text-[#0284C7]">· {mision.nombre}</span>
                          )}
                          {typeof v.distanceKm === 'number' && (
                            <span className="inline-flex items-center gap-0.5 font-mono tabular-nums text-[#0284C7]">
                              · <MapPin className="h-3 w-3" />
                              {v.distanceKm} km
                            </span>
                          )}
                        </div>
                        {typeof v.excedenteRD === 'number' && v.excedenteRD > 0 && (
                          <div className="mt-1.5 rounded-md border border-[#FDE047] bg-[#FEF9C3]/70 px-2.5 py-1.5 text-[11px] text-[#92400E]">
                            <strong>Excedente:</strong> {formatRD(v.excedenteRD, moneda)} (tope{' '}
                            {formatRD(v.topeAplicadoRD ?? 0, moneda)})
                            {v.motivoExcedente ? ` · Motivo: ${v.motivoExcedente}` : ''}
                            {v.decisionExcedente === 'cargo_colaborador' && (
                              <div className="font-semibold text-[#93000A]">
                                Cargo colaborador: {formatRD(v.montoCargoColaboradorRD ?? v.excedenteRD, moneda)} · Empresa:{' '}
                                {formatRD(v.montoAprobadoEmpresaRD ?? 0, moneda)}
                              </div>
                            )}
                          </div>
                        )}
                        {v.notas && <div className="mt-1 text-[11px] text-[#74777E]">{v.notas}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="space-y-1">
                      {v.repartos.map((r) => (
                        <div
                          key={r.proyectoId}
                          className="flex items-center justify-between gap-2 text-[11px]"
                        >
                          <span
                            className={`font-mono font-semibold ${
                              r.proyectoId === 'sin_asignar' ? 'text-[#D97706]' : 'text-[#0F2942]'
                            }`}
                          >
                            {proyectoNombre(r.proyectoId)}
                          </span>
                          <span className="font-mono tabular-nums text-[#334155]">
                            {formatRD(r.montoRD)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">
                    <div>{formatRD(v.itbisRD)}</div>
                    <div className="text-[11px] text-[#43474D]">{v.ncf || 'Sin NCF'}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top text-right font-mono font-bold text-[#0D1C2F] tabular-nums">
                    <div>{formatRD(v.montoRD)}</div>
                    {v.decisionExcedente === 'cargo_colaborador' &&
                      typeof v.montoAprobadoEmpresaRD === 'number' && (
                        <div className="text-[10px] font-semibold text-[#15803D]">
                          Emp: {formatRD(v.montoAprobadoEmpresaRD)}
                        </div>
                      )}
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span
                      className={`inline-block rounded-md border px-2 py-0.5 text-[11px] font-semibold uppercase ${estadoStyle(
                        v.estadoAprobacion
                      )}`}
                    >
                      {v.estadoAprobacion}
                    </span>
                    {v.motivoRechazo && (
                      <div className="mt-1 text-[11px] text-[#DC2626] max-w-[190px]">
                        {v.motivoRechazo}
                      </div>
                    )}
                    {v.motivoDecision && !v.motivoRechazo && (
                      <div className="mt-1 text-[11px] text-[#15803D] max-w-[190px]">
                        {v.motivoDecision}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {canDecide && v.estadoAprobacion === 'pendiente' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setMotivoAprobacion(v.motivoDecision || '');
                              setDecisionExcedente(v.decisionExcedente || 'aprobado_empresa');
                              setAprobacionTarget(v);
                            }}
                            title="Aprobar viático"
                            className="rounded-md bg-[#15803D] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#166534] whitespace-nowrap shrink-0"
                          >
                            Aprobar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setRechazoTarget(v);
                            }}
                            title="Rechazar viático"
                            className="rounded-md border border-[#FCA5A5] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2] whitespace-nowrap shrink-0"
                          >
                            Rechazar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setModalError(null);
                              setRepartoTarget(v);
                              setRepartoEdicion(v.repartos.map((r) => ({ ...r })));
                            }}
                            title="Editar reparto por proyecto"
                            className="rounded-md border border-slate-300 bg-white p-1.5 text-[#0F2942] hover:bg-slate-50"
                          >
                            <Split className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                      {v.estadoAprobacion === 'pendiente' && (
                        <button
                          type="button"
                          onClick={() => onEliminarViatico(v.id)}
                          title="Eliminar viático"
                          className="rounded-md p-1.5 text-[#DC2626] hover:bg-[#FEE2E2]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {viaticosFiltrados.length === 0 && (
          <div className="p-8 text-center text-xs text-[#43474D]">
            No hay viáticos registrados con los filtros actuales.
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3.5">
        {viaticosFiltrados.map((v) => (
          <div key={v.id} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                {v.receiptThumbnail && (
                  <MediaThumb
                    src={v.receiptThumbnail}
                    alt={`Comprobante ${v.comercio}`}
                    caption={`${v.comercio} · ${formatRD(v.montoRD, moneda)}`}
                    sizeClass="h-14 w-14 shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0D1C2F]">{v.comercio}</div>
                  <div className="font-mono text-[11px] text-[#43474D] tabular-nums">
                    {v.fechaIso} · {v.categoria} · {v.metodo}
                  </div>
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-[#0F2942] tabular-nums shrink-0">
                {formatRD(v.montoRD)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className={`rounded-md border px-2 py-0.5 font-semibold uppercase ${estadoStyle(
                  v.estadoAprobacion
                )}`}
              >
                {v.estadoAprobacion}
              </span>
              <span className="font-mono text-[#43474D] tabular-nums">
                {v.repartos
                  .map((r) => `${proyectoNombre(r.proyectoId)}: ${formatRD(r.montoRD)}`)
                  .join(' · ')}
              </span>
            </div>

            {typeof v.excedenteRD === 'number' && v.excedenteRD > 0 && (
              <div className="rounded-md border border-[#FDE047] bg-[#FEF9C3]/70 px-3 py-2 text-[11px] text-[#92400E]">
                <strong>Excedente:</strong> {formatRD(v.excedenteRD, moneda)}
                {v.motivoExcedente ? ` · ${v.motivoExcedente}` : ''}
                {v.decisionExcedente === 'cargo_colaborador' && (
                  <div className="font-semibold text-[#93000A]">
                    Cargo colaborador: {formatRD(v.montoCargoColaboradorRD ?? v.excedenteRD, moneda)}
                  </div>
                )}
              </div>
            )}

            {v.motivoRechazo && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2]/60 px-3 py-2 text-[11px] text-[#93000A]">
                Motivo rechazo: {v.motivoRechazo}
              </div>
            )}
            {v.motivoDecision && !v.motivoRechazo && (
              <div className="rounded-md border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-[11px] text-[#15803D]">
                Nota aprobación: {v.motivoDecision}
              </div>
            )}

            {v.estadoAprobacion === 'pendiente' &&
              (canDecide ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setMotivoAprobacion(v.motivoDecision || '');
                      setDecisionExcedente(v.decisionExcedente || 'aprobado_empresa');
                      setAprobacionTarget(v);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md bg-[#15803D] py-2 text-xs font-semibold text-white min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setRechazoTarget(v);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-[#FCA5A5] bg-white py-2 text-xs font-semibold text-[#DC2626] min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Rechazar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setRepartoTarget(v);
                      setRepartoEdicion(v.repartos.map((r) => ({ ...r })));
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-300 bg-white py-2 text-xs font-semibold text-[#0F2942] min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <Split className="h-3.5 w-3.5" />
                    Repartir
                  </button>
                  <button
                    type="button"
                    onClick={() => onEliminarViatico(v.id)}
                    title="Eliminar viático"
                    className="inline-flex items-center justify-center gap-1 rounded-md border border-[#FCA5A5] bg-white py-2 text-xs font-semibold text-[#DC2626] min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Borrar
                  </button>
                </div>
              ) : (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => onEliminarViatico(v.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-[#FCA5A5] bg-white px-3 py-2 text-xs font-semibold text-[#DC2626] min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Eliminar pendiente
                  </button>
                </div>
              ))}
          </div>
        ))}
      </div>

      {/* Modal Aprobar Viático (F12 + decisión de excedente B2) */}
      {aprobacionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">
                Aprobar Viático ({formatRD(aprobacionTarget.montoRD, moneda)})
              </h3>
              <button
                type="button"
                onClick={() => setAprobacionTarget(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmAprobacion} className="space-y-3 text-xs">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-[11px] text-[#334155]">
                <div>
                  <strong>{aprobacionTarget.comercio}</strong> · {aprobacionTarget.categoria}
                </div>
                <div className="font-mono mt-0.5 tabular-nums">
                  Reparto:{' '}
                  {aprobacionTarget.repartos
                    .map((r) => `${proyectoNombre(r.proyectoId)} (${formatRD(r.montoRD)})`)
                    .join(' · ')}
                </div>
              </div>

              {(aprobacionTarget.excedenteRD ?? 0) > 0 && (
                <div className="rounded-md border border-[#FCA5A5] bg-[#FEF2F2] p-3 space-y-2.5 text-[11px] text-[#93000A]">
                  <div className="flex items-start gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>
                      Este viático excede el tope de misión (
                      {formatRD(aprobacionTarget.topeAplicadoRD ?? 0, moneda)}) por{' '}
                      <strong>{formatRD(aprobacionTarget.excedenteRD ?? 0, moneda)}</strong>.
                    </span>
                  </div>
                  {aprobacionTarget.motivoExcedente && (
                    <div className="text-[#334155]">
                      <strong>Motivo reportado:</strong> {aprobacionTarget.motivoExcedente}
                    </div>
                  )}
                  <div className="space-y-1.5 pt-1 text-[#0D1C2F]">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decisionExcedente"
                        checked={decisionExcedente === 'aprobado_empresa'}
                        onChange={() => setDecisionExcedente('aprobado_empresa')}
                        className="mt-0.5 accent-[#0F2942]"
                      />
                      <span>
                        <strong>Aprobar excedente (cubre empresa):</strong> se imputa el total de{' '}
                        {formatRD(aprobacionTarget.montoRD, moneda)} a proyectos.
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="decisionExcedente"
                        checked={decisionExcedente === 'cargo_colaborador'}
                        onChange={() => setDecisionExcedente('cargo_colaborador')}
                        className="mt-0.5 accent-[#0F2942]"
                      />
                      <span>
                        <strong>Cargar excedente al colaborador:</strong> la empresa solo cubre{' '}
                        {formatRD(
                          Math.max(
                            0,
                            aprobacionTarget.montoRD - (aprobacionTarget.excedenteRD ?? 0)
                          ),
                          moneda
                        )}{' '}
                        y {formatRD(aprobacionTarget.excedenteRD ?? 0, moneda)} queda a cargo de la
                        persona (excluido de proyectos).
                      </span>
                    </label>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#334155] mb-1.5">
                  {(aprobacionTarget.excedenteRD ?? 0) > 0
                    ? 'Motivo de decisión sobre el excedente (obligatorio, mín. 4 caracteres)'
                    : 'Motivo / Observación de aprobación (opcional para auditoría)'}
                </label>
                <textarea
                  rows={2}
                  required={(aprobacionTarget.excedenteRD ?? 0) > 0}
                  value={motivoAprobacion}
                  onChange={(e) => setMotivoAprobacion(e.target.value)}
                  placeholder="Ej. Comprobante fiscal verificado contra cálculo de ruta GPS..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setAprobacionTarget(null)}
                  className="rounded-md border border-slate-300 px-3.5 py-2 font-semibold min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#15803D] px-4 py-2 font-semibold text-white hover:bg-[#166534] min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Confirmar Aprobación
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Rechazar Viático */}
      {rechazoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">
                Rechazar Viático ({formatRD(rechazoTarget.montoRD)})
              </h3>
              <button
                type="button"
                onClick={() => setRechazoTarget(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmRechazo} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1.5">
                  Motivo de rechazo (obligatorio)
                </label>
                <textarea
                  rows={3}
                  required
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Ej. Comprobante duplicado o NCF ilegible..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setRechazoTarget(null)}
                  className="rounded-md border border-slate-300 px-3.5 py-2 font-semibold min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#DC2626] px-4 py-2 font-semibold text-white hover:bg-[#B91C1C] min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redistribuir Reparto Exacto */}
      {repartoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0D1C2F]">
                  Reparto Exacto a Proyectos — {repartoTarget.comercio}
                </h3>
                <p className="text-xs text-[#43474D]">
                  Total imputable a proyectos: <strong>{formatRD(montoObjetivoReparto, moneda)}</strong>
                  {repartoTarget.decisionExcedente === 'cargo_colaborador' && (
                    <span className="ml-1 text-[#93000A]">
                      (excedente de {formatRD(repartoTarget.montoCargoColaboradorRD ?? 0, moneda)} a cargo del colaborador)
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepartoTarget(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmReparto} className="space-y-3 text-xs">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {repartoEdicion.map((linea, idx) => (
                  <div key={`${linea.proyectoId}-${idx}`} className="flex items-center gap-2">
                    <select
                      value={linea.proyectoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRepartoEdicion((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, proyectoId: val } : item))
                        );
                      }}
                      className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 min-h-[40px]"
                    >
                      {proyectos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigoContrato} — {p.nombre}
                        </option>
                      ))}
                      <option value="sin_asignar">Sin asignar</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={linea.montoRD}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setRepartoEdicion((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, montoRD: val } : item))
                        );
                      }}
                      className="w-28 rounded-md border border-slate-300 px-3 py-2 font-mono tabular-nums min-h-[40px]"
                    />
                    {repartoEdicion.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRepartoEdicion((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded-md p-2 text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] flex flex-wrap items-center justify-between gap-2 tabular-nums">
                <span>Asignado: {formatRD(sumaRepartoActual)}</span>
                <span
                  className={
                    Math.round((montoObjetivoReparto - sumaRepartoActual) * 100) === 0
                      ? 'font-bold text-[#15803D]'
                      : 'font-bold text-[#DC2626]'
                  }
                >
                  Diferencia: {formatRD(montoObjetivoReparto - sumaRepartoActual)}
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const usado = new Set(repartoEdicion.map((r) => r.proyectoId));
                    const libre = proyectos.find((p) => !usado.has(p.id))?.id || 'sin_asignar';
                    setRepartoEdicion((prev) => [...prev, { proyectoId: libre, montoRD: 0 }]);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-2 font-semibold text-[#0F2942] min-h-[38px] whitespace-nowrap shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir proyecto
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRepartoEdicion(
                      completarRepartoConSinAsignar(montoObjetivoReparto, repartoEdicion)
                    )
                  }
                  className="rounded-md bg-[#FEF3C7] px-3 py-2 font-semibold text-[#A16207] min-h-[38px] whitespace-nowrap shrink-0"
                >
                  Completar saldo en Sin asignar
                </button>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={() => setRepartoTarget(null)}
                  className="rounded-md border border-slate-300 px-3.5 py-2 font-semibold min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Guardar Reparto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};

