import type {
  Asignacion,
  ConflictDetail,
  Cuadrilla,
  EquipoGNSS,
  OverrideConflicto,
  Personal,
  Ruta,
  Vehiculo,
} from '../types/domain';
import { haversineMeters } from '../utils/geodesy';

const DISTANCIA_PROXIMIDAD_METROS = 120;

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
  } = params;

  const conflictos: ConflictDetail[] = [];
  const rutaCandidata = rutas.find((r) => r.id === candidata.rutaId);
  const cuadrillaCandidata = cuadrillas.find((c) => c.id === candidata.cuadrillaId);
  const miembrosCand = miembrosDeCuadrilla(cuadrillaCandidata);

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
