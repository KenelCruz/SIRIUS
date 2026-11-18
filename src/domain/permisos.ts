import type {
  Asignacion,
  Cuadrilla,
  Personal,
  RolEmpresa,
  Ruta,
  Servicio,
  Viatico,
} from '../types/domain';

export function puedeGestionarEmpresa(rol: RolEmpresa): boolean {
  return rol === 'admin';
}

export function puedeGestionarCatalogos(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeCrearOEditarOperacion(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeAsignarRutas(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeAprobarViatico(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeVerAuditoria(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeEliminarRegistro(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function obtenerRutasAsignadasAUsuario(params: {
  usuarioId: string;
  personalIdMembresia?: string;
  personal: Personal[];
  cuadrillas: Cuadrilla[];
  asignaciones: Asignacion[];
}): Set<string> {
  const { usuarioId, personalIdMembresia, personal, cuadrillas, asignaciones } = params;

  const personalIdsUsuario = new Set<string>();
  if (personalIdMembresia) {
    personalIdsUsuario.add(personalIdMembresia);
  }
  for (const p of personal) {
    if (p.usuarioId === usuarioId) {
      personalIdsUsuario.add(p.id);
    }
  }

  if (personalIdsUsuario.size === 0) {
    return new Set<string>();
  }

  const cuadrillasUsuario = new Set<string>();
  for (const c of cuadrillas) {
    if (personalIdsUsuario.has(c.jefeId) || c.miembroIds.some((id) => personalIdsUsuario.has(id))) {
      cuadrillasUsuario.add(c.id);
    }
  }

  const rutasIds = new Set<string>();
  for (const a of asignaciones) {
    if (cuadrillasUsuario.has(a.cuadrillaId)) {
      rutasIds.add(a.rutaId);
    }
  }
  return rutasIds;
}

export function filtrarRutasParaUsuario(
  rol: RolEmpresa,
  rutas: Ruta[],
  rutasAsignadasIds: Set<string>
): Ruta[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return rutas;
  }
  return rutas.filter((r) => rutasAsignadasIds.has(r.id));
}

export function filtrarServiciosParaUsuario(
  rol: RolEmpresa,
  servicios: Servicio[],
  rutasAsignadasIds: Set<string>
): Servicio[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return servicios;
  }
  return servicios.filter((s) => rutasAsignadasIds.has(s.rutaId));
}

export function filtrarViaticosParaUsuario(
  rol: RolEmpresa,
  viaticos: Viatico[],
  usuarioId: string
): Viatico[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return viaticos;
  }
  return viaticos.filter((v) => v.creadoPorUsuarioId === usuarioId);
}

export function puedeRegistrarBitacoraEnServicio(params: {
  rol: RolEmpresa;
  servicio: Servicio;
  rutasAsignadasIds: Set<string>;
}): boolean {
  const { rol, servicio, rutasAsignadasIds } = params;
  if (rol === 'admin' || rol === 'coordinador') return true;
  return rutasAsignadasIds.has(servicio.rutaId);
}
