import React, { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Lock, Plus, X } from 'lucide-react';
import {
  CATEGORIAS_PRESUPUESTO,
  ETIQUETA_EJEMPLO_CONFIRMAR,
  ETIQUETAS_CATEGORIA_PRESUPUESTO,
  ETIQUETAS_ESTADO_PRESUPUESTO,
  TARIFAS_VIATICOS_PROVISIONALES_PUESTO,
  calcularEjecutadoProyectoDesdeFuentes,
  calcularEstimadoViaticosPorPuesto,
  calcularTotalPlanificadoPresupuesto,
  compararPresupuestoProyecto,
  crearLineasBasePresupuesto,
  normalizarLineasPresupuesto,
  obtenerFechaHoyAST,
  obtenerHistorialPresupuestosProyecto,
  obtenerPresupuestoVigenteProyecto,
  puedeGestionarPresupuesto,
} from '../domain';
import type {
  Asignacion,
  CategoriaPresupuesto,
  ConfiguracionEmpresa,
  Cuadrilla,
  EstadoPresupuestoProyecto,
  LineaPresupuestoProyecto,
  Personal,
  PresupuestoProyecto,
  Proyecto,
  Renta,
  RolEmpresa,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface PresupuestoProyectoModalProps {
  isOpen: boolean;
  onClose: () => void;
  rol: RolEmpresa;
  proyecto: Proyecto | null;
  presupuestos: PresupuestoProyecto[];
  rutas: Ruta[];
  asignaciones: Asignacion[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  rentas: Renta[];
  configuracion?: ConfiguracionEmpresa | null;
  moneda?: string;
  onCrearVersion: (params: {
    proyectoId: string;
    vigenciaDesde: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
    aprobarInmediatamente?: boolean;
  }) => Promise<void>;
  onEditarBorrador: (params: {
    presupuestoId: string;
    vigenciaDesde?: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
  }) => Promise<void>;
  onTransicionarEstado: (params: {
    presupuestoId: string;
    nuevoEstado: EstadoPresupuestoProyecto;
    motivo?: string;
  }) => Promise<void>;
}

export const PresupuestoProyectoModal: React.FC<PresupuestoProyectoModalProps> = ({
  isOpen,
  onClose,
  rol,
  proyecto,
  presupuestos,
  rutas,
  asignaciones,
  cuadrillas,
  personal,
  vehiculos,
  viaticos,
  rentas,
  configuracion,
  moneda = 'RD$',
  onCrearVersion,
  onEditarBorrador,
  onTransicionarEstado,
}) => {
  const [tab, setTab] = useState<'comparacion' | 'versiones'>('comparacion');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Estado de formulario para editar borrador o crear nueva versión
  const [modoFormulario, setModoFormulario] = useState<'editar_borrador' | 'nueva_version' | null>(null);
  const [vigenciaDesde, setVigenciaDesde] = useState(obtenerFechaHoyAST());
  const [motivoCambio, setMotivoCambio] = useState('');
  const [notas, setNotas] = useState('');
  const [montosInput, setMontosInput] = useState<Record<CategoriaPresupuesto, string>>({
    viaticos: '0',
    rentas: '0',
    personal: '0',
    vehiculos: '0',
    equipos_gnss: '0',
    otros: '0',
  });

  // Estimador provisional de viáticos por puesto (de referencia adjunta)
  const [showEstimador, setShowEstimador] = useState(false);
  const [diasEstimados, setDiasEstimados] = useState('3');
  const [incluirAlojamiento, setIncluirAlojamiento] = useState(true);
  const [personasPorPuesto, setPersonasPorPuesto] = useState<Record<string, string>>(() =>
    TARIFAS_VIATICOS_PROVISIONALES_PUESTO.reduce<Record<string, string>>((acc, t) => {
      acc[t.puesto] = t.puesto === 'Técnico' ? '2' : '0';
      return acc;
    }, {})
  );

  const canManage = puedeGestionarPresupuesto(rol);

  const historial = useMemo(
    () => (proyecto ? obtenerHistorialPresupuestosProyecto(presupuestos, proyecto.id) : []),
    [presupuestos, proyecto]
  );

  const borradorAbierto = useMemo(
    () => historial.find((p) => p.estado === 'borrador') ?? null,
    [historial]
  );

  const hayCerrado = useMemo(
    () => historial.some((p) => p.estado === 'cerrado'),
    [historial]
  );

  const vigente = useMemo(
    () => (proyecto ? obtenerPresupuestoVigenteProyecto(presupuestos, proyecto.id) : undefined),
    [presupuestos, proyecto]
  );

  const ejecutado = useMemo(
    () =>
      proyecto
        ? calcularEjecutadoProyectoDesdeFuentes({
            proyectoId: proyecto.id,
            rutas,
            asignaciones,
            cuadrillas,
            personal,
            vehiculos,
            viaticos,
            rentas,
            configuracion: configuracion ?? undefined,
          })
        : null,
    [proyecto, rutas, asignaciones, cuadrillas, personal, vehiculos, viaticos, rentas, configuracion]
  );

  const comparacion = useMemo(() => {
    if (!proyecto || !ejecutado) return null;
    return compararPresupuestoProyecto({
      proyecto,
      presupuesto: vigente,
      ejecutado,
    });
  }, [proyecto, vigente, ejecutado]);

  const cargarMontosDesdeLineas = (lineas: LineaPresupuestoProyecto[]) => {
    const norm = normalizarLineasPresupuesto(lineas);
    const next: Record<CategoriaPresupuesto, string> = {
      viaticos: '0',
      rentas: '0',
      personal: '0',
      vehiculos: '0',
      equipos_gnss: '0',
      otros: '0',
    };
    for (const l of norm) {
      next[l.categoria] = String(l.montoPlanificadoRD);
    }
    setMontosInput(next);
  };

  useEffect(() => {
    if (!isOpen || !proyecto) return;
    setErrorMsg(null);
    setTab('comparacion');
    if (borradorAbierto) {
      setModoFormulario('editar_borrador');
      setVigenciaDesde(borradorAbierto.vigenciaDesde);
      setMotivoCambio(borradorAbierto.motivoCambio ?? '');
      setNotas(borradorAbierto.notas ?? '');
      cargarMontosDesdeLineas(borradorAbierto.lineas);
    } else {
      setModoFormulario(null);
      const base = vigente?.lineas ?? crearLineasBasePresupuesto({ viaticos: proyecto.presupuestoViaticosRD });
      cargarMontosDesdeLineas(base);
      setVigenciaDesde(obtenerFechaHoyAST());
      setMotivoCambio('');
      setNotas('');
    }
  }, [isOpen, proyecto?.id, borradorAbierto?.id]);

  const lineasFormulario = useMemo<LineaPresupuestoProyecto[]>(
    () =>
      CATEGORIAS_PRESUPUESTO.map((categoria) => ({
        categoria,
        montoPlanificadoRD: Number(montosInput[categoria]) || 0,
      })),
    [montosInput]
  );

  const totalFormularioRD = useMemo(
    () => calcularTotalPlanificadoPresupuesto(lineasFormulario),
    [lineasFormulario]
  );

  const estimadoPuestos = useMemo(() => {
    const dias = Math.max(1, Number(diasEstimados) || 1);
    const items = TARIFAS_VIATICOS_PROVISIONALES_PUESTO.map((t) => ({
      puesto: t.puesto,
      dias,
      personas: Math.max(0, Number(personasPorPuesto[t.puesto]) || 0),
      incluirAlojamiento,
    }));
    return calcularEstimadoViaticosPorPuesto(items);
  }, [diasEstimados, personasPorPuesto, incluirAlojamiento]);

  if (!isOpen || !proyecto || !comparacion) return null;

  const margenProyectadoRD = proyecto.valorContratoRD - totalFormularioRD;
  const margenProyectadoPct =
    proyecto.valorContratoRD > 0
      ? Number(((margenProyectadoRD / proyecto.valorContratoRD) * 100).toFixed(1))
      : null;

  const iniciarNuevaVersion = () => {
    setErrorMsg(null);
    const base =
      vigente?.lineas ?? crearLineasBasePresupuesto({ viaticos: proyecto.presupuestoViaticosRD });
    cargarMontosDesdeLineas(base);
    setVigenciaDesde(obtenerFechaHoyAST());
    setMotivoCambio('');
    setNotas('');
    setModoFormulario('nueva_version');
    setTab('versiones');
  };

  const handleGuardarBorrador = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSaving(true);
    try {
      if (modoFormulario === 'editar_borrador' && borradorAbierto) {
        await onEditarBorrador({
          presupuestoId: borradorAbierto.id,
          vigenciaDesde,
          lineas: lineasFormulario,
          notas,
          motivoCambio,
        });
      } else {
        await onCrearVersion({
          proyectoId: proyecto.id,
          vigenciaDesde,
          lineas: lineasFormulario,
          notas,
          motivoCambio,
          aprobarInmediatamente: false,
        });
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo guardar el borrador.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCrearYAprobar = async () => {
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onCrearVersion({
        proyectoId: proyecto.id,
        vigenciaDesde,
        lineas: lineasFormulario,
        notas,
        motivoCambio,
        aprobarInmediatamente: true,
      });
      setModoFormulario(null);
      setTab('comparacion');
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo aprobar la nueva versión.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTransicionar = async (
    presupuestoId: string,
    nuevoEstado: EstadoPresupuestoProyecto
  ) => {
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onTransicionarEstado({
        presupuestoId,
        nuevoEstado,
        motivo: motivoCambio.trim() || undefined,
      });
      if (nuevoEstado === 'aprobado') {
        setModoFormulario(null);
        setTab('comparacion');
      }
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
      <div className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-[#F8FAFC] px-6 py-4">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#43474D]">
              <span className="font-mono font-bold text-[#0284C7]">{proyecto.codigoContrato}</span>
              <span aria-hidden="true">·</span>
              <span>
                {vigente
                  ? `Versión v${vigente.version} (${ETIQUETAS_ESTADO_PRESUPUESTO[vigente.estado]})`
                  : 'Sin versión aprobada'}
              </span>
              {vigente?.vigenciaDesde && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">Vigente desde {vigente.vigenciaDesde}</span>
                </>
              )}
              {vigente?.esMigracionInicial && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>Migrado desde presupuestoViaticosRD</span>
                </>
              )}
            </div>
            <h3 className="text-base font-bold tracking-tight text-[#0D1C2F] text-balance">
              Presupuesto y Margen — {proyecto.nombre}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal de presupuesto"
            className="rounded-md p-2 text-[#43474D] hover:bg-slate-200/70 min-h-[40px] min-w-[40px] flex items-center justify-center shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Segmented Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3 bg-white">
          <div className="inline-flex rounded-lg bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('comparacion')}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                tab === 'comparacion'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-[#43474D] hover:text-[#0F2942]'
              }`}
            >
              Plan vs Ejecutado y Margen
            </button>
            <button
              type="button"
              onClick={() => setTab('versiones')}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[36px] ${
                tab === 'versiones'
                  ? 'bg-white text-[#0F2942] shadow-sm'
                  : 'text-[#43474D] hover:text-[#0F2942]'
              }`}
            >
              Versiones y Edición ({historial.length})
            </button>
          </div>

          {canManage && !borradorAbierto && !hayCerrado && (
            <button
              type="button"
              onClick={iniciarNuevaVersion}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] whitespace-nowrap shrink-0 min-h-[40px]"
            >
              <Plus className="h-3.5 w-3.5" />
              Nueva Versión
            </button>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          {errorMsg && (
            <div className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs font-medium text-[#93000A]">
              {errorMsg}
            </div>
          )}

          {tab === 'comparacion' && (
            <div className="space-y-6">
              {/* 4-column KPI strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
                  <div className="text-xs font-medium text-[#43474D]">Valor de Contrato</div>
                  <div className="mt-1.5 font-mono text-lg font-bold text-[#0D1C2F] tabular-nums">
                    {formatRD(comparacion.valorContratoRD, moneda)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#43474D]">Ingreso acordado con cliente</div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
                  <div className="text-xs font-medium text-[#43474D]">Costo Planificado</div>
                  <div className="mt-1.5 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                    {formatRD(comparacion.totalPlanificadoRD, moneda)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                    Margen plan:{' '}
                    {comparacion.margenPlanificadoPct !== null
                      ? `${comparacion.margenPlanificadoPct}%`
                      : 'N/D'}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
                  <div className="text-xs font-medium text-[#43474D]">Costo Ejecutado (Live)</div>
                  <div
                    className={`mt-1.5 font-mono text-lg font-bold tabular-nums ${
                      comparacion.excedidoTotal ? 'text-[#DC2626]' : 'text-[#0284C7]'
                    }`}
                  >
                    {formatRD(comparacion.totalEjecutadoRD, moneda)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                    Dif. vs plan: {formatRD(comparacion.diferenciaTotalRD, moneda)}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-4">
                  <div className="text-xs font-medium text-[#43474D]">Margen Real Actual</div>
                  <div
                    className={`mt-1.5 font-mono text-lg font-bold tabular-nums ${
                      comparacion.margenRealRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]'
                    }`}
                  >
                    {formatRD(comparacion.margenRealRD, moneda)}
                  </div>
                  <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                    {comparacion.margenRealPct !== null
                      ? `${comparacion.margenRealPct}% del contrato`
                      : 'Sin valor de contrato'}
                  </div>
                </div>
              </div>

              {/* 6-Category Comparison Table */}
              <div className="rounded-lg border border-slate-200 overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#F8FAFC] border-b border-slate-200 text-[11px] font-semibold text-[#43474D]">
                      <th className="px-4 py-3">Categoría de Costo</th>
                      <th className="px-4 py-3 text-right">Planificado</th>
                      <th className="px-4 py-3 text-right">Ejecutado (Real / Est.)</th>
                      <th className="px-4 py-3 text-right">Saldo</th>
                      <th className="px-4 py-3 text-right">Desviación</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {comparacion.filas.map((fila) => (
                      <tr key={fila.categoria} className="hover:bg-[#F8FAFC]">
                        <td className="px-4 py-3 font-semibold text-[#0D1C2F]">
                          {fila.etiqueta}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-[#0F2942]">
                          {formatRD(fila.planificadoRD, moneda)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#0D1C2F]">
                          {formatRD(fila.ejecutadoRD, moneda)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums font-semibold ${
                            fila.excedido ? 'text-[#DC2626]' : 'text-[#15803D]'
                          }`}
                        >
                          {formatRD(fila.diferenciaRD, moneda)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono tabular-nums ${
                            fila.excedido ? 'text-[#DC2626] font-semibold' : 'text-[#43474D]'
                          }`}
                        >
                          {fila.variacionPct !== null
                            ? `${fila.variacionPct > 0 ? '+' : ''}${fila.variacionPct}%`
                            : fila.ejecutadoRD > 0
                            ? 'Sin plan'
                            : '0.0%'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 bg-[#F8FAFC] font-bold text-[#0D1C2F]">
                      <td className="px-4 py-3">Total Costos de Ejecución</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatRD(comparacion.totalPlanificadoRD, moneda)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatRD(comparacion.totalEjecutadoRD, moneda)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums ${
                          comparacion.excedidoTotal ? 'text-[#DC2626]' : 'text-[#15803D]'
                        }`}
                      >
                        {formatRD(comparacion.diferenciaTotalRD, moneda)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {comparacion.totalPlanificadoRD > 0
                          ? `${Number(
                              (
                                ((comparacion.totalEjecutadoRD - comparacion.totalPlanificadoRD) /
                                  comparacion.totalPlanificadoRD) *
                                100
                              ).toFixed(1)
                            )}%`
                          : '—'}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Fuente de cálculo live */}
              <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-[11px] text-[#43474D] space-y-1">
                <div>
                  Los costos ejecutados no se duplican: se calculan en vivo desde viáticos aprobados
                  ({formatRD(comparacion.viaticosPendientesRD, moneda)} en viáticos pendientes por aprobar),
                  rentas activas/finalizadas y asignaciones de campo ({comparacion.diasCampoAsignados} días-ruta).
                </div>
                <div>
                  Personal y Equipos GNSS usan tarifas diarias operativas provisionales ({ETIQUETA_EJEMPLO_CONFIRMAR}).
                </div>
              </div>
            </div>
          )}

          {tab === 'versiones' && (
            <div className="space-y-6">
              {hayCerrado && (
                <div className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-[#F8FAFC] px-4 py-3 text-xs text-[#334155]">
                  <Lock className="h-4 w-4 text-[#0F2942] shrink-0" />
                  <span>
                    Este proyecto tiene una versión de presupuesto cerrada. Es definitiva y de solo lectura.
                  </span>
                </div>
              )}

              {!hayCerrado && borradorAbierto && !modoFormulario && (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  <span>
                    Existe un borrador abierto (v{borradorAbierto.version}) vigente desde {borradorAbierto.vigenciaDesde}.
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setModoFormulario('editar_borrador');
                        setVigenciaDesde(borradorAbierto.vigenciaDesde);
                        setMotivoCambio(borradorAbierto.motivoCambio ?? '');
                        setNotas(borradorAbierto.notas ?? '');
                        cargarMontosDesdeLineas(borradorAbierto.lineas);
                      }}
                      className="rounded-md bg-[#0F2942] px-3 py-1.5 font-semibold text-white whitespace-nowrap shrink-0"
                    >
                      Editar Borrador
                    </button>
                  )}
                </div>
              )}

              {/* Editor de borrador o nueva versión */}
              {canManage && modoFormulario && !hayCerrado && (
                <form
                  onSubmit={handleGuardarBorrador}
                  className="rounded-lg border border-slate-200 bg-white p-5 space-y-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                    <div>
                      <h4 className="text-sm font-bold text-[#0D1C2F]">
                        {modoFormulario === 'editar_borrador' && borradorAbierto
                          ? `Editando Borrador v${borradorAbierto.version}`
                          : 'Nueva Versión de Presupuesto'}
                      </h4>
                      <p className="text-xs text-[#43474D]">
                        Los presupuestos aprobados son inmutables; cada cambio genera una nueva versión con vigencia.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowEstimador((prev) => !prev)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-[#0284C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 whitespace-nowrap shrink-0 min-h-[38px]"
                    >
                      <Calculator className="h-3.5 w-3.5" />
                      {showEstimador ? 'Ocultar Estimador por Puesto' : 'Estimar Viáticos por Puesto'}
                    </button>
                  </div>

                  {/* Estimador provisional de viáticos por puesto (tabla de referencia) */}
                  {showEstimador && (
                    <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-bold text-[#0F2942]">
                            Estimador de Viáticos por Puesto ({ETIQUETA_EJEMPLO_CONFIRMAR})
                          </div>
                          <div className="text-[11px] text-[#43474D]">
                            Basado en dieta (desayuno + almuerzo + cena) y alojamiento por día de misión.
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <label className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-[#334155]">Días:</span>
                            <input
                              type="number"
                              min={1}
                              value={diasEstimados}
                              onChange={(e) => setDiasEstimados(e.target.value)}
                              className="w-16 rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-right min-h-[34px]"
                            />
                          </label>
                          <label className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={incluirAlojamiento}
                              onChange={(e) => setIncluirAlojamiento(e.target.checked)}
                              className="h-4 w-4 rounded border-slate-300"
                            />
                            <span className="font-semibold text-[#334155]">Incluir alojamiento</span>
                          </label>
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                        <table className="w-full text-left text-[11px] border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-[#43474D]">
                              <th className="px-3 py-2">Puesto</th>
                              <th className="px-3 py-2 text-right">Dieta</th>
                              <th className="px-3 py-2 text-right">Alojamiento</th>
                              <th className="px-3 py-2 text-right">Total / día</th>
                              <th className="px-3 py-2 text-right">Personas</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {TARIFAS_VIATICOS_PROVISIONALES_PUESTO.map((tar) => (
                              <tr key={tar.puesto}>
                                <td className="px-3 py-2 font-medium text-[#0D1C2F]">{tar.puesto}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#43474D]">
                                  {formatRD(tar.dietaTotalRD, moneda)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums text-[#43474D]">
                                  {formatRD(tar.alojamientoRD, moneda)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums font-semibold text-[#0F2942]">
                                  {formatRD(
                                    incluirAlojamiento ? tar.montoViaticosRD : tar.dietaTotalRD,
                                    moneda
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    value={personasPorPuesto[tar.puesto] ?? '0'}
                                    onChange={(e) =>
                                      setPersonasPorPuesto((prev) => ({
                                        ...prev,
                                        [tar.puesto]: e.target.value,
                                      }))
                                    }
                                    aria-label={`Cantidad de ${tar.puesto}`}
                                    className="w-16 rounded-md border border-slate-200 px-2 py-1 text-right font-mono min-h-[32px]"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <div className="text-xs font-semibold text-[#0F2942] font-mono tabular-nums">
                          Estimado calculado: {formatRD(estimadoPuestos.totalEstimadoRD, moneda)}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setMontosInput((prev) => ({
                              ...prev,
                              viaticos: String(estimadoPuestos.totalEstimadoRD),
                            }))
                          }
                          className="rounded-md bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] whitespace-nowrap shrink-0 min-h-[36px]"
                        >
                          Aplicar a línea Viáticos
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">
                        Vigencia Desde *
                      </label>
                      <input
                        type="date"
                        required
                        value={vigenciaDesde}
                        onChange={(e) => setVigenciaDesde(e.target.value)}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#334155] mb-1">
                        Motivo / Alcance de la Versión
                      </label>
                      <input
                        type="text"
                        value={motivoCambio}
                        onChange={(e) => setMotivoCambio(e.target.value)}
                        placeholder="Ej. Ajuste por ampliación de polígono o renta extra"
                        className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 text-xs">
                    {CATEGORIAS_PRESUPUESTO.map((cat) => (
                      <div key={cat}>
                        <label className="block font-semibold text-[#334155] mb-1">
                          {ETIQUETAS_CATEGORIA_PRESUPUESTO[cat]} ({moneda})
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          value={montosInput[cat]}
                          onChange={(e) =>
                            setMontosInput((prev) => ({
                              ...prev,
                              [cat]: e.target.value,
                            }))
                          }
                          className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono text-right min-h-[40px] tabular-nums"
                        />
                      </div>
                    ))}
                  </div>

                  <div className="text-xs">
                    <label className="block font-semibold text-[#334155] mb-1">Notas</label>
                    <input
                      type="text"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Supuestos de brigada, días estimados o equipo GNSS..."
                      className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-200 pt-4">
                    <div className="text-xs space-y-0.5 font-mono tabular-nums">
                      <div className="font-bold text-[#0F2942]">
                        Total Planificado: {formatRD(totalFormularioRD, moneda)}
                      </div>
                      <div
                        className={
                          margenProyectadoRD < 0 ? 'text-[#DC2626]' : 'text-[#15803D]'
                        }
                      >
                        Margen Planificado: {formatRD(margenProyectadoRD, moneda)}
                        {margenProyectadoPct !== null ? ` (${margenProyectadoPct}%)` : ''}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {modoFormulario === 'nueva_version' && (
                        <button
                          type="button"
                          onClick={() => setModoFormulario(null)}
                          className="rounded-md border border-slate-200 px-3.5 py-2 text-xs font-semibold text-[#334155] min-h-[40px] whitespace-nowrap shrink-0"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSaving}
                        className="rounded-md border border-[#0F2942] bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-60 min-h-[40px] whitespace-nowrap shrink-0"
                      >
                        Guardar Borrador
                      </button>
                      {modoFormulario === 'editar_borrador' && borradorAbierto ? (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={async () => {
                            setErrorMsg(null);
                            setIsSaving(true);
                            try {
                              await onEditarBorrador({
                                presupuestoId: borradorAbierto.id,
                                vigenciaDesde,
                                lineas: lineasFormulario,
                                notas,
                                motivoCambio,
                              });
                              await onTransicionarEstado({
                                presupuestoId: borradorAbierto.id,
                                nuevoEstado: 'aprobado',
                                motivo: motivoCambio.trim() || undefined,
                              });
                              setModoFormulario(null);
                              setTab('comparacion');
                            } catch (err: unknown) {
                              setErrorMsg(
                                err instanceof Error
                                  ? err.message
                                  : 'No se pudo aprobar el presupuesto.'
                              );
                            } finally {
                              setIsSaving(false);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#15803D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[40px] whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Guardar y Aprobar
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={handleCrearYAprobar}
                          className="inline-flex items-center gap-1.5 rounded-md bg-[#15803D] px-4 py-2 text-xs font-semibold text-white hover:bg-[#166534] disabled:opacity-60 min-h-[40px] whitespace-nowrap shrink-0"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Crear y Aprobar
                        </button>
                      )}
                    </div>
                  </div>
                </form>
              )}

              {/* Historial de versiones */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wide text-[#43474D]">
                    Historial de Versiones ({historial.length})
                  </h4>
                  {canManage && vigente?.estado === 'aprobado' && !borradorAbierto && !hayCerrado && (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => handleTransicionar(vigente.id, 'cerrado')}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-slate-50 min-h-[36px] whitespace-nowrap shrink-0"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      Cerrar Presupuesto v{vigente.version}
                    </button>
                  )}
                </div>

                {historial.length === 0 ? (
                  <div className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-6 text-center text-xs text-[#43474D]">
                    Este proyecto aún no tiene versiones de presupuesto registradas.
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-[#F8FAFC] border-b border-slate-200 text-[11px] font-semibold text-[#43474D]">
                          <th className="px-4 py-2.5">Versión</th>
                          <th className="px-4 py-2.5">Vigencia Desde</th>
                          <th className="px-4 py-2.5">Estado</th>
                          <th className="px-4 py-2.5 text-right">Total Planificado</th>
                          <th className="px-4 py-2.5">Autor / Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {historial.map((v) => (
                          <tr key={v.id} className="hover:bg-[#F8FAFC]">
                            <td className="px-4 py-2.5 font-mono font-bold text-[#0F2942]">
                              v{v.version}
                            </td>
                            <td className="px-4 py-2.5 font-mono tabular-nums text-[#334155]">
                              {v.vigenciaDesde}
                            </td>
                            <td className="px-4 py-2.5 font-semibold">
                              <span
                                className={
                                  v.estado === 'aprobado'
                                    ? 'text-[#15803D]'
                                    : v.estado === 'cerrado'
                                    ? 'text-[#0F2942]'
                                    : 'text-[#B45309]'
                                }
                              >
                                {ETIQUETAS_ESTADO_PRESUPUESTO[v.estado]}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-bold tabular-nums text-[#0D1C2F]">
                              {formatRD(v.totalPlanificadoRD, moneda)}
                            </td>
                            <td className="px-4 py-2.5 text-[#43474D]">
                              <div className="font-medium text-[#0D1C2F]">{v.creadoPorNombre}</div>
                              {v.motivoCambio && (
                                <div className="text-[11px] text-[#43474D]">{v.motivoCambio}</div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
