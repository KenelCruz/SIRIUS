import {
  asegurarConfiguracionEmpresa,
  asegurarEstadoOnboarding,
  crearConfiguracionInicialEmpresa,
  crearEstadoOnboardingInicial,
  detectarConflictosAsignacion,
  detectarConflictosRenta,
  ERROR_TECNICO_SIN_PERSONAL,
  escalarRepartosAMontoEmpresa,
  evaluarTopeViaticoEnMision,
  obtenerCuadrillasDeUsuario,
  obtenerFechaHoyAST,
  obtenerPersonalIdsUsuario,
  obtenerRendimientoConfigVigente,
  obtenerRutasAsignadasAUsuario,
  proyectarSnapshotParaRol,
  puedeAprobarViatico,
  puedeCrearOEditarOperacion,
  puedeEditarConfiguracion,
  puedeGestionarCatalogos,
  puedeGestionarEmpresa,
  puedeRegistrarBitacoraEnServicio,
  reconciliarColeccionLWWConReporte,
  resolverEtiquetaCargo,
  resolverPersonalYCargoUsuario,
  siguienteVersion,
  sumarDiasIso,
  validarCargoConfig,
  validarDecisionViatico,
  validarEdicionRenta,
  validarEdicionViatico,
  validarEliminacionViatico,
  validarEliminacionViaticoTecnico,
  validarEliminarCargo,
  validarEmpresaConfig,
  validarNuevaVigenciaCombustible,
  validarNuevaVigenciaReglasViaticos,
  validarNuevaVigenciaRendimientoFlota,
  validarNuevaVigenciaServicio,
  validarNuevaVigenciaTerreno,
  validarNuevaVigenciaTopeViatico,
  validarNuevoServicioCatalogo,
  validarNuevoTipoCombustible,
  validarRangoFechas,
  validarRedistribucionViatico,
  validarRenta,
  validarRepartoViatico,
  validarResolucionConflictos,
  validarTransicionServicio,
  validarVehiculoConfig,
} from '../domain';
import type { PayloadTransicionServicio } from '../domain/estados';
import type {
  Asignacion,
  AvisoSobrescrituraLWW,
  BitacoraEntrada,
  CargoConfig,
  CategoriaViatico,
  Cliente,
  ConfiguracionEmpresa,
  Cuadrilla,
  DecisionExcedenteViatico,
  Empresa,
  EquipoGNSS,
  EstadoAprobacionViatico,
  EstadoEmpresaSnapshot,
  EstadoOnboardingEmpresa,
  EstadoServicio,
  HistorialEvento,
  MembresiaEmpresa,
  Mision,
  Personal,
  ProyeccionSnapshotPorRol,
  Proyecto,
  ReglaRendimientoFlotaVersion,
  ReglasViaticosVersion,
  Renta,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Servicio,
  ServicioCatalogoConfig,
  SesionActiva,
  TarifaServicioVersion,
  TerrenoFactorVersion,
  Usuario,
  Vehiculo,
  Viatico,
} from '../types/domain';
import {
  computeCentroid,
  computePerimeterM,
  computePolygonAreaM2,
  formatSantoDomingoAST,
  latLonToUtm19N,
} from '../utils/geodesy';
import type { CuentaDemoInfo, RepositorioOperacion } from './RepositorioOperacion';

const DB_STORAGE_KEY = 'sirius_saas_db_v3';
const SESSION_STORAGE_KEY = 'geomatrix_saas_session_v2';
const TUTORIALES_STORAGE_KEY = 'sirius_tutoriales_vistos_v1';

function esModoDemoHabilitado(): boolean {
  const env = (import.meta as unknown as { env?: Record<string, unknown> }).env;
  if (!env) return false;
  return Boolean(env.DEV) || env.VITE_ENABLE_DEMO === 'true';
}

interface DatabaseLocal {
  empresas: Empresa[];
  usuarios: Array<Usuario & { passwordDemo: string }>;
  membresias: MembresiaEmpresa[];
  snapshotsPorEmpresa: Record<string, EstadoEmpresaSnapshot>;
}

function makeFeature(id: string, name: string, coords: [number, number, number][]) {
  const points = coords.map(([lon, lat, elev]) => latLonToUtm19N(lat, lon, elev));
  return {
    id,
    name,
    geometryType: 'Polygon' as const,
    points,
    areaM2: computePolygonAreaM2(points),
    perimeterM: computePerimeterM(points, true),
  };
}

function crearSeedDatabase(): DatabaseLocal {
  const hoy = obtenerFechaHoyAST();
  const ayer = sumarDiasIso(hoy, -1);
  const hace2Dias = sumarDiasIso(hoy, -2);
  const hace5Dias = sumarDiasIso(hoy, -5);
  const hace8Dias = sumarDiasIso(hoy, -8);
  const en1Dia = sumarDiasIso(hoy, 1);
  const en2Dias = sumarDiasIso(hoy, 2);
  const en3Dias = sumarDiasIso(hoy, 3);
  const en5Dias = sumarDiasIso(hoy, 5);
  const en6Dias = sumarDiasIso(hoy, 6);

  const empresas: Empresa[] = [
    {
      id: 'emp-aia',
      nombre: 'AIA Services',
      rnc: '1-31-84920-4',
      telefono: '809-555-0142',
      direccionBase: 'Av. 27 de Febrero #340, Santo Domingo',
      baseLat: 18.4861,
      baseLon: -69.9312,
      zonaHoraria: 'America/Santo_Domingo',
      moneda: 'RD$',
      planMensualRD: 14500,
      estadoSuscripcion: 'activa',
      fechaAlta: '2026-01-15',
    },
    {
      id: 'emp-caribe',
      nombre: 'Geodesia Caribe SRL',
      rnc: '1-32-11904-8',
      telefono: '809-555-0198',
      direccionBase: 'Av. Estrella Sadhalá #88, Santiago',
      baseLat: 19.4517,
      baseLon: -70.697,
      zonaHoraria: 'America/Santo_Domingo',
      moneda: 'RD$',
      planMensualRD: 9500,
      estadoSuscripcion: 'activa',
      fechaAlta: '2026-03-02',
    },
  ];

  const usuarios: Array<Usuario & { passwordDemo: string }> = [
    {
      id: 'usr-admin',
      email: 'admin@aiaservices.do',
      nombre: 'Ing. Roberto Almonte',
      activo: true,
      passwordDemo: 'demo123',
    },
    {
      id: 'usr-coord',
      email: 'coordinador@aiaservices.do',
      nombre: 'Lic. Patricia Vargas',
      activo: true,
      passwordDemo: 'demo123',
    },
    {
      id: 'usr-tec1',
      email: 'carlos@aiaservices.do',
      nombre: 'Ing. Carlos Méndez',
      activo: true,
      passwordDemo: 'demo123',
    },
    {
      id: 'usr-tec2',
      email: 'laura@aiaservices.do',
      nombre: 'Agrim. Laura Ramírez',
      activo: true,
      passwordDemo: 'demo123',
    },
  ];

  const membresias: MembresiaEmpresa[] = [
    { id: 'mem-1', usuarioId: 'usr-admin', empresaId: 'emp-aia', rol: 'admin', activo: true },
    { id: 'mem-2', usuarioId: 'usr-admin', empresaId: 'emp-caribe', rol: 'coordinador', activo: true },
    { id: 'mem-3', usuarioId: 'usr-coord', empresaId: 'emp-aia', rol: 'coordinador', activo: true },
    {
      id: 'mem-4',
      usuarioId: 'usr-tec1',
      empresaId: 'emp-aia',
      rol: 'tecnico',
      personalId: 'per-1',
      activo: true,
    },
    {
      id: 'mem-5',
      usuarioId: 'usr-tec2',
      empresaId: 'emp-aia',
      rol: 'tecnico',
      personalId: 'per-2',
      activo: true,
    },
  ];

  // Geometrías reales RD (UTM Zona 19N)
  const f1 = makeFeature('f1', 'Polígono Principal Hacienda Macorís', [
    [-69.2984, 18.4621, 14.2],
    [-69.2912, 18.4628, 15.1],
    [-69.2905, 18.4579, 13.8],
    [-69.2979, 18.4572, 13.2],
    [-69.2984, 18.4621, 14.2],
  ]);
  const f2 = makeFeature('f2', 'Deslinde Residencial Gurabo II', [
    [-70.6682, 19.4852, 198.4],
    [-70.6641, 19.4858, 204.2],
    [-70.6634, 19.4824, 195.0],
    [-70.6678, 19.4819, 192.1],
    [-70.6682, 19.4852, 198.4],
  ]);
  const f3 = makeFeature('f3', 'Finca Cacaotera Yamasá Lote B', [
    [-70.0294, 18.7745, 74.0],
    [-70.0228, 18.7751, 82.5],
    [-70.0219, 18.7694, 79.3],
    [-70.0289, 18.7689, 71.2],
    [-70.0294, 18.7745, 74.0],
  ]);
  const f4 = makeFeature('f4', 'Solar Industrial Parque Haina', [
    [-70.0365, 18.4214, 18.5],
    [-70.0332, 18.4217, 19.1],
    [-70.0329, 18.4192, 17.8],
    [-70.0362, 18.4189, 17.2],
    [-70.0365, 18.4214, 18.5],
  ]);

  const personalAia: Personal[] = [
    {
      id: 'per-1',
      empresaId: 'emp-aia',
      usuarioId: 'usr-tec1',
      nombre: 'Ing. Carlos Méndez',
      cargo: 'jefe_brigada',
      telefono: '809-555-2101',
      activo: true,
    },
    {
      id: 'per-2',
      empresaId: 'emp-aia',
      usuarioId: 'usr-tec2',
      nombre: 'Agrim. Laura Ramírez',
      cargo: 'jefe_brigada',
      telefono: '809-555-2102',
      activo: true,
    },
    {
      id: 'per-3',
      empresaId: 'emp-aia',
      nombre: 'Agrim. José Luis Peña',
      cargo: 'tecnico',
      telefono: '809-555-2103',
      activo: true,
    },
    {
      id: 'per-4',
      empresaId: 'emp-aia',
      nombre: 'Mateo Jiménez',
      cargo: 'chofer',
      telefono: '809-555-2104',
      activo: true,
    },
  ];

  const vehiculosAia: Vehiculo[] = [
    {
      id: 'veh-1',
      empresaId: 'emp-aia',
      etiqueta: 'Hilux 4x4 Doble Cabina',
      placa: 'L402819',
      tipoCombustibleId: 'diesel_optimo',
      tipoCombustible: 'Diésel Óptimo',
      precioGalonRD: 239.1,
      kmPorGal: 32,
      mantenimientoPorKmRD: 15,
      estado: 'disponible',
    },
    {
      id: 'veh-2',
      empresaId: 'emp-aia',
      etiqueta: 'Pickup Ranger 4x4',
      placa: 'L418390',
      tipoCombustibleId: 'diesel_optimo',
      tipoCombustible: 'Diésel Óptimo',
      precioGalonRD: 239.1,
      kmPorGal: 30,
      mantenimientoPorKmRD: 16,
      estado: 'disponible',
    },
    {
      id: 'veh-3',
      empresaId: 'emp-aia',
      etiqueta: 'SUV Brigada Urbana',
      placa: 'G551209',
      tipoCombustibleId: 'gasolina_regular',
      tipoCombustible: 'Gasolina Regular',
      precioGalonRD: 272.5,
      kmPorGal: 35,
      mantenimientoPorKmRD: 12,
      estado: 'en_mantenimiento',
    },
  ];

  const equiposAia: EquipoGNSS[] = [
    {
      id: 'eq-1',
      empresaId: 'emp-aia',
      nombre: 'Trimble R12i RTK',
      serial: 'TR-8842',
      estado: 'disponible',
    },
    {
      id: 'eq-2',
      empresaId: 'emp-aia',
      nombre: 'Leica GS18 T',
      serial: 'LC-3190',
      estado: 'disponible',
    },
    {
      id: 'eq-3',
      empresaId: 'emp-aia',
      nombre: 'Sokkia GRX3',
      serial: 'SK-1104',
      estado: 'disponible',
    },
  ];

  const cuadrillasAia: Cuadrilla[] = [
    {
      id: 'cua-1',
      empresaId: 'emp-aia',
      nombre: 'Brigada Este Alpha',
      jefeId: 'per-1',
      miembroIds: ['per-1', 'per-4'],
      activa: true,
    },
    {
      id: 'cua-2',
      empresaId: 'emp-aia',
      nombre: 'Brigada Cibao Sur',
      jefeId: 'per-2',
      miembroIds: ['per-2', 'per-3'],
      activa: true,
    },
  ];

  const clientesAia: Cliente[] = [
    {
      id: 'cli-1',
      empresaId: 'emp-aia',
      nombre: 'Consorcio Agroindustrial del Este',
      rnc: '1-01-74829-1',
      contacto: 'Ing. Miguel Henríquez',
      telefono: '809-555-3301',
    },
    {
      id: 'cli-2',
      empresaId: 'emp-aia',
      nombre: 'Inmobiliaria Cibao Central SRL',
      rnc: '1-30-98412-5',
      contacto: 'Arq. Sofía Durán',
      telefono: '809-555-3302',
    },
    {
      id: 'cli-3',
      empresaId: 'emp-aia',
      nombre: 'Logística Portuaria del Sur',
      rnc: '1-05-44102-9',
      contacto: 'Lic. Ernesto Mejía',
      telefono: '809-555-3303',
    },
  ];

  const proyectosAia: Proyecto[] = [
    {
      id: 'proy-1',
      empresaId: 'emp-aia',
      clienteId: 'cli-1',
      nombre: 'Saneamiento y Deslinde Hacienda Macorís',
      codigoContrato: 'AIA-2026-0891',
      presupuestoViaticosRD: 18500,
      valorContratoRD: 185000,
      estado: 'en_campo',
      fechaCreacion: hace8Dias,
      notas: 'Contrato marco zona este con entrega en Jurisdicción Inmobiliaria.',
      version: 1,
      updatedAt: `${ayer}T09:15:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'proy-2',
      empresaId: 'emp-aia',
      clienteId: 'cli-2',
      nombre: 'Subdivisión Residencial Gurabo II',
      codigoContrato: 'AIA-2026-0412',
      presupuestoViaticosRD: 24800,
      valorContratoRD: 240000,
      estado: 'programado',
      fechaCreacion: hace5Dias,
      notas: 'Incluye levantamiento planimétrico y altimétrico para drenaje pluvial.',
      version: 1,
      updatedAt: `${hace2Dias}T16:40:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'proy-3',
      empresaId: 'emp-aia',
      clienteId: 'cli-3',
      nombre: 'Actualización Parcelaria Parque Haina',
      codigoContrato: 'AIA-2026-0309',
      presupuestoViaticosRD: 8600,
      valorContratoRD: 115000,
      estado: 'entregado',
      fechaCreacion: hace8Dias,
      notas: 'Expediente depositado en Mensuras Catastrales.',
      version: 1,
      updatedAt: `${hace2Dias}T14:05:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const rutasAia: Ruta[] = [
    {
      id: 'ruta-1',
      empresaId: 'emp-aia',
      proyectoId: 'proy-1',
      nombre: 'Polígono Hacienda Macorís — Sector A',
      codigoParcela: 'DC-04-PARC-2026-0891',
      ubicacion: 'Autovía del Este Km 68, San Pedro de Macorís',
      provincia: 'San Pedro de Macorís',
      fechaPrevista: hoy,
      kmzFileName: 'Hacienda_Macoris_Poligono_A.kmz',
      features: [f1],
      centroid: computeCentroid(f1.points),
      totalAreaM2: f1.areaM2,
      totalPerimeterM: f1.perimeterM,
      routeSummary: {
        routeName: 'Expreso Las Américas · Autovía del Este',
        distanceOneWayKm: 72.4,
        durationMin: 68,
        tollsRD: 400,
        fuelRD: 1082,
        vehicleLabel: 'Hilux 4x4 Doble Cabina',
      },
      version: 1,
      updatedAt: `${ayer}T09:15:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'ruta-2',
      empresaId: 'emp-aia',
      proyectoId: 'proy-2',
      nombre: 'Lotes Gurabo II Norte',
      codigoParcela: 'DC-08-PARC-2026-0412',
      ubicacion: 'Carretera Turística Luperón, Gurabo',
      provincia: 'Santiago',
      fechaPrevista: en1Dia,
      kmzFileName: 'Gurabo_II_Lotes_19N.kmz',
      features: [f2],
      centroid: computeCentroid(f2.points),
      totalAreaM2: f2.areaM2,
      totalPerimeterM: f2.perimeterM,
      routeSummary: {
        routeName: 'Autopista Duarte Expresa',
        distanceOneWayKm: 158.0,
        durationMin: 135,
        tollsRD: 500,
        fuelRD: 2361,
        vehicleLabel: 'Pickup Ranger 4x4',
      },
      version: 1,
      updatedAt: `${hace2Dias}T16:40:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'ruta-3',
      empresaId: 'emp-aia',
      proyectoId: 'proy-1',
      nombre: 'Anexo Finca Cacaotera Yamasá',
      codigoParcela: 'DC-12-PARC-2026-1108',
      ubicacion: 'Tramo Yamasá · Monte Plata',
      provincia: 'Monte Plata',
      fechaPrevista: en5Dias,
      kmzFileName: 'Finca_Yamasa_LoteB.kmz',
      features: [f3],
      centroid: computeCentroid(f3.points),
      totalAreaM2: f3.areaM2,
      totalPerimeterM: f3.perimeterM,
      version: 1,
      updatedAt: `${hace2Dias}T11:22:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'ruta-4',
      empresaId: 'emp-aia',
      proyectoId: 'proy-3',
      nombre: 'Solar Industrial Zona Franca Haina',
      codigoParcela: 'DC-05-PARC-2026-0309',
      ubicacion: 'Zona Industrial de Haina',
      provincia: 'San Cristóbal',
      fechaPrevista: hace8Dias,
      kmzFileName: 'Parque_Haina_Zona_Franca.kmz',
      features: [f4],
      centroid: computeCentroid(f4.points),
      totalAreaM2: f4.areaM2,
      totalPerimeterM: f4.perimeterM,
      version: 1,
      updatedAt: `${hace2Dias}T14:05:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const serviciosAia: Servicio[] = [
    {
      id: 'srv-1',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      tipoServicioId: 'deslinde',
      nombre: 'Deslinde Catastral',
      cotizacionRD: 95000,
      estado: 'en_campo',
      fechaRealInicio: hoy,
      notas: 'Replanteo de 4 hitos de hormigón y verificación lindero oeste.',
      version: 2,
      updatedAt: `${hoy}T08:30:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'srv-2',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      tipoServicioId: 'rtk',
      nombre: 'Topografía GNSS RTK',
      cotizacionRD: 45000,
      estado: 'programado',
      notas: 'Densificación de vértices auxiliares.',
      version: 1,
      updatedAt: `${ayer}T10:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'srv-3',
      empresaId: 'emp-aia',
      rutaId: 'ruta-2',
      tipoServicioId: 'drone_lidar',
      nombre: 'Dron & LiDAR Fotogrametría',
      cotizacionRD: 125000,
      estado: 'programado',
      notas: 'Vuelo fotogramétrico con 5 puntos de control GCP.',
      version: 1,
      updatedAt: `${hace2Dias}T16:40:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'srv-4',
      empresaId: 'emp-aia',
      rutaId: 'ruta-3',
      tipoServicioId: 'rtk',
      nombre: 'Mensura Finca Cacaotera',
      cotizacionRD: 45000,
      estado: 'programado',
      notas: 'Programada para la próxima ventana semanal.',
      version: 1,
      updatedAt: `${hace2Dias}T12:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'srv-5',
      empresaId: 'emp-aia',
      rutaId: 'ruta-4',
      tipoServicioId: 'deslinde',
      nombre: 'Actualización Parcelaria Haina',
      cotizacionRD: 115000,
      estado: 'entregado',
      fechaRealInicio: hace8Dias,
      fechaRealFin: hace5Dias,
      notas: 'Listo para gestión de cobro.',
      version: 3,
      updatedAt: `${hace2Dias}T14:05:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const bitacorasAia: BitacoraEntrada[] = [
    {
      id: 'bit-1',
      empresaId: 'emp-aia',
      servicioId: 'srv-1',
      rutaId: 'ruta-1',
      autorUsuarioId: 'usr-tec1',
      autorNombre: 'Ing. Carlos Méndez',
      fechaAST: formatSantoDomingoAST(new Date()),
      nota: 'Base RTK instalada en PG-01 con solución fija (PDOP 1.4). Levantamiento lindero norte completado.',
      fotos: [],
      syncStatus: 'synced',
    },
  ];

  const asignacionesAia: Asignacion[] = [
    {
      id: 'asig-1',
      empresaId: 'emp-aia',
      rutaId: 'ruta-1',
      fechaInicio: hoy,
      fechaFin: en2Dias,
      cuadrillaId: 'cua-1',
      vehiculoIds: ['veh-1'],
      equipoIds: ['eq-1'],
      version: 1,
      updatedAt: `${ayer}T11:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'asig-2',
      empresaId: 'emp-aia',
      rutaId: 'ruta-2',
      fechaInicio: en1Dia,
      fechaFin: en3Dias,
      cuadrillaId: 'cua-2',
      vehiculoIds: ['veh-2'],
      equipoIds: ['eq-2'],
      version: 1,
      updatedAt: `${ayer}T11:15:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'asig-3',
      empresaId: 'emp-aia',
      rutaId: 'ruta-3',
      fechaInicio: en5Dias,
      fechaFin: en6Dias,
      cuadrillaId: 'cua-1',
      vehiculoIds: ['veh-1'],
      equipoIds: ['eq-1'],
      version: 1,
      updatedAt: `${ayer}T11:30:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const misionesAia: Mision[] = [
    {
      id: 'mis-1',
      empresaId: 'emp-aia',
      nombre: 'Misión Este — Punta Cana / La Romana',
      zona: 'Este Turístico',
      provincia: 'La Altagracia',
      fechaInicio: hoy,
      fechaFin: en6Dias,
      rutaIds: ['ruta-1', 'ruta-3'],
      notas: 'Deslinde turístico Bavaro y trazado vial en La Romana',
      version: 1,
      updatedAt: `${ayer}T10:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'mis-2',
      empresaId: 'emp-aia',
      nombre: 'Misión Cibao Central — Santiago',
      zona: 'Norte / Cibao',
      provincia: 'Santiago',
      fechaInicio: en1Dia,
      fechaFin: en3Dias,
      rutaIds: ['ruta-2'],
      notas: 'Levantamiento LiDAR y polígono agroindustrial en Tamboril',
      version: 1,
      updatedAt: `${ayer}T10:15:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'mis-3',
      empresaId: 'emp-aia',
      nombre: 'Misión Sur — San Cristóbal',
      zona: 'Sur Corto',
      provincia: 'San Cristóbal',
      fechaInicio: hace8Dias,
      fechaFin: hoy,
      rutaIds: ['ruta-4'],
      notas: 'Cierre de replanteo y entregas finales en Zona Franca Sur',
      version: 1,
      updatedAt: `${hace8Dias}T08:00:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const rentasAia: Renta[] = [
    {
      id: 'rent-1',
      empresaId: 'emp-aia',
      recursoTipo: 'equipo',
      recursoId: 'eq-3',
      recursoEtiqueta: 'Trimble R12i Rover Base',
      proveedor: 'TopGeo Rent SRL',
      misionId: 'mis-2',
      rutaId: 'ruta-2',
      fechaInicio: en1Dia,
      fechaFin: en3Dias,
      modalidadTarifa: 'por_dia',
      tarifaRD: 3500,
      cantidadEstimada: 3,
      incluyeItbis: true,
      itbisRD: 1890,
      costoTotalRD: 12390,
      estado: 'activa',
      notas: 'Renta auxiliar de base RTK para cobertura simultánea en Santiago',
      repartos: [{ proyectoId: 'proy-2', montoRD: 12390 }],
      configVersion: 1,
      umbralDistanciaKmUsado: 30,
      version: 1,
      updatedAt: `${ayer}T12:00:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const viaticosAia: Viatico[] = [
    {
      id: 'via-1',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      personalId: 'per-1',
      cargoUsado: 'jefe_brigada',
      misionId: 'mis-1',
      rutaId: 'ruta-1',
      vehiculoId: 'veh-1',
      galonesCargados: 18.8,
      fechaIso: hoy,
      timestampAST: `${hoy} 07:42:15 AST`,
      categoria: 'Combustible',
      comercio: 'Estación Texaco Autovía del Este',
      montoRD: 4500,
      itbisRD: 0,
      ncf: 'B0100048219',
      metodo: 'OCR Móvil',
      gpsCoords: {
        lat: 18.4624,
        lon: -69.3142,
        easting: 466824.12,
        northing: 2041450.33,
      },
      estadoAprobacion: 'aprobado',
      aprobadoPorUsuarioId: 'usr-coord',
      aprobadoEn: `${hoy} 09:00:00 AST`,
      topeAplicadoRD: 5500,
      montoAprobadoEmpresaRD: 4500,
      montoCargoColaboradorRD: 0,
      repartos: [
        { proyectoId: 'proy-1', montoRD: 3850 },
        { proyectoId: 'sin_asignar', montoRD: 650 },
      ],
      notas: 'Tanque lleno Hilux #1; excedente reserva para próxima salida.',
      version: 2,
      updatedAt: `${hoy}T09:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'via-2',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      personalId: 'per-1',
      cargoUsado: 'jefe_brigada',
      misionId: 'mis-1',
      rutaId: 'ruta-1',
      fechaIso: hoy,
      timestampAST: `${hoy} 07:18:04 AST`,
      categoria: 'Peaje',
      comercio: 'RD Vial — Peaje Las Américas + Coral I',
      montoRD: 400,
      itbisRD: 0,
      metodo: 'GPS Ruta',
      distanceKm: 144.8,
      gpsCoords: {
        lat: 18.4398,
        lon: -69.6621,
        easting: 430082.45,
        northing: 2039011.9,
      },
      estadoAprobacion: 'aprobado',
      aprobadoPorUsuarioId: 'usr-coord',
      aprobadoEn: `${hoy} 09:05:00 AST`,
      topeAplicadoRD: 1500,
      montoAprobadoEmpresaRD: 400,
      montoCargoColaboradorRD: 0,
      repartos: [{ proyectoId: 'proy-1', montoRD: 400 }],
      notas: 'Ida y vuelta autopista del Este',
      version: 1,
      updatedAt: `${hoy}T09:05:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'via-3',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      personalId: 'per-1',
      cargoUsado: 'jefe_brigada',
      misionId: 'mis-1',
      rutaId: 'ruta-1',
      fechaIso: hoy,
      timestampAST: `${hoy} 12:15:00 AST`,
      categoria: 'Dieta',
      comercio: 'Dieta de Campo — Brigada Este Alpha',
      montoRD: 4400,
      itbisRD: 0,
      metodo: 'Dieta Automática',
      estadoAprobacion: 'pendiente',
      topeAplicadoRD: 2800,
      excedenteRD: 1600,
      motivoExcedente: 'Jornada extendida para 2 técnicos en deslinde Bávaro',
      repartos: [{ proyectoId: 'proy-1', montoRD: 4400 }],
      notas: 'Jornada de 2 personas en campo',
      version: 1,
      updatedAt: `${hoy}T12:15:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'via-4',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec2',
      creadoPorNombre: 'Agrim. Laura Ramírez',
      personalId: 'per-3',
      cargoUsado: 'tecnico',
      misionId: 'mis-3',
      rutaId: 'ruta-4',
      vehiculoId: 'veh-2',
      galonesCargados: 8.7,
      fechaIso: hace8Dias,
      timestampAST: `${hace8Dias} 08:25:12 AST`,
      categoria: 'Combustible',
      comercio: 'TotalEnergies 6 de Noviembre',
      montoRD: 2100,
      itbisRD: 0,
      ncf: 'B0100077431',
      metodo: 'OCR Móvil',
      estadoAprobacion: 'aprobado',
      aprobadoPorUsuarioId: 'usr-coord',
      aprobadoEn: `${hace8Dias} 17:00:00 AST`,
      topeAplicadoRD: 4000,
      montoAprobadoEmpresaRD: 2100,
      montoCargoColaboradorRD: 0,
      repartos: [{ proyectoId: 'proy-3', montoRD: 2100 }],
      notas: 'Traslado brigada San Cristóbal',
      version: 1,
      updatedAt: `${hace8Dias}T17:00:00-04:00`,
      syncStatus: 'synced',
    },
    {
      id: 'via-5',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      rutaId: 'ruta-1',
      fechaIso: ayer,
      timestampAST: `${ayer} 16:40:00 AST`,
      categoria: 'Materiales',
      comercio: 'Ferretería Del Este',
      montoRD: 950,
      itbisRD: 145,
      metodo: 'Manual',
      estadoAprobacion: 'rechazado',
      motivoRechazo: 'Falta fotografía legible del comprobante con NCF fiscal.',
      aprobadoPorUsuarioId: 'usr-coord',
      aprobadoEn: `${ayer} 18:10:00 AST`,
      repartos: [{ proyectoId: 'proy-1', montoRD: 950 }],
      notas: 'Compra de pintura spray y estacas',
      version: 2,
      updatedAt: `${ayer}T18:10:00-04:00`,
      syncStatus: 'synced',
    },
  ];

  const historialAia: HistorialEvento[] = [
    {
      id: 'hist-1',
      empresaId: 'emp-aia',
      entidadTipo: 'servicio',
      entidadId: 'srv-1',
      accion: 'Cambio de estado',
      detalle: 'Deslinde Catastral pasó de programado a en_campo (Inicio: 2026-11-18).',
      usuarioId: 'usr-tec1',
      usuarioNombre: 'Ing. Carlos Méndez',
      fechaAST: '18/11/2026 08:30:00 AST',
    },
    {
      id: 'hist-2',
      empresaId: 'emp-aia',
      entidadTipo: 'viatico',
      entidadId: 'via-1',
      accion: 'Viático aprobado',
      detalle: 'Estación Texaco Autovía del Este por RD$ 4,500.00 aprobado (reparto: proy-1 RD$ 3,850 + sin_asignar RD$ 650).',
      usuarioId: 'usr-coord',
      usuarioNombre: 'Lic. Patricia Vargas',
      fechaAST: '18/11/2026 09:00:00 AST',
    },
  ];

  const fCaribe = makeFeature('fc1', 'Parcela Marina Sosúa', [
    [-70.515, 19.758, 12],
    [-70.511, 19.758, 14],
    [-70.511, 19.754, 10],
    [-70.515, 19.754, 9],
    [-70.515, 19.758, 12],
  ]);

  const snapshotCaribe: EstadoEmpresaSnapshot = {
    empresa: empresas[1],
    membresias: membresias.filter((m) => m.empresaId === 'emp-caribe'),
    usuarios: usuarios
      .filter((u) => u.id === 'usr-admin')
      .map(({ passwordDemo: _p, ...u }) => u),
    personal: [
      {
        id: 'per-c1',
        empresaId: 'emp-caribe',
        nombre: 'Agrim. Kelvin Taveras',
        cargo: 'jefe_brigada',
        activo: true,
      },
    ],
    vehiculos: [
      {
        id: 'veh-c1',
        empresaId: 'emp-caribe',
        etiqueta: 'Nissan Frontier 4x4',
        placa: 'L390112',
        tipoCombustibleId: 'diesel_optimo',
        tipoCombustible: 'Diésel Óptimo',
        precioGalonRD: 239.1,
        kmPorGal: 31,
        mantenimientoPorKmRD: 15,
        estado: 'disponible',
      },
    ],
    equipos: [
      {
        id: 'eq-c1',
        empresaId: 'emp-caribe',
        nombre: 'CHC i83 GNSS',
        serial: 'CHC-9901',
        estado: 'disponible',
      },
    ],
    cuadrillas: [
      {
        id: 'cua-c1',
        empresaId: 'emp-caribe',
        nombre: 'Brigada Costa Norte',
        jefeId: 'per-c1',
        miembroIds: ['per-c1'],
        activa: true,
      },
    ],
    clientes: [
      {
        id: 'cli-c1',
        empresaId: 'emp-caribe',
        nombre: 'Villas Atlántico Norte',
        rnc: '1-31-55201-3',
        contacto: 'Sr. Jean Paul',
      },
    ],
    proyectos: [
      {
        id: 'proy-c1',
        empresaId: 'emp-caribe',
        clienteId: 'cli-c1',
        nombre: 'Deslinde Frente Costero Sosúa',
        codigoContrato: 'GC-2026-0110',
        presupuestoViaticosRD: 12000,
        valorContratoRD: 145000,
        estado: 'cotizado',
        fechaCreacion: '2026-11-16',
        version: 1,
        updatedAt: '2026-11-16T10:00:00-04:00',
        syncStatus: 'synced',
      },
    ],
    rutas: [
      {
        id: 'ruta-c1',
        empresaId: 'emp-caribe',
        proyectoId: 'proy-c1',
        nombre: 'Lote Frente Marítimo Sosúa',
        codigoParcela: 'DC-07-PARC-2026-0110',
        ubicacion: 'Sosúa, Puerto Plata',
        provincia: 'Puerto Plata',
        fechaPrevista: '2026-11-25',
        kmzFileName: 'Sosua_Frente_Maritimo.kmz',
        features: [fCaribe],
        centroid: computeCentroid(fCaribe.points),
        totalAreaM2: fCaribe.areaM2,
        totalPerimeterM: fCaribe.perimeterM,
        version: 1,
        updatedAt: '2026-11-16T10:00:00-04:00',
        syncStatus: 'synced',
      },
    ],
    servicios: [
      {
        id: 'srv-c1',
        empresaId: 'emp-caribe',
        rutaId: 'ruta-c1',
        tipoServicioId: 'deslinde',
        nombre: 'Deslinde Costero',
        cotizacionRD: 145000,
        estado: 'cotizado',
        version: 1,
        updatedAt: '2026-11-16T10:00:00-04:00',
        syncStatus: 'synced',
      },
    ],
    bitacoras: [],
    asignaciones: [],
    viaticos: [],
    misiones: [],
    rentas: [],
    historial: [],
    configuracion: crearConfiguracionInicialEmpresa('emp-caribe'),
    onboarding: crearEstadoOnboardingInicial('emp-caribe'),
  };

  const snapshotAia: EstadoEmpresaSnapshot = {
    empresa: empresas[0],
    membresias: membresias.filter((m) => m.empresaId === 'emp-aia'),
    usuarios: usuarios.map(({ passwordDemo: _p, ...u }) => u),
    personal: personalAia,
    vehiculos: vehiculosAia,
    equipos: equiposAia,
    cuadrillas: cuadrillasAia,
    clientes: clientesAia,
    proyectos: proyectosAia,
    rutas: rutasAia,
    servicios: serviciosAia,
    bitacoras: bitacorasAia,
    asignaciones: asignacionesAia,
    viaticos: viaticosAia,
    misiones: misionesAia,
    rentas: rentasAia,
    historial: historialAia,
    configuracion: crearConfiguracionInicialEmpresa('emp-aia'),
    onboarding: crearEstadoOnboardingInicial('emp-aia'),
  };

  return {
    empresas,
    usuarios,
    membresias,
    snapshotsPorEmpresa: {
      'emp-aia': snapshotAia,
      'emp-caribe': snapshotCaribe,
    },
  };
}

function hidratarDatabase(rawDb: DatabaseLocal): DatabaseLocal {
  const empresas = rawDb.empresas.map((emp) => ({
    ...emp,
    zonaHoraria: emp.zonaHoraria || 'America/Santo_Domingo',
    moneda: emp.moneda || 'RD$',
  }));

  const snapshotsPorEmpresa: Record<string, EstadoEmpresaSnapshot> = {};
  for (const [empresaId, snap] of Object.entries(rawDb.snapshotsPorEmpresa)) {
    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const onboarding = asegurarEstadoOnboarding(empresaId, snap.onboarding);
    const empresaHydrated: Empresa = {
      ...snap.empresa,
      zonaHoraria: snap.empresa.zonaHoraria || 'America/Santo_Domingo',
      moneda: snap.empresa.moneda || 'RD$',
    };
    const vehiculos = snap.vehiculos.map((v) => {
      if (v.tipoCombustibleId) return v;
      const match = config.combustibles.find(
        (c) => c.nombre.toLowerCase() === v.tipoCombustible.toLowerCase()
      );
      return {
        ...v,
        tipoCombustibleId: match?.id ?? config.combustibles[0]?.id,
      };
    });
    snapshotsPorEmpresa[empresaId] = {
      ...snap,
      empresa: empresaHydrated,
      vehiculos,
      misiones: snap.misiones ?? [],
      rentas: snap.rentas ?? [],
      configuracion: config,
      onboarding,
    };
  }

  return {
    ...rawDb,
    empresas,
    snapshotsPorEmpresa,
  };
}

export class LocalRepositorioOperacion implements RepositorioOperacion {
  private db: DatabaseLocal;

  constructor() {
    this.db = this.cargarDB();
  }

  private cargarDB(): DatabaseLocal {
    try {
      const raw = localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as DatabaseLocal;
        if (parsed?.empresas?.length && parsed?.snapshotsPorEmpresa) {
          const hydrated = hidratarDatabase(parsed);
          this.guardarDB(hydrated);
          return hydrated;
        }
      }
    } catch {
      // Fallback to seed
    }
    const seed = crearSeedDatabase();
    this.guardarDB(seed);
    return seed;
  }

  private guardarDB(nextDb = this.db) {
    this.db = nextDb;
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(nextDb));
    } catch {
      // Ignore storage quota issues
    }
  }

  private obtenerSesionRequerida(): SesionActiva {
    const sesion = this.obtenerSesionGuardada();
    if (!sesion) {
      throw new Error('No hay una sesión activa. Inicia sesión nuevamente.');
    }
    return sesion;
  }

  private obtenerSnapshot(empresaId: string): EstadoEmpresaSnapshot {
    const snap = this.db.snapshotsPorEmpresa[empresaId];
    if (!snap) {
      throw new Error(`No se encontró la empresa ${empresaId} en el almacenamiento local.`);
    }
    return snap;
  }

  private registrarEvento(
    snap: EstadoEmpresaSnapshot,
    evento: Omit<HistorialEvento, 'id' | 'empresaId' | 'fechaAST'>
  ) {
    const item: HistorialEvento = {
      ...evento,
      id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      empresaId: snap.empresa.id,
      fechaAST: formatSantoDomingoAST(new Date()),
    };
    snap.historial = [item, ...snap.historial].slice(0, 200);
  }

  esModoDemoActivo(): boolean {
    return esModoDemoHabilitado();
  }

  listarCuentasDemo(): CuentaDemoInfo[] {
    if (!esModoDemoHabilitado()) {
      return [];
    }
    return [
      {
        email: 'admin@aiaservices.do',
        passwordDemo: 'demo123',
        nombre: 'Ing. Roberto Almonte (Admin)',
        descripcion: 'Acceso total en AIA Services + Coordinador en Geodesia Caribe SRL',
      },
      {
        email: 'coordinador@aiaservices.do',
        passwordDemo: 'demo123',
        nombre: 'Lic. Patricia Vargas (Coordinador)',
        descripcion: 'Gestión operativa, asignaciones, aprobación de viáticos y cobros',
      },
      {
        email: 'carlos@aiaservices.do',
        passwordDemo: 'demo123',
        nombre: 'Ing. Carlos Méndez (Técnico)',
        descripcion: 'Solo sus rutas asignadas, campo, bitácora y viáticos propios',
      },
      {
        email: 'laura@aiaservices.do',
        passwordDemo: 'demo123',
        nombre: 'Agrim. Laura Ramírez (Técnico)',
        descripcion: 'Brigada Cibao Sur — Rutas asignadas en Santiago',
      },
    ];
  }

  async iniciarSesion(email: string, password: string): Promise<SesionActiva> {
    const normEmail = email.trim().toLowerCase();
    const user = this.db.usuarios.find((u) => u.email.toLowerCase() === normEmail);
    if (!user || !user.activo) {
      throw new Error('Usuario no encontrado o inactivo.');
    }
    if (password !== user.passwordDemo) {
      throw new Error('Contraseña incorrecta. Usa "demo123" para las cuentas piloto.');
    }

    const membresias = this.db.membresias.filter((m) => m.usuarioId === user.id && m.activo);
    if (membresias.length === 0) {
      throw new Error('Tu usuario no tiene empresas asignadas. Contacta al administrador.');
    }

    const empresaPreferida = membresias[0];
    const sesion: SesionActiva = {
      usuario: { id: user.id, email: user.email, nombre: user.nombre, activo: user.activo },
      membresias,
      empresaActivaId: empresaPreferida.empresaId,
      rolActivo: empresaPreferida.rol,
      token: `aia-session-${user.id}-${Date.now()}`,
      guardadaEn: new Date().toISOString(),
    };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sesion));
    } catch {
      // Ignore
    }
    return sesion;
  }

  obtenerSesionGuardada(): SesionActiva | null {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw) as SesionActiva;
    } catch {
      return null;
    }
  }

  async cerrarSesion(): Promise<void> {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  async listarEmpresasDeUsuario(
    usuarioId: string
  ): Promise<Array<{ empresa: Empresa; rol: RolEmpresa }>> {
    const mems = this.db.membresias.filter((m) => m.usuarioId === usuarioId && m.activo);
    return mems
      .map((m) => {
        const empresa = this.db.empresas.find((e) => e.id === m.empresaId);
        return empresa ? { empresa, rol: m.rol } : null;
      })
      .filter((x): x is { empresa: Empresa; rol: RolEmpresa } => x !== null);
  }

  async cambiarEmpresaActiva(empresaId: string): Promise<SesionActiva> {
    const sesion = this.obtenerSesionRequerida();
    const mem = this.db.membresias.find(
      (m) => m.usuarioId === sesion.usuario.id && m.empresaId === empresaId && m.activo
    );
    if (!mem) {
      throw new Error('No tienes acceso a la empresa seleccionada.');
    }
    const actualizada: SesionActiva = {
      ...sesion,
      empresaActivaId: empresaId,
      rolActivo: mem.rol,
      guardadaEn: new Date().toISOString(),
    };
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(actualizada));
    } catch {
      // Ignore
    }
    return actualizada;
  }

  async cargarSnapshotEmpresa(empresaId: string): Promise<EstadoEmpresaSnapshot> {
    const snap = this.obtenerSnapshot(empresaId);
    return structuredClone(snap);
  }

  async cargarSnapshotParaRol(params: {
    empresaId: string;
    rol: RolEmpresa;
    usuarioId: string;
    personalIdMembresia?: string;
  }): Promise<ProyeccionSnapshotPorRol> {
    const snap = structuredClone(this.obtenerSnapshot(params.empresaId));
    return proyectarSnapshotParaRol({
      snapshot: snap,
      rol: params.rol,
      usuarioId: params.usuarioId,
      personalIdMembresia: params.personalIdMembresia,
    });
  }

  async crearCliente(
    empresaId: string,
    datos: Omit<Cliente, 'id' | 'empresaId'>
  ): Promise<Cliente> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para crear clientes.');
    }
    if (!datos.nombre.trim()) throw new Error('El nombre del cliente es obligatorio.');
    const snap = this.obtenerSnapshot(empresaId);
    const nuevo: Cliente = {
      ...datos,
      id: `cli-${Date.now()}`,
      empresaId,
      nombre: datos.nombre.trim(),
      rnc: datos.rnc.trim(),
      contacto: datos.contacto.trim(),
    };
    snap.clientes = [nuevo, ...snap.clientes];
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: nuevo.id,
      accion: 'Cliente creado',
      detalle: `Cliente "${nuevo.nombre}" (RNC: ${nuevo.rnc || 'N/A'}) registrado.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nuevo;
  }

  async actualizarCliente(empresaId: string, cliente: Cliente): Promise<Cliente> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para editar clientes.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    snap.clientes = snap.clientes.map((c) => (c.id === cliente.id ? cliente : c));
    this.guardarDB();
    return cliente;
  }

  async crearProyecto(
    empresaId: string,
    datos: Omit<
      Proyecto,
      'id' | 'empresaId' | 'estado' | 'fechaCreacion' | 'version' | 'updatedAt' | 'syncStatus'
    >
  ): Promise<Proyecto> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para crear proyectos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const nuevo: Proyecto = {
      ...datos,
      id: `proy-${Date.now()}`,
      empresaId,
      estado: 'cotizado',
      fechaCreacion: new Date().toISOString().slice(0, 10),
      version: 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.proyectos = [nuevo, ...snap.proyectos];
    this.registrarEvento(snap, {
      entidadTipo: 'proyecto',
      entidadId: nuevo.id,
      accion: 'Proyecto creado (cotizado)',
      detalle: `Proyecto "${nuevo.nombre}" (${nuevo.codigoContrato}) · Presup. viáticos RD$ ${nuevo.presupuestoViaticosRD.toLocaleString('en-US')}.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nuevo;
  }

  async actualizarProyecto(empresaId: string, proyecto: Proyecto): Promise<Proyecto> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para editar proyectos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = snap.proyectos.find((p) => p.id === proyecto.id);
    const actualizado: Proyecto = {
      ...proyecto,
      version: proyecto.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.proyectos = snap.proyectos.map((p) => (p.id === actualizado.id ? actualizado : p));
    if (anterior) {
      const prevTxt = `Presup: RD$ ${anterior.presupuestoViaticosRD.toLocaleString('en-US')} · Contrato: RD$ ${anterior.valorContratoRD.toLocaleString('en-US')}`;
      const nextTxt = `Presup: RD$ ${actualizado.presupuestoViaticosRD.toLocaleString('en-US')} · Contrato: RD$ ${actualizado.valorContratoRD.toLocaleString('en-US')}`;
      this.registrarEvento(snap, {
        entidadTipo: 'proyecto',
        entidadId: actualizado.id,
        accion: 'Presupuesto / proyecto actualizado',
        detalle: `Proyecto "${actualizado.nombre}" (${actualizado.codigoContrato}) actualizado.`,
        valorAnterior: prevTxt,
        valorNuevo: nextTxt,
        usuarioId: sesion.usuario.id,
        usuarioNombre: sesion.usuario.nombre,
        metadata: {
          valorAnterior: prevTxt,
          valorNuevo: nextTxt,
        },
      });
    }
    this.guardarDB();
    return actualizado;
  }

  async crearRuta(
    empresaId: string,
    datos: Omit<Ruta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Ruta> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para crear rutas.');
    }
    if (!datos.features || datos.features.length === 0) {
      throw new Error('La ruta debe contener al menos una geometría válida.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const nueva: Ruta = {
      ...datos,
      id: `ruta-${Date.now()}`,
      empresaId,
      version: 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.rutas = [nueva, ...snap.rutas];
    this.registrarEvento(snap, {
      entidadTipo: 'ruta',
      entidadId: nueva.id,
      accion: 'Ruta KMZ/GeoJSON creada',
      detalle: `Ruta "${nueva.nombre}" (${nueva.codigoParcela}) agregada desde ${nueva.kmzFileName}.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nueva;
  }

  async actualizarRuta(empresaId: string, ruta: Ruta): Promise<Ruta> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para editar rutas.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const actualizada: Ruta = {
      ...ruta,
      version: ruta.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.rutas = snap.rutas.map((r) => (r.id === actualizada.id ? actualizada : r));
    this.guardarDB();
    return actualizada;
  }

  async crearServicio(
    empresaId: string,
    datos: Omit<Servicio, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Servicio> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para crear servicios.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const nuevo: Servicio = {
      ...datos,
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      empresaId,
      version: 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.servicios = [nuevo, ...snap.servicios];
    this.registrarEvento(snap, {
      entidadTipo: 'servicio',
      entidadId: nuevo.id,
      accion: 'Servicio cotizado',
      detalle: `Servicio "${nuevo.nombre}" por RD$ ${nuevo.cotizacionRD.toLocaleString('en-US')} en ruta ${nuevo.rutaId}.`,
      valorAnterior: 'Sin registro',
      valorNuevo: `${nuevo.estado} (RD$ ${nuevo.cotizacionRD.toLocaleString('en-US')})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior: 'Sin registro',
        valorNuevo: nuevo.estado,
      },
    });
    this.guardarDB();
    return nuevo;
  }

  async actualizarServicio(empresaId: string, servicio: Servicio): Promise<Servicio> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para editar servicios.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = snap.servicios.find((s) => s.id === servicio.id);
    const actualizado: Servicio = {
      ...servicio,
      version: (anterior?.version ?? servicio.version) + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.servicios = snap.servicios.map((s) => (s.id === actualizado.id ? actualizado : s));
    if (anterior) {
      const prevTxt = `${anterior.nombre} · RD$ ${anterior.cotizacionRD.toLocaleString('en-US')}`;
      const nextTxt = `${actualizado.nombre} · RD$ ${actualizado.cotizacionRD.toLocaleString('en-US')}`;
      this.registrarEvento(snap, {
        entidadTipo: 'servicio',
        entidadId: actualizado.id,
        accion: 'Cotización de servicio actualizada',
        detalle: `Servicio "${actualizado.nombre}" actualizado en ruta ${actualizado.rutaId}.`,
        valorAnterior: prevTxt,
        valorNuevo: nextTxt,
        usuarioId: sesion.usuario.id,
        usuarioNombre: sesion.usuario.nombre,
        metadata: {
          valorAnterior: prevTxt,
          valorNuevo: nextTxt,
        },
      });
    }
    this.guardarDB();
    return actualizado;
  }

  async transicionarServicio(params: {
    empresaId: string;
    servicioId: string;
    nuevoEstado: EstadoServicio;
    payload?: PayloadTransicionServicio;
  }): Promise<Servicio> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(params.empresaId);
    const servicio = snap.servicios.find((s) => s.id === params.servicioId);
    if (!servicio) throw new Error('Servicio no encontrado.');

    const mem = sesion.membresias.find((m) => m.empresaId === params.empresaId);
    const personalIdsUsuario = obtenerPersonalIdsUsuario({
      usuarioId: sesion.usuario.id,
      personalIdMembresia: mem?.personalId,
      personal: snap.personal,
    });
    const cuadrillasUsuarioIds = new Set(
      obtenerCuadrillasDeUsuario({ personalIdsUsuario, cuadrillas: snap.cuadrillas }).map(
        (c) => c.id
      )
    );
    const rutasAsignadas = obtenerRutasAsignadasAUsuario({
      usuarioId: sesion.usuario.id,
      personalIdMembresia: mem?.personalId,
      personal: snap.personal,
      cuadrillas: snap.cuadrillas,
      asignaciones: snap.asignaciones,
    });

    const res = validarTransicionServicio({
      rol: sesion.rolActivo,
      servicio,
      nuevoEstado: params.nuevoEstado,
      rutasAsignadasIds: rutasAsignadas,
      asignaciones: snap.asignaciones,
      cuadrillasUsuarioIds,
      bitacoras: snap.bitacoras,
      payload: params.payload,
    });

    if (!res.valido || !res.servicioActualizado) {
      throw new Error(res.error || 'No se pudo cambiar el estado del servicio.');
    }

    const updated = res.servicioActualizado;
    snap.servicios = snap.servicios.map((s) => (s.id === updated.id ? updated : s));

    const detalleCobro =
      updated.estado === 'cobrado'
        ? ` · Cobrado: RD$ ${updated.montoCobradoRD?.toLocaleString('en-US')} (${updated.fechaPago})`
        : '';
    const valorNuevo =
      updated.estado === 'cobrado'
        ? `${updated.estado} (RD$ ${updated.montoCobradoRD?.toLocaleString('en-US')} · ${updated.fechaPago})`
        : updated.estado;
    this.registrarEvento(snap, {
      entidadTipo: 'servicio',
      entidadId: updated.id,
      accion: `Estado servicio -> ${updated.estado}`,
      detalle: `"${updated.nombre}" pasó de ${servicio.estado} a ${updated.estado}${detalleCobro}.`,
      valorAnterior: servicio.estado,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior: servicio.estado,
        valorNuevo,
      },
    });
    this.guardarDB();
    return updated;
  }

  async agregarBitacora(
    empresaId: string,
    datos: Omit<BitacoraEntrada, 'id' | 'empresaId' | 'fechaAST' | 'syncStatus'>
  ): Promise<BitacoraEntrada> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    const servicio = snap.servicios.find((s) => s.id === datos.servicioId);
    if (!servicio) throw new Error('Servicio no encontrado para la bitácora.');

    const mem = sesion.membresias.find((m) => m.empresaId === empresaId);
    const rutasAsignadas = obtenerRutasAsignadasAUsuario({
      usuarioId: sesion.usuario.id,
      personalIdMembresia: mem?.personalId,
      personal: snap.personal,
      cuadrillas: snap.cuadrillas,
      asignaciones: snap.asignaciones,
    });

    if (!puedeRegistrarBitacoraEnServicio({ rol: sesion.rolActivo, servicio, rutasAsignadasIds: rutasAsignadas })) {
      throw new Error('No tienes permiso para escribir en la bitácora de este servicio.');
    }

    const entry: BitacoraEntrada = {
      ...datos,
      id: `bit-${Date.now()}`,
      empresaId,
      fechaAST: formatSantoDomingoAST(new Date()),
      syncStatus: 'pending',
    };
    snap.bitacoras = [entry, ...snap.bitacoras];
    this.registrarEvento(snap, {
      entidadTipo: 'servicio',
      entidadId: servicio.id,
      accion: 'Nota de bitácora',
      detalle: `${entry.autorNombre}: "${entry.nota.slice(0, 90)}" (${entry.fotos.length} foto(s)).`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return entry;
  }

  async guardarAsignacion(
    empresaId: string,
    datos: Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ): Promise<Asignacion> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para asignar cuadrillas o vehículos.');
    }
    if (!validarRangoFechas(datos.fechaInicio, datos.fechaFin)) {
      throw new Error('El rango de fechas es inválido (fechaInicio debe ser <= fechaFin).');
    }

    const snap = this.obtenerSnapshot(empresaId);
    const asignacionId = datos.id || `asig-${Date.now()}`;

    const conflictos = detectarConflictosAsignacion({
      candidata: {
        id: asignacionId,
        rutaId: datos.rutaId,
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        cuadrillaId: datos.cuadrillaId,
        vehiculoIds: datos.vehiculoIds,
        equipoIds: datos.equipoIds,
      },
      asignacionesExistentes: snap.asignaciones,
      rutas: snap.rutas,
      cuadrillas: snap.cuadrillas,
      personal: snap.personal,
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
      rentasExistentes: snap.rentas ?? [],
      misiones: snap.misiones ?? [],
      umbralCercaniaRentaKm: obtenerRendimientoConfigVigente(
        asegurarConfiguracionEmpresa(empresaId, snap.configuracion)
      ).umbralCercaniaRentaKm,
    });

    const validacion = validarResolucionConflictos(conflictos, datos.overrideConflicto);
    if (!validacion.valido) {
      throw new Error(validacion.error || 'Conflicto bloqueante en la asignación.');
    }

    const existente = snap.asignaciones.find((a) => a.id === asignacionId);
    const guardada: Asignacion = {
      id: asignacionId,
      empresaId,
      rutaId: datos.rutaId,
      fechaInicio: datos.fechaInicio,
      fechaFin: datos.fechaFin,
      cuadrillaId: datos.cuadrillaId,
      vehiculoIds: datos.vehiculoIds,
      equipoIds: datos.equipoIds,
      overrideConflicto: datos.overrideConflicto,
      version: existente ? existente.version + 1 : 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    snap.asignaciones = existente
      ? snap.asignaciones.map((a) => (a.id === asignacionId ? guardada : a))
      : [guardada, ...snap.asignaciones];

    const ruta = snap.rutas.find((r) => r.id === guardada.rutaId);
    const cuadrilla = snap.cuadrillas.find((c) => c.id === guardada.cuadrillaId);

    const formatearResumenAsig = (a: Asignacion) => {
      const r = snap.rutas.find((x) => x.id === a.rutaId);
      const c = snap.cuadrillas.find((x) => x.id === a.cuadrillaId);
      const vehs = a.vehiculoIds
        .map((id) => snap.vehiculos.find((v) => v.id === id)?.etiqueta || id)
        .join(', ');
      const eqs = a.equipoIds
        .map((id) => snap.equipos.find((e) => e.id === id)?.nombre || id)
        .join(', ');
      return `${c?.nombre || a.cuadrillaId} · ${r?.codigoParcela || a.rutaId} (${a.fechaInicio} al ${a.fechaFin}) · Veh: ${vehs || 'N/A'} · GNSS: ${eqs || 'N/A'}`;
    };

    const valorAnterior = existente ? formatearResumenAsig(existente) : 'Sin asignación previa';
    const valorNuevo = formatearResumenAsig(guardada);

    this.registrarEvento(snap, {
      entidadTipo: 'asignacion',
      entidadId: guardada.id,
      accion: existente
        ? guardada.overrideConflicto
          ? 'Asignación reasignada con override'
          : 'Asignación reasignada'
        : guardada.overrideConflicto
        ? 'Asignación con override de conflicto'
        : 'Asignación programada',
      detalle: `${cuadrilla?.nombre || guardada.cuadrillaId} → ${ruta?.codigoParcela || guardada.rutaId} (${guardada.fechaInicio} al ${guardada.fechaFin})${
        guardada.overrideConflicto ? ` · Motivo excepción: ${guardada.overrideConflicto.motivo}` : ''
      }`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
        ...(guardada.overrideConflicto
          ? {
              overrideMotivo: guardada.overrideConflicto.motivo,
              overrideFecha: guardada.overrideConflicto.fecha,
            }
          : {}),
      },
    });

    this.guardarDB();
    return guardada;
  }

  async eliminarAsignacion(empresaId: string, asignacionId: string): Promise<void> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para eliminar asignaciones.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const target = snap.asignaciones.find((a) => a.id === asignacionId);
    snap.asignaciones = snap.asignaciones.filter((a) => a.id !== asignacionId);
    if (target) {
      const r = snap.rutas.find((x) => x.id === target.rutaId);
      const c = snap.cuadrillas.find((x) => x.id === target.cuadrillaId);
      const valorAnterior = `${c?.nombre || target.cuadrillaId} · ${r?.codigoParcela || target.rutaId} (${target.fechaInicio} al ${target.fechaFin})`;
      this.registrarEvento(snap, {
        entidadTipo: 'asignacion',
        entidadId: target.id,
        accion: 'Asignación eliminada',
        detalle: `Se eliminó la asignación de ${valorAnterior}.`,
        valorAnterior,
        valorNuevo: 'Eliminada',
        usuarioId: sesion.usuario.id,
        usuarioNombre: sesion.usuario.nombre,
        metadata: {
          valorAnterior,
          valorNuevo: 'Eliminada',
        },
      });
    }
    this.guardarDB();
  }

  async registrarViatico(
    empresaId: string,
    datos: Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>
  ): Promise<Viatico> {
    const sesion = this.obtenerSesionRequerida();
    const checkReparto = validarRepartoViatico(datos.montoRD, datos.repartos);
    if (!checkReparto.valido) {
      throw new Error(checkReparto.error || 'Reparto de viático inválido.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const mem = this.db.membresias.find(
      (m) => m.empresaId === empresaId && m.usuarioId === sesion.usuario.id
    );
    const resCargo = resolverPersonalYCargoUsuario({
      usuarioId: sesion.usuario.id,
      rol: sesion.rolActivo,
      personalIdMembresia: mem?.personalId,
      personal: snap.personal,
    });
    if (!resCargo.valido) {
      throw new Error(resCargo.error || ERROR_TECNICO_SIN_PERSONAL);
    }

    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const evalTope = evaluarTopeViaticoEnMision({
      misionId: datos.misionId,
      categoria: datos.categoria,
      montoRD: datos.montoRD,
      cargoCodigo: resCargo.cargoCodigo,
      usuarioId: sesion.usuario.id,
      personalId: resCargo.personalId,
      viaticosExistentes: snap.viaticos,
      config,
      fechaCalculoIso: datos.fechaIso,
    });

    if (evalTope.motivoExcedenteRequerido && !(datos.motivoExcedente && datos.motivoExcedente.trim().length >= 3)) {
      throw new Error(
        evalTope.mensajeAviso ||
          'El gasto supera el tope de misión y requiere un motivo de excedente obligatorio (mínimo 3 caracteres).'
      );
    }

    const nuevo: Viatico = {
      ...datos,
      id: `via-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      empresaId,
      personalId: resCargo.personalId,
      cargoUsado: resCargo.cargoCodigo,
      topeAplicadoRD: evalTope.topeAplicadoRD,
      excedenteRD: evalTope.excedenteRD > 0 ? evalTope.excedenteRD : undefined,
      motivoExcedente: evalTope.excedenteRD > 0 ? datos.motivoExcedente?.trim() : undefined,
      configVersion: datos.configVersion ?? config.versionGlobal,
      estadoAprobacion: 'pendiente',
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    snap.viaticos = [nuevo, ...snap.viaticos];
    const repartoStr = nuevo.repartos
      .map((r) => {
        const p = snap.proyectos.find((x) => x.id === r.proyectoId);
        return `${p?.codigoContrato || r.proyectoId}: RD$ ${r.montoRD}`;
      })
      .join(' · ');
    this.registrarEvento(snap, {
      entidadTipo: 'viatico',
      entidadId: nuevo.id,
      accion: nuevo.excedenteRD ? 'Viático registrado con excedente' : 'Viático registrado',
      detalle: `${nuevo.comercio} (${nuevo.categoria}) por RD$ ${nuevo.montoRD.toLocaleString('en-US')} [${nuevo.metodo}]${
        nuevo.excedenteRD ? ` · Excedente RD$ ${nuevo.excedenteRD.toLocaleString('en-US')}` : ''
      }.`,
      valorAnterior: 'Sin registro',
      valorNuevo: `pendiente (${repartoStr})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior: 'Sin registro',
        valorNuevo: `pendiente (${repartoStr})`,
        ...(nuevo.excedenteRD ? { excedenteRD: nuevo.excedenteRD } : {}),
      },
    });
    this.guardarDB();
    return nuevo;
  }

  async actualizarRepartoViatico(
    empresaId: string,
    viaticoId: string,
    repartos: RepartoProyecto[]
  ): Promise<Viatico> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    const viatico = snap.viaticos.find((v) => v.id === viaticoId);
    if (!viatico) throw new Error('Viático no encontrado.');

    const checkRedist = validarRedistribucionViatico({
      viatico,
      rol: sesion.rolActivo,
    });
    if (!checkRedist.valido) {
      throw new Error(checkRedist.error);
    }

    const montoBaseReparto = viatico.montoAprobadoEmpresaRD ?? viatico.montoRD;
    const check = validarRepartoViatico(montoBaseReparto, repartos);
    if (!check.valido) throw new Error(check.error);

    const formatearReparto = (items: RepartoProyecto[]) =>
      items
        .map((r) => {
          const p =
            r.proyectoId === 'sin_asignar'
              ? 'Sin asignar'
              : snap.proyectos.find((x) => x.id === r.proyectoId)?.codigoContrato || r.proyectoId;
          return `${p}: RD$ ${r.montoRD}`;
        })
        .join(' · ');

    const valorAnterior = formatearReparto(viatico.repartos);
    const valorNuevo = formatearReparto(repartos);

    const actualizado: Viatico = {
      ...viatico,
      repartos,
      version: viatico.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.viaticos = snap.viaticos.map((v) => (v.id === viaticoId ? actualizado : v));
    this.registrarEvento(snap, {
      entidadTipo: 'viatico',
      entidadId: actualizado.id,
      accion: 'Reparto de viático actualizado',
      detalle: `Reparto recalculado para ${actualizado.comercio}: ${valorNuevo}`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return actualizado;
  }

  async decidirViatico(params: {
    empresaId: string;
    viaticoId: string;
    nuevoEstado: EstadoAprobacionViatico;
    motivoRechazo?: string;
    motivoDecision?: string;
    decisionExcedente?: DecisionExcedenteViatico;
  }): Promise<Viatico> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(params.empresaId);
    const viatico = snap.viaticos.find((v) => v.id === params.viaticoId);
    if (!viatico) throw new Error('Viático no encontrado.');

    const check = validarDecisionViatico({
      estadoActual: viatico.estadoAprobacion,
      rol: sesion.rolActivo,
      nuevoEstado: params.nuevoEstado,
      motivoRechazo: params.motivoRechazo,
      motivoDecision: params.motivoDecision,
      excedenteRD: viatico.excedenteRD ?? 0,
      decisionExcedente: params.decisionExcedente,
    });
    if (!check.valido) throw new Error(check.error);

    const motivoLimpo = (params.motivoRechazo ?? params.motivoDecision ?? '').trim() || undefined;
    const valorAnterior = viatico.motivoRechazo
      ? `${viatico.estadoAprobacion} (${viatico.motivoRechazo})`
      : viatico.motivoDecision
      ? `${viatico.estadoAprobacion} (${viatico.motivoDecision})`
      : viatico.estadoAprobacion;
    const valorNuevo = motivoLimpo ? `${params.nuevoEstado} (${motivoLimpo})` : params.nuevoEstado;

    let decisionExcedenteFinal: DecisionExcedenteViatico | undefined = viatico.decisionExcedente;
    let montoAprobadoEmpresaRD: number | undefined = viatico.montoAprobadoEmpresaRD;
    let montoCargoColaboradorRD: number | undefined = viatico.montoCargoColaboradorRD;
    let repartosFinales = viatico.repartos;

    if (params.nuevoEstado === 'aprobado') {
      const exc = viatico.excedenteRD ?? 0;
      if (exc > 0 && params.decisionExcedente === 'cargo_colaborador') {
        decisionExcedenteFinal = 'cargo_colaborador';
        montoCargoColaboradorRD = Number(Math.min(viatico.montoRD, exc).toFixed(2));
        montoAprobadoEmpresaRD = Number(Math.max(0, viatico.montoRD - montoCargoColaboradorRD).toFixed(2));
        repartosFinales = escalarRepartosAMontoEmpresa(montoAprobadoEmpresaRD, viatico.repartos);
      } else {
        decisionExcedenteFinal = exc > 0 ? 'aprobado_empresa' : undefined;
        montoCargoColaboradorRD = 0;
        montoAprobadoEmpresaRD = viatico.montoRD;
      }
    } else {
      decisionExcedenteFinal = undefined;
      montoAprobadoEmpresaRD = undefined;
      montoCargoColaboradorRD = undefined;
    }

    const actualizado: Viatico = {
      ...viatico,
      estadoAprobacion: params.nuevoEstado,
      motivoRechazo: params.nuevoEstado === 'rechazado' ? motivoLimpo : undefined,
      motivoDecision: motivoLimpo,
      decisionExcedente: decisionExcedenteFinal,
      montoAprobadoEmpresaRD,
      montoCargoColaboradorRD,
      repartos: repartosFinales,
      aprobadoPorUsuarioId: sesion.usuario.id,
      aprobadoEn: formatSantoDomingoAST(new Date()),
      version: viatico.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.viaticos = snap.viaticos.map((v) => (v.id === actualizado.id ? actualizado : v));
    this.registrarEvento(snap, {
      entidadTipo: 'viatico',
      entidadId: actualizado.id,
      accion:
        params.nuevoEstado === 'aprobado'
          ? decisionExcedenteFinal === 'cargo_colaborador'
            ? 'Viático aprobado con cargo de excedente al colaborador'
            : 'Viático aprobado'
          : params.nuevoEstado === 'rechazado'
          ? 'Viático rechazado'
          : 'Viático devuelto a pendiente',
      detalle: `${actualizado.comercio} (Total RD$ ${actualizado.montoRD.toLocaleString('en-US')}${
        decisionExcedenteFinal === 'cargo_colaborador'
          ? ` · Empresa RD$ ${(montoAprobadoEmpresaRD ?? 0).toLocaleString('en-US')} / Colaborador RD$ ${(montoCargoColaboradorRD ?? 0).toLocaleString('en-US')}`
          : ''
      })${motivoLimpo ? ` · Motivo: ${motivoLimpo}` : ''}`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
        ...(motivoLimpo ? { motivoDecision: motivoLimpo } : {}),
      },
    });
    this.guardarDB();
    return actualizado;
  }

  async editarViatico(
    empresaId: string,
    viaticoId: string,
    datos: Omit<
      Viatico,
      | 'id'
      | 'empresaId'
      | 'creadoPorUsuarioId'
      | 'creadoPorNombre'
      | 'estadoAprobacion'
      | 'motivoRechazo'
      | 'aprobadoPorUsuarioId'
      | 'aprobadoEn'
      | 'version'
      | 'updatedAt'
    >
  ): Promise<Viatico> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    const target = snap.viaticos.find((v) => v.id === viaticoId);
    if (!target) {
      throw new Error('Viático no encontrado.');
    }

    const checkEdicion = validarEdicionViatico({
      viatico: target,
      rol: sesion.rolActivo,
      usuarioId: sesion.usuario.id,
    });
    if (!checkEdicion.valido) {
      throw new Error(
        checkEdicion.error || 'No es posible editar este viático en su estado actual.'
      );
    }

    const checkReparto = validarRepartoViatico(datos.montoRD, datos.repartos);
    if (!checkReparto.valido) {
      throw new Error(checkReparto.error || 'Reparto de viático inválido.');
    }

    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const cargoCodigo = target.cargoUsado || 'administrativo';
    const evalTope = evaluarTopeViaticoEnMision({
      misionId: datos.misionId,
      categoria: datos.categoria,
      montoRD: datos.montoRD,
      cargoCodigo,
      usuarioId: target.creadoPorUsuarioId,
      personalId: target.personalId,
      viaticosExistentes: snap.viaticos,
      excluirViaticoId: target.id,
      config,
      fechaCalculoIso: datos.fechaIso,
    });

    if (evalTope.motivoExcedenteRequerido && !(datos.motivoExcedente && datos.motivoExcedente.trim().length >= 3)) {
      throw new Error(
        evalTope.mensajeAviso ||
          'El gasto supera el tope de misión y requiere un motivo de excedente obligatorio.'
      );
    }

    const actualizado: Viatico = {
      ...target,
      ...datos,
      id: target.id,
      empresaId: target.empresaId,
      creadoPorUsuarioId: target.creadoPorUsuarioId,
      creadoPorNombre: target.creadoPorNombre,
      topeAplicadoRD: evalTope.topeAplicadoRD,
      excedenteRD: evalTope.excedenteRD > 0 ? evalTope.excedenteRD : undefined,
      motivoExcedente: evalTope.excedenteRD > 0 ? datos.motivoExcedente?.trim() : undefined,
      estadoAprobacion: 'pendiente',
      version: target.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: datos.syncStatus === 'needs_ocr' ? 'needs_ocr' : 'pending',
    };

    const valorAnterior = `${target.comercio} (${target.categoria}) · RD$ ${target.montoRD.toLocaleString('en-US')}`;
    const valorNuevo = `${actualizado.comercio} (${actualizado.categoria}) · RD$ ${actualizado.montoRD.toLocaleString('en-US')}`;

    snap.viaticos = snap.viaticos.map((v) => (v.id === viaticoId ? actualizado : v));
    this.registrarEvento(snap, {
      entidadTipo: 'viatico',
      entidadId: actualizado.id,
      accion: 'Viático editado',
      detalle: `${actualizado.comercio} actualizado a RD$ ${actualizado.montoRD.toLocaleString('en-US')}.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return actualizado;
  }

  async eliminarViatico(empresaId: string, viaticoId: string): Promise<void> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    const target = snap.viaticos.find((v) => v.id === viaticoId);
    if (!target) return;
    const checkEstado = validarEliminacionViatico(target);
    if (!checkEstado.valido) {
      throw new Error(checkEstado.error);
    }
    if (sesion.rolActivo === 'tecnico') {
      const checkElim = validarEliminacionViaticoTecnico(target, sesion.usuario.id);
      if (!checkElim.valido) {
        throw new Error(checkElim.error || 'Solo puedes eliminar tus propios viáticos pendientes.');
      }
    }
    snap.viaticos = snap.viaticos.filter((v) => v.id !== viaticoId);
    this.guardarDB();
  }

  async crearMision(
    empresaId: string,
    datos: Omit<Mision, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Mision> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeCrearOEditarOperacion(sesion.rolActivo)) {
      throw new Error('No tienes permisos para crear misiones.');
    }
    if (!datos.nombre.trim() || !datos.zona.trim() || !datos.provincia.trim()) {
      throw new Error('Nombre, zona y provincia de la misión son obligatorios.');
    }
    if (!validarRangoFechas(datos.fechaInicio, datos.fechaFin)) {
      throw new Error('El rango de fechas de la misión es inválido.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const nueva: Mision = {
      ...datos,
      id: `mis-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      empresaId,
      nombre: datos.nombre.trim(),
      zona: datos.zona.trim(),
      provincia: datos.provincia.trim(),
      version: 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.misiones = [nueva, ...(snap.misiones ?? [])];
    this.registrarEvento(snap, {
      entidadTipo: 'mision',
      entidadId: nueva.id,
      accion: 'Misión creada',
      detalle: `${nueva.nombre} (${nueva.provincia} · ${nueva.fechaInicio} al ${nueva.fechaFin}).`,
      valorAnterior: 'Sin registro',
      valorNuevo: nueva.nombre,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nueva;
  }

  async guardarRenta(
    empresaId: string,
    datos: Omit<Renta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ): Promise<Renta> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('Solo Coordinador o Admin pueden registrar o modificar rentas.');
    }
    const checkDatos = validarRenta(datos);
    if (!checkDatos.valido) {
      throw new Error(checkDatos.error || 'Datos de renta inválidos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const rentaId = datos.id || `rent-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const existente = (snap.rentas ?? []).find((r) => r.id === rentaId);
    if (existente) {
      const checkEdicionRenta = validarEdicionRenta(existente);
      if (!checkEdicionRenta.valido) {
        throw new Error(checkEdicionRenta.error);
      }
    }

    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const umbralKm = obtenerRendimientoConfigVigente(config, datos.fechaInicio).umbralCercaniaRentaKm;

    const conflictos = detectarConflictosRenta({
      candidata: {
        id: rentaId,
        recursoTipo: datos.recursoTipo,
        recursoId: datos.recursoId,
        misionId: datos.misionId,
        rutaId: datos.rutaId,
        fechaInicio: datos.fechaInicio,
        fechaFin: datos.fechaFin,
        estado: datos.estado,
      },
      rentasExistentes: snap.rentas ?? [],
      asignacionesExistentes: snap.asignaciones,
      rutas: snap.rutas,
      misiones: snap.misiones ?? [],
      vehiculos: snap.vehiculos,
      equipos: snap.equipos,
      umbralCercaniaKm: umbralKm,
    });

    const validacionConf = validarResolucionConflictos(conflictos, datos.overrideConflicto);
    if (!validacionConf.valido) {
      throw new Error(validacionConf.error || 'Conflicto bloqueante en la renta.');
    }

    const etiqueta =
      datos.recursoEtiqueta ||
      (datos.recursoTipo === 'vehiculo'
        ? snap.vehiculos.find((v) => v.id === datos.recursoId)?.etiqueta
        : snap.equipos.find((e) => e.id === datos.recursoId)?.nombre) ||
      datos.recursoId;

    const guardada: Renta = {
      ...datos,
      id: rentaId,
      empresaId,
      recursoEtiqueta: etiqueta,
      proveedor: datos.proveedor.trim(),
      configVersion: datos.configVersion ?? config.versionGlobal,
      umbralDistanciaKmUsado: datos.umbralDistanciaKmUsado ?? umbralKm,
      version: existente ? existente.version + 1 : 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };

    snap.rentas = existente
      ? (snap.rentas ?? []).map((r) => (r.id === rentaId ? guardada : r))
      : [guardada, ...(snap.rentas ?? [])];

    this.registrarEvento(snap, {
      entidadTipo: 'renta',
      entidadId: guardada.id,
      accion: existente ? 'Renta actualizada' : 'Renta registrada',
      detalle: `${etiqueta} (${guardada.proveedor}) del ${guardada.fechaInicio} al ${guardada.fechaFin} por RD$ ${guardada.costoTotalRD.toLocaleString('en-US')}.`,
      valorAnterior: existente ? `${existente.estado} · RD$ ${existente.costoTotalRD}` : 'Sin registro',
      valorNuevo: `${guardada.estado} · RD$ ${guardada.costoTotalRD}`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return guardada;
  }

  async devolverRenta(params: {
    empresaId: string;
    rentaId: string;
    fechaDevolucion?: string;
    notas?: string;
  }): Promise<Renta> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('Solo Coordinador o Admin pueden registrar la devolución de una renta.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const target = (snap.rentas ?? []).find((r) => r.id === params.rentaId);
    if (!target) {
      throw new Error('Renta no encontrada.');
    }
    const fechaDev = params.fechaDevolucion || obtenerFechaHoyAST();
    const actualizada: Renta = {
      ...target,
      estado: 'finalizada',
      fechaDevolucion: fechaDev,
      notas: params.notas ? `${target.notas ? `${target.notas} · ` : ''}${params.notas}` : target.notas,
      version: target.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.rentas = (snap.rentas ?? []).map((r) => (r.id === target.id ? actualizada : r));
    this.registrarEvento(snap, {
      entidadTipo: 'renta',
      entidadId: actualizada.id,
      accion: 'Renta finalizada / devuelta',
      detalle: `${actualizada.recursoEtiqueta || actualizada.recursoId} (${actualizada.proveedor}) devuelta el ${fechaDev}.`,
      valorAnterior: target.estado,
      valorNuevo: `finalizada (${fechaDev})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return actualizada;
  }

  async guardarPersonal(
    empresaId: string,
    item: Omit<Personal, 'id' | 'empresaId'> & { id?: string }
  ): Promise<Personal> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('No tienes permisos para administrar personal.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = item.id ? snap.personal.find((p) => p.id === item.id) : undefined;
    const record: Personal = {
      ...item,
      id: item.id || `per-${Date.now()}`,
      empresaId,
    };
    snap.personal = anterior
      ? snap.personal.map((p) => (p.id === record.id ? record : p))
      : [record, ...snap.personal];

    const valorAnterior = anterior
      ? `${anterior.activo ? 'Activo' : 'De baja'} (${anterior.cargo})`
      : 'Sin registro';
    const valorNuevo = `${record.activo ? 'Activo' : 'De baja'} (${record.cargo})`;
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: record.id,
      accion: anterior
        ? record.activo === anterior.activo
          ? 'Personal actualizado'
          : record.activo
          ? 'Personal reactivado'
          : 'Personal dado de baja'
        : 'Personal registrado',
      detalle: `${record.nombre} (${record.cargo}) → ${record.activo ? 'Activo' : 'De baja'}.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return record;
  }

  async guardarVehiculo(
    empresaId: string,
    item: Omit<Vehiculo, 'id' | 'empresaId'> & { id?: string }
  ): Promise<Vehiculo> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('No tienes permisos para administrar vehículos.');
    }
    const check = validarVehiculoConfig(item);
    if (!check.valido) {
      throw new Error(check.error || 'Datos de vehículo inválidos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = item.id ? snap.vehiculos.find((v) => v.id === item.id) : undefined;
    const record: Vehiculo = {
      ...item,
      id: item.id || `veh-${Date.now()}`,
      empresaId,
      etiqueta: item.etiqueta.trim(),
      placa: item.placa.trim().toUpperCase(),
    };
    snap.vehiculos = anterior
      ? snap.vehiculos.map((v) => (v.id === record.id ? record : v))
      : [record, ...snap.vehiculos];
    const valorAnterior = anterior
      ? `${anterior.estado} · ${anterior.tipoCombustible} · ${anterior.kmPorGal} km/gal`
      : 'Sin registro';
    const valorNuevo = `${record.estado} · ${record.tipoCombustible} · ${record.kmPorGal} km/gal`;
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: record.id,
      accion: anterior ? 'Vehículo actualizado' : 'Vehículo registrado',
      detalle: `${record.etiqueta} (${record.placa}) → estado: ${record.estado}, mant: ${record.mantenimientoPorKmRD}/km.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return record;
  }

  async guardarEquipo(
    empresaId: string,
    item: Omit<EquipoGNSS, 'id' | 'empresaId'> & { id?: string }
  ): Promise<EquipoGNSS> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('No tienes permisos para administrar equipos GNSS.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = item.id ? snap.equipos.find((e) => e.id === item.id) : undefined;
    const record: EquipoGNSS = {
      ...item,
      id: item.id || `eq-${Date.now()}`,
      empresaId,
    };
    snap.equipos = anterior
      ? snap.equipos.map((e) => (e.id === record.id ? record : e))
      : [record, ...snap.equipos];
    const valorAnterior = anterior ? anterior.estado : 'Sin registro';
    const valorNuevo = record.estado;
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: record.id,
      accion: anterior ? 'Equipo GNSS actualizado' : 'Equipo GNSS registrado',
      detalle: `${record.nombre} (${record.serial}) → estado: ${record.estado}.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return record;
  }

  async guardarCuadrilla(
    empresaId: string,
    item: Omit<Cuadrilla, 'id' | 'empresaId'> & { id?: string }
  ): Promise<Cuadrilla> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarCatalogos(sesion.rolActivo)) {
      throw new Error('No tienes permisos para administrar cuadrillas.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const anterior = item.id ? snap.cuadrillas.find((c) => c.id === item.id) : undefined;
    const miembroSet = new Set(item.miembroIds);
    if (item.jefeId) miembroSet.add(item.jefeId);
    const record: Cuadrilla = {
      ...item,
      miembroIds: Array.from(miembroSet),
      id: item.id || `cua-${Date.now()}`,
      empresaId,
    };
    snap.cuadrillas = anterior
      ? snap.cuadrillas.map((c) => (c.id === record.id ? record : c))
      : [record, ...snap.cuadrillas];

    const valorAnterior = anterior
      ? `${anterior.activa ? 'Activa' : 'De baja'} (${anterior.miembroIds.length} integrantes)`
      : 'Sin registro';
    const valorNuevo = `${record.activa ? 'Activa' : 'De baja'} (${record.miembroIds.length} integrantes)`;
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: record.id,
      accion: anterior
        ? record.activa === anterior.activa
          ? 'Cuadrilla actualizada'
          : record.activa
          ? 'Cuadrilla reactivada'
          : 'Cuadrilla dada de baja'
        : 'Cuadrilla creada',
      detalle: `${record.nombre} → ${record.activa ? 'Activa' : 'De baja'}.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: {
        valorAnterior,
        valorNuevo,
      },
    });
    this.guardarDB();
    return record;
  }

  async actualizarEmpresa(empresa: Empresa): Promise<Empresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarEmpresa(sesion.rolActivo)) {
      throw new Error('Solo el Administrador de la empresa puede modificar la configuración.');
    }
    const check = validarEmpresaConfig(empresa);
    if (!check.valido) {
      throw new Error(check.error || 'Datos de empresa inválidos.');
    }
    const snap = this.obtenerSnapshot(empresa.id);
    const anterior = snap.empresa;
    // Plan de suscripción y estado permanecen de solo lectura desde el cliente
    const actualizada: Empresa = {
      ...empresa,
      nombre: empresa.nombre.trim(),
      rnc: empresa.rnc.trim(),
      direccionBase: empresa.direccionBase.trim(),
      zonaHoraria: empresa.zonaHoraria.trim(),
      moneda: empresa.moneda.trim(),
      planMensualRD: anterior.planMensualRD,
      estadoSuscripcion: anterior.estadoSuscripcion,
      fechaAlta: anterior.fechaAlta,
    };
    this.db.empresas = this.db.empresas.map((e) => (e.id === actualizada.id ? actualizada : e));
    snap.empresa = actualizada;
    const valorAnterior = `${anterior.nombre} (${anterior.zonaHoraria} · ${anterior.moneda})`;
    const valorNuevo = `${actualizada.nombre} (${actualizada.zonaHoraria} · ${actualizada.moneda})`;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: actualizada.id,
      accion: 'Empresa actualizada',
      detalle: `Datos de "${actualizada.nombre}" (${actualizada.zonaHoraria}, ${actualizada.moneda}) actualizados.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: { valorAnterior, valorNuevo },
    });
    this.guardarDB();
    return actualizada;
  }

  async guardarMembresiaUsuario(params: {
    empresaId: string;
    email: string;
    nombre: string;
    rol: RolEmpresa;
    personalId?: string;
    activo: boolean;
  }): Promise<{ usuario: Usuario; rol: RolEmpresa }> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarEmpresa(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede gestionar usuarios y roles.');
    }
    const normEmail = params.email.trim().toLowerCase();
    let user = this.db.usuarios.find((u) => u.email.toLowerCase() === normEmail);
    if (!user) {
      user = {
        id: `usr-${Date.now()}`,
        email: normEmail,
        nombre: params.nombre.trim(),
        activo: params.activo,
        passwordDemo: 'demo123',
      };
      this.db.usuarios.push(user);
    } else {
      user.nombre = params.nombre.trim();
      user.activo = params.activo;
    }

    const memIdx = this.db.membresias.findIndex(
      (m) => m.usuarioId === user!.id && m.empresaId === params.empresaId
    );
    const nuevaMem: MembresiaEmpresa = {
      id: memIdx >= 0 ? this.db.membresias[memIdx].id : `mem-${Date.now()}`,
      usuarioId: user.id,
      empresaId: params.empresaId,
      rol: params.rol,
      personalId: params.personalId,
      activo: params.activo,
    };
    if (memIdx >= 0) {
      this.db.membresias[memIdx] = nuevaMem;
    } else {
      this.db.membresias.push(nuevaMem);
    }

    const snap = this.obtenerSnapshot(params.empresaId);
    snap.membresias = this.db.membresias.filter((m) => m.empresaId === params.empresaId);
    const cleanUser: Usuario = { id: user.id, email: user.email, nombre: user.nombre, activo: user.activo };
    snap.usuarios = snap.usuarios.some((u) => u.id === cleanUser.id)
      ? snap.usuarios.map((u) => (u.id === cleanUser.id ? cleanUser : u))
      : [...snap.usuarios, cleanUser];

    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: user.id,
      accion: 'Rol de usuario actualizado',
      detalle: `${cleanUser.nombre} (${cleanUser.email}) asignado como ${params.rol} (${params.activo ? 'activo' : 'inactivo'}).`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return { usuario: cleanUser, rol: params.rol };
  }

  async actualizarAccesoMembresia(params: {
    empresaId: string;
    usuarioId: string;
    rol: RolEmpresa;
    activo: boolean;
  }): Promise<void> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarEmpresa(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede modificar roles o acceso de usuarios.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const mem = this.db.membresias.find(
      (m) => m.empresaId === params.empresaId && m.usuarioId === params.usuarioId
    );
    if (!mem) {
      throw new Error('No se encontró la membresía del usuario en esta empresa.');
    }
    if (params.usuarioId === sesion.usuario.id && !params.activo) {
      throw new Error('No puedes desactivar tu propio acceso activo como Administrador.');
    }

    const valorAnterior = `${mem.rol} (${mem.activo ? 'activo' : 'inactivo'})`;
    mem.rol = params.rol;
    mem.activo = params.activo;

    const user = this.db.usuarios.find((u) => u.id === params.usuarioId);
    if (user) {
      const tieneAlgunaActiva = this.db.membresias.some(
        (m) => m.usuarioId === user.id && m.activo
      );
      user.activo = tieneAlgunaActiva;
      snap.usuarios = snap.usuarios.map((u) =>
        u.id === user.id ? { ...u, activo: params.activo } : u
      );
    }
    snap.membresias = this.db.membresias.filter((m) => m.empresaId === params.empresaId);

    const valorNuevo = `${params.rol} (${params.activo ? 'activo' : 'inactivo'})`;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: params.usuarioId,
      accion: 'Acceso de usuario actualizado',
      detalle: `${user?.nombre || params.usuarioId} cambió a ${valorNuevo}.`,
      valorAnterior,
      valorNuevo,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: { valorAnterior, valorNuevo },
    });
    this.guardarDB();
  }

  async guardarCargoConfig(
    empresaId: string,
    cargo: Pick<CargoConfig, 'codigo' | 'etiqueta' | 'activo'>
  ): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede editar el catálogo de cargos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const existente = config.cargos.find((c) => c.codigo === cargo.codigo);
    const check = validarCargoConfig({
      codigo: cargo.codigo,
      etiqueta: cargo.etiqueta,
      existentes: config.cargos,
      esEdicion: Boolean(existente),
    });
    if (!check.valido || !check.codigoNormalizado) {
      throw new Error(check.error || 'Cargo inválido.');
    }

    const nuevoCargo: CargoConfig = {
      codigo: check.codigoNormalizado,
      etiqueta: cargo.etiqueta.trim(),
      esBase: existente?.esBase ?? false,
      activo: cargo.activo,
    };

    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      cargos: existente
        ? config.cargos.map((c) => (c.codigo === nuevoCargo.codigo ? nuevoCargo : c))
        : [...config.cargos, nuevoCargo],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;

    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: nuevoCargo.codigo,
      accion: existente ? 'Cargo actualizado' : 'Cargo creado',
      detalle: `Cargo "${nuevoCargo.etiqueta}" [${nuevoCargo.codigo}] (${nuevoCargo.activo ? 'activo' : 'inactivo'}).`,
      valorAnterior: existente ? `${existente.etiqueta} (${existente.activo ? 'activo' : 'inactivo'})` : 'Sin registro',
      valorNuevo: `${nuevoCargo.etiqueta} (${nuevoCargo.activo ? 'activo' : 'inactivo'})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async eliminarCargoConfig(empresaId: string, codigo: string): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede eliminar cargos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const config = asegurarConfiguracionEmpresa(empresaId, snap.configuracion);
    const check = validarEliminarCargo({
      codigo,
      cargos: config.cargos,
      personal: snap.personal,
    });
    if (!check.valido) {
      throw new Error(check.error || 'No se puede eliminar el cargo.');
    }
    const eliminado = config.cargos.find((c) => c.codigo === codigo);
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      cargos: config.cargos.filter((c) => c.codigo !== codigo),
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: codigo,
      accion: 'Cargo eliminado',
      detalle: `Se eliminó el cargo "${eliminado?.etiqueta || codigo}" [${codigo}].`,
      valorAnterior: eliminado?.etiqueta || codigo,
      valorNuevo: 'Eliminado',
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async crearTipoCombustible(params: {
    empresaId: string;
    nombre: string;
    precioGalonRD: number;
    vigenciaDesde: string;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede crear combustibles.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const check = validarNuevoTipoCombustible({
      nombre: params.nombre,
      existentes: config.combustibles,
      precioGalonRD: params.precioGalonRD,
      vigenciaDesde: params.vigenciaDesde,
    });
    if (!check.valido || !check.idNormalizado) {
      throw new Error(check.error || 'Datos de combustible inválidos.');
    }
    const nuevo = {
      id: check.idNormalizado,
      nombre: params.nombre.trim(),
      activo: true,
      versiones: [
        {
          version: 1,
          vigenciaDesde: params.vigenciaDesde,
          precioGalonRD: params.precioGalonRD,
        },
      ],
    };
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      combustibles: [...config.combustibles, nuevo],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: nuevo.id,
      accion: 'Combustible agregado',
      detalle: `Tipo de combustible "${nuevo.nombre}" @ RD$ ${params.precioGalonRD}/gal desde ${params.vigenciaDesde}.`,
      valorAnterior: 'Sin registro',
      valorNuevo: `RD$ ${params.precioGalonRD}/gal (v1 · ${params.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaCombustible(params: {
    empresaId: string;
    combustibleId: string;
    precioGalonRD: number;
    vigenciaDesde: string;
    activo?: boolean;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar precios de combustible.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const target = config.combustibles.find((c) => c.id === params.combustibleId);
    if (!target) {
      throw new Error('Tipo de combustible no encontrado.');
    }
    const check = validarNuevaVigenciaCombustible(target.versiones, {
      vigenciaDesde: params.vigenciaDesde,
      precioGalonRD: params.precioGalonRD,
    });
    if (!check.valido) {
      throw new Error(check.error || 'Vigencia de combustible inválida.');
    }
    const nextVersionNum = siguienteVersion(target.versiones);
    const nuevaVersion = {
      version: nextVersionNum,
      vigenciaDesde: params.vigenciaDesde,
      precioGalonRD: params.precioGalonRD,
    };
    const ultimaVersion = target.versiones[target.versiones.length - 1];
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      combustibles: config.combustibles.map((c) =>
        c.id === params.combustibleId
          ? {
              ...c,
              activo: params.activo ?? c.activo,
              versiones: [...c.versiones, nuevaVersion],
            }
          : c
      ),
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: target.id,
      accion: 'Tarifa de combustible versionada',
      detalle: `${target.nombre}: nueva vigencia desde ${params.vigenciaDesde} a ${params.precioGalonRD}/gal (v${nextVersionNum}).`,
      valorAnterior: ultimaVersion ? `${ultimaVersion.precioGalonRD}/gal (${ultimaVersion.vigenciaDesde})` : undefined,
      valorNuevo: `${params.precioGalonRD}/gal (${params.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async crearServicioCatalogo(params: {
    empresaId: string;
    codigo: string;
    nombre: string;
    subtitulo: string;
    tarifaInicial: Omit<TarifaServicioVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede crear servicios del catálogo.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const check = validarNuevoServicioCatalogo({
      codigo: params.codigo,
      nombre: params.nombre,
      subtitulo: params.subtitulo,
      existentes: config.servicios,
      tarifaInicial: params.tarifaInicial,
    });
    if (!check.valido || !check.codigoNormalizado) {
      throw new Error(check.error || 'Servicio inválido.');
    }
    const nuevo: ServicioCatalogoConfig = {
      codigo: check.codigoNormalizado,
      nombre: params.nombre.trim(),
      subtitulo: params.subtitulo.trim() || 'Servicio Técnico',
      activo: true,
      versiones: [{ ...params.tarifaInicial, version: 1 }],
    };
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      servicios: [...config.servicios, nuevo],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: nuevo.codigo,
      accion: 'Servicio de catálogo agregado',
      detalle: `Servicio "${nuevo.nombre}" [${nuevo.codigo}] con base ${params.tarifaInicial.precioBaseRD} desde ${params.tarifaInicial.vigenciaDesde}.`,
      valorAnterior: 'Sin registro',
      valorNuevo: `Base ${params.tarifaInicial.precioBaseRD} (${params.tarifaInicial.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaServicio(params: {
    empresaId: string;
    servicioCodigo: string;
    nombre?: string;
    subtitulo?: string;
    activo?: boolean;
    tarifa: Omit<TarifaServicioVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar tarifas de servicios.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const target = config.servicios.find((s) => s.codigo === params.servicioCodigo);
    if (!target) {
      throw new Error('Servicio no encontrado en catálogo.');
    }
    const check = validarNuevaVigenciaServicio(target.versiones, params.tarifa);
    if (!check.valido) {
      throw new Error(check.error || 'Tarifa de servicio inválida.');
    }
    const nextVersionNum = siguienteVersion(target.versiones);
    const nuevaTarifa: TarifaServicioVersion = {
      ...params.tarifa,
      version: nextVersionNum,
    };
    const ultima = target.versiones[target.versiones.length - 1];
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      servicios: config.servicios.map((s) =>
        s.codigo === params.servicioCodigo
          ? {
              ...s,
              nombre: params.nombre?.trim() || s.nombre,
              subtitulo: params.subtitulo?.trim() || s.subtitulo,
              activo: params.activo ?? s.activo,
              versiones: [...s.versiones, nuevaTarifa],
            }
          : s
      ),
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: target.codigo,
      accion: 'Tarifa de servicio versionada',
      detalle: `${target.nombre}: nueva vigencia v${nextVersionNum} desde ${params.tarifa.vigenciaDesde} (base ${params.tarifa.precioBaseRD}).`,
      valorAnterior: ultima ? `Base ${ultima.precioBaseRD} (${ultima.vigenciaDesde})` : undefined,
      valorNuevo: `Base ${params.tarifa.precioBaseRD} (${params.tarifa.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaFactoresTerreno(params: {
    empresaId: string;
    factores: Omit<TerrenoFactorVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar factores de terreno.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const check = validarNuevaVigenciaTerreno(config.factoresTerreno, params.factores);
    if (!check.valido) {
      throw new Error(check.error || 'Factores de terreno inválidos.');
    }
    const nextVersionNum = siguienteVersion(config.factoresTerreno);
    const nueva: TerrenoFactorVersion = {
      ...params.factores,
      version: nextVersionNum,
    };
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      factoresTerreno: [...config.factoresTerreno, nueva],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: 'factores_terreno',
      accion: 'Factores de terreno versionados',
      detalle: `Vigencia v${nextVersionNum} desde ${nueva.vigenciaDesde}: Llano ${nueva.Llano}x, Ondulado ${nueva.Ondulado}x, Montañoso ${nueva.Montañoso}x.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaReglasViaticos(params: {
    empresaId: string;
    reglas: Omit<ReglasViaticosVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar reglas de viáticos y distancia.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const check = validarNuevaVigenciaReglasViaticos(config.reglasViaticos, params.reglas);
    if (!check.valido) {
      throw new Error(check.error || 'Reglas de viáticos inválidas.');
    }
    const nextVersionNum = siguienteVersion(config.reglasViaticos);
    const nueva: ReglasViaticosVersion = {
      ...params.reglas,
      version: nextVersionNum,
    };
    const ultima = config.reglasViaticos[config.reglasViaticos.length - 1];
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      reglasViaticos: [...config.reglasViaticos, nueva],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: 'reglas_viaticos',
      accion: 'Reglas de viáticos y GPS versionadas',
      detalle: `Vigencia v${nextVersionNum} desde ${nueva.vigenciaDesde}: GPS ${nueva.gpsRuta.tarifaPorKmRD}/km (mín ${nueva.gpsRuta.minimoKm} km, ${nueva.gpsRuta.conceptoDistancia}).`,
      valorAnterior: ultima
        ? `GPS ${ultima.gpsRuta.tarifaPorKmRD}/km · Dieta ${ultima.dietaCampoRD} (${ultima.vigenciaDesde})`
        : undefined,
      valorNuevo: `GPS ${nueva.gpsRuta.tarifaPorKmRD}/km · Dieta ${nueva.dietaCampoRD} (${nueva.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaTopeViatico(params: {
    empresaId: string;
    cargoCodigo: string;
    categoria: CategoriaViatico;
    vigenciaDesde: string;
    montoMaximoPorMisionRD: number;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede editar los topes de viáticos.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const existente = config.topesViatico.find(
      (t) => t.cargoCodigo === params.cargoCodigo && t.categoria === params.categoria
    );
    const versionesPrevias = existente?.versiones ?? [];
    const check = validarNuevaVigenciaTopeViatico(versionesPrevias, {
      vigenciaDesde: params.vigenciaDesde,
      montoMaximoPorMisionRD: params.montoMaximoPorMisionRD,
    });
    if (!check.valido) {
      throw new Error(check.error || 'Tope de viático inválido.');
    }
    const nextVer = siguienteVersion(versionesPrevias);
    const nuevaVer = {
      version: nextVer,
      vigenciaDesde: params.vigenciaDesde,
      montoMaximoPorMisionRD: params.montoMaximoPorMisionRD,
      esEjemploPendienteConfirmar: false,
    };
    const nextTopes = existente
      ? config.topesViatico.map((t) =>
          t.cargoCodigo === params.cargoCodigo && t.categoria === params.categoria
            ? { ...t, versiones: [...t.versiones, nuevaVer] }
            : t
        )
      : [
          ...config.topesViatico,
          {
            cargoCodigo: params.cargoCodigo,
            categoria: params.categoria,
            versiones: [nuevaVer],
          },
        ];

    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      topesViatico: nextTopes,
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    const etiquetaCargo = resolverEtiquetaCargo(params.cargoCodigo, config.cargos);
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: `${params.cargoCodigo}::${params.categoria}`,
      accion: 'Tope de viático actualizado',
      detalle: `${etiquetaCargo} · ${params.categoria}: tope por misión RD$ ${params.montoMaximoPorMisionRD.toLocaleString('en-US')} desde ${params.vigenciaDesde} (v${nextVer}).`,
      valorAnterior: versionesPrevias.length
        ? `RD$ ${versionesPrevias[versionesPrevias.length - 1].montoMaximoPorMisionRD}`
        : 'Sin tope',
      valorNuevo: `RD$ ${params.montoMaximoPorMisionRD} (${params.vigenciaDesde})`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async agregarVigenciaRendimientoFlota(params: {
    empresaId: string;
    regla: Omit<ReglaRendimientoFlotaVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar reglas de rendimiento y rentas.');
    }
    const snap = this.obtenerSnapshot(params.empresaId);
    const config = asegurarConfiguracionEmpresa(params.empresaId, snap.configuracion);
    const check = validarNuevaVigenciaRendimientoFlota(config.rendimientoFlota, params.regla);
    if (!check.valido) {
      throw new Error(check.error || 'Reglas de rendimiento de flota inválidas.');
    }
    const nextVer = siguienteVersion(config.rendimientoFlota);
    const nuevaVer: ReglaRendimientoFlotaVersion = {
      ...params.regla,
      version: nextVer,
      esEjemploPendienteConfirmar: false,
    };
    const nextConfig: ConfiguracionEmpresa = {
      ...config,
      rendimientoFlota: [...config.rendimientoFlota, nuevaVer],
      versionGlobal: config.versionGlobal + 1,
    };
    snap.configuracion = nextConfig;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: 'rendimiento_flota',
      accion: 'Parámetros de flota y cercanía versionados',
      detalle: `Fuente km: ${nuevaVer.fuenteKm} · Alerta rendimiento: ±${nuevaVer.umbralAlertaPct}% · Cercanía rentas: ${nuevaVer.umbralCercaniaRentaKm} km (desde ${nuevaVer.vigenciaDesde}).`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nextConfig;
  }

  async guardarOnboarding(
    empresaId: string,
    onboarding: EstadoOnboardingEmpresa
  ): Promise<EstadoOnboardingEmpresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeEditarConfiguracion(sesion.rolActivo)) {
      throw new Error('Solo el Administrador puede actualizar el asistente de configuración.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const next = asegurarEstadoOnboarding(empresaId, onboarding);
    snap.onboarding = next;
    this.guardarDB();
    return next;
  }

  obtenerTutorialesVistos(usuarioId: string): Partial<Record<RolEmpresa, boolean>> {
    try {
      const raw = localStorage.getItem(TUTORIALES_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<Record<RolEmpresa, boolean>>>;
      return parsed[usuarioId] ?? {};
    } catch {
      return {};
    }
  }

  marcarTutorialVisto(usuarioId: string, rol: RolEmpresa): Partial<Record<RolEmpresa, boolean>> {
    let all: Record<string, Partial<Record<RolEmpresa, boolean>>> = {};
    try {
      const raw = localStorage.getItem(TUTORIALES_STORAGE_KEY);
      if (raw) all = JSON.parse(raw) as Record<string, Partial<Record<RolEmpresa, boolean>>>;
    } catch {
      all = {};
    }
    const nextUser = { ...(all[usuarioId] ?? {}), [rol]: true };
    all[usuarioId] = nextUser;
    try {
      localStorage.setItem(TUTORIALES_STORAGE_KEY, JSON.stringify(all));
    } catch {
      // Ignore quota errors
    }
    return nextUser;
  }

  async sincronizarConServidor(empresaId: string): Promise<{
    snapshot: EstadoEmpresaSnapshot;
    ocrProcesados: number;
    sobrescritosLocales: AvisoSobrescrituraLWW[];
  }> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    let ocrProcesados = 0;
    const sobrescritosLocales: AvisoSobrescrituraLWW[] = [];

    // 1. Procesar OCR pendiente de la cola offline
    for (let i = 0; i < snap.viaticos.length; i++) {
      const v = snap.viaticos[i];
      if (v.syncStatus === 'needs_ocr' && v.pendingReceiptBase64) {
        try {
          const ocrRes = await fetch('/api/expenses/analyze-receipt', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-session-token': sesion.token,
            },
            body: JSON.stringify({
              imageBase64: v.pendingReceiptBase64,
              mimeType: v.pendingReceiptMime || 'image/jpeg',
            }),
          });
          if (ocrRes.ok) {
            const ocrJson = await ocrRes.json();
            const ex = ocrJson.extracted || {};
            const nextMonto =
              typeof ex.amountRD === 'number' && ex.amountRD > 0 ? ex.amountRD : v.montoRD;
            const repartosAjustados: RepartoProyecto[] =
              v.repartos.length === 1
                ? [{ proyectoId: v.repartos[0].proyectoId, montoRD: nextMonto }]
                : v.repartos;

            snap.viaticos[i] = {
              ...v,
              comercio: ex.merchant || v.comercio,
              montoRD: nextMonto,
              itbisRD: typeof ex.itbisRD === 'number' ? ex.itbisRD : v.itbisRD,
              ncf: ex.ncf || v.ncf,
              fechaIso: ex.dateIso || v.fechaIso,
              notas: ex.notes || v.notas,
              repartos: repartosAjustados,
              pendingReceiptBase64: undefined,
              syncStatus: 'pending',
              version: v.version + 1,
              updatedAt: new Date().toISOString(),
            };
            ocrProcesados++;
          }
        } catch {
          // Mantiene needs_ocr para siguiente reintento
        }
      }
    }

    // 2. Enviar snapshot al servidor y esperar ACK real con reconciliación LWW
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-token': sesion.token,
      },
      body: JSON.stringify({
        empresaId,
        snapshot: snap,
      }),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'El servidor no confirmó la sincronización.');
    }

    const ack = await res.json();
    const serverSnap = ack.snapshot as EstadoEmpresaSnapshot | undefined;

    if (serverSnap) {
      const recProyectos = reconciliarColeccionLWWConReporte(
        snap.proyectos,
        serverSnap.proyectos || []
      );
      const recRutas = reconciliarColeccionLWWConReporte(snap.rutas, serverSnap.rutas || []);
      const recServicios = reconciliarColeccionLWWConReporte(
        snap.servicios,
        serverSnap.servicios || []
      );
      const recAsignaciones = reconciliarColeccionLWWConReporte(
        snap.asignaciones,
        serverSnap.asignaciones || []
      );
      const recViaticos = reconciliarColeccionLWWConReporte(
        snap.viaticos,
        serverSnap.viaticos || []
      );

      for (const s of recServicios.sobrescritosLocales) {
        const ganador = recServicios.items.find((x) => x.id === s.id);
        sobrescritosLocales.push({
          entidadTipo: 'servicio',
          entidadId: s.id,
          descripcion: `Servicio "${ganador?.nombre || s.id}" actualizado por una versión más reciente del servidor.`,
          fecha: s.remotoUpdatedAt,
        });
      }
      for (const v of recViaticos.sobrescritosLocales) {
        const ganador = recViaticos.items.find((x) => x.id === v.id);
        if (sesion.rolActivo !== 'tecnico' || ganador?.creadoPorUsuarioId === sesion.usuario.id) {
          sobrescritosLocales.push({
            entidadTipo: 'viatico',
            entidadId: v.id,
            descripcion: `Viático "${ganador?.comercio || v.id}" actualizado por una versión más reciente del servidor.`,
            fecha: v.remotoUpdatedAt,
          });
        }
      }
      if (sesion.rolActivo !== 'tecnico') {
        for (const p of recProyectos.sobrescritosLocales) {
          sobrescritosLocales.push({
            entidadTipo: 'proyecto',
            entidadId: p.id,
            descripcion: `Proyecto ${p.id} sobrescrito por versión más reciente del servidor.`,
            fecha: p.remotoUpdatedAt,
          });
        }
        for (const r of recRutas.sobrescritosLocales) {
          sobrescritosLocales.push({
            entidadTipo: 'ruta',
            entidadId: r.id,
            descripcion: `Ruta ${r.id} sobrescrita por versión más reciente del servidor.`,
            fecha: r.remotoUpdatedAt,
          });
        }
        for (const a of recAsignaciones.sobrescritosLocales) {
          sobrescritosLocales.push({
            entidadTipo: 'asignacion',
            entidadId: a.id,
            descripcion: `Asignación ${a.id} sobrescrita por versión más reciente del servidor.`,
            fecha: a.remotoUpdatedAt,
          });
        }
      }

      snap.proyectos = recProyectos.items.map((p) => ({
        ...p,
        syncStatus: 'synced',
      }));
      snap.rutas = recRutas.items.map((r) => ({
        ...r,
        syncStatus: 'synced',
      }));
      snap.servicios = recServicios.items.map((s) => ({
        ...s,
        syncStatus: 'synced',
      }));
      snap.asignaciones = recAsignaciones.items.map((a) => ({ ...a, syncStatus: 'synced' }));
      snap.viaticos = recViaticos.items.map((v) =>
        v.syncStatus === 'needs_ocr' ? v : { ...v, syncStatus: 'synced' }
      );
      if (serverSnap.misiones) {
        const recMisiones = reconciliarColeccionLWWConReporte(
          snap.misiones ?? [],
          serverSnap.misiones
        );
        snap.misiones = recMisiones.items.map((m) => ({ ...m, syncStatus: 'synced' }));
      }
      if (serverSnap.rentas) {
        const recRentas = reconciliarColeccionLWWConReporte(snap.rentas ?? [], serverSnap.rentas);
        snap.rentas = recRentas.items.map((r) => ({ ...r, syncStatus: 'synced' }));
      }
      snap.bitacoras = snap.bitacoras.map((b) => ({ ...b, syncStatus: 'synced' }));
      snap.lastSyncedAt = ack.lastSyncedAt;
    }

    this.guardarDB();
    return {
      snapshot: structuredClone(snap),
      ocrProcesados,
      sobrescritosLocales,
    };
  }
}

export const repositorioOperacion: RepositorioOperacion = new LocalRepositorioOperacion();
