import type { AreaUnit, GeoPoint, KmzFeature } from './geodesy';
export type { AreaUnit, GeoPoint, KmzFeature };

export type EstadoServicio =
  | 'cotizado'
  | 'aprobado'
  | 'programado'
  | 'en_campo'
  | 'procesando'
  | 'entregado'
  | 'cobrado';

export type RolEmpresa = 'admin' | 'coordinador' | 'tecnico';

export type CargoPersonal = 'tecnico' | 'ingeniero' | 'jefe_brigada' | 'chofer';

export type EstadoRecurso = 'disponible' | 'en_mantenimiento' | 'fuera_servicio';

export type CategoriaViatico =
  | 'Combustible'
  | 'Dieta'
  | 'Hospedaje'
  | 'Peaje'
  | 'Materiales'
  | 'Otro';

export type MetodoViatico = 'OCR Móvil' | 'GPS Ruta' | 'Dieta Automática' | 'Manual';

export type EstadoAprobacionViatico = 'pendiente' | 'aprobado' | 'rechazado';

export type EstadoSync = 'synced' | 'pending' | 'needs_ocr' | 'conflict';

export interface Empresa {
  id: string;
  nombre: string;
  rnc: string;
  telefono?: string;
  direccionBase: string;
  baseLat: number;
  baseLon: number;
  planMensualRD: number;
  estadoSuscripcion: 'activa' | 'prueba' | 'suspendida';
  fechaAlta: string;
}

export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  activo: boolean;
}

export interface MembresiaEmpresa {
  id: string;
  usuarioId: string;
  empresaId: string;
  rol: RolEmpresa;
  personalId?: string;
  activo: boolean;
}

export interface SesionActiva {
  usuario: Usuario;
  membresias: MembresiaEmpresa[];
  empresaActivaId: string;
  rolActivo: RolEmpresa;
  token: string;
  guardadaEn: string;
}

export interface Personal {
  id: string;
  empresaId: string;
  usuarioId?: string;
  nombre: string;
  cargo: CargoPersonal;
  telefono?: string;
  activo: boolean;
}

export interface Vehiculo {
  id: string;
  empresaId: string;
  etiqueta: string;
  placa: string;
  tipoCombustible: string;
  precioGalonRD: number;
  kmPorGal: number;
  mantenimientoPorKmRD: number;
  estado: EstadoRecurso;
}

export interface EquipoGNSS {
  id: string;
  empresaId: string;
  nombre: string;
  serial: string;
  estado: EstadoRecurso;
}

export interface Cuadrilla {
  id: string;
  empresaId: string;
  nombre: string;
  jefeId: string;
  miembroIds: string[];
  activa: boolean;
}

export interface Cliente {
  id: string;
  empresaId: string;
  nombre: string;
  rnc: string;
  contacto: string;
  telefono?: string;
  email?: string;
}

export interface Proyecto {
  id: string;
  empresaId: string;
  clienteId: string;
  nombre: string;
  codigoContrato: string;
  presupuestoViaticosRD: number;
  valorContratoRD: number;
  estado: EstadoServicio;
  fechaCreacion: string;
  notas?: string;
  version: number;
  updatedAt: string;
  syncStatus: EstadoSync;
}

export interface RouteSummary {
  routeName: string;
  distanceOneWayKm: number;
  durationMin: number;
  tollsRD: number;
  fuelRD: number;
  vehicleLabel: string;
}

export interface Ruta {
  id: string;
  empresaId: string;
  proyectoId: string;
  nombre: string;
  codigoParcela: string;
  ubicacion: string;
  provincia: string;
  fechaPrevista: string;
  kmzFileName: string;
  features: KmzFeature[];
  centroid: GeoPoint;
  totalAreaM2: number;
  totalPerimeterM: number;
  routeSummary?: RouteSummary;
  version: number;
  updatedAt: string;
  syncStatus: EstadoSync;
}

export interface Servicio {
  id: string;
  empresaId: string;
  rutaId: string;
  tipoServicioId: string;
  nombre: string;
  cotizacionRD: number;
  estado: EstadoServicio;
  fechaRealInicio?: string;
  fechaRealFin?: string;
  montoCobradoRD?: number;
  fechaPago?: string;
  notas?: string;
  version: number;
  updatedAt: string;
  syncStatus: EstadoSync;
}

export interface BitacoraEntrada {
  id: string;
  empresaId: string;
  servicioId: string;
  rutaId: string;
  autorUsuarioId: string;
  autorNombre: string;
  fechaAST: string;
  nota: string;
  fotos: string[];
  syncStatus: EstadoSync;
}

export interface OverrideConflicto {
  motivo: string;
  usuarioId: string;
  usuarioNombre: string;
  fecha: string;
}

export interface Asignacion {
  id: string;
  empresaId: string;
  rutaId: string;
  fechaInicio: string;
  fechaFin: string;
  cuadrillaId: string;
  vehiculoIds: string[];
  equipoIds: string[];
  overrideConflicto?: OverrideConflicto;
  version: number;
  updatedAt: string;
  syncStatus: EstadoSync;
}

export interface RepartoProyecto {
  proyectoId: string | 'sin_asignar';
  montoRD: number;
}

export interface Viatico {
  id: string;
  empresaId: string;
  creadoPorUsuarioId: string;
  creadoPorNombre: string;
  rutaId?: string;
  fechaIso: string;
  timestampAST: string;
  categoria: CategoriaViatico;
  comercio: string;
  montoRD: number;
  itbisRD: number;
  ncf?: string;
  metodo: MetodoViatico;
  gpsCoords?: {
    lat: number;
    lon: number;
    easting: number;
    northing: number;
  };
  distanceKm?: number;
  receiptThumbnail?: string;
  pendingReceiptBase64?: string;
  pendingReceiptMime?: string;
  estadoAprobacion: EstadoAprobacionViatico;
  motivoRechazo?: string;
  motivoDecision?: string;
  aprobadoPorUsuarioId?: string;
  aprobadoEn?: string;
  repartos: RepartoProyecto[];
  notas?: string;
  version: number;
  updatedAt: string;
  syncStatus: EstadoSync;
}

export type TipoConflicto =
  | 'personal'
  | 'cuadrilla'
  | 'cuadrilla_inactiva'
  | 'vehiculo'
  | 'vehiculo_mantenimiento'
  | 'equipo'
  | 'equipo_mantenimiento'
  | 'spatial';

export type SeveridadConflicto = 'advertencia' | 'bloqueante';

export interface ConflictDetail {
  type: TipoConflicto;
  severidad: SeveridadConflicto;
  permiteOverride: boolean;
  message: string;
  conflictingEntityId?: string;
  conflictingRutaCode: string;
  conflictingRutaTitle: string;
  overlapDates?: string[];
  overlapPct?: number;
}

export interface HistorialEvento {
  id: string;
  empresaId: string;
  entidadTipo: 'proyecto' | 'ruta' | 'servicio' | 'asignacion' | 'viatico' | 'empresa' | 'catalogo';
  entidadId: string;
  accion: string;
  detalle: string;
  valorAnterior?: string;
  valorNuevo?: string;
  usuarioId: string;
  usuarioNombre: string;
  fechaAST: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface EstadoEmpresaSnapshot {
  empresa: Empresa;
  membresias: MembresiaEmpresa[];
  usuarios: Usuario[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  cuadrillas: Cuadrilla[];
  clientes: Cliente[];
  proyectos: Proyecto[];
  rutas: Ruta[];
  servicios: Servicio[];
  bitacoras: BitacoraEntrada[];
  asignaciones: Asignacion[];
  viaticos: Viatico[];
  historial: HistorialEvento[];
  lastSyncedAt?: string;
}

// Tipos proyectados estrictamente para el rol Técnico (el compilador impide exponer presupuestos, contratos, tarifas o personal ajeno)
export type EmpresaTecnico = Pick<
  Empresa,
  'id' | 'nombre' | 'rnc' | 'telefono' | 'direccionBase' | 'baseLat' | 'baseLon'
>;

export type ProyectoTecnico = Omit<Proyecto, 'presupuestoViaticosRD' | 'valorContratoRD'>;

export type ServicioTecnico = Omit<
  Servicio,
  'cotizacionRD' | 'montoCobradoRD' | 'fechaPago'
>;

export type VehiculoTecnico = Pick<
  Vehiculo,
  'id' | 'empresaId' | 'etiqueta' | 'placa' | 'estado'
>;

export type RouteSummaryTecnico = Omit<RouteSummary, 'tollsRD' | 'fuelRD'>;

export type RutaTecnico = Omit<Ruta, 'routeSummary'> & {
  routeSummary?: RouteSummaryTecnico;
};

export interface SnapshotTecnico {
  empresa: EmpresaTecnico;
  personal: Personal[];
  vehiculos: VehiculoTecnico[];
  equipos: EquipoGNSS[];
  cuadrillas: Cuadrilla[];
  clientes: Cliente[];
  proyectos: ProyectoTecnico[];
  rutas: RutaTecnico[];
  servicios: ServicioTecnico[];
  bitacoras: BitacoraEntrada[];
  asignaciones: Asignacion[];
  viaticos: Viatico[];
  lastSyncedAt?: string;
}

export type ProyeccionSnapshotPorRol =
  | {
      rol: 'admin' | 'coordinador';
      snapshot: EstadoEmpresaSnapshot;
    }
  | {
      rol: 'tecnico';
      snapshot: SnapshotTecnico;
    };

export interface ConteoPendientesPorTipo {
  servicios: number;
  bitacoras: number;
  viaticos: number;
  proyectos: number;
  rutas: number;
  asignaciones: number;
  total: number;
}

export interface AvisoSobrescrituraLWW {
  entidadTipo: 'proyecto' | 'ruta' | 'servicio' | 'asignacion' | 'viatico';
  entidadId: string;
  descripcion: string;
  fecha: string;
}
