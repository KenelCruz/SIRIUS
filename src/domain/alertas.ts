import type {
  EstadoEmpresaSnapshot,
  HistorialEvento,
  SnapshotTecnico,
} from '../types/domain';
import { obtenerRentasVencidasSinDevolucion } from './conflictos';
import { calcularReportePresupuestosDesdeSnapshot } from './presupuesto';
import { calcularRendimientoFlota } from './rendimiento';
import { obtenerFechaHoyAST } from './tecnico';

export type SeveridadAlerta = 'critica' | 'advertencia' | 'informativa';

export type ModuloAlerta =
  | 'presupuestos'
  | 'viaticos'
  | 'agenda'
  | 'catalogos'
  | 'rutas'
  | 'auditoria'
  | 'sincronizacion';

export type AdminTabDestino =
  | 'hoy'
  | 'proyectos'
  | 'presupuestos'
  | 'agenda'
  | 'rutas'
  | 'map'
  | 'viaticos'
  | 'catalogos'
  | 'auditoria'
  | 'configuracion';

export type TecnicoTabDestino =
  | 'hoy'
  | 'rutas_tecnico'
  | 'agenda_tecnico'
  | 'viaticos_tecnico';

export interface AlertaOperativa {
  id: string;
  severidad: SeveridadAlerta;
  modulo: ModuloAlerta;
  moduloEtiqueta: string;
  titulo: string;
  detalle: string;
  fechaIso: string;
  tabDestinoAdmin?: AdminTabDestino;
  tabDestinoTecnico?: TecnicoTabDestino;
  entidadId?: string;
  entidadTipo?: HistorialEvento['entidadTipo'];
  accionEtiqueta: string;
}

export type ModuloAuditoria =
  | 'todos'
  | 'proyectos_rutas'
  | 'presupuestos'
  | 'agenda_misiones'
  | 'servicios'
  | 'viaticos'
  | 'flota_rentas'
  | 'catalogos'
  | 'empresa';

export type CategoriaAccionAuditoria =
  | 'todas'
  | 'overrides'
  | 'rechazos_alertas'
  | 'cambios_valor'
  | 'aprobaciones'
  | 'creaciones';

export const MODULOS_AUDITORIA_LABELS: Record<ModuloAuditoria, string> = {
  todos: 'Todos',
  proyectos_rutas: 'Proyectos y Rutas',
  presupuestos: 'Presupuestos',
  agenda_misiones: 'Agenda y Misiones',
  servicios: 'Servicios',
  viaticos: 'Viáticos',
  flota_rentas: 'Flota y Rentas',
  catalogos: 'Catálogos',
  empresa: 'Empresa',
};

export const ENTIDAD_TIPO_LABELS: Record<HistorialEvento['entidadTipo'], string> = {
  proyecto: 'Proyecto',
  presupuesto: 'Presupuesto',
  ruta: 'Ruta / Parcela',
  servicio: 'Servicio',
  asignacion: 'Asignación',
  mision: 'Misión',
  viatico: 'Viático',
  renta: 'Renta',
  catalogo: 'Catálogo',
  empresa: 'Empresa',
};

export function mapEntidadAModuloAuditoria(
  entidadTipo: HistorialEvento['entidadTipo']
): Exclude<ModuloAuditoria, 'todos'> {
  switch (entidadTipo) {
    case 'proyecto':
    case 'ruta':
      return 'proyectos_rutas';
    case 'presupuesto':
      return 'presupuestos';
    case 'asignacion':
    case 'mision':
      return 'agenda_misiones';
    case 'servicio':
      return 'servicios';
    case 'viatico':
      return 'viaticos';
    case 'renta':
      return 'flota_rentas';
    case 'catalogo':
      return 'catalogos';
    case 'empresa':
    default:
      return 'empresa';
  }
}

export function mapEntidadATabAdmin(
  entidadTipo: HistorialEvento['entidadTipo']
): AdminTabDestino {
  switch (entidadTipo) {
    case 'proyecto':
      return 'proyectos';
    case 'ruta':
    case 'servicio':
      return 'rutas';
    case 'presupuesto':
      return 'presupuestos';
    case 'asignacion':
    case 'mision':
      return 'agenda';
    case 'viatico':
      return 'viaticos';
    case 'renta':
    case 'catalogo':
      return 'catalogos';
    case 'empresa':
    default:
      return 'configuracion';
  }
}

/**
 * Convierte `DD/MM/YYYY HH:mm:ss AST` o ISO `YYYY-MM-DD...` en `YYYY-MM-DD`.
 */
export function parseFechaAstToIso(fechaAST: string): string {
  const trimmed = (fechaAST || '').trim();
  if (!trimmed) return '';
  const ddmmyyyy = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (ddmmyyyy) {
    return `${ddmmyyyy[3]}-${ddmmyyyy[2]}-${ddmmyyyy[1]}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return '';
}

export function parseFechaAstToTimestamp(fechaAST: string): number {
  const trimmed = (fechaAST || '').trim();
  const match = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (match) {
    const [, dd, mm, yyyy, hh, min, ss] = match;
    return Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh) + 4, Number(min), Number(ss));
  }
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export interface ClasificacionEventoAuditoria {
  modulo: Exclude<ModuloAuditoria, 'todos'>;
  moduloEtiqueta: string;
  categoria: Exclude<CategoriaAccionAuditoria, 'todas'>;
  esOverride: boolean;
  esRechazoOAlerta: boolean;
}

export function clasificarEventoAuditoria(ev: HistorialEvento): ClasificacionEventoAuditoria {
  const modulo = mapEntidadAModuloAuditoria(ev.entidadTipo);
  const moduloEtiqueta = MODULOS_AUDITORIA_LABELS[modulo];
  const texto = `${ev.accion} ${ev.detalle}`.toLowerCase();
  const esOverride = Boolean(ev.metadata?.overrideMotivo) || texto.includes('override');
  const esRechazoOAlerta =
    texto.includes('rechaz') ||
    texto.includes('excedente') ||
    texto.includes('desviaci') ||
    texto.includes('bloque') ||
    texto.includes('cancelad') ||
    texto.includes('vencid') ||
    texto.includes('cargo al colaborador');

  let categoria: Exclude<CategoriaAccionAuditoria, 'todas'> = 'creaciones';
  if (esOverride) {
    categoria = 'overrides';
  } else if (esRechazoOAlerta) {
    categoria = 'rechazos_alertas';
  } else if (
    texto.includes('aprob') ||
    texto.includes('devoluci') ||
    texto.includes('cerrad') ||
    texto.includes('autoriz')
  ) {
    categoria = 'aprobaciones';
  } else if (
    Boolean(ev.valorAnterior || ev.valorNuevo || ev.metadata?.valorAnterior || ev.metadata?.valorNuevo) ||
    texto.includes('cambio') ||
    texto.includes('actualiz') ||
    texto.includes('reasign') ||
    texto.includes('progreso') ||
    texto.includes('estado')
  ) {
    categoria = 'cambios_valor';
  }

  return {
    modulo,
    moduloEtiqueta,
    categoria,
    esOverride,
    esRechazoOAlerta,
  };
}

const PESO_SEVERIDAD: Record<SeveridadAlerta, number> = {
  critica: 0,
  advertencia: 1,
  informativa: 2,
};

function ordenarAlertas(alertas: AlertaOperativa[]): AlertaOperativa[] {
  return [...alertas].sort((a, b) => {
    const diffSev = PESO_SEVERIDAD[a.severidad] - PESO_SEVERIDAD[b.severidad];
    if (diffSev !== 0) return diffSev;
    return b.fechaIso.localeCompare(a.fechaIso);
  });
}

function formatMoneyRD(monto: number, moneda = 'RD$'): string {
  return `${moneda} ${monto.toLocaleString('es-DO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function restarDiasIso(fechaIso: string, dias: number): string {
  const base = new Date(`${fechaIso}T12:00:00Z`);
  if (Number.isNaN(base.getTime())) return fechaIso;
  base.setUTCDate(base.getUTCDate() - dias);
  return base.toISOString().slice(0, 10);
}

export function generarAlertasOperativasAdmin(params: {
  snapshot: EstadoEmpresaSnapshot;
  hoyIso?: string;
  pendingCount?: number;
  hasConflict?: boolean;
}): AlertaOperativa[] {
  const {
    snapshot,
    hoyIso = obtenerFechaHoyAST(),
    pendingCount = 0,
    hasConflict = false,
  } = params;

  const moneda = snapshot.empresa.moneda || 'RD$';
  const alertas: AlertaOperativa[] = [];

  // 1. Conflictos o cola de sincronización offline
  if (hasConflict) {
    alertas.push({
      id: 'sync-conflicto-admin',
      severidad: 'critica',
      modulo: 'sincronizacion',
      moduloEtiqueta: 'Sincronización',
      titulo: 'Conflicto de sincronización detectado',
      detalle:
        'Existen cambios locales en conflicto con la última versión del servidor. Revisa y sincroniza antes de cerrar operaciones.',
      fechaIso: hoyIso,
      tabDestinoAdmin: 'hoy',
      accionEtiqueta: 'Revisar sincronización',
    });
  } else if (pendingCount > 0) {
    alertas.push({
      id: `sync-pendiente-admin-${pendingCount}`,
      severidad: 'advertencia',
      modulo: 'sincronizacion',
      moduloEtiqueta: 'Sincronización',
      titulo: `${pendingCount} cambio(s) pendiente(s) por sincronizar`,
      detalle:
        'Hay registros guardados localmente en espera de conexión o confirmación remota.',
      fechaIso: hoyIso,
      tabDestinoAdmin: 'hoy',
      accionEtiqueta: 'Ver estado de sync',
    });
  }

  // 2. Rentas vencidas sin devolución
  const rentasVencidas = obtenerRentasVencidasSinDevolucion(snapshot.rentas ?? [], hoyIso);
  for (const renta of rentasVencidas) {
    alertas.push({
      id: `renta-vencida-${renta.id}-${renta.fechaFin}`,
      severidad: 'critica',
      modulo: 'catalogos',
      moduloEtiqueta: 'Flota y Rentas',
      titulo: `Renta vencida sin devolución (${renta.recursoEtiqueta || renta.proveedor})`,
      detalle: `Debió devolverse el ${renta.fechaFin}. Proveedor: ${renta.proveedor} · Costo: ${formatMoneyRD(renta.costoTotalRD, moneda)}.`,
      fechaIso: renta.fechaFin,
      tabDestinoAdmin: 'catalogos',
      entidadId: renta.id,
      entidadTipo: 'renta',
      accionEtiqueta: 'Registrar devolución',
    });
  }

  // 3. Desviación de rendimiento de combustible en flota
  try {
    const rendimientos = calcularRendimientoFlota({
      vehiculos: snapshot.vehiculos ?? [],
      viaticos: snapshot.viaticos ?? [],
      asignaciones: snapshot.asignaciones ?? [],
      rutas: snapshot.rutas ?? [],
      bitacoras: snapshot.bitacoras ?? [],
      config: snapshot.configuracion,
      fechaCalculoIso: hoyIso,
    });
    for (const r of rendimientos) {
      if (!r.alerta) continue;
      alertas.push({
        id: `rendimiento-alerta-${r.vehiculoId}-${r.desviacionPct ?? 0}`,
        severidad: 'critica',
        modulo: 'catalogos',
        moduloEtiqueta: 'Rendimiento de Flota',
        titulo: `Desviación de combustible en ${r.vehiculoEtiqueta} (${r.placa})`,
        detalle: `Rendimiento real ${r.rendimientoRealKmGal ?? 0} km/gal vs teórico ${r.rendimientoTeoricoKmGal} km/gal (${r.desviacionPct ?? 0}% sobre umbral de -${r.umbralAlertaPct}%).`,
        fechaIso: r.fechaFinVentana || hoyIso,
        tabDestinoAdmin: 'catalogos',
        entidadId: r.vehiculoId,
        entidadTipo: 'catalogo',
        accionEtiqueta: 'Revisar flota',
      });
    }
  } catch {
    // Evitar fallo si falta configuración de flota
  }

  // 4. Sobregiros y cercanía al límite presupuestario por proyecto
  try {
    const reportePresupuesto = calcularReportePresupuestosDesdeSnapshot(snapshot, {
      fechaCalculoIso: hoyIso,
    });
    for (const comp of reportePresupuesto.comparaciones) {
      if (comp.totalPlanificadoRD <= 0) continue;
      if (comp.excedidoTotal) {
        const exceso = Math.abs(comp.diferenciaTotalRD);
        alertas.push({
          id: `presupuesto-excedido-${comp.proyectoId}-${Math.round(comp.totalEjecutadoRD)}`,
          severidad: 'critica',
          modulo: 'presupuestos',
          moduloEtiqueta: 'Presupuestos',
          titulo: `Sobregiro presupuestario en ${comp.codigoContrato}`,
          detalle: `${comp.nombreProyecto}: ejecutado ${formatMoneyRD(comp.totalEjecutadoRD, moneda)} sobre ${formatMoneyRD(comp.totalPlanificadoRD, moneda)} (${comp.porcentajeEjecucionTotalPct ?? 0}%, exceso ${formatMoneyRD(exceso, moneda)}).`,
          fechaIso: hoyIso,
          tabDestinoAdmin: 'presupuestos',
          entidadId: comp.proyectoId,
          entidadTipo: 'presupuesto',
          accionEtiqueta: 'Revisar presupuesto',
        });
      } else if (
        comp.porcentajeEjecucionTotalPct !== null &&
        comp.porcentajeEjecucionTotalPct >= 85
      ) {
        alertas.push({
          id: `presupuesto-umbral-${comp.proyectoId}-${Math.round(comp.porcentajeEjecucionTotalPct)}`,
          severidad: 'advertencia',
          modulo: 'presupuestos',
          moduloEtiqueta: 'Presupuestos',
          titulo: `Presupuesto al ${comp.porcentajeEjecucionTotalPct}% en ${comp.codigoContrato}`,
          detalle: `${comp.nombreProyecto} tiene disponible ${formatMoneyRD(comp.diferenciaTotalRD, moneda)} de ${formatMoneyRD(comp.totalPlanificadoRD, moneda)}.`,
          fechaIso: hoyIso,
          tabDestinoAdmin: 'presupuestos',
          entidadId: comp.proyectoId,
          entidadTipo: 'presupuesto',
          accionEtiqueta: 'Ver ejecución',
        });
      }
    }
  } catch {
    // Evitar fallo si algún proyecto tiene datos parciales
  }

  // 5. Viáticos con excedente pendiente, sin OCR o cola de aprobación
  const viaticosPendientes = (snapshot.viaticos ?? []).filter(
    (v) => v.estadoAprobacion === 'pendiente'
  );
  const viaticosConExcedente = viaticosPendientes.filter((v) => (v.excedenteRD ?? 0) > 0);
  for (const v of viaticosConExcedente) {
    alertas.push({
      id: `viatico-excedente-${v.id}`,
      severidad: 'critica',
      modulo: 'viaticos',
      moduloEtiqueta: 'Viáticos',
      titulo: `Viático con excedente pendiente (${v.creadoPorNombre})`,
      detalle: `${v.categoria} en ${v.comercio}: ${formatMoneyRD(v.montoRD, moneda)} (excedente de ${formatMoneyRD(v.excedenteRD ?? 0, moneda)} sobre tope). Requiere decisión de aprobación o cargo.`,
      fechaIso: v.fechaIso || hoyIso,
      tabDestinoAdmin: 'viaticos',
      entidadId: v.id,
      entidadTipo: 'viatico',
      accionEtiqueta: 'Decidir excedente',
    });
  }

  const viaticosPendientesRegulares = viaticosPendientes.filter(
    (v) => (v.excedenteRD ?? 0) <= 0
  );
  if (viaticosPendientesRegulares.length > 0) {
    const totalPendiente = viaticosPendientesRegulares.reduce((s, v) => s + v.montoRD, 0);
    alertas.push({
      id: `viaticos-pendientes-cola-${viaticosPendientesRegulares.length}`,
      severidad: 'advertencia',
      modulo: 'viaticos',
      moduloEtiqueta: 'Viáticos',
      titulo: `${viaticosPendientesRegulares.length} viático(s) pendiente(s) de aprobación`,
      detalle: `Total en espera de validación: ${formatMoneyRD(totalPendiente, moneda)}.`,
      fechaIso: viaticosPendientesRegulares[0]?.fechaIso || hoyIso,
      tabDestinoAdmin: 'viaticos',
      entidadTipo: 'viatico',
      accionEtiqueta: 'Aprobar viáticos',
    });
  }

  const viaticosSinOcr = (snapshot.viaticos ?? []).filter(
    (v) => v.syncStatus === 'needs_ocr'
  );
  for (const v of viaticosSinOcr) {
    alertas.push({
      id: `viatico-ocr-${v.id}`,
      severidad: 'advertencia',
      modulo: 'viaticos',
      moduloEtiqueta: 'Viáticos',
      titulo: `Factura pendiente de lectura OCR (${v.creadoPorNombre})`,
      detalle: `El recibo capturado el ${v.fechaIso} en ${v.comercio || 'comercio por validar'} requiere procesamiento OCR.`,
      fechaIso: v.fechaIso || hoyIso,
      tabDestinoAdmin: 'viaticos',
      entidadId: v.id,
      entidadTipo: 'viatico',
      accionEtiqueta: 'Revisar recibo',
    });
  }

  // 6. Asignaciones activas o futuras con recursos en mantenimiento / fuera de servicio o cuadrilla inactiva
  for (const asig of snapshot.asignaciones ?? []) {
    if (asig.fechaFin < hoyIso) continue;
    const ruta = snapshot.rutas.find((r) => r.id === asig.rutaId);
    const cuad = snapshot.cuadrillas.find((c) => c.id === asig.cuadrillaId);
    const problemas: string[] = [];

    if (cuad && !cuad.activa) {
      problemas.push(`cuadrilla "${cuad.nombre}" inactiva`);
    }
    for (const vehId of asig.vehiculoIds) {
      const veh = snapshot.vehiculos.find((v) => v.id === vehId);
      if (veh && veh.estado !== 'disponible') {
        problemas.push(
          `vehículo ${veh.etiqueta} (${veh.estado === 'en_mantenimiento' ? 'en mantenimiento' : 'fuera de servicio'})`
        );
      }
    }
    for (const eqId of asig.equipoIds) {
      const eq = snapshot.equipos.find((e) => e.id === eqId);
      if (eq && eq.estado !== 'disponible') {
        problemas.push(
          `equipo ${eq.nombre} (${eq.estado === 'en_mantenimiento' ? 'en mantenimiento' : 'fuera de servicio'})`
        );
      }
    }

    if (problemas.length > 0) {
      alertas.push({
        id: `agenda-recurso-inactivo-${asig.id}`,
        severidad: 'critica',
        modulo: 'agenda',
        moduloEtiqueta: 'Agenda y Despacho',
        titulo: `Asignación afectada en ${ruta?.codigoParcela || 'ruta programada'}`,
        detalle: `La programación del ${asig.fechaInicio} al ${asig.fechaFin} incluye ${problemas.join(', ')}.`,
        fechaIso: asig.fechaInicio,
        tabDestinoAdmin: 'agenda',
        entidadId: asig.id,
        entidadTipo: 'asignacion',
        accionEtiqueta: 'Reprogramar en agenda',
      });
    }
  }

  // 7. Rutas con fecha prevista hoy o vencida sin brigada asignada
  const rutasAsignadasSet = new Set((snapshot.asignaciones ?? []).map((a) => a.rutaId));
  for (const ruta of snapshot.rutas ?? []) {
    if (!ruta.fechaPrevista || ruta.fechaPrevista > hoyIso) continue;
    if (rutasAsignadasSet.has(ruta.id)) continue;
    const serviciosRuta = snapshot.servicios.filter((s) => s.rutaId === ruta.id);
    const requiereDespacho = serviciosRuta.some(
      (s) => s.estado === 'cotizado' || s.estado === 'aprobado'
    );
    if (!requiereDespacho) continue;

    alertas.push({
      id: `ruta-sin-brigada-${ruta.id}-${ruta.fechaPrevista}`,
      severidad: 'advertencia',
      modulo: 'agenda',
      moduloEtiqueta: 'Rutas y Agenda',
      titulo: `Ruta sin cuadrilla asignada: ${ruta.codigoParcela}`,
      detalle: `"${ruta.nombre}" (${ruta.provincia}) tenía fecha prevista ${ruta.fechaPrevista} y aún no tiene brigada en agenda.`,
      fechaIso: ruta.fechaPrevista,
      tabDestinoAdmin: 'agenda',
      entidadId: ruta.id,
      entidadTipo: 'ruta',
      accionEtiqueta: 'Programar brigada',
    });
  }

  // 8. Flota o equipos GNSS no disponibles (informativa)
  const vehiculosNoDisp = (snapshot.vehiculos ?? []).filter((v) => v.estado !== 'disponible');
  const equiposNoDisp = (snapshot.equipos ?? []).filter((e) => e.estado !== 'disponible');
  if (vehiculosNoDisp.length > 0 || equiposNoDisp.length > 0) {
    const partes: string[] = [];
    if (vehiculosNoDisp.length > 0) {
      partes.push(
        `${vehiculosNoDisp.length} vehículo(s): ${vehiculosNoDisp.map((v) => v.etiqueta).join(', ')}`
      );
    }
    if (equiposNoDisp.length > 0) {
      partes.push(
        `${equiposNoDisp.length} equipo(s) GNSS: ${equiposNoDisp.map((e) => e.nombre).join(', ')}`
      );
    }
    alertas.push({
      id: `flota-no-disponible-${vehiculosNoDisp.length}-${equiposNoDisp.length}`,
      severidad: 'informativa',
      modulo: 'catalogos',
      moduloEtiqueta: 'Flota y Equipos',
      titulo: 'Recursos en mantenimiento o fuera de servicio',
      detalle: partes.join(' · '),
      fechaIso: hoyIso,
      tabDestinoAdmin: 'catalogos',
      entidadTipo: 'catalogo',
      accionEtiqueta: 'Ver catálogos',
    });
  }

  // 9. Overrides recientes en los últimos 7 días (informativa para auditoría)
  const limiteOverridesIso = restarDiasIso(hoyIso, 7);
  const overridesRecientes = (snapshot.historial ?? [])
    .filter((ev) => {
      if (!ev.metadata?.overrideMotivo) return false;
      const fechaEv = parseFechaAstToIso(ev.fechaAST);
      return !fechaEv || fechaEv >= limiteOverridesIso;
    })
    .slice(0, 3);

  for (const ev of overridesRecientes) {
    alertas.push({
      id: `auditoria-override-${ev.id}`,
      severidad: 'informativa',
      modulo: 'auditoria',
      moduloEtiqueta: 'Auditoría',
      titulo: `Override autorizado por ${ev.usuarioNombre}`,
      detalle: `${ev.accion}: "${String(ev.metadata?.overrideMotivo)}" (${ev.fechaAST}).`,
      fechaIso: parseFechaAstToIso(ev.fechaAST) || hoyIso,
      tabDestinoAdmin: 'auditoria',
      entidadId: ev.entidadId,
      entidadTipo: ev.entidadTipo,
      accionEtiqueta: 'Ver en auditoría',
    });
  }

  return ordenarAlertas(alertas);
}

export function generarAlertasOperativasTecnico(params: {
  snapshot: SnapshotTecnico;
  usuarioId: string;
  hoyIso?: string;
  pendingCount?: number;
  hasConflict?: boolean;
}): AlertaOperativa[] {
  const {
    snapshot,
    usuarioId,
    hoyIso = obtenerFechaHoyAST(),
    pendingCount = 0,
    hasConflict = false,
  } = params;

  const moneda = snapshot.empresa.moneda || 'RD$';
  const alertas: AlertaOperativa[] = [];

  if (hasConflict) {
    alertas.push({
      id: 'sync-conflicto-tec',
      severidad: 'critica',
      modulo: 'sincronizacion',
      moduloEtiqueta: 'Sincronización',
      titulo: 'Conflicto de sincronización en dispositivo',
      detalle:
        'Se detectaron cambios locales que difieren de la versión remota. Sincroniza tus datos en cuanto tengas red.',
      fechaIso: hoyIso,
      tabDestinoTecnico: 'hoy',
      accionEtiqueta: 'Revisar sincronización',
    });
  } else if (pendingCount > 0) {
    alertas.push({
      id: `sync-pendiente-tec-${pendingCount}`,
      severidad: 'advertencia',
      modulo: 'sincronizacion',
      moduloEtiqueta: 'Sincronización',
      titulo: `${pendingCount} registro(s) guardado(s) offline`,
      detalle:
        'Tienes bitácoras, servicios o viáticos pendientes de subir al servidor.',
      fechaIso: hoyIso,
      tabDestinoTecnico: 'hoy',
      accionEtiqueta: 'Ir a inicio',
    });
  }

  const misViaticos = (snapshot.viaticos ?? []).filter(
    (v) => v.creadoPorUsuarioId === usuarioId
  );

  for (const v of misViaticos) {
    if (v.estadoAprobacion === 'rechazado') {
      alertas.push({
        id: `tec-viatico-rechazado-${v.id}`,
        severidad: 'critica',
        modulo: 'viaticos',
        moduloEtiqueta: 'Mis Viáticos',
        titulo: `Viático rechazado: ${v.categoria} (${formatMoneyRD(v.montoRD, moneda)})`,
        detalle: v.motivoRechazo
          ? `Motivo: ${v.motivoRechazo}`
          : `Comprobante en ${v.comercio} (${v.fechaIso}) rechazado por administración.`,
        fechaIso: v.fechaIso || hoyIso,
        tabDestinoTecnico: 'viaticos_tecnico',
        entidadId: v.id,
        entidadTipo: 'viatico',
        accionEtiqueta: 'Ver viático',
      });
    } else if (v.estadoAprobacion === 'pendiente' && (v.excedenteRD ?? 0) > 0) {
      alertas.push({
        id: `tec-viatico-excedente-${v.id}`,
        severidad: 'advertencia',
        modulo: 'viaticos',
        moduloEtiqueta: 'Mis Viáticos',
        titulo: `Viático pendiente con excedente (${formatMoneyRD(v.excedenteRD ?? 0, moneda)})`,
        detalle: `Tu registro en ${v.comercio} (${v.fechaIso}) supera el tope asignado y espera revisión de coordinación.`,
        fechaIso: v.fechaIso || hoyIso,
        tabDestinoTecnico: 'viaticos_tecnico',
        entidadId: v.id,
        entidadTipo: 'viatico',
        accionEtiqueta: 'Ver estado',
      });
    }

    if (v.syncStatus === 'needs_ocr') {
      alertas.push({
        id: `tec-viatico-ocr-${v.id}`,
        severidad: 'advertencia',
        modulo: 'viaticos',
        moduloEtiqueta: 'Mis Viáticos',
        titulo: 'Comprobante pendiente de lectura OCR',
        detalle: `La factura guardada el ${v.fechaIso} se procesará automáticamente al sincronizar con conexión.`,
        fechaIso: v.fechaIso || hoyIso,
        tabDestinoTecnico: 'viaticos_tecnico',
        entidadId: v.id,
        entidadTipo: 'viatico',
        accionEtiqueta: 'Ver mis viáticos',
      });
    }
  }

  // Servicios en campo sin bitácora registrada aún
  for (const srv of snapshot.servicios ?? []) {
    if (srv.estado !== 'en_campo') continue;
    const tieneBitacora = (snapshot.bitacoras ?? []).some((b) => b.servicioId === srv.id);
    if (tieneBitacora) continue;
    const ruta = snapshot.rutas.find((r) => r.id === srv.rutaId);
    alertas.push({
      id: `tec-bitacora-faltante-${srv.id}`,
      severidad: 'advertencia',
      modulo: 'rutas',
      moduloEtiqueta: 'Trabajo en Campo',
      titulo: `Servicio en campo sin notas de bitácora`,
      detalle: `${srv.nombre} en ${ruta?.codigoParcela || 'ruta asignada'} (${ruta?.nombre || ''}) aún no tiene registro en bitácora.`,
      fechaIso: hoyIso,
      tabDestinoTecnico: 'hoy',
      entidadId: srv.id,
      entidadTipo: 'servicio',
      accionEtiqueta: 'Registrar bitácora',
    });
  }

  // Rutas asignadas activas hoy
  for (const asig of snapshot.asignaciones ?? []) {
    if (asig.fechaInicio <= hoyIso && asig.fechaFin >= hoyIso) {
      const ruta = snapshot.rutas.find((r) => r.id === asig.rutaId);
      if (!ruta) continue;
      alertas.push({
        id: `tec-ruta-hoy-${asig.id}-${hoyIso}`,
        severidad: 'informativa',
        modulo: 'agenda',
        moduloEtiqueta: 'Mi Agenda',
        titulo: `Ruta activa hoy: ${ruta.codigoParcela}`,
        detalle: `${ruta.nombre} (${ruta.provincia}) · Programación ${asig.fechaInicio} al ${asig.fechaFin}.`,
        fechaIso: hoyIso,
        tabDestinoTecnico: 'rutas_tecnico',
        entidadId: ruta.id,
        entidadTipo: 'ruta',
        accionEtiqueta: 'Abrir rutas',
      });
    }
  }

  return ordenarAlertas(alertas);
}

export function claveAlertasLeidas(empresaId: string, usuarioId: string): string {
  return `sirius_alertas_leidas_v1:${empresaId}:${usuarioId}`;
}

export function cargarAlertasLeidas(empresaId: string, usuarioId: string): Set<string> {
  try {
    const raw = localStorage.getItem(claveAlertasLeidas(empresaId, usuarioId));
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set(parsed.filter((x): x is string => typeof x === 'string'));
  } catch {
    return new Set<string>();
  }
}

export function guardarAlertasLeidas(
  empresaId: string,
  usuarioId: string,
  ids: Set<string>
): void {
  try {
    // Limitar a los últimos 300 IDs para no crecer indefinidamente en localStorage
    const arr = Array.from(ids).slice(-300);
    localStorage.setItem(claveAlertasLeidas(empresaId, usuarioId), JSON.stringify(arr));
  } catch {
    // Ignorar error de almacenamiento (modo privado / cuota)
  }
}
