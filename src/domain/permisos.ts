import type {
  Asignacion,
  BitacoraEntrada,
  CategoriaViatico,
  Cliente,
  Cuadrilla,
  EmpresaTecnico,
  EquipoGNSS,
  EstadoEmpresaSnapshot,
  Mision,
  MisionTecnico,
  Personal,
  ProyeccionSnapshotPorRol,
  Proyecto,
  ProyectoTecnico,
  RolEmpresa,
  Ruta,
  RutaTecnico,
  Servicio,
  ServicioTecnico,
  SnapshotTecnico,
  TopeViaticoUsuarioResumen,
  Vehiculo,
  VehiculoTecnico,
  Viatico,
} from '../types/domain';
import {
  asegurarConfiguracionEmpresa,
  obtenerReglasViaticosVigentes,
  obtenerTopesViaticoVigentes,
} from './configuracion';

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

export function puedeGestionarPresupuesto(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function obtenerPersonalIdsUsuario(params: {
  usuarioId: string;
  personalIdMembresia?: string;
  personal: Personal[];
}): Set<string> {
  const { usuarioId, personalIdMembresia, personal } = params;
  const ids = new Set<string>();
  if (personalIdMembresia) {
    ids.add(personalIdMembresia);
  }
  for (const p of personal) {
    if (p.usuarioId === usuarioId) {
      ids.add(p.id);
    }
  }
  return ids;
}

export function obtenerCuadrillasDeUsuario(params: {
  personalIdsUsuario: Set<string>;
  cuadrillas: Cuadrilla[];
}): Cuadrilla[] {
  const { personalIdsUsuario, cuadrillas } = params;
  if (personalIdsUsuario.size === 0) return [];
  return cuadrillas.filter(
    (c) =>
      personalIdsUsuario.has(c.jefeId) ||
      c.miembroIds.some((id) => personalIdsUsuario.has(id))
  );
}

export function obtenerRutasAsignadasAUsuario(params: {
  usuarioId: string;
  personalIdMembresia?: string;
  personal: Personal[];
  cuadrillas: Cuadrilla[];
  asignaciones: Asignacion[];
}): Set<string> {
  const { usuarioId, personalIdMembresia, personal, cuadrillas, asignaciones } = params;

  const personalIdsUsuario = obtenerPersonalIdsUsuario({
    usuarioId,
    personalIdMembresia,
    personal,
  });
  if (personalIdsUsuario.size === 0) {
    return new Set<string>();
  }

  const cuadrillasUsuarioIds = new Set(
    obtenerCuadrillasDeUsuario({ personalIdsUsuario, cuadrillas }).map((c) => c.id)
  );

  const rutasIds = new Set<string>();
  for (const a of asignaciones) {
    if (cuadrillasUsuarioIds.has(a.cuadrillaId)) {
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

export function filtrarAsignacionesParaUsuario(
  rol: RolEmpresa,
  asignaciones: Asignacion[],
  cuadrillasUsuarioIds: Set<string>
): Asignacion[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return asignaciones;
  }
  return asignaciones.filter((a) => cuadrillasUsuarioIds.has(a.cuadrillaId));
}

export function filtrarCuadrillasParaUsuario(
  rol: RolEmpresa,
  cuadrillas: Cuadrilla[],
  cuadrillasUsuarioIds: Set<string>
): Cuadrilla[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return cuadrillas;
  }
  return cuadrillas.filter((c) => cuadrillasUsuarioIds.has(c.id));
}

export function filtrarPersonalParaUsuario(
  rol: RolEmpresa,
  personal: Personal[],
  cuadrillasUsuario: Cuadrilla[],
  personalIdsUsuario: Set<string>
): Personal[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return personal;
  }
  const visibles = new Set<string>(personalIdsUsuario);
  for (const c of cuadrillasUsuario) {
    visibles.add(c.jefeId);
    for (const id of c.miembroIds) {
      visibles.add(id);
    }
  }
  return personal.filter((p) => visibles.has(p.id));
}

export function filtrarBitacorasParaUsuario(
  rol: RolEmpresa,
  bitacoras: BitacoraEntrada[],
  rutasAsignadasIds: Set<string>
): BitacoraEntrada[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return bitacoras;
  }
  return bitacoras.filter((b) => rutasAsignadasIds.has(b.rutaId));
}

export function filtrarClientesParaUsuario(
  rol: RolEmpresa,
  clientes: Cliente[],
  proyectosVisibles: Array<Pick<Proyecto, 'clienteId'>>
): Cliente[] {
  if (rol === 'admin' || rol === 'coordinador') {
    return clientes;
  }
  const clienteIds = new Set(proyectosVisibles.map((p) => p.clienteId));
  return clientes.filter((c) => clienteIds.has(c.id));
}

export function puedeRegistrarBitacoraEnServicio(params: {
  rol: RolEmpresa;
  servicio: Pick<Servicio, 'rutaId'>;
  rutasAsignadasIds: Set<string>;
}): boolean {
  const { rol, servicio, rutasAsignadasIds } = params;
  if (rol === 'admin' || rol === 'coordinador') return true;
  return rutasAsignadasIds.has(servicio.rutaId);
}

export function puedeEditarViatico(
  rol: RolEmpresa,
  viatico: Viatico,
  usuarioId: string
): boolean {
  if (viatico.estadoAprobacion === 'aprobado' || viatico.estadoAprobacion === 'rechazado') {
    return false;
  }
  if (rol === 'tecnico') {
    return viatico.creadoPorUsuarioId === usuarioId;
  }
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeEliminarViatico(
  rol: RolEmpresa,
  viatico: Viatico,
  usuarioId: string
): boolean {
  if (rol === 'admin' || rol === 'coordinador') return true;
  return (
    viatico.creadoPorUsuarioId === usuarioId &&
    viatico.estadoAprobacion === 'pendiente'
  );
}

function sanitizarEmpresaParaTecnico(empresa: EstadoEmpresaSnapshot['empresa']): EmpresaTecnico {
  return {
    id: empresa.id,
    nombre: empresa.nombre,
    rnc: empresa.rnc,
    telefono: empresa.telefono,
    direccionBase: empresa.direccionBase,
    baseLat: empresa.baseLat,
    baseLon: empresa.baseLon,
    zonaHoraria: empresa.zonaHoraria || 'America/Santo_Domingo',
    moneda: empresa.moneda || 'RD$',
  };
}

function sanitizarProyectoParaTecnico(proyecto: Proyecto): ProyectoTecnico {
  const { presupuestoViaticosRD: _p, valorContratoRD: _v, ...rest } = proyecto;
  return rest;
}

function sanitizarServicioParaTecnico(servicio: Servicio): ServicioTecnico {
  const {
    cotizacionRD: _c,
    montoCobradoRD: _m,
    fechaPago: _f,
    ...rest
  } = servicio;
  return rest;
}

function sanitizarVehiculoParaTecnico(vehiculo: Vehiculo): VehiculoTecnico {
  return {
    id: vehiculo.id,
    empresaId: vehiculo.empresaId,
    etiqueta: vehiculo.etiqueta,
    placa: vehiculo.placa,
    estado: vehiculo.estado,
  };
}

function sanitizarMisionParaTecnico(mision: Mision): MisionTecnico {
  return {
    id: mision.id,
    empresaId: mision.empresaId,
    nombre: mision.nombre,
    zona: mision.zona,
    provincia: mision.provincia,
    fechaInicio: mision.fechaInicio,
    fechaFin: mision.fechaFin,
    rutaIds: mision.rutaIds,
  };
}

function sanitizarRutaParaTecnico(ruta: Ruta): RutaTecnico {
  if (!ruta.routeSummary) {
    const { routeSummary: _rs, ...rest } = ruta;
    return rest;
  }
  const { tollsRD: _t, fuelRD: _f, ...summarySanitizado } = ruta.routeSummary;
  return {
    ...ruta,
    routeSummary: summarySanitizado,
  };
}

/**
 * Proyecta el snapshot completo según el rol del usuario autenticado.
 * Para 'tecnico', devuelve SnapshotTecnico estrictamente filtrado y sin datos financieros,
 * usuarios, membresías, auditoría ni recursos de otras cuadrillas.
 */
export function proyectarSnapshotParaRol(params: {
  snapshot: EstadoEmpresaSnapshot;
  rol: RolEmpresa;
  usuarioId: string;
  personalIdMembresia?: string;
}): ProyeccionSnapshotPorRol {
  const { snapshot, rol, usuarioId, personalIdMembresia } = params;

  if (rol === 'admin' || rol === 'coordinador') {
    return {
      rol,
      snapshot,
    };
  }

  const personalIdsUsuario = obtenerPersonalIdsUsuario({
    usuarioId,
    personalIdMembresia,
    personal: snapshot.personal,
  });
  const cuadrillasUsuario = obtenerCuadrillasDeUsuario({
    personalIdsUsuario,
    cuadrillas: snapshot.cuadrillas,
  });
  const cuadrillasUsuarioIds = new Set(cuadrillasUsuario.map((c) => c.id));

  const asignacionesTecnico = filtrarAsignacionesParaUsuario(
    'tecnico',
    snapshot.asignaciones,
    cuadrillasUsuarioIds
  );

  const rutasAsignadasIds = new Set(asignacionesTecnico.map((a) => a.rutaId));
  const rutasTecnico = filtrarRutasParaUsuario('tecnico', snapshot.rutas, rutasAsignadasIds).map(
    sanitizarRutaParaTecnico
  );

  const proyectoIdsVisibles = new Set(rutasTecnico.map((r) => r.proyectoId));
  const proyectosTecnico = snapshot.proyectos
    .filter((p) => proyectoIdsVisibles.has(p.id))
    .map(sanitizarProyectoParaTecnico);

  const clientesTecnico = filtrarClientesParaUsuario(
    'tecnico',
    snapshot.clientes,
    proyectosTecnico
  );

  const serviciosTecnico = filtrarServiciosParaUsuario(
    'tecnico',
    snapshot.servicios,
    rutasAsignadasIds
  ).map(sanitizarServicioParaTecnico);

  const bitacorasTecnico = filtrarBitacorasParaUsuario(
    'tecnico',
    snapshot.bitacoras,
    rutasAsignadasIds
  );

  const personalTecnico = filtrarPersonalParaUsuario(
    'tecnico',
    snapshot.personal,
    cuadrillasUsuario,
    personalIdsUsuario
  );

  const vehiculosAsignadosIds = new Set(asignacionesTecnico.flatMap((a) => a.vehiculoIds));
  const vehiculosTecnico = snapshot.vehiculos
    .filter((v) => vehiculosAsignadosIds.has(v.id))
    .map(sanitizarVehiculoParaTecnico);

  const equiposAsignadosIds = new Set(asignacionesTecnico.flatMap((a) => a.equipoIds));
  const equiposTecnico = snapshot.equipos.filter((e) => equiposAsignadosIds.has(e.id));

  const viaticosTecnico = filtrarViaticosParaUsuario('tecnico', snapshot.viaticos, usuarioId);
  const configEmpresa = asegurarConfiguracionEmpresa(snapshot.empresa.id, snapshot.configuracion);
  const reglasVigentes = obtenerReglasViaticosVigentes(configEmpresa);

  const personalUsuarioId =
    personalIdMembresia ?? snapshot.personal.find((p) => p.usuarioId === usuarioId)?.id;
  const personaUsuario = personalUsuarioId
    ? snapshot.personal.find((p) => p.id === personalUsuarioId)
    : undefined;
  const cargoUsuario = personaUsuario?.cargo;

  const topesUsuario: Partial<Record<CategoriaViatico, TopeViaticoUsuarioResumen>> | undefined =
    cargoUsuario
      ? obtenerTopesViaticoVigentes(configEmpresa)
          .filter((t) => t.cargoCodigo === cargoUsuario)
          .reduce<Partial<Record<CategoriaViatico, TopeViaticoUsuarioResumen>>>((acc, t) => {
            acc[t.categoria] = {
              montoMaximoPorMisionRD: t.montoMaximoPorMisionRD,
              vigenciaDesde: t.vigenciaDesde,
              cargoCodigo: t.cargoCodigo,
            };
            return acc;
          }, {})
      : undefined;

  const misionesTecnico: MisionTecnico[] = (snapshot.misiones ?? [])
    .filter((m) => m.rutaIds.some((rId) => rutasAsignadasIds.has(rId)))
    .map(sanitizarMisionParaTecnico);

  const snapshotTecnico: SnapshotTecnico = {
    empresa: sanitizarEmpresaParaTecnico(snapshot.empresa),
    personal: personalTecnico,
    cargos: configEmpresa.cargos.filter((c) => c.activo),
    vehiculos: vehiculosTecnico,
    equipos: equiposTecnico,
    cuadrillas: cuadrillasUsuario,
    clientes: clientesTecnico,
    proyectos: proyectosTecnico,
    rutas: rutasTecnico,
    servicios: serviciosTecnico,
    bitacoras: bitacorasTecnico,
    asignaciones: asignacionesTecnico,
    viaticos: viaticosTecnico,
    misiones: misionesTecnico,
    personalIdUsuario: personalUsuarioId,
    reglasCapturaViaticos: {
      version: reglasVigentes.version,
      vigenciaDesde: reglasVigentes.vigenciaDesde,
      gpsRuta: reglasVigentes.gpsRuta,
      presetsRapidos: reglasVigentes.presetsRapidos,
      categoriasViatico: configEmpresa.categoriasViatico,
      topesUsuario,
    },
    lastSyncedAt: snapshot.lastSyncedAt,
  };

  return {
    rol: 'tecnico',
    snapshot: snapshotTecnico,
  };
}
