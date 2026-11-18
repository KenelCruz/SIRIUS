import type { EstadoServicio, RolEmpresa, Servicio } from '../types/domain';

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

export interface ResultadoValidacionTransicion {
  valido: boolean;
  error?: string;
  servicioActualizado?: Servicio;
}

export function obtenerEstadosSiguientesPermitidos(params: {
  rol: RolEmpresa;
  servicio: Servicio;
  rutasAsignadasIds: Set<string>;
}): EstadoServicio[] {
  const { rol, servicio, rutasAsignadasIds } = params;
  if (rol === 'tecnico') {
    if (!rutasAsignadasIds.has(servicio.rutaId)) return [];
    return TRANSICIONES_TECNICO[servicio.estado] ?? [];
  }
  return TRANSICIONES_VALIDAS[servicio.estado] ?? [];
}

export function validarTransicionServicio(params: {
  rol: RolEmpresa;
  servicio: Servicio;
  nuevoEstado: EstadoServicio;
  rutasAsignadasIds: Set<string>;
  payload?: PayloadTransicionServicio;
  ahoraIso?: string;
}): ResultadoValidacionTransicion {
  const {
    rol,
    servicio,
    nuevoEstado,
    rutasAsignadasIds,
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

  const next: Servicio = {
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
    next.montoCobradoRD = Number(monto.toFixed(2));
    next.fechaPago = fechaPago;
  }

  return { valido: true, servicioActualizado: next };
}

export function calcularEstadoProyecto(
  serviciosProyecto: Servicio[],
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
