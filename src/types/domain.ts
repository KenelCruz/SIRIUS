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

export type CargoBasePersonal = 'tecnico' | 'ingeniero' | 'jefe_brigada' | 'chofer';

export type CargoPersonal = CargoBasePersonal | (string & {});

export type ConceptoDistanciaGps = 'ida_vuelta' | 'solo_ida';

export type SeccionConfiguracion =
  | 'empresa'
  | 'usuarios'
  | 'cargos'
  | 'flota'
  | 'servicios'
  | 'viaticos_reglas'
  | 'viaticos_categorias'
  | 'ensayos'
  | 'ayuda';

export interface CargoConfig {
  codigo: string;
  etiqueta: string;
  esBase: boolean;
  activo: boolean;
}

export interface TarifaCombustibleVersion {
  version: number;
  vigenciaDesde: string;
  precioGalonRD: number;
}

export interface TipoCombustibleConfig {
  id: string;
  nombre: string;
  activo: boolean;
  versiones: TarifaCombustibleVersion[];
}

export interface TarifaServicioVersion {
  version: number;
  vigenciaDesde: string;
  precioBaseRD: number;
  recargoCorredorPorKmRD: number;
  recargoAreaPorHaExtraRD: number;
  umbralAreaBaseM2: number;
}

export interface ServicioCatalogoConfig {
  codigo: string;
  nombre: string;
  subtitulo: string;
  activo: boolean;
  versiones: TarifaServicioVersion[];
}

export interface TerrenoFactorVersion {
  version: number;
  vigenciaDesde: string;
  Llano: number;
  Ondulado: number;
  Montañoso: number;
}

export interface ReglaGpsRutaConfig {
  tarifaPorKmRD: number;
  minimoKm: number;
  conceptoDistancia: ConceptoDistanciaGps;
}

export interface PeajesCorredorConfig {
  urbanoExpresoRD: number;
  nacionalBaseRD: number;
  norteExpresoRD: number;
  suroesteExpresoRD: number;
  otroExpresoRD: number;
  esteEstacionesCerca: number;
  esteEstacionesLejos: number;
  estePorEstacionRD: number;
}

export interface PresetViaticoConfig {
  id: string;
  etiqueta: string;
  categoria: CategoriaViatico;
  comercio: string;
  montoRD: number;
  notas: string;
}

export interface ReglasViaticosVersion {
  version: number;
  vigenciaDesde: string;
  gpsRuta: ReglaGpsRutaConfig;
  dietaUrbanaRD: number;
  dietaCampoRD: number;
  umbralDistanciaUrbanaKm: number;
  hospedajePorNocheRD: number;
  umbralHospedajeKm: number;
  kmzPeajeUmbralKm: number;
  kmzPeajePorTramo50KmRD: number;
  kmzPersonasDietaDefault: number;
  peajesCorredor: PeajesCorredorConfig;
  presetsRapidos: PresetViaticoConfig[];
}

export interface ConfiguracionEmpresa {
  empresaId: string;
  cargos: CargoConfig[];
  combustibles: TipoCombustibleConfig[];
  servicios: ServicioCatalogoConfig[];
  factoresTerreno: TerrenoFactorVersion[];
  reglasViaticos: ReglasViaticosVersion[];
  categoriasViatico: CategoriaViatico[];
  versionGlobal: number;
}

export type OnboardingPasoId =
  | 'empresa'
  | 'personal_cargos'
  | 'flota'
  | 'servicios'
  | 'cliente_proyecto'
  | 'kmz_demo';

export type OnboardingEstadoPaso = 'pendiente' | 'completo' | 'saltado';

export type EstadoEfectivoPasoOnboarding =
  | 'pendiente'
  | 'completo'
  | 'completo_manual'
  | 'saltado';

export interface EstadoOnboardingEmpresa {
  empresaId: string;
  pasoActual: OnboardingPasoId;
  pasos: Record<OnboardingPasoId, OnboardingEstadoPaso>;
  completadoEn?: string;
  tarjetaOcultada: boolean;
  updatedAt: string;
}

export interface TutorialTarjeta {
  id: string;
  titulo: string;
  fraseCorta: string;
  pantallaClave:
    | 'admin_hoy'
    | 'admin_config'
    | 'admin_kmz'
    | 'admin_viaticos'
    | 'coord_proyectos'
    | 'coord_agenda'
    | 'coord_rutas'
    | 'coord_viaticos'
    | 'tec_hoy'
    | 'tec_detalle'
    | 'tec_bitacora'
    | 'tec_viaticos';
  destacados: string[];
}

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
  zonaHoraria: string;
  moneda: string;
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
  tipoCombustibleId?: string;
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
  configVersion?: number;
  precioGalonUsadoRD?: number;
  mantenimientoPorKmUsadoRD?: number;
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
  configVersion?: number;
  tarifaBaseUsadaRD?: number;
  recargosUsadosRD?: number;
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
  configVersion?: number;
  tarifaUsadaRD?: number;
  conceptoDistanciaUsado?: ConceptoDistanciaGps;
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
  configuracion?: ConfiguracionEmpresa;
  onboarding?: EstadoOnboardingEmpresa;
  lastSyncedAt?: string;
}

// Tipos proyectados estrictamente para el rol Técnico (el compilador impide exponer presupuestos, contratos, tarifas o personal ajeno)
export type EmpresaTecnico = Pick<
  Empresa,
  'id' | 'nombre' | 'rnc' | 'telefono' | 'direccionBase' | 'baseLat' | 'baseLon' | 'zonaHoraria' | 'moneda'
>;

export type ProyectoTecnico = Omit<Proyecto, 'presupuestoViaticosRD' | 'valorContratoRD'>;

export type ServicioTecnico = Omit<
  Servicio,
  'cotizacionRD' | 'montoCobradoRD' | 'fechaPago' | 'tarifaBaseUsadaRD' | 'recargosUsadosRD'
>;

export type VehiculoTecnico = Pick<
  Vehiculo,
  'id' | 'empresaId' | 'etiqueta' | 'placa' | 'estado'
>;

export type RouteSummaryTecnico = Omit<
  RouteSummary,
  'tollsRD' | 'fuelRD' | 'precioGalonUsadoRD' | 'mantenimientoPorKmUsadoRD'
>;

export type RutaTecnico = Omit<Ruta, 'routeSummary'> & {
  routeSummary?: RouteSummaryTecnico;
};

export interface ReglasCapturaViaticosTecnico {
  version: number;
  vigenciaDesde: string;
  gpsRuta: ReglaGpsRutaConfig;
  presetsRapidos: PresetViaticoConfig[];
  categoriasViatico: CategoriaViatico[];
}

export interface SnapshotTecnico {
  empresa: EmpresaTecnico;
  personal: Personal[];
  cargos: CargoConfig[];
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
  reglasCapturaViaticos: ReglasCapturaViaticosTecnico;
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
