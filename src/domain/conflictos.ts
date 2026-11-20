import type {
  Asignacion,
  ConflictDetail,
  Cuadrilla,
  EquipoGNSS,
  GeoPoint,
  Mision,
  OverrideConflicto,
  Personal,
  Renta,
  Ruta,
  Vehiculo,
} from '../types/domain';
import { haversineMeters } from '../utils/geodesy';
import { validarRepartoViatico } from './viaticos';

const DISTANCIA_PROXIMIDAD_METROS = 120;
const UMBRAL_CERCANIA_RENTA_KM_FALLBACK = 30;

export function validarRangoFechas(fechaInicio: string, fechaFin: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
    return false;
  }
  return fechaInicio <= fechaFin;
}

export function rangosSeSolapan(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string
): boolean {
  return inicioA <= finB && inicioB <= finA;
}

export function expandirRangoFechas(fechaInicio: string, fechaFin: string, maxDias = 60): string[] {
  if (!validarRangoFechas(fechaInicio, fechaFin)) return [];
  const start = new Date(`${fechaInicio}T00:00:00Z`);
  const end = new Date(`${fechaFin}T00:00:00Z`);
  const dias: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end && dias.length < maxDias) {
    dias.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dias;
}

export function obtenerDiasSolapados(
  inicioA: string,
  finA: string,
  inicioB: string,
  finB: string
): string[] {
  if (!rangosSeSolapan(inicioA, finA, inicioB, finB)) return [];
  const solInicio = inicioA > inicioB ? inicioA : inicioB;
  const solFin = finA < finB ? finA : finB;
  return expandirRangoFechas(solInicio, solFin);
}

function miembrosDeCuadrilla(cuadrilla: Cuadrilla | undefined): Set<string> {
  const set = new Set<string>();
  if (!cuadrilla) return set;
  if (cuadrilla.jefeId) set.add(cuadrilla.jefeId);
  for (const m of cuadrilla.miembroIds) {
    set.add(m);
  }
  return set;
}

export interface ParamsDeteccionConflictos {
  candidata: Pick<
    Asignacion,
    'id' | 'rutaId' | 'fechaInicio' | 'fechaFin' | 'cuadrillaId' | 'vehiculoIds' | 'equipoIds'
  >;
  asignacionesExistentes: Asignacion[];
  rutas: Ruta[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  rentasExistentes?: Renta[];
  misiones?: Mision[];
  umbralCercaniaRentaKm?: number;
}

export function rentaEstaActivaOReservada(renta: Pick<Renta, 'estado'>): boolean {
  return renta.estado === 'reservada' || renta.estado === 'activa';
}

function resolverCoordenadaRenta(
  renta: Pick<Renta, 'rutaId' | 'misionId'>,
  rutas: Ruta[],
  misiones: Mision[]
): { lat: number; lon: number } | undefined {
  if (renta.rutaId) {
    const r = rutas.find((x) => x.id === renta.rutaId);
    if (r?.centroid) return { lat: r.centroid.lat, lon: r.centroid.lon };
  }
  if (renta.misionId) {
    const m = misiones.find((x) => x.id === renta.misionId);
    if (m?.rutaIds?.length) {
      const puntos = m.rutaIds
        .map((id) => rutas.find((r) => r.id === id)?.centroid)
        .filter((p): p is GeoPoint => Boolean(p));
      if (puntos.length > 0) {
        const lat = puntos.reduce((s, p) => s + p.lat, 0) / puntos.length;
        const lon = puntos.reduce((s, p) => s + p.lon, 0) / puntos.length;
        return { lat, lon };
      }
    }
  }
  return undefined;
}

function rentaCorrespondeARuta(
  renta: Pick<Renta, 'rutaId' | 'misionId'>,
  rutaId: string,
  misiones: Mision[]
): boolean {
  if (renta.rutaId && renta.rutaId === rutaId) return true;
  if (renta.misionId) {
    const m = misiones.find((x) => x.id === renta.misionId);
    if (m?.rutaIds.includes(rutaId)) return true;
  }
  return false;
}

export function detectarConflictosAsignacion(params: ParamsDeteccionConflictos): ConflictDetail[] {
  const {
    candidata,
    asignacionesExistentes,
    rutas,
    cuadrillas,
    personal,
    vehiculos,
    equipos,
    rentasExistentes = [],
    misiones = [],
    umbralCercaniaRentaKm = UMBRAL_CERCANIA_RENTA_KM_FALLBACK,
  } = params;

  const conflictos: ConflictDetail[] = [];
  const rutaCandidata = rutas.find((r) => r.id === candidata.rutaId);
  const cuadrillaCandidata = cuadrillas.find((c) => c.id === candidata.cuadrillaId);
  const miembrosCand = miembrosDeCuadrilla(cuadrillaCandidata);

  if (cuadrillaCandidata && !cuadrillaCandidata.activa) {
    conflictos.push({
      type: 'cuadrilla_inactiva',
      severidad: 'bloqueante',
      permiteOverride: false,
      conflictingEntityId: cuadrillaCandidata.id,
      message: `La cuadrilla "${cuadrillaCandidata.nombre}" está dada de baja (inactiva) y no puede asignarse.`,
      conflictingRutaCode: rutaCandidata?.codigoParcela || 'RUTA',
      conflictingRutaTitle: rutaCandidata?.nombre || 'Ruta seleccionada',
    });
  }

  // 1. Bloqueos duros por estado físico de vehículos (en mantenimiento o fuera de servicio)
  for (const vehiculoId of candidata.vehiculoIds) {
    const veh = vehiculos.find((v) => v.id === vehiculoId);
    if (veh && veh.estado !== 'disponible') {
      conflictos.push({
        type: 'vehiculo_mantenimiento',
        severidad: 'bloqueante',
        permiteOverride: false,
        conflictingEntityId: veh.id,
        message: `El vehículo ${veh.etiqueta} (${veh.placa}) está en estado "${
          veh.estado === 'en_mantenimiento' ? 'En mantenimiento' : 'Fuera de servicio'
        }" y no puede asignarse.`,
        conflictingRutaCode: rutaCandidata?.codigoParcela || 'RUTA',
        conflictingRutaTitle: rutaCandidata?.nombre || 'Ruta seleccionada',
      });
    }
  }

  // 2. Bloqueos duros por estado físico de equipos GNSS
  for (const equipoId of candidata.equipoIds) {
    const eq = equipos.find((e) => e.id === equipoId);
    if (eq && eq.estado !== 'disponible') {
      conflictos.push({
        type: 'equipo_mantenimiento',
        severidad: 'bloqueante',
        permiteOverride: false,
        conflictingEntityId: eq.id,
        message: `El equipo GNSS ${eq.nombre} (${eq.serial}) está en estado "${
          eq.estado === 'en_mantenimiento' ? 'En mantenimiento' : 'Fuera de servicio'
        }" y no puede asignarse.`,
        conflictingRutaCode: rutaCandidata?.codigoParcela || 'RUTA',
        conflictingRutaTitle: rutaCandidata?.nombre || 'Ruta seleccionada',
      });
    }
  }

  // 3. Conflictos por solapamiento en rango [fechaInicio, fechaFin] con otras rutas
  for (const existente of asignacionesExistentes) {
    if (existente.id === candidata.id) continue;

    // SUPUESTO PENDIENTE: "Un técnico no puede estar en dos rutas el mismo día (salvo misma ruta)"
    if (existente.rutaId === candidata.rutaId) continue;

    if (
      !rangosSeSolapan(
        candidata.fechaInicio,
        candidata.fechaFin,
        existente.fechaInicio,
        existente.fechaFin
      )
    ) {
      continue;
    }

    const rutaConflicto = rutas.find((r) => r.id === existente.rutaId);
    const dias = obtenerDiasSolapados(
      candidata.fechaInicio,
      candidata.fechaFin,
      existente.fechaInicio,
      existente.fechaFin
    );
    const rangoTexto =
      dias.length === 1 ? dias[0] : `${dias[0]} al ${dias[dias.length - 1]} (${dias.length} días)`;

    if (existente.cuadrillaId === candidata.cuadrillaId) {
      conflictos.push({
        type: 'cuadrilla',
        severidad: 'bloqueante',
        permiteOverride: true,
        conflictingEntityId: candidata.cuadrillaId,
        message: `La cuadrilla "${cuadrillaCandidata?.nombre || candidata.cuadrillaId}" ya está asignada del ${rangoTexto}.`,
        conflictingRutaCode: rutaConflicto?.codigoParcela || existente.rutaId,
        conflictingRutaTitle: rutaConflicto?.nombre || 'Otra ruta',
        overlapDates: dias,
      });
    } else {
      const cuadrillaExist = cuadrillas.find((c) => c.id === existente.cuadrillaId);
      const miembrosExist = miembrosDeCuadrilla(cuadrillaExist);
      for (const personaId of miembrosCand) {
        if (miembrosExist.has(personaId)) {
          const persona = personal.find((p) => p.id === personaId);
          conflictos.push({
            type: 'personal',
            severidad: 'bloqueante',
            permiteOverride: true,
            conflictingEntityId: personaId,
            message: `${persona?.nombre || personaId} ya participa en otra ruta el ${rangoTexto}.`,
            conflictingRutaCode: rutaConflicto?.codigoParcela || existente.rutaId,
            conflictingRutaTitle: rutaConflicto?.nombre || 'Otra ruta',
            overlapDates: dias,
          });
        }
      }
    }

    for (const vehId of candidata.vehiculoIds) {
      if (existente.vehiculoIds.includes(vehId)) {
        const veh = vehiculos.find((v) => v.id === vehId);
        conflictos.push({
          type: 'vehiculo',
          severidad: 'bloqueante',
          permiteOverride: true,
          conflictingEntityId: vehId,
          message: `El vehículo ${veh?.etiqueta || vehId} (${veh?.placa || ''}) está reservado el ${rangoTexto}.`,
          conflictingRutaCode: rutaConflicto?.codigoParcela || existente.rutaId,
          conflictingRutaTitle: rutaConflicto?.nombre || 'Otra ruta',
          overlapDates: dias,
        });
      }
    }

    for (const eqId of candidata.equipoIds) {
      if (existente.equipoIds.includes(eqId)) {
        const eq = equipos.find((e) => e.id === eqId);
        conflictos.push({
          type: 'equipo',
          severidad: 'bloqueante',
          permiteOverride: true,
          conflictingEntityId: eqId,
          message: `El equipo GNSS ${eq?.nombre || eqId} está asignado a otra ruta el ${rangoTexto}.`,
          conflictingRutaCode: rutaConflicto?.codigoParcela || existente.rutaId,
          conflictingRutaTitle: rutaConflicto?.nombre || 'Otra ruta',
          overlapDates: dias,
        });
      }
    }
  }

  // 3b. Conflictos con rentas activas/reservadas de vehículos o equipos
  if (rentasExistentes.length > 0) {
    for (const renta of rentasExistentes) {
      if (!rentaEstaActivaOReservada(renta)) continue;
      const usaRecurso =
        renta.recursoTipo === 'vehiculo'
          ? candidata.vehiculoIds.includes(renta.recursoId)
          : candidata.equipoIds.includes(renta.recursoId);
      if (!usaRecurso) continue;
      if (rentaCorrespondeARuta(renta, candidata.rutaId, misiones)) continue;
      if (
        !rangosSeSolapan(candidata.fechaInicio, candidata.fechaFin, renta.fechaInicio, renta.fechaFin)
      ) {
        continue;
      }

      const dias = obtenerDiasSolapados(
        candidata.fechaInicio,
        candidata.fechaFin,
        renta.fechaInicio,
        renta.fechaFin
      );
      const coordRenta = resolverCoordenadaRenta(renta, rutas, misiones);
      const distKm =
        rutaCandidata?.centroid && coordRenta
          ? haversineMeters(
              rutaCandidata.centroid.lat,
              rutaCandidata.centroid.lon,
              coordRenta.lat,
              coordRenta.lon
            ) / 1000
          : undefined;
      const cercaDeCamino = distKm !== undefined && distKm < umbralCercaniaRentaKm;
      const etiquetaRec =
        renta.recursoEtiqueta ||
        (renta.recursoTipo === 'vehiculo'
          ? vehiculos.find((v) => v.id === renta.recursoId)?.etiqueta
          : equipos.find((e) => e.id === renta.recursoId)?.nombre) ||
        renta.recursoId;

      conflictos.push({
        type: cercaDeCamino ? 'renta_cercana' : 'renta_lejana',
        severidad: 'bloqueante',
        permiteOverride: cercaDeCamino,
        conflictingEntityId: renta.id,
        distanceKm: distKm !== undefined ? Number(distKm.toFixed(1)) : undefined,
        message: cercaDeCamino
          ? `El recurso "${etiquetaRec}" tiene una renta activa (${renta.proveedor}) en otra ruta cercana (${distKm!.toFixed(1)} km < ${umbralCercaniaRentaKm} km). Puedes continuar indicando un motivo de excepción.`
          : `El recurso "${etiquetaRec}" tiene una renta activa (${renta.proveedor}) fuera del umbral de cercanía (${distKm !== undefined ? `${distKm.toFixed(1)} km >= ${umbralCercaniaRentaKm} km` : 'otra zona'}) y no permite solapamiento.`,
        conflictingRutaCode: `RENTA-${renta.recursoId}`,
        conflictingRutaTitle: `Renta ${renta.proveedor}`,
        overlapDates: dias,
      });
    }
  }

  // 4. Advertencia espacial (< 120 m entre centroides): es advertencia, nunca bloqueo
  if (rutaCandidata) {
    for (const otraRuta of rutas) {
      if (otraRuta.id === rutaCandidata.id) continue;
      const dist = haversineMeters(
        otraRuta.centroid.lat,
        otraRuta.centroid.lon,
        rutaCandidata.centroid.lat,
        rutaCandidata.centroid.lon
      );
      if (dist < DISTANCIA_PROXIMIDAD_METROS) {
        conflictos.push({
          type: 'spatial',
          severidad: 'advertencia',
          permiteOverride: true,
          conflictingEntityId: otraRuta.id,
          message: `Proximidad espacial de ${dist.toFixed(0)} m respecto a la ruta "${otraRuta.nombre}" (advertencia no bloqueante).`,
          conflictingRutaCode: otraRuta.codigoParcela,
          conflictingRutaTitle: otraRuta.nombre,
        });
      }
    }
  }

  return conflictos;
}

export function detectarConflictosRenta(params: {
  candidata: Pick<
    Renta,
    'id' | 'recursoTipo' | 'recursoId' | 'misionId' | 'rutaId' | 'fechaInicio' | 'fechaFin' | 'estado'
  >;
  rentasExistentes: Renta[];
  asignacionesExistentes: Asignacion[];
  rutas: Ruta[];
  misiones: Mision[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  umbralCercaniaKm?: number;
}): ConflictDetail[] {
  const {
    candidata,
    rentasExistentes,
    asignacionesExistentes,
    rutas,
    misiones,
    vehiculos,
    equipos,
    umbralCercaniaKm = UMBRAL_CERCANIA_RENTA_KM_FALLBACK,
  } = params;

  if (!rentaEstaActivaOReservada(candidata)) {
    return [];
  }

  const conflictos: ConflictDetail[] = [];
  const etiquetaRecurso =
    candidata.recursoTipo === 'vehiculo'
      ? vehiculos.find((v) => v.id === candidata.recursoId)?.etiqueta || candidata.recursoId
      : equipos.find((e) => e.id === candidata.recursoId)?.nombre || candidata.recursoId;

  // 1. Renta vs otra renta activa/reservada del mismo recurso: siempre bloqueante duro
  for (const existente of rentasExistentes) {
    if (existente.id === candidata.id) continue;
    if (!rentaEstaActivaOReservada(existente)) continue;
    if (
      existente.recursoTipo !== candidata.recursoTipo ||
      existente.recursoId !== candidata.recursoId
    ) {
      continue;
    }
    if (
      !rangosSeSolapan(
        candidata.fechaInicio,
        candidata.fechaFin,
        existente.fechaInicio,
        existente.fechaFin
      )
    ) {
      continue;
    }

    const dias = obtenerDiasSolapados(
      candidata.fechaInicio,
      candidata.fechaFin,
      existente.fechaInicio,
      existente.fechaFin
    );
    conflictos.push({
      type: 'renta_solapada',
      severidad: 'bloqueante',
      permiteOverride: false,
      conflictingEntityId: existente.id,
      message: `El recurso "${etiquetaRecurso}" ya tiene otra renta (${existente.proveedor}) del ${existente.fechaInicio} al ${existente.fechaFin}. No se permiten rentas solapadas.`,
      conflictingRutaCode: existente.recursoEtiqueta || etiquetaRecurso,
      conflictingRutaTitle: `Renta ${existente.proveedor}`,
      overlapDates: dias,
    });
  }

  // 2. Renta vs asignación a otra misión/ruta que ya usa el mismo recurso en fechas solapadas
  const coordCand = resolverCoordenadaRenta(candidata, rutas, misiones);
  for (const asig of asignacionesExistentes) {
    const usaRecurso =
      candidata.recursoTipo === 'vehiculo'
        ? asig.vehiculoIds.includes(candidata.recursoId)
        : asig.equipoIds.includes(candidata.recursoId);
    if (!usaRecurso) continue;
    if (rentaCorrespondeARuta(candidata, asig.rutaId, misiones)) continue;
    if (
      !rangosSeSolapan(candidata.fechaInicio, candidata.fechaFin, asig.fechaInicio, asig.fechaFin)
    ) {
      continue;
    }

    const rutaAsig = rutas.find((r) => r.id === asig.rutaId);
    const dias = obtenerDiasSolapados(
      candidata.fechaInicio,
      candidata.fechaFin,
      asig.fechaInicio,
      asig.fechaFin
    );
    const distKm =
      coordCand && rutaAsig?.centroid
        ? haversineMeters(
            coordCand.lat,
            coordCand.lon,
            rutaAsig.centroid.lat,
            rutaAsig.centroid.lon
          ) / 1000
        : undefined;
    const cercaDeCamino = distKm !== undefined && distKm < umbralCercaniaKm;

    conflictos.push({
      type: cercaDeCamino ? 'renta_cercana' : 'renta_lejana',
      severidad: 'bloqueante',
      permiteOverride: cercaDeCamino,
      conflictingEntityId: asig.id,
      distanceKm: distKm !== undefined ? Number(distKm.toFixed(1)) : undefined,
      message: cercaDeCamino
        ? `Solapamiento con la ruta "${rutaAsig?.nombre || asig.rutaId}" a ${distKm!.toFixed(1)} km (< ${umbralCercaniaKm} km, queda de camino). Puedes continuar con motivo.`
        : `El recurso "${etiquetaRecurso}" ya está asignado a la ruta "${rutaAsig?.nombre || asig.rutaId}" (${distKm !== undefined ? `${distKm.toFixed(1)} km >= ${umbralCercaniaKm} km` : 'distancia fuera de umbral'}). Solapamiento bloqueado.`,
      conflictingRutaCode: rutaAsig?.codigoParcela || asig.rutaId,
      conflictingRutaTitle: rutaAsig?.nombre || 'Otra misión/ruta',
      overlapDates: dias,
    });
  }

  return conflictos;
}

export function calcularTotalesRenta(params: {
  tarifaRD: number;
  cantidadEstimada: number;
  incluyeItbis: boolean;
}): { subtotalRD: number; itbisRD: number; costoTotalRD: number } {
  const subtotal = Math.max(0, params.tarifaRD) * Math.max(0, params.cantidadEstimada);
  const itbisRD = params.incluyeItbis ? Number((subtotal * 0.18).toFixed(2)) : 0;
  const costoTotalRD = Number((subtotal + itbisRD).toFixed(2));
  return {
    subtotalRD: Number(subtotal.toFixed(2)),
    itbisRD,
    costoTotalRD,
  };
}

export function validarRenta(
  renta: Pick<
    Renta,
    | 'recursoTipo'
    | 'recursoId'
    | 'proveedor'
    | 'fechaInicio'
    | 'fechaFin'
    | 'modalidadTarifa'
    | 'tarifaRD'
    | 'cantidadEstimada'
    | 'costoTotalRD'
    | 'repartos'
  >
): { valido: boolean; error?: string } {
  if (!renta.recursoId.trim()) {
    return { valido: false, error: 'Debes seleccionar el vehículo o equipo en renta.' };
  }
  if (!renta.proveedor.trim()) {
    return { valido: false, error: 'El nombre del proveedor de la renta es obligatorio.' };
  }
  if (!validarRangoFechas(renta.fechaInicio, renta.fechaFin)) {
    return {
      valido: false,
      error: 'Las fechas de la renta son inválidas (fecha inicio debe ser <= fecha fin).',
    };
  }
  if (!Number.isFinite(renta.tarifaRD) || renta.tarifaRD < 0) {
    return { valido: false, error: 'La tarifa de la renta no puede ser negativa.' };
  }
  if (!Number.isFinite(renta.cantidadEstimada) || renta.cantidadEstimada <= 0) {
    return {
      valido: false,
      error:
        renta.modalidadTarifa === 'por_dia'
          ? 'La cantidad estimada de días debe ser mayor que 0.'
          : 'La cantidad estimada de kilómetros debe ser mayor que 0.',
    };
  }
  const repVal = validarRepartoViatico(renta.costoTotalRD, renta.repartos);
  if (!repVal.valido) {
    return { valido: false, error: repVal.error };
  }
  return { valido: true };
}

export function obtenerRentasVencidasSinDevolucion(rentas: Renta[], hoyIso: string): Renta[] {
  return rentas.filter(
    (r) => rentaEstaActivaOReservada(r) && Boolean(r.fechaFin) && r.fechaFin < hoyIso
  );
}

export function validarResolucionConflictos(
  conflictos: ConflictDetail[],
  override?: OverrideConflicto
): { valido: boolean; error?: string } {
  const bloqueosDuros = conflictos.filter((c) => c.severidad === 'bloqueante' && !c.permiteOverride);
  if (bloqueosDuros.length > 0) {
    return {
      valido: false,
      error: bloqueosDuros[0].message,
    };
  }

  const bloqueosConExcepcion = conflictos.filter(
    (c) => c.severidad === 'bloqueante' && c.permiteOverride
  );
  if (bloqueosConExcepcion.length > 0) {
    if (!override || override.motivo.trim().length < 5) {
      return {
        valido: false,
        error:
          'Existen conflictos de agenda bloqueantes. Debes indicar un motivo de excepción (mínimo 5 caracteres) para autorizar el override.',
      };
    }
    if (!override.usuarioId || !override.fecha) {
      return {
        valido: false,
        error: 'El override de conflicto debe incluir usuarioId y fecha de autorización.',
      };
    }
  }

  return { valido: true };
}
