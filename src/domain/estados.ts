import type {
  Asignacion,
  BitacoraEntrada,
  EstadoServicio,
  RolEmpresa,
  Servicio,
  ServicioTecnico,
} from '../types/domain';

export const ESTADOS_SERVICIO: EstadoServicio[] = [
  'cotizado',
  'aprobado',
  'programado',
  'en_campo',
  'procesando',
  'entregado',
  'cobrado',
];

export const ETIQUETA_ESTADO: Record<EstadoServicio, string> = {
  cotizado: 'Cotizado',
  aprobado: 'Aprobado',
  programado: 'Programado',
  en_campo: 'En campo',
  procesando: 'Procesando',
  entregado: 'Entregado',
  cobrado: 'Cobrado',
};

export const TRANSICIONES_VALIDAS: Record<EstadoServicio, EstadoServicio[]> = {
  cotizado: ['aprobado'],
  aprobado: ['programado', 'cotizado'],
  programado: ['en_campo', 'aprobado'],
  en_campo: ['procesando', 'programado'],
  procesando: ['entregado', 'en_campo'],
  entregado: ['cobrado', 'procesando'],
  cobrado: [],
};

export const TRANSICIONES_TECNICO: Partial<Record<EstadoServicio, EstadoServicio[]>> = {
  programado: ['en_campo'],
  en_campo: ['procesando'],
};

export interface PayloadTransicionServicio {
  fechaRealInicio?: string;
  fechaRealFin?: string;
  montoCobradoRD?: number;
  fechaPago?: string;
}

export type ServicioTransicionable = Servicio | ServicioTecnico;

export interface ResultadoValidacionTransicion<T extends ServicioTransicionable = Servicio> {
  valido: boolean;
  error?: string;
  servicioActualizado?: T;
}

export function obtenerEstadosSiguientesPermitidos(params: {
  rol: RolEmpresa;
  servicio: ServicioTransicionable;
  rutasAsignadasIds: Set<string>;
}): EstadoServicio[] {
  const { rol, servicio, rutasAsignadasIds } = params;
  if (rol === 'tecnico') {
    if (!rutasAsignadasIds.has(servicio.rutaId)) return [];
    return TRANSICIONES_TECNICO[servicio.estado] ?? [];
  }
  return TRANSICIONES_VALIDAS[servicio.estado] ?? [];
}

/**
 * Valida y aplica una transición de estado sobre un Servicio.
 * Para el rol 'tecnico':
 *  - programado -> en_campo: exige que fechaRealInicio caiga dentro de [fechaInicio, fechaFin]
 *    de una Asignacion de su cuadrilla en esa ruta (sin excepción por coordinador).
 *  - en_campo -> procesando: exige fechaRealFin >= fechaRealInicio y al menos 1 entrada en bitacoras del servicio.
 */
export function validarTransicionServicio<T extends ServicioTransicionable>(params: {
  rol: RolEmpresa;
  servicio: T;
  nuevoEstado: EstadoServicio;
  rutasAsignadasIds: Set<string>;
  asignaciones?: Asignacion[];
  cuadrillasUsuarioIds?: Set<string>;
  bitacoras?: BitacoraEntrada[];
  payload?: PayloadTransicionServicio;
  ahoraIso?: string;
}): ResultadoValidacionTransicion<T> {
  const {
    rol,
    servicio,
    nuevoEstado,
    rutasAsignadasIds,
    asignaciones = [],
    cuadrillasUsuarioIds,
    bitacoras = [],
    payload = {},
    ahoraIso = new Date().toISOString(),
  } = params;

  if (servicio.estado === nuevoEstado) {
    return { valido: false, error: 'El servicio ya se encuentra en ese estado.' };
  }

  const permitidos = obtenerEstadosSiguientesPermitidos({ rol, servicio, rutasAsignadasIds });
  if (!permitidos.includes(nuevoEstado)) {
    return {
      valido: false,
      error:
        rol === 'tecnico'
          ? 'Tu perfil técnico solo puede iniciar campo o cerrar a procesando en rutas asignadas.'
          : `Transición no permitida de "${ETIQUETA_ESTADO[servicio.estado]}" a "${ETIQUETA_ESTADO[nuevoEstado]}".`,
    };
  }

  const next: T = {
    ...servicio,
    estado: nuevoEstado,
    version: servicio.version + 1,
    updatedAt: ahoraIso,
    syncStatus: 'pending',
  };

  if (nuevoEstado === 'en_campo') {
    const fechaInicio = payload.fechaRealInicio?.trim() || ahoraIso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)) {
      return { valido: false, error: 'La fecha real de inicio debe tener formato YYYY-MM-DD.' };
    }

    if (rol === 'tecnico') {
      const asignacionesRuta = asignaciones.filter((a) => {
        if (a.rutaId !== servicio.rutaId) return false;
        if (cuadrillasUsuarioIds) {
          return cuadrillasUsuarioIds.has(a.cuadrillaId);
        }
        return true;
      });

      const dentroDeRango = asignacionesRuta.some(
        (a) => fechaInicio >= a.fechaInicio && fechaInicio <= a.fechaFin
      );

      if (!dentroDeRango) {
        const rangosDisponibles = asignacionesRuta
          .map((a) => `${a.fechaInicio} al ${a.fechaFin}`)
          .join(', ');
        return {
          valido: false,
          error:
            asignacionesRuta.length === 0
              ? 'No puedes iniciar campo: tu cuadrilla no tiene una asignación registrada en esta ruta.'
              : `No puedes iniciar campo el ${fechaInicio}: la fecha está fuera del rango asignado a tu cuadrilla (${rangosDisponibles}).`,
        };
      }
    }

    next.fechaRealInicio = fechaInicio;
  }

  if (nuevoEstado === 'procesando') {
    const fechaFin = payload.fechaRealFin?.trim() || ahoraIso.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFin)) {
      return { valido: false, error: 'La fecha real de cierre debe tener formato YYYY-MM-DD.' };
    }
    if (next.fechaRealInicio && fechaFin < next.fechaRealInicio) {
      return {
        valido: false,
        error: 'La fecha real de fin no puede ser anterior a la fecha real de inicio.',
      };
    }

    if (rol === 'tecnico') {
      const tieneBitacora = bitacoras.some((b) => b.servicioId === servicio.id);
      if (!tieneBitacora) {
        return {
          valido: false,
          error:
            'No puedes cerrar el servicio a Procesando sin registrar al menos una entrada en la bitácora de campo.',
        };
      }
    }

    next.fechaRealFin = fechaFin;
  }

  if (nuevoEstado === 'cobrado') {
    const monto = Number(payload.montoCobradoRD);
    const fechaPago = payload.fechaPago?.trim() || '';
    if (!Number.isFinite(monto) || monto <= 0) {
      return {
        valido: false,
        error: 'Para marcar como cobrado debes registrar montoCobradoRD mayor que 0.',
      };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
      return {
        valido: false,
        error: 'Para marcar como cobrado debes registrar una fechaPago válida (YYYY-MM-DD).',
      };
    }
    if ('cotizacionRD' in next || rol !== 'tecnico') {
      (next as Servicio).montoCobradoRD = Number(monto.toFixed(2));
      (next as Servicio).fechaPago = fechaPago;
    }
  }

  return { valido: true, servicioActualizado: next };
}

export function calcularEstadoProyecto(
  serviciosProyecto: Array<Pick<Servicio, 'estado'>>,
  estadoFallback: EstadoServicio = 'cotizado'
): EstadoServicio {
  if (serviciosProyecto.length === 0) return estadoFallback;
  const orden: Record<EstadoServicio, number> = {
    cotizado: 0,
    aprobado: 1,
    programado: 2,
    en_campo: 3,
    procesando: 4,
    entregado: 5,
    cobrado: 6,
  };
  if (serviciosProyecto.every((s) => s.estado === 'cobrado')) {
    return 'cobrado';
  }
  let maxEstado: EstadoServicio = serviciosProyecto[0].estado;
  for (const srv of serviciosProyecto) {
    if (orden[srv.estado] > orden[maxEstado]) {
      maxEstado = srv.estado;
    }
  }
  return maxEstado;
}
