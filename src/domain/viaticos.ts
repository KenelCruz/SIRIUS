import type {
  EstadoAprobacionViatico,
  RepartoProyecto,
  RolEmpresa,
  Viatico,
} from '../types/domain';

// SUPUESTO PENDIENTE: "El reparto de viáticos es por monto exacto, no por porcentaje"
export function validarRepartoViatico(
  montoTotalRD: number,
  repartos: RepartoProyecto[]
): { valido: boolean; error?: string; sumaRD: number } {
  if (!Number.isFinite(montoTotalRD) || montoTotalRD < 0) {
    return { valido: false, error: 'El monto total del viático debe ser mayor o igual a 0.', sumaRD: 0 };
  }
  if (!Array.isArray(repartos) || repartos.length === 0) {
    return {
      valido: false,
      error: 'Debes asignar al menos un proyecto o enviar el monto a "sin_asignar".',
      sumaRD: 0,
    };
  }

  const vistos = new Set<string>();
  let sumaCents = 0;

  for (const r of repartos) {
    if (!r.proyectoId) {
      return { valido: false, error: 'Cada línea de reparto debe tener un proyectoId válido.', sumaRD: 0 };
    }
    if (vistos.has(r.proyectoId)) {
      return {
        valido: false,
        error: `Proyecto duplicado en el reparto (${r.proyectoId}).`,
        sumaRD: 0,
      };
    }
    vistos.add(r.proyectoId);

    if (!Number.isFinite(r.montoRD) || r.montoRD < 0) {
      return {
        valido: false,
        error: 'Los montos de reparto no pueden ser negativos.',
        sumaRD: 0,
      };
    }
    sumaCents += Math.round(r.montoRD * 100);
  }

  const totalCents = Math.round(montoTotalRD * 100);
  const sumaRD = Number((sumaCents / 100).toFixed(2));

  if (sumaCents !== totalCents) {
    const diffRD = ((totalCents - sumaCents) / 100).toFixed(2);
    return {
      valido: false,
      error: `La suma del reparto (${sumaRD.toFixed(2)} RD$) debe igualar exactamente el monto del gasto (${montoTotalRD.toFixed(2)} RD$). Diferencia: ${diffRD} RD$.`,
      sumaRD,
    };
  }

  return { valido: true, sumaRD };
}

export function completarRepartoConSinAsignar(
  montoTotalRD: number,
  repartosProyectos: RepartoProyecto[]
): RepartoProyecto[] {
  const filtrados = repartosProyectos.filter(
    (r) => r.proyectoId !== 'sin_asignar' && r.montoRD > 0
  );
  const sumaAsignadaCents = filtrados.reduce((acc, r) => acc + Math.round(r.montoRD * 100), 0);
  const totalCents = Math.round(montoTotalRD * 100);
  const restanteCents = totalCents - sumaAsignadaCents;

  if (restanteCents > 0) {
    return [
      ...filtrados,
      { proyectoId: 'sin_asignar', montoRD: Number((restanteCents / 100).toFixed(2)) },
    ];
  }
  return filtrados;
}

export function validarDecisionViatico(params: {
  rol: RolEmpresa;
  nuevoEstado: EstadoAprobacionViatico;
  motivoRechazo?: string;
}): { valido: boolean; error?: string } {
  const { rol, nuevoEstado, motivoRechazo } = params;
  if (rol !== 'admin' && rol !== 'coordinador') {
    return { valido: false, error: 'Solo Admin o Coordinador pueden aprobar o rechazar viáticos.' };
  }
  if (nuevoEstado === 'rechazado' && (!motivoRechazo || motivoRechazo.trim().length < 4)) {
    return {
      valido: false,
      error: 'Para rechazar un viático debes indicar el motivo del rechazo.',
    };
  }
  return { valido: true };
}

export interface ResumenGastoProyecto {
  aprobadoRD: number;
  pendienteRD: number;
  totalEjecutadoRD: number;
}

export function calcularGastoPorProyecto(
  viaticos: Viatico[]
): Record<string, ResumenGastoProyecto> {
  const mapa: Record<string, ResumenGastoProyecto> = {};

  for (const v of viaticos) {
    if (v.estadoAprobacion === 'rechazado') continue;

    for (const r of v.repartos) {
      if (!mapa[r.proyectoId]) {
        mapa[r.proyectoId] = { aprobadoRD: 0, pendienteRD: 0, totalEjecutadoRD: 0 };
      }
      if (v.estadoAprobacion === 'aprobado') {
        mapa[r.proyectoId].aprobadoRD += r.montoRD;
      } else {
        mapa[r.proyectoId].pendienteRD += r.montoRD;
      }
      mapa[r.proyectoId].totalEjecutadoRD += r.montoRD;
    }
  }

  return mapa;
}
