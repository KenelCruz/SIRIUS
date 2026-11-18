import type {
  Asignacion,
  Cliente,
  ConteoPendientesPorTipo,
  Cuadrilla,
  EquipoGNSS,
  EstadoServicio,
  ProyeccionSnapshotPorRol,
  ProyectoTecnico,
  RutaTecnico,
  ServicioTecnico,
  SnapshotTecnico,
  VehiculoTecnico,
  Viatico,
} from '../types/domain';
import { expandirRangoFechas } from './conflictos';

// SUPUESTO PENDIENTE: Criterio exacto de "Hoy" para el técnico = servicios en estado 'programado' o 'en_campo'
// cuya ruta tenga una asignación activa hoy o en los próximos 3 días (o que ya estén en estado 'en_campo'
// dentro de las rutas asignadas al técnico).
export const DIAS_VENTANA_HOY_TECNICO = 3;

// SUPUESTO PENDIENTE: Estados de servicio cuyas rutas/asignaciones aparecen en "Mi agenda" del técnico =
// rutas asignadas a su cuadrilla que tengan al menos un servicio en estado operativo activo o en curso
// ('aprobado', 'programado', 'en_campo', 'procesando', 'entregado'), o sin servicios registrados aún.
// Se excluyen asignaciones cuyas rutas están únicamente 'cotizado' o completamente 'cobrado'.
export const ESTADOS_VISIBLES_AGENDA_TECNICO: EstadoServicio[] = [
  'aprobado',
  'programado',
  'en_campo',
  'procesando',
  'entregado',
];

export interface ServicioHoyItem {
  servicio: ServicioTecnico;
  ruta: RutaTecnico;
  proyecto?: ProyectoTecnico;
  cliente?: Cliente;
  asignacion?: Asignacion;
  cuadrilla?: Cuadrilla;
  vehiculos: VehiculoTecnico[];
  equipos: EquipoGNSS[];
  bitacoraCount: number;
  enCursoAhora: boolean;
}

export interface AgendaItemTecnico {
  asignacion: Asignacion;
  ruta: RutaTecnico;
  proyecto?: ProyectoTecnico;
  cliente?: Cliente;
  cuadrilla?: Cuadrilla;
  vehiculos: VehiculoTecnico[];
  equipos: EquipoGNSS[];
  serviciosResumen: ServicioTecnico[];
}

export interface AgendaDiaTecnico {
  fechaIso: string;
  items: AgendaItemTecnico[];
}

export function obtenerFechaHoyAST(ahora: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santo_Domingo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(ahora);
}

export function sumarDiasIso(fechaIso: string, dias: number): string {
  const base = new Date(`${fechaIso}T12:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dias);
  return base.toISOString().slice(0, 10);
}

export function obtenerInicioSemanaLunes(fechaIso: string): string {
  const base = new Date(`${fechaIso}T12:00:00Z`);
  const day = base.getUTCDay(); // 0 domingo .. 6 sabado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  base.setUTCDate(base.getUTCDate() + diffToMonday);
  return base.toISOString().slice(0, 10);
}

export function validarEdicionViaticoTecnico(
  viatico: Viatico,
  usuarioId: string
): { valido: boolean; error?: string } {
  if (viatico.creadoPorUsuarioId !== usuarioId) {
    return {
      valido: false,
      error: 'Solo puedes modificar tus propios viáticos.',
    };
  }
  if (viatico.estadoAprobacion !== 'pendiente') {
    return {
      valido: false,
      error: `Este viático ya está ${viatico.estadoAprobacion} y es de solo lectura.`,
    };
  }
  return { valido: true };
}

export function validarEliminacionViaticoTecnico(
  viatico: Viatico,
  usuarioId: string
): { valido: boolean; error?: string } {
  if (viatico.creadoPorUsuarioId !== usuarioId) {
    return {
      valido: false,
      error: 'Solo puedes eliminar tus propios viáticos.',
    };
  }
  if (viatico.estadoAprobacion !== 'pendiente') {
    return {
      valido: false,
      error: `Solo puedes eliminar viáticos pendientes. Este registro ya fue ${viatico.estadoAprobacion}.`,
    };
  }
  return { valido: true };
}

export function obtenerServiciosHoyTecnico(
  snapshot: SnapshotTecnico,
  fechaHoyAST: string = obtenerFechaHoyAST()
): ServicioHoyItem[] {
  const fechaLimite = sumarDiasIso(fechaHoyAST, DIAS_VENTANA_HOY_TECNICO);
  const items: ServicioHoyItem[] = [];

  for (const srv of snapshot.servicios) {
    if (srv.estado !== 'programado' && srv.estado !== 'en_campo') {
      continue;
    }

    const ruta = snapshot.rutas.find((r) => r.id === srv.rutaId);
    if (!ruta) continue;

    const asignacionesRuta = snapshot.asignaciones.filter((a) => a.rutaId === ruta.id);
    if (asignacionesRuta.length === 0) continue;

    // Selecciona la asignación vigente o más próxima dentro de la ventana [hoy, hoy + 3 días]
    const asignacionEnVentana = asignacionesRuta
      .filter((a) => a.fechaFin >= fechaHoyAST && a.fechaInicio <= fechaLimite)
      .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0];

    const asignacionActiva =
      asignacionEnVentana ??
      (srv.estado === 'en_campo'
        ? asignacionesRuta.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))[0]
        : undefined);

    if (!asignacionActiva) continue;

    const proyecto = snapshot.proyectos.find((p) => p.id === ruta.proyectoId);
    const cliente = proyecto
      ? snapshot.clientes.find((c) => c.id === proyecto.clienteId)
      : undefined;
    const cuadrilla = snapshot.cuadrillas.find((c) => c.id === asignacionActiva.cuadrillaId);
    const vehiculos = snapshot.vehiculos.filter((v) =>
      asignacionActiva.vehiculoIds.includes(v.id)
    );
    const equipos = snapshot.equipos.filter((e) => asignacionActiva.equipoIds.includes(e.id));
    const bitacoraCount = snapshot.bitacoras.filter((b) => b.servicioId === srv.id).length;

    const enCursoAhora =
      srv.estado === 'en_campo' ||
      (asignacionActiva.fechaInicio <= fechaHoyAST && asignacionActiva.fechaFin >= fechaHoyAST);

    items.push({
      servicio: srv,
      ruta,
      proyecto,
      cliente,
      asignacion: asignacionActiva,
      cuadrilla,
      vehiculos,
      equipos,
      bitacoraCount,
      enCursoAhora,
    });
  }

  return items.sort((a, b) => {
    if (a.servicio.estado !== b.servicio.estado) {
      return a.servicio.estado === 'en_campo' ? -1 : 1;
    }
    const fa = a.asignacion?.fechaInicio || a.ruta.fechaPrevista;
    const fb = b.asignacion?.fechaInicio || b.ruta.fechaPrevista;
    if (fa !== fb) return fa.localeCompare(fb);
    return a.ruta.codigoParcela.localeCompare(b.ruta.codigoParcela);
  });
}

export function obtenerAgendaSemanalTecnico(
  snapshot: SnapshotTecnico,
  inicioSemanaIso?: string
): AgendaDiaTecnico[] {
  const baseLunes = inicioSemanaIso || obtenerInicioSemanaLunes(obtenerFechaHoyAST());
  const diasSemana = Array.from({ length: 7 }, (_, i) => sumarDiasIso(baseLunes, i));
  const mapaPorDia = new Map<string, AgendaItemTecnico[]>();
  for (const dia of diasSemana) {
    mapaPorDia.set(dia, []);
  }

  for (const asig of snapshot.asignaciones) {
    const ruta = snapshot.rutas.find((r) => r.id === asig.rutaId);
    if (!ruta) continue;

    const serviciosRuta = snapshot.servicios.filter((s) => s.rutaId === ruta.id);
    const tieneEstadoVisible =
      serviciosRuta.length === 0 ||
      serviciosRuta.some((s) => ESTADOS_VISIBLES_AGENDA_TECNICO.includes(s.estado));
    if (!tieneEstadoVisible) continue;

    const proyecto = snapshot.proyectos.find((p) => p.id === ruta.proyectoId);
    const cliente = proyecto
      ? snapshot.clientes.find((c) => c.id === proyecto.clienteId)
      : undefined;
    const cuadrilla = snapshot.cuadrillas.find((c) => c.id === asig.cuadrillaId);
    const vehiculos = snapshot.vehiculos.filter((v) => asig.vehiculoIds.includes(v.id));
    const equipos = snapshot.equipos.filter((e) => asig.equipoIds.includes(e.id));

    const diasAsig = expandirRangoFechas(asig.fechaInicio, asig.fechaFin);
    for (const dia of diasAsig) {
      const listaDia = mapaPorDia.get(dia);
      if (!listaDia) continue;
      listaDia.push({
        asignacion: asig,
        ruta,
        proyecto,
        cliente,
        cuadrilla,
        vehiculos,
        equipos,
        serviciosResumen: serviciosRuta,
      });
    }
  }

  return diasSemana.map((fechaIso) => ({
    fechaIso,
    items: mapaPorDia.get(fechaIso) ?? [],
  }));
}

export function calcularConteoPendientesPorTipo(
  proyeccion: ProyeccionSnapshotPorRol
): ConteoPendientesPorTipo {
  const snap = proyeccion.snapshot;
  const servicios = snap.servicios.filter((x) => x.syncStatus !== 'synced').length;
  const bitacoras = snap.bitacoras.filter((x) => x.syncStatus !== 'synced').length;
  const viaticos = snap.viaticos.filter((x) => x.syncStatus !== 'synced').length;

  if (proyeccion.rol === 'tecnico') {
    return {
      servicios,
      bitacoras,
      viaticos,
      proyectos: 0,
      rutas: 0,
      asignaciones: 0,
      total: servicios + bitacoras + viaticos,
    };
  }

  const proyectos = snap.proyectos.filter((x) => x.syncStatus !== 'synced').length;
  const rutas = snap.rutas.filter((x) => x.syncStatus !== 'synced').length;
  const asignaciones = snap.asignaciones.filter((x) => x.syncStatus !== 'synced').length;

  return {
    servicios,
    bitacoras,
    viaticos,
    proyectos,
    rutas,
    asignaciones,
    total: servicios + bitacoras + viaticos + proyectos + rutas + asignaciones,
  };
}
