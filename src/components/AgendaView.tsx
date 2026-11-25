import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  List,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import {
  detectarConflictosAsignacion,
  expandirRangoFechas,
  puedeAsignarRutas,
  validarRangoFechas,
} from '../domain';
import type {
  Asignacion,
  ConflictDetail,
  Cuadrilla,
  EquipoGNSS,
  Mision,
  OverrideConflicto,
  Personal,
  Renta,
  RolEmpresa,
  Ruta,
  Vehiculo,
} from '../types/domain';
import { ResourceConflictModal } from './ResourceConflictModal';
import { AgendaViewSkeleton } from './Skeletons';

interface AgendaViewProps {
  rol: RolEmpresa;
  isLoading?: boolean;
  usuarioActual: { id: string; nombre: string };
  rutas: Ruta[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  asignaciones: Asignacion[];
  rentas?: Renta[];
  misiones?: Mision[];
  umbralCercaniaRentaKm?: number;
  onGuardarAsignacion: (
    datos: Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ) => Promise<void>;
  onEliminarAsignacion: (asignacionId: string) => Promise<void>;
}

const DIAS_SEMANA_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const DIAS_POR_PAGINA = 4;

function sumarDiasIso(iso: string, delta: number): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function obtenerLunesSemana(iso: string): string {
  const base = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? iso
    : new Date().toISOString().slice(0, 10);
  const dt = new Date(`${base}T00:00:00Z`);
  const day = dt.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diffToMonday);
  return dt.toISOString().slice(0, 10);
}

function obtenerMesBase(iso: string): string {
  if (/^\d{4}-\d{2}/.test(iso)) return iso.slice(0, 7);
  return new Date().toISOString().slice(0, 7);
}

function sumarMeses(ym: string, delta: number): string {
  const [yStr, mStr] = ym.split('-');
  const dt = new Date(Date.UTC(Number(yStr), Number(mStr) - 1 + delta, 1));
  return dt.toISOString().slice(0, 7);
}

function formatearMesTitulo(ym: string): string {
  const [yStr, mStr] = ym.split('-');
  const monthIdx = Math.max(0, Math.min(11, Number(mStr) - 1));
  return `${MESES_ES[monthIdx]} ${yStr}`;
}

function calcularDiasInclusivos(inicio: string, fin: string): number {
  if (!validarRangoFechas(inicio, fin)) return 0;
  const a = new Date(`${inicio}T00:00:00Z`).getTime();
  const b = new Date(`${fin}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

function rangosSeSolapan(aIni: string, aFin: string, bIni: string, bFin: string): boolean {
  return aIni <= bFin && bIni <= aFin;
}

export const AgendaView: React.FC<AgendaViewProps> = ({
  rol,
  isLoading = false,
  usuarioActual,
  rutas,
  cuadrillas,
  personal,
  vehiculos,
  equipos,
  asignaciones,
  rentas = [],
  misiones = [],
  umbralCercaniaRentaKm,
  onGuardarAsignacion,
  onEliminarAsignacion,
}) => {
  const canAssign = puedeAsignarRutas(rol);
  const hoyIso = new Date().toISOString().slice(0, 10);
  const fechaInicialAgenda =
    asignaciones[0]?.fechaInicio || rutas[0]?.fechaPrevista || hoyIso;

  // Modo de agenda: Calendario mensual (default), Semanal o Lista paginada
  const [vistaAgenda, setVistaAgenda] = useState<'mes' | 'semana' | 'lista'>('mes');
  const [mesActivoYm, setMesActivoYm] = useState(() => obtenerMesBase(fechaInicialAgenda));
  const [selectedDayIso, setSelectedDayIso] = useState(() => fechaInicialAgenda);
  const [semanaInicioIso, setSemanaInicioIso] = useState(() =>
    obtenerLunesSemana(fechaInicialAgenda)
  );
  const [filtroCuadrilla, setFiltroCuadrilla] = useState('ALL');
  const [filtroBusqueda, setFiltroBusqueda] = useState('');
  const [filtroFechaLista, setFiltroFechaLista] = useState('');
  const [paginaLista, setPaginaLista] = useState(1);

  // Modal escalable de Programación / Reasignación de Cuadrilla
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingAsignacionId, setEditingAsignacionId] = useState<string | null>(null);
  const [rutaId, setRutaId] = useState(rutas[0]?.id || '');
  const [cuadrillaId, setCuadrillaId] = useState(
    cuadrillas.find((c) => c.activa)?.id || cuadrillas[0]?.id || ''
  );
  const [fechaInicio, setFechaInicio] = useState(fechaInicialAgenda);
  const [fechaFin, setFechaFin] = useState(fechaInicialAgenda);
  const [vehiculoIds, setVehiculoIds] = useState<string[]>(
    vehiculos.find((v) => v.estado === 'disponible')?.id
      ? [vehiculos.find((v) => v.estado === 'disponible')!.id]
      : []
  );
  const [equipoIds, setEquipoIds] = useState<string[]>(
    equipos.find((e) => e.estado === 'disponible')?.id
      ? [equipos.find((e) => e.estado === 'disponible')!.id]
      : []
  );

  // Buscadores internos del modal para escalar con muchos registros
  const [modalRutaSearch, setModalRutaSearch] = useState('');
  const [modalCuadrillaSearch, setModalCuadrillaSearch] = useState('');
  const [modalRecursoSearch, setModalRecursoSearch] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [pendingCandidate, setPendingCandidate] = useState<
    | (Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
        id?: string;
      })
    | null
  >(null);
  const [conflictosModal, setConflictosModal] = useState<ConflictDetail[]>([]);

  const toggleId = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const openCreateModal = (targetDate?: string) => {
    const fechaBase = targetDate || selectedDayIso || rutas[0]?.fechaPrevista || hoyIso;
    setEditingAsignacionId(null);
    setFormError(null);
    setModalRutaSearch('');
    setModalCuadrillaSearch('');
    setModalRecursoSearch('');
    setRutaId(rutas[0]?.id || '');
    setCuadrillaId(cuadrillas.find((c) => c.activa)?.id || cuadrillas[0]?.id || '');
    setFechaInicio(fechaBase);
    setFechaFin(fechaBase);
    setVehiculoIds(
      vehiculos.find((v) => v.estado === 'disponible')?.id
        ? [vehiculos.find((v) => v.estado === 'disponible')!.id]
        : []
    );
    setEquipoIds(
      equipos.find((e) => e.estado === 'disponible')?.id
        ? [equipos.find((e) => e.estado === 'disponible')!.id]
        : []
    );
    setIsFormModalOpen(true);
  };

  const handleStartEdit = (asig: Asignacion) => {
    setEditingAsignacionId(asig.id);
    setFormError(null);
    setModalRutaSearch('');
    setModalCuadrillaSearch('');
    setModalRecursoSearch('');
    setRutaId(asig.rutaId);
    setCuadrillaId(asig.cuadrillaId);
    setFechaInicio(asig.fechaInicio);
    setFechaFin(asig.fechaFin);
    setVehiculoIds([...asig.vehiculoIds]);
    setEquipoIds([...asig.equipoIds]);
    setIsFormModalOpen(true);
  };

  const handleSubmitAsignacion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!rutaId || !cuadrillaId) {
      setFormError('Selecciona una ruta y una cuadrilla.');
      return;
    }
    if (!validarRangoFechas(fechaInicio, fechaFin)) {
      setFormError('El rango de fechas es inválido (fecha inicio debe ser menor o igual a fecha fin).');
      return;
    }

    const candidateId = editingAsignacionId || `asig-cand-${Date.now()}`;
    const candidata = {
      id: candidateId,
      rutaId,
      fechaInicio,
      fechaFin,
      cuadrillaId,
      vehiculoIds,
      equipoIds,
    };

    const encontrados = detectarConflictosAsignacion({
      candidata,
      asignacionesExistentes: asignaciones,
      rutas,
      cuadrillas,
      personal,
      vehiculos,
      equipos,
      rentasExistentes: rentas,
      misiones,
      umbralCercaniaRentaKm,
    });

    const payloadLimpio = {
      ...(editingAsignacionId ? { id: editingAsignacionId } : {}),
      rutaId,
      fechaInicio,
      fechaFin,
      cuadrillaId,
      vehiculoIds,
      equipoIds,
    };

    if (encontrados.length > 0) {
      setPendingCandidate(payloadLimpio);
      setConflictosModal(encontrados);
      return;
    }

    setIsSaving(true);
    try {
      await onGuardarAsignacion(payloadLimpio);
      setSelectedDayIso(fechaInicio);
      setMesActivoYm(obtenerMesBase(fechaInicio));
      setIsFormModalOpen(false);
      setEditingAsignacionId(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar la asignación.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmarOverride = async (motivo?: string) => {
    if (!pendingCandidate) return;
    setFormError(null);
    setIsSaving(true);
    try {
      const overrideConflicto: OverrideConflicto | undefined = motivo
        ? {
            motivo,
            usuarioId: usuarioActual.id,
            usuarioNombre: usuarioActual.nombre,
            fecha: new Date().toISOString().slice(0, 10),
          }
        : undefined;
      await onGuardarAsignacion({
        ...pendingCandidate,
        overrideConflicto,
      });
      setSelectedDayIso(pendingCandidate.fechaInicio);
      setMesActivoYm(obtenerMesBase(pendingCandidate.fechaInicio));
      setPendingCandidate(null);
      setConflictosModal([]);
      setIsFormModalOpen(false);
      setEditingAsignacionId(null);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'No se pudo autorizar la asignación.');
    } finally {
      setIsSaving(false);
    }
  };

  // Filtrado unificado para las 3 vistas (cuadrilla + búsqueda)
  const asignacionesFiltradas = useMemo(() => {
    const q = filtroBusqueda.trim().toLowerCase();
    return asignaciones.filter((asig) => {
      if (filtroCuadrilla !== 'ALL' && asig.cuadrillaId !== filtroCuadrilla) return false;
      if (!q) return true;
      const ruta = rutas.find((r) => r.id === asig.rutaId);
      const cuadrilla = cuadrillas.find((c) => c.id === asig.cuadrillaId);
      return (
        (ruta?.codigoParcela || '').toLowerCase().includes(q) ||
        (ruta?.nombre || '').toLowerCase().includes(q) ||
        (ruta?.provincia || '').toLowerCase().includes(q) ||
        (cuadrilla?.nombre || '').toLowerCase().includes(q)
      );
    });
  }, [asignaciones, filtroCuadrilla, filtroBusqueda, rutas, cuadrillas]);

  // Mapa rápido fechaIso -> items[]
  const mapaPorDia = useMemo(() => {
    const mapa = new Map<
      string,
      Array<{ asignacion: Asignacion; ruta?: Ruta; cuadrilla?: Cuadrilla }>
    >();
    for (const asig of asignacionesFiltradas) {
      const ruta = rutas.find((r) => r.id === asig.rutaId);
      const cuadrilla = cuadrillas.find((c) => c.id === asig.cuadrillaId);
      const dias = expandirRangoFechas(asig.fechaInicio, asig.fechaFin);
      for (const dia of dias) {
        const arr = mapa.get(dia) || [];
        arr.push({ asignacion: asig, ruta, cuadrilla });
        mapa.set(dia, arr);
      }
    }
    return mapa;
  }, [asignacionesFiltradas, rutas, cuadrillas]);

  // Lista diaria ordenada y paginada
  const agendaPorDia = useMemo(() => {
    return Array.from(mapaPorDia.entries())
      .filter(([dia]) => !filtroFechaLista || dia === filtroFechaLista)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [mapaPorDia, filtroFechaLista]);

  const totalPaginasLista = Math.max(1, Math.ceil(agendaPorDia.length / DIAS_POR_PAGINA));
  const paginaListaSegura = Math.min(paginaLista, totalPaginasLista);
  const agendaPaginada = useMemo(() => {
    const start = (paginaListaSegura - 1) * DIAS_POR_PAGINA;
    return agendaPorDia.slice(start, start + DIAS_POR_PAGINA);
  }, [agendaPorDia, paginaListaSegura]);

  // Celdas del calendario mensual (siempre 35 o 42 días de Lunes a Domingo)
  const celdasMes = useMemo(() => {
    const firstDayIso = `${mesActivoYm}-01`;
    const gridStartIso = obtenerLunesSemana(firstDayIso);
    const [yStr, mStr] = mesActivoYm.split('-');
    const lastDayDt = new Date(Date.UTC(Number(yStr), Number(mStr), 0));
    const lastDayIso = lastDayDt.toISOString().slice(0, 10);
    const gridEndMonday = obtenerLunesSemana(lastDayIso);
    const gridEndIso = sumarDiasIso(gridEndMonday, 6);

    const cells: Array<{
      fecha: string;
      diaNumero: number;
      enMesActual: boolean;
      items: Array<{ asignacion: Asignacion; ruta?: Ruta; cuadrilla?: Cuadrilla }>;
    }> = [];

    let cursor = gridStartIso;
    while (cursor <= gridEndIso && cells.length < 42) {
      cells.push({
        fecha: cursor,
        diaNumero: Number(cursor.slice(8, 10)),
        enMesActual: cursor.slice(0, 7) === mesActivoYm,
        items: mapaPorDia.get(cursor) || [],
      });
      cursor = sumarDiasIso(cursor, 1);
    }
    return cells;
  }, [mesActivoYm, mapaPorDia]);

  // Vista semanal (Lunes–Domingo)
  const diasSemana = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => {
      const fecha = sumarDiasIso(semanaInicioIso, idx);
      return {
        fecha,
        labelDia: DIAS_SEMANA_CORTOS[idx],
        items: mapaPorDia.get(fecha) || [],
      };
    });
  }, [semanaInicioIso, mapaPorDia]);

  const itemsDiaSeleccionado = useMemo(
    () => mapaPorDia.get(selectedDayIso) || [],
    [mapaPorDia, selectedDayIso]
  );

  // Indicadores en vivo de solapamiento en el Modal de Programación (escalabilidad)
  const ocupacionEnRangoModal = useMemo(() => {
    const cuadrillasOcupadas = new Set<string>();
    const vehiculosOcupados = new Set<string>();
    const equiposOcupados = new Set<string>();

    if (!validarRangoFechas(fechaInicio, fechaFin)) {
      return { cuadrillasOcupadas, vehiculosOcupados, equiposOcupados };
    }

    for (const a of asignaciones) {
      if (editingAsignacionId && a.id === editingAsignacionId) continue;
      if (!rangosSeSolapan(fechaInicio, fechaFin, a.fechaInicio, a.fechaFin)) continue;
      cuadrillasOcupadas.add(a.cuadrillaId);
      a.vehiculoIds.forEach((vId) => vehiculosOcupados.add(vId));
      a.equipoIds.forEach((eId) => equiposOcupados.add(eId));
    }
    return { cuadrillasOcupadas, vehiculosOcupados, equiposOcupados };
  }, [asignaciones, fechaInicio, fechaFin, editingAsignacionId]);

  const rutasModalFiltradas = useMemo(() => {
    const q = modalRutaSearch.trim().toLowerCase();
    if (!q) return rutas;
    return rutas.filter(
      (r) =>
        r.codigoParcela.toLowerCase().includes(q) ||
        r.nombre.toLowerCase().includes(q) ||
        r.provincia.toLowerCase().includes(q)
    );
  }, [rutas, modalRutaSearch]);

  const cuadrillasModalFiltradas = useMemo(() => {
    const q = modalCuadrillaSearch.trim().toLowerCase();
    if (!q) return cuadrillas;
    return cuadrillas.filter((c) => {
      const jefe = personal.find((p) => p.id === c.jefeId);
      return (
        c.nombre.toLowerCase().includes(q) ||
        (jefe?.nombre || '').toLowerCase().includes(q)
      );
    });
  }, [cuadrillas, personal, modalCuadrillaSearch]);

  const vehiculosModalFiltrados = useMemo(() => {
    const q = modalRecursoSearch.trim().toLowerCase();
    if (!q) return vehiculos;
    return vehiculos.filter(
      (v) =>
        v.etiqueta.toLowerCase().includes(q) ||
        v.placa.toLowerCase().includes(q)
    );
  }, [vehiculos, modalRecursoSearch]);

  const equiposModalFiltrados = useMemo(() => {
    const q = modalRecursoSearch.trim().toLowerCase();
    if (!q) return equipos;
    return equipos.filter(
      (e) =>
        e.nombre.toLowerCase().includes(q) ||
        e.serial.toLowerCase().includes(q)
    );
  }, [equipos, modalRecursoSearch]);

  const kpis = useMemo(() => {
    const cuadrillasActivas = cuadrillas.filter((c) => c.activa).length;
    const diasMesConRuta = celdasMes.filter((c) => c.enMesActual && c.items.length > 0).length;
    const excepciones = asignaciones.filter((a) => Boolean(a.overrideConflicto)).length;
    return {
      totalAsignaciones: asignaciones.length,
      cuadrillasActivas,
      diasMesConRuta,
      excepciones,
    };
  }, [asignaciones, cuadrillas, celdasMes]);

  if (isLoading && asignaciones.length === 0) {
    return <AgendaViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      {/* Encabezado ejecutivo + botón principal de programación */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
            Agenda y Asignaciones
          </h2>
          <p className="text-sm text-[#475569] mt-0.5">
            Calendario operativo de cuadrillas, vehículos y equipos GNSS con control de solapamientos.
          </p>
        </div>

        {canAssign && (
          <button
            type="button"
            onClick={() => openCreateModal()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#0284C7] transition-colors min-h-[44px] whitespace-nowrap shrink-0 shadow-sm"
          >
            <Plus className="h-4 w-4" />
            Programar cuadrilla
          </button>
        )}
      </div>

      {/* Franja KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-4 text-white">
          <div className="text-xs font-medium text-sky-100">Asignaciones activas</div>
          <div className="mt-1.5 font-mono text-2xl font-bold tabular-nums">
            {kpis.totalAsignaciones}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-xs font-medium text-[#475569]">Cuadrillas operativas</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
            {kpis.cuadrillasActivas}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-xs font-medium text-[#475569]">Días cubiertos este mes</div>
          <div className="mt-1.5 font-mono text-2xl font-bold text-[#0284C7] tabular-nums">
            {kpis.diasMesConRuta}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200/90 bg-white p-4">
          <div className="text-xs font-medium text-[#475569]">Excepciones auditadas</div>
          <div
            className={`mt-1.5 font-mono text-2xl font-bold tabular-nums ${
              kpis.excepciones > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
            }`}
          >
            {kpis.excepciones}
          </div>
        </div>
      </div>

      {/* Contenedor principal de Calendario y Agenda */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-5 sm:p-6 space-y-5">
        {/* Toolbar de modos, filtros y búsqueda */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex rounded-2xl border border-slate-200/70 bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => setVistaAgenda('mes')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  vistaAgenda === 'mes'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <Calendar className="h-3.5 w-3.5" />
                Mes
              </button>
              <button
                type="button"
                onClick={() => setVistaAgenda('semana')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  vistaAgenda === 'semana'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Semana
              </button>
              <button
                type="button"
                onClick={() => {
                  setVistaAgenda('lista');
                  setPaginaLista(1);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  vistaAgenda === 'lista'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Lista paginada
              </button>
            </div>

            {vistaAgenda === 'mes' && (
              <div className="inline-flex items-center gap-1.5 text-xs">
                <button
                  type="button"
                  onClick={() => setMesActivoYm((m) => sumarMeses(m, -1))}
                  aria-label="Mes anterior"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F2942] hover:bg-slate-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[130px] text-center font-bold text-[#0F2942]">
                  {formatearMesTitulo(mesActivoYm)}
                </span>
                <button
                  type="button"
                  onClick={() => setMesActivoYm((m) => sumarMeses(m, 1))}
                  aria-label="Mes siguiente"
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-[#0F2942] hover:bg-slate-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMesActivoYm(obtenerMesBase(hoyIso));
                    setSelectedDayIso(hoyIso);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-[#0284C7] hover:bg-[#EFF6FF] min-h-[36px] whitespace-nowrap"
                >
                  Hoy
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="relative min-w-[190px] flex-1 sm:flex-initial">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={filtroBusqueda}
                onChange={(e) => {
                  setFiltroBusqueda(e.target.value);
                  setPaginaLista(1);
                }}
                placeholder="Buscar ruta, parcela o cuadrilla..."
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-8 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[40px]"
              />
            </div>

            <select
              value={filtroCuadrilla}
              onChange={(e) => {
                setFiltroCuadrilla(e.target.value);
                setPaginaLista(1);
              }}
              aria-label="Filtrar por cuadrilla"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
            >
              <option value="ALL">Todas las cuadrillas</option>
              {cuadrillas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                  {!c.activa ? ' [De baja]' : ''}
                </option>
              ))}
            </select>

            {vistaAgenda === 'lista' && (
              <>
                <input
                  type="date"
                  value={filtroFechaLista}
                  onChange={(e) => {
                    setFiltroFechaLista(e.target.value);
                    setPaginaLista(1);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[40px] focus:border-[#0284C7] focus:outline-none"
                />
                {filtroFechaLista && (
                  <button
                    type="button"
                    onClick={() => {
                      setFiltroFechaLista('');
                      setPaginaLista(1);
                    }}
                    className="text-xs font-semibold text-[#0284C7] hover:underline whitespace-nowrap"
                  >
                    Limpiar fecha
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* MODO 1: CALENDARIO MENSUAL + PANEL DE DÍA SELECCIONADO */}
        {vistaAgenda === 'mes' && (
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
            <div className="xl:col-span-8 space-y-2">
              <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold text-[#475569]">
                {DIAS_SEMANA_CORTOS.map((d) => (
                  <div key={d} className="py-1.5">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1.5">
                {celdasMes.map((celda) => {
                  const isSelected = celda.fecha === selectedDayIso;
                  const isToday = celda.fecha === hoyIso;
                  return (
                    <div
                      key={celda.fecha}
                      onClick={() => setSelectedDayIso(celda.fecha)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedDayIso(celda.fecha);
                        }
                      }}
                      className={`group rounded-xl border p-2 min-h-[86px] sm:min-h-[104px] flex flex-col justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'border-[#0284C7] bg-[#EFF6FF]/60 ring-1 ring-[#0284C7]'
                          : celda.enMesActual
                          ? 'border-slate-200/80 bg-white hover:border-[#0284C7]/60 hover:bg-[#F8FAFC]'
                          : 'border-slate-100 bg-[#F8FAFC]/50 text-slate-400'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`inline-flex h-6 w-6 items-center justify-center rounded-lg font-mono text-[11px] font-bold tabular-nums ${
                            isToday
                              ? 'bg-[#0284C7] text-white'
                              : isSelected
                              ? 'bg-[#0F2942] text-white'
                              : celda.enMesActual
                              ? 'text-[#0F2942]'
                              : 'text-slate-400'
                          }`}
                        >
                          {celda.diaNumero}
                        </span>
                        {canAssign && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDayIso(celda.fecha);
                              openCreateModal(celda.fecha);
                            }}
                            title={`Programar el ${celda.fecha}`}
                            aria-label={`Programar el ${celda.fecha}`}
                            className="opacity-0 group-hover:opacity-100 focus:opacity-100 flex h-5 w-5 items-center justify-center rounded-md bg-slate-100 text-[#0F2942] hover:bg-[#0284C7] hover:text-white transition-all"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 mt-1">
                        {celda.items.slice(0, 2).map(({ asignacion, ruta, cuadrilla }) => (
                          <div
                            key={`${celda.fecha}-${asignacion.id}`}
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold truncate ${
                              asignacion.overrideConflicto
                                ? 'bg-amber-100 text-[#B45309]'
                                : 'bg-[#0F2942] text-white'
                            }`}
                            title={`${ruta?.codigoParcela || asignacion.rutaId} · ${cuadrilla?.nombre || ''}`}
                          >
                            {ruta?.codigoParcela || asignacion.rutaId}
                          </div>
                        ))}
                        {celda.items.length > 2 && (
                          <div className="text-[10px] font-semibold text-[#0284C7] pl-0.5">
                            +{celda.items.length - 2} más
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Inspector del día seleccionado */}
            <div className="xl:col-span-4 rounded-2xl border border-slate-200/80 bg-[#F8FAFC] p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
                <div>
                  <div className="text-[11px] font-semibold text-[#475569]">Día seleccionado</div>
                  <div className="font-mono text-base font-bold text-[#0F2942] tabular-nums">
                    {selectedDayIso}
                  </div>
                </div>
                {canAssign && (
                  <button
                    type="button"
                    onClick={() => openCreateModal(selectedDayIso)}
                    className="inline-flex items-center gap-1 rounded-xl bg-[#0F2942] px-3 py-2 text-[11px] font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Programar aquí
                  </button>
                )}
              </div>

              {itemsDiaSeleccionado.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <CalendarDays className="mx-auto h-7 w-7 text-slate-300" />
                  <div className="text-xs font-semibold text-[#475569]">
                    Sin cuadrillas asignadas para este día
                  </div>
                  {canAssign && (
                    <button
                      type="button"
                      onClick={() => openCreateModal(selectedDayIso)}
                      className="text-xs font-semibold text-[#0284C7] hover:underline"
                    >
                      + Asignar cuadrilla el {selectedDayIso}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {itemsDiaSeleccionado.map(({ asignacion, ruta, cuadrilla }) => {
                    const vehNames = asignacion.vehiculoIds
                      .map((id) => vehiculos.find((v) => v.id === id)?.etiqueta || id)
                      .join(', ');
                    const eqNames = asignacion.equipoIds
                      .map((id) => equipos.find((e) => e.id === id)?.nombre || id)
                      .join(', ');

                    return (
                      <div
                        key={`sel-${asignacion.id}`}
                        className="rounded-xl border border-slate-200/90 bg-white p-3.5 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-mono text-[11px] font-bold text-[#0284C7]">
                              {ruta?.codigoParcela || asignacion.rutaId}
                            </div>
                            <div className="font-bold text-[#0F2942] truncate">
                              {ruta?.nombre || 'Ruta sin nombre'}
                            </div>
                            <div className="font-mono text-[10px] text-[#475569] mt-0.5 tabular-nums">
                              {asignacion.fechaInicio} → {asignacion.fechaFin}
                            </div>
                          </div>

                          {canAssign && (
                            <div className="inline-flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleStartEdit(asignacion)}
                                title="Reasignar"
                                className="rounded-lg border border-slate-200 p-1.5 text-[#0F2942] hover:bg-sky-50"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => onEliminarAsignacion(asignacion.id)}
                                title="Eliminar asignación"
                                className="rounded-lg border border-slate-200 p-1.5 text-[#DC2626] hover:bg-rose-50"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 text-[11px] text-[#334155]">
                          <div className="flex items-center gap-1.5 font-semibold text-[#0F2942]">
                            <Users className="h-3.5 w-3.5 text-[#0284C7]" />
                            {cuadrilla?.nombre || asignacion.cuadrillaId}
                          </div>
                          <div>Vehículos: {vehNames || 'Ninguno'}</div>
                          <div>GNSS: {eqNames || 'Ninguno'}</div>
                        </div>

                        {asignacion.overrideConflicto ? (
                          <div className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2]/60 px-2.5 py-1.5 text-[11px] text-[#93000A]">
                            Excepción: {asignacion.overrideConflicto.motivo}
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1 text-[11px] text-[#15803D]">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Sin conflictos
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MODO 2: CALENDARIO SEMANAL */}
        {vistaAgenda === 'semana' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-mono font-bold text-[#0F2942] tabular-nums">
                Semana: {semanaInicioIso} al {sumarDiasIso(semanaInicioIso, 6)}
              </div>
              <div className="inline-flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSemanaInicioIso((s) => sumarDiasIso(s, -7))}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Anterior
                </button>
                <button
                  type="button"
                  onClick={() => setSemanaInicioIso(obtenerLunesSemana(hoyIso))}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#0284C7] hover:bg-[#EFF6FF] min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Semana actual
                </button>
                <button
                  type="button"
                  onClick={() => setSemanaInicioIso((s) => sumarDiasIso(s, 7))}
                  className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap shrink-0"
                >
                  Siguiente
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {diasSemana.map((dia) => (
                <div
                  key={dia.fecha}
                  className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-3 flex flex-col gap-2 min-h-[180px]"
                >
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-1.5">
                    <div>
                      <span className="text-[11px] font-bold text-[#0F2942]">{dia.labelDia}</span>
                      <div className="font-mono text-[10px] text-[#475569] tabular-nums">
                        {dia.fecha}
                      </div>
                    </div>
                    {canAssign && (
                      <button
                        type="button"
                        onClick={() => openCreateModal(dia.fecha)}
                        title={`Programar el ${dia.fecha}`}
                        className="flex h-6 w-6 items-center justify-center rounded-lg border border-slate-200 bg-white text-[#0F2942] hover:bg-[#0284C7] hover:text-white transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  {dia.items.length === 0 ? (
                    <div className="text-[11px] text-[#94A3B8] py-4 text-center">Sin ruta</div>
                  ) : (
                    <div className="space-y-2">
                      {dia.items.map(({ asignacion, ruta, cuadrilla }) => (
                        <div
                          key={`${dia.fecha}-${asignacion.id}`}
                          className="rounded-xl border border-slate-200/80 bg-white p-2.5 space-y-1 text-[11px]"
                        >
                          <div className="flex items-start justify-between gap-1">
                            <span className="font-mono font-bold text-[#0284C7] truncate">
                              {ruta?.codigoParcela || asignacion.rutaId}
                            </span>
                            {canAssign && (
                              <div className="inline-flex items-center gap-0.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEdit(asignacion)}
                                  title="Reasignar"
                                  className="rounded-lg p-1 text-[#0F2942] hover:bg-[#EFF6FF]"
                                >
                                  <Pencil className="h-3 w-3" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onEliminarAsignacion(asignacion.id)}
                                  title="Eliminar"
                                  className="rounded-lg p-1 text-[#DC2626] hover:bg-[#FEE2E2]"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            )}
                          </div>
                          <div className="font-semibold text-[#0F2942] line-clamp-2">
                            {ruta?.nombre || 'Ruta'}
                          </div>
                          <div className="text-[10px] text-[#475569]">
                            {cuadrilla?.nombre || asignacion.cuadrillaId}
                          </div>
                          {asignacion.overrideConflicto && (
                            <div className="text-[10px] font-semibold text-[#93000A]">
                              Override auditado
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODO 3: LISTA DIARIA PAGINADA */}
        {vistaAgenda === 'lista' &&
          (agendaPaginada.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#475569]">
              No hay asignaciones programadas para los filtros seleccionados.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="space-y-4">
                {agendaPaginada.map(([fechaDia, items]) => (
                  <div key={fechaDia} className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-mono text-xs font-bold text-[#0F2942] tabular-nums">
                        {fechaDia}
                      </span>
                      <span className="text-[11px] text-[#475569] tabular-nums">
                        {items.length} cuadrilla(s) en campo
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {items.map(({ asignacion, ruta, cuadrilla }) => {
                        const vehNames = asignacion.vehiculoIds
                          .map((id) => vehiculos.find((v) => v.id === id)?.etiqueta || id)
                          .join(', ');
                        const eqNames = asignacion.equipoIds
                          .map((id) => equipos.find((e) => e.id === id)?.nombre || id)
                          .join(', ');

                        return (
                          <div
                            key={`${fechaDia}-${asignacion.id}`}
                            className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-4 space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-mono text-[11px] font-bold text-[#0284C7] tabular-nums">
                                  {ruta?.codigoParcela || asignacion.rutaId} · Rango{' '}
                                  {asignacion.fechaInicio} → {asignacion.fechaFin}
                                </div>
                                <div className="font-bold text-[#0F2942]">
                                  {ruta?.nombre || 'Ruta sin nombre'}
                                </div>
                              </div>

                              {canAssign && (
                                <div className="inline-flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(asignacion)}
                                    title="Reasignar / Editar rango"
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#0F2942] hover:bg-[#EFF6FF] whitespace-nowrap shrink-0"
                                  >
                                    <Pencil className="h-3 w-3" />
                                    Reasignar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onEliminarAsignacion(asignacion.id)}
                                    title="Eliminar asignación"
                                    className="rounded-xl p-1.5 text-[#DC2626] hover:bg-[#FEE2E2]"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              )}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#334155]">
                              <span className="inline-flex items-center gap-1 font-semibold">
                                <Users className="h-3 w-3 text-[#0F2942]" />
                                {cuadrilla?.nombre || asignacion.cuadrillaId}
                              </span>
                              <span>Vehículos: {vehNames || 'Ninguno'}</span>
                              <span>GNSS: {eqNames || 'Ninguno'}</span>
                            </div>

                            {asignacion.overrideConflicto ? (
                              <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2]/60 px-3 py-2 text-[11px] text-[#93000A]">
                                <span className="inline-flex items-center gap-1 font-semibold">
                                  <AlertTriangle className="h-3 w-3" />
                                  Excepción autorizada por {asignacion.overrideConflicto.usuarioNombre} (
                                  {asignacion.overrideConflicto.fecha}):
                                </span>{' '}
                                {asignacion.overrideConflicto.motivo}
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 text-[11px] text-[#15803D]">
                                <ShieldCheck className="h-3 w-3" />
                                Sin conflictos de recursos
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              {/* Controles de paginación */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
                <span className="text-[#475569] tabular-nums">
                  Página <strong className="text-[#0F2942]">{paginaListaSegura}</strong> de{' '}
                  <strong className="text-[#0F2942]">{totalPaginasLista}</strong> ·{' '}
                  {agendaPorDia.length} día(s) con agenda
                </span>

                <div className="inline-flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={paginaListaSegura <= 1}
                    onClick={() => setPaginaLista((p) => Math.max(1, p - 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-40 min-h-[38px]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Anterior
                  </button>

                  {Array.from({ length: totalPaginasLista }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPaginaLista(pageNum)}
                      className={`h-9 min-w-[36px] rounded-xl px-2.5 font-mono text-xs font-semibold transition-colors ${
                        pageNum === paginaListaSegura
                          ? 'bg-[#0F2942] text-white'
                          : 'border border-slate-200 bg-white text-[#475569] hover:bg-slate-50'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={paginaListaSegura >= totalPaginasLista}
                    onClick={() => setPaginaLista((p) => Math.min(totalPaginasLista, p + 1))}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-semibold text-[#0F2942] hover:bg-slate-50 disabled:opacity-40 min-h-[38px]"
                  >
                    Siguiente
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* MODAL ESCALABLE PARA PROGRAMAR / REASIGNAR CUADRILLA */}
      {isFormModalOpen && canAssign && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="text-base font-bold text-[#0F2942]">
                  {editingAsignacionId
                    ? 'Editar asignación de cuadrilla'
                    : 'Programar asignación de cuadrilla'}
                </h3>
                <p className="text-xs text-[#475569] mt-0.5">
                  Busca rutas, valida disponibilidad en vivo por fechas y asigna vehículos y GNSS.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
                aria-label="Cerrar ventana"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={handleSubmitAsignacion}
              className="flex-1 overflow-y-auto p-5 space-y-5 text-xs"
            >
              {formError && (
                <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs font-medium text-[#93000A]">
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
                {/* Columna 1: Ruta + Fechas */}
                <div className="md:col-span-6 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-[#0F2942]">1. Ruta / Parcela</label>
                      <span className="text-[11px] text-[#475569]">
                        {rutasModalFiltradas.length} disponible(s)
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={modalRutaSearch}
                        onChange={(e) => setModalRutaSearch(e.target.value)}
                        placeholder="Filtrar por código, parcela o provincia..."
                        className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-8 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[38px]"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2">
                      {rutasModalFiltradas.length === 0 ? (
                        <div className="py-4 text-center text-[11px] text-[#475569]">
                          Sin rutas que coincidan.
                        </div>
                      ) : (
                        rutasModalFiltradas.map((r) => {
                          const isSel = r.id === rutaId;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => {
                                setRutaId(r.id);
                                if (!editingAsignacionId) {
                                  setFechaInicio(r.fechaPrevista);
                                  setFechaFin(r.fechaPrevista);
                                }
                              }}
                              className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                                isSel
                                  ? 'border-[#0284C7] bg-[#0F2942] text-white'
                                  : 'border-slate-200/80 bg-white text-[#0F2942] hover:border-[#0284C7]'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-mono text-[11px] font-bold">
                                  {r.codigoParcela}
                                </div>
                                <div className="text-[11px] truncate">{r.nombre}</div>
                                <div
                                  className={`text-[10px] truncate ${
                                    isSel ? 'text-sky-200' : 'text-[#475569]'
                                  }`}
                                >
                                  {r.provincia} · Prevista {r.fechaPrevista}
                                </div>
                              </div>
                              {isSel && <Check className="h-4 w-4 text-[#38BDF8] shrink-0" />}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-[#0F2942] mb-1.5">
                        2. Fecha Inicio
                      </label>
                      <input
                        type="date"
                        required
                        value={fechaInicio}
                        onChange={(e) => {
                          setFechaInicio(e.target.value);
                          if (e.target.value > fechaFin) {
                            setFechaFin(e.target.value);
                          }
                        }}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-[#0F2942] mb-1.5">Fecha Fin</label>
                      <input
                        type="date"
                        required
                        min={fechaInicio}
                        value={fechaFin}
                        onChange={(e) => setFechaFin(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs text-[#0F2942] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-sky-200 bg-[#EFF6FF] px-3 py-2 text-[11px] font-semibold text-[#0F2942]">
                    <Clock className="h-3.5 w-3.5 text-[#0284C7] shrink-0" />
                    Duración estimada:{' '}
                    <span className="font-mono tabular-nums">
                      {calcularDiasInclusivos(fechaInicio, fechaFin)} día(s) en campo
                    </span>
                  </div>
                </div>

                {/* Columna 2: Cuadrilla + Vehículos + GNSS con estado de disponibilidad */}
                <div className="md:col-span-6 space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-[#0F2942]">3. Cuadrilla</label>
                      <span className="text-[11px] text-[#475569]">
                        {cuadrillasModalFiltradas.length} cuadrilla(s)
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={modalCuadrillaSearch}
                        onChange={(e) => setModalCuadrillaSearch(e.target.value)}
                        placeholder="Buscar cuadrilla o jefe..."
                        className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-8 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[38px]"
                      />
                    </div>

                    <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2">
                      {cuadrillasModalFiltradas.map((c) => {
                        const jefe = personal.find((p) => p.id === c.jefeId);
                        const isSel = c.id === cuadrillaId;
                        const ocupada = ocupacionEnRangoModal.cuadrillasOcupadas.has(c.id);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCuadrillaId(c.id)}
                            className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
                              isSel
                                ? 'border-[#0284C7] bg-[#0F2942] text-white'
                                : 'border-slate-200/80 bg-white text-[#0F2942] hover:border-[#0284C7]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-bold truncate">{c.nombre}</div>
                              <div
                                className={`text-[10px] truncate ${
                                  isSel ? 'text-sky-200' : 'text-[#475569]'
                                }`}
                              >
                                Jefe: {jefe?.nombre || 'Sin jefe'} · {c.miembroIds.length} miembro(s)
                              </div>
                            </div>
                            <span
                              className={`text-[10px] font-semibold shrink-0 ${
                                !c.activa
                                  ? 'text-[#DC2626]'
                                  : ocupada
                                  ? isSel
                                    ? 'text-amber-300'
                                    : 'text-[#B45309]'
                                  : isSel
                                  ? 'text-[#38BDF8]'
                                  : 'text-[#15803D]'
                              }`}
                            >
                              {!c.activa ? 'De baja' : ocupada ? 'Con solape' : 'Disponible'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-[#0F2942]">
                        4. Vehículos y Equipos GNSS
                      </label>
                      <span className="font-mono text-[11px] text-[#0284C7]">
                        {vehiculoIds.length} veh. · {equipoIds.length} GNSS
                      </span>
                    </div>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                      <input
                        type="text"
                        value={modalRecursoSearch}
                        onChange={(e) => setModalRecursoSearch(e.target.value)}
                        placeholder="Filtrar vehículo, placa o equipo GNSS..."
                        className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-8 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[38px]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2.5 space-y-1.5 max-h-36 overflow-y-auto">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#475569]">
                          <Truck className="h-3 w-3 text-[#0284C7]" />
                          Vehículos
                        </div>
                        {vehiculosModalFiltrados.map((v) => {
                          const enMant = v.estado !== 'disponible';
                          const ocupado = ocupacionEnRangoModal.vehiculosOcupados.has(v.id);
                          return (
                            <label
                              key={v.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 border border-slate-200/60 cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={vehiculoIds.includes(v.id)}
                                  onChange={() => toggleId(vehiculoIds, v.id, setVehiculoIds)}
                                  className="accent-[#0F2942]"
                                />
                                <span className="truncate text-[11px] font-medium">
                                  {v.etiqueta} ({v.placa})
                                </span>
                              </span>
                              {enMant ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-[#DC2626] shrink-0">
                                  <Wrench className="h-2.5 w-2.5" />
                                  Mant.
                                </span>
                              ) : ocupado ? (
                                <span className="text-[10px] font-semibold text-[#B45309] shrink-0">
                                  En uso
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>

                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-2.5 space-y-1.5 max-h-36 overflow-y-auto">
                        <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#475569]">
                          <ShieldCheck className="h-3 w-3 text-[#0284C7]" />
                          Equipos GNSS RTK
                        </div>
                        {equiposModalFiltrados.map((eq) => {
                          const ocupado = ocupacionEnRangoModal.equiposOcupados.has(eq.id);
                          return (
                            <label
                              key={eq.id}
                              className="flex items-center justify-between gap-2 rounded-lg bg-white px-2 py-1.5 border border-slate-200/60 cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1.5 min-w-0">
                                <input
                                  type="checkbox"
                                  checked={equipoIds.includes(eq.id)}
                                  onChange={() => toggleId(equipoIds, eq.id, setEquipoIds)}
                                  className="accent-[#0F2942]"
                                />
                                <span className="font-mono truncate text-[11px]">
                                  {eq.nombre}
                                </span>
                              </span>
                              {eq.estado !== 'disponible' ? (
                                <span className="font-mono text-[10px] font-semibold text-[#DC2626] shrink-0">
                                  {eq.estado}
                                </span>
                              ) : ocupado ? (
                                <span className="text-[10px] font-semibold text-[#B45309] shrink-0">
                                  En uso
                                </span>
                              ) : null}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] disabled:opacity-50 min-h-[42px] transition-colors"
                >
                  {editingAsignacionId ? (
                    <Pencil className="h-3.5 w-3.5" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  {isSaving
                    ? 'Validando y guardando...'
                    : editingAsignacionId
                    ? 'Confirmar reasignación'
                    : 'Programar asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ResourceConflictModal
        conflicts={conflictosModal}
        onCancel={() => {
          setPendingCandidate(null);
          setConflictosModal([]);
        }}
        onConfirmWithOverride={handleConfirmarOverride}
      />
    </section>
  );
};
