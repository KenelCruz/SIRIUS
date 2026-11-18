import {
  detectarConflictosAsignacion,
  obtenerRutasAsignadasAUsuario,
  puedeAprobarViatico,
  puedeCrearOEditarOperacion,
  puedeGestionarCatalogos,
  puedeGestionarEmpresa,
  puedeRegistrarBitacoraEnServicio,
  reconciliarColeccionLWW,
  validarDecisionViatico,
  validarRangoFechas,
  validarRepartoViatico,
  validarResolucionConflictos,
  validarTransicionServicio,
} from '../domain';
import type { PayloadTransicionServicio } from '../domain/estados';
import type {
  Asignacion,
  BitacoraEntrada,
  Cliente,
  Cuadrilla,
  Empresa,
  EquipoGNSS,
  EstadoAprobacionViatico,
  EstadoEmpresaSnapshot,
  EstadoServicio,
  HistorialEvento,
  MembresiaEmpresa,
  Personal,
  Proyecto,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Servicio,
  SesionActiva,
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

const DB_STORAGE_KEY = 'geomatrix_saas_db_v2';
const SESSION_STORAGE_KEY = 'geomatrix_saas_session_v2';

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
  const empresas: Empresa[] = [
    {
      id: 'emp-aia',
      nombre: 'AIA Services',
      rnc: '1-31-84920-4',
      telefono: '809-555-0142',
      direccionBase: 'Av. 27 de Febrero #340, Santo Domingo',
      baseLat: 18.4861,
      baseLon: -69.9312,
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
      fechaCreacion: '2026-11-10',
      notas: 'Contrato marco zona este con entrega en Jurisdicción Inmobiliaria.',
      version: 1,
      updatedAt: '2026-11-17T09:15:00-04:00',
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
      fechaCreacion: '2026-11-12',
      notas: 'Incluye levantamiento planimétrico y altimétrico para drenaje pluvial.',
      version: 1,
      updatedAt: '2026-11-16T16:40:00-04:00',
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
      fechaCreacion: '2026-11-05',
      notas: 'Expediente depositado en Mensuras Catastrales.',
      version: 1,
      updatedAt: '2026-11-15T14:05:00-04:00',
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
      fechaPrevista: '2026-11-18',
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
      updatedAt: '2026-11-17T09:15:00-04:00',
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
      fechaPrevista: '2026-11-20',
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
      updatedAt: '2026-11-16T16:40:00-04:00',
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
      fechaPrevista: '2026-11-22',
      kmzFileName: 'Finca_Yamasa_LoteB.kmz',
      features: [f3],
      centroid: computeCentroid(f3.points),
      totalAreaM2: f3.areaM2,
      totalPerimeterM: f3.perimeterM,
      version: 1,
      updatedAt: '2026-11-16T11:22:00-04:00',
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
      fechaPrevista: '2026-11-10',
      kmzFileName: 'Parque_Haina_Zona_Franca.kmz',
      features: [f4],
      centroid: computeCentroid(f4.points),
      totalAreaM2: f4.areaM2,
      totalPerimeterM: f4.perimeterM,
      version: 1,
      updatedAt: '2026-11-15T14:05:00-04:00',
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
      fechaRealInicio: '2026-11-18',
      notas: 'Replanteo de 4 hitos de hormigón y verificación lindero oeste.',
      version: 2,
      updatedAt: '2026-11-18T08:30:00-04:00',
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
      updatedAt: '2026-11-17T10:00:00-04:00',
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
      updatedAt: '2026-11-16T16:40:00-04:00',
      syncStatus: 'synced',
    },
    {
      id: 'srv-4',
      empresaId: 'emp-aia',
      rutaId: 'ruta-3',
      tipoServicioId: 'rtk',
      nombre: 'Mensura Finca Cacaotera',
      cotizacionRD: 45000,
      estado: 'aprobado',
      version: 1,
      updatedAt: '2026-11-16T12:00:00-04:00',
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
      fechaRealInicio: '2026-11-10',
      fechaRealFin: '2026-11-12',
      notas: 'Listo para gestión de cobro.',
      version: 3,
      updatedAt: '2026-11-15T14:05:00-04:00',
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
      fechaAST: '18/11/2026 08:45:00 AST',
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
      fechaInicio: '2026-11-18',
      fechaFin: '2026-11-19',
      cuadrillaId: 'cua-1',
      vehiculoIds: ['veh-1'],
      equipoIds: ['eq-1'],
      version: 1,
      updatedAt: '2026-11-17T11:00:00-04:00',
      syncStatus: 'synced',
    },
    {
      id: 'asig-2',
      empresaId: 'emp-aia',
      rutaId: 'ruta-2',
      fechaInicio: '2026-11-20',
      fechaFin: '2026-11-22',
      cuadrillaId: 'cua-2',
      vehiculoIds: ['veh-2'],
      equipoIds: ['eq-2'],
      version: 1,
      updatedAt: '2026-11-17T11:15:00-04:00',
      syncStatus: 'synced',
    },
  ];

  const viaticosAia: Viatico[] = [
    {
      id: 'via-1',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      rutaId: 'ruta-1',
      fechaIso: '2026-11-18',
      timestampAST: '18/11/2026 07:42:15 AST',
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
      aprobadoEn: '18/11/2026 09:00:00 AST',
      repartos: [
        { proyectoId: 'proy-1', montoRD: 3850 },
        { proyectoId: 'sin_asignar', montoRD: 650 },
      ],
      notas: 'Tanque lleno Hilux #1; excedente reserva para próxima salida.',
      version: 2,
      updatedAt: '2026-11-18T09:00:00-04:00',
      syncStatus: 'synced',
    },
    {
      id: 'via-2',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      rutaId: 'ruta-1',
      fechaIso: '2026-11-18',
      timestampAST: '18/11/2026 07:18:04 AST',
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
      aprobadoEn: '18/11/2026 09:05:00 AST',
      repartos: [{ proyectoId: 'proy-1', montoRD: 400 }],
      notas: 'Ida y vuelta autopista del Este',
      version: 1,
      updatedAt: '2026-11-18T09:05:00-04:00',
      syncStatus: 'synced',
    },
    {
      id: 'via-3',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec1',
      creadoPorNombre: 'Ing. Carlos Méndez',
      rutaId: 'ruta-1',
      fechaIso: '2026-11-18',
      timestampAST: '18/11/2026 12:15:00 AST',
      categoria: 'Dieta',
      comercio: 'Dieta de Campo — Brigada Este Alpha',
      montoRD: 4400,
      itbisRD: 0,
      metodo: 'Dieta Automática',
      estadoAprobacion: 'pendiente',
      repartos: [{ proyectoId: 'proy-1', montoRD: 4400 }],
      notas: 'Jornada de 2 personas en campo',
      version: 1,
      updatedAt: '2026-11-18T12:15:00-04:00',
      syncStatus: 'synced',
    },
    {
      id: 'via-4',
      empresaId: 'emp-aia',
      creadoPorUsuarioId: 'usr-tec2',
      creadoPorNombre: 'Agrim. Laura Ramírez',
      rutaId: 'ruta-4',
      fechaIso: '2026-11-10',
      timestampAST: '10/11/2026 08:25:12 AST',
      categoria: 'Combustible',
      comercio: 'TotalEnergies 6 de Noviembre',
      montoRD: 2100,
      itbisRD: 0,
      ncf: 'B0100077431',
      metodo: 'OCR Móvil',
      estadoAprobacion: 'aprobado',
      aprobadoPorUsuarioId: 'usr-coord',
      aprobadoEn: '10/11/2026 17:00:00 AST',
      repartos: [{ proyectoId: 'proy-3', montoRD: 2100 }],
      notas: 'Traslado brigada San Cristóbal',
      version: 1,
      updatedAt: '2026-11-10T17:00:00-04:00',
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
    historial: [],
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
    historial: historialAia,
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
          return parsed;
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

  listarCuentasDemo(): CuentaDemoInfo[] {
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
    const actualizado: Proyecto = {
      ...proyecto,
      version: proyecto.version + 1,
      updatedAt: new Date().toISOString(),
      syncStatus: 'pending',
    };
    snap.proyectos = snap.proyectos.map((p) => (p.id === actualizado.id ? actualizado : p));
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
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return nuevo;
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
    this.registrarEvento(snap, {
      entidadTipo: 'servicio',
      entidadId: updated.id,
      accion: `Estado servicio -> ${updated.estado}`,
      detalle: `"${updated.nombre}" pasó de ${servicio.estado} a ${updated.estado}${detalleCobro}.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
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

    this.registrarEvento(snap, {
      entidadTipo: 'asignacion',
      entidadId: guardada.id,
      accion: guardada.overrideConflicto ? 'Asignación con override de conflicto' : 'Asignación programada',
      detalle: `${cuadrilla?.nombre || guardada.cuadrillaId} → ${ruta?.codigoParcela || guardada.rutaId} (${guardada.fechaInicio} al ${guardada.fechaFin})${
        guardada.overrideConflicto ? ` · Motivo excepción: ${guardada.overrideConflicto.motivo}` : ''
      }`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
      metadata: guardada.overrideConflicto
        ? {
            overrideMotivo: guardada.overrideConflicto.motivo,
            overrideFecha: guardada.overrideConflicto.fecha,
          }
        : undefined,
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
    snap.asignaciones = snap.asignaciones.filter((a) => a.id !== asignacionId);
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
    const nuevo: Viatico = {
      ...datos,
      id: `via-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      empresaId,
      estadoAprobacion: 'pendiente',
      version: 1,
      updatedAt: new Date().toISOString(),
    };
    snap.viaticos = [nuevo, ...snap.viaticos];
    this.registrarEvento(snap, {
      entidadTipo: 'viatico',
      entidadId: nuevo.id,
      accion: 'Viático registrado',
      detalle: `${nuevo.comercio} (${nuevo.categoria}) por RD$ ${nuevo.montoRD.toLocaleString('en-US')} [${nuevo.metodo}].`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
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
    if (!puedeAprobarViatico(sesion.rolActivo)) {
      throw new Error('Solo Coordinador o Admin pueden redistribuir el reparto a proyectos.');
    }
    const snap = this.obtenerSnapshot(empresaId);
    const viatico = snap.viaticos.find((v) => v.id === viaticoId);
    if (!viatico) throw new Error('Viático no encontrado.');

    const check = validarRepartoViatico(viatico.montoRD, repartos);
    if (!check.valido) throw new Error(check.error);

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
      detalle: `Reparto recalculado para ${actualizado.comercio}: ${repartos
        .map((r) => `${r.proyectoId}: RD$ ${r.montoRD}`)
        .join(' · ')}`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return actualizado;
  }

  async decidirViatico(params: {
    empresaId: string;
    viaticoId: string;
    nuevoEstado: EstadoAprobacionViatico;
    motivoRechazo?: string;
  }): Promise<Viatico> {
    const sesion = this.obtenerSesionRequerida();
    const check = validarDecisionViatico({
      rol: sesion.rolActivo,
      nuevoEstado: params.nuevoEstado,
      motivoRechazo: params.motivoRechazo,
    });
    if (!check.valido) throw new Error(check.error);

    const snap = this.obtenerSnapshot(params.empresaId);
    const viatico = snap.viaticos.find((v) => v.id === params.viaticoId);
    if (!viatico) throw new Error('Viático no encontrado.');

    const actualizado: Viatico = {
      ...viatico,
      estadoAprobacion: params.nuevoEstado,
      motivoRechazo: params.nuevoEstado === 'rechazado' ? params.motivoRechazo?.trim() : undefined,
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
          ? 'Viático aprobado'
          : params.nuevoEstado === 'rechazado'
          ? 'Viático rechazado'
          : 'Viático devuelto a pendiente',
      detalle: `${actualizado.comercio} (RD$ ${actualizado.montoRD.toLocaleString('en-US')})${
        actualizado.motivoRechazo ? ` · Motivo: ${actualizado.motivoRechazo}` : ''
      }`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return actualizado;
  }

  async eliminarViatico(empresaId: string, viaticoId: string): Promise<void> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    const target = snap.viaticos.find((v) => v.id === viaticoId);
    if (!target) return;
    if (
      sesion.rolActivo === 'tecnico' &&
      (target.creadoPorUsuarioId !== sesion.usuario.id || target.estadoAprobacion !== 'pendiente')
    ) {
      throw new Error('Solo puedes eliminar tus propios viáticos pendientes.');
    }
    snap.viaticos = snap.viaticos.filter((v) => v.id !== viaticoId);
    this.guardarDB();
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
    const record: Personal = {
      ...item,
      id: item.id || `per-${Date.now()}`,
      empresaId,
    };
    const existe = snap.personal.some((p) => p.id === record.id);
    snap.personal = existe
      ? snap.personal.map((p) => (p.id === record.id ? record : p))
      : [record, ...snap.personal];
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
    const snap = this.obtenerSnapshot(empresaId);
    const record: Vehiculo = {
      ...item,
      id: item.id || `veh-${Date.now()}`,
      empresaId,
    };
    const existe = snap.vehiculos.some((v) => v.id === record.id);
    snap.vehiculos = existe
      ? snap.vehiculos.map((v) => (v.id === record.id ? record : v))
      : [record, ...snap.vehiculos];
    this.registrarEvento(snap, {
      entidadTipo: 'catalogo',
      entidadId: record.id,
      accion: 'Vehículo actualizado',
      detalle: `${record.etiqueta} (${record.placa}) → estado: ${record.estado}.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
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
    const record: EquipoGNSS = {
      ...item,
      id: item.id || `eq-${Date.now()}`,
      empresaId,
    };
    const existe = snap.equipos.some((e) => e.id === record.id);
    snap.equipos = existe
      ? snap.equipos.map((e) => (e.id === record.id ? record : e))
      : [record, ...snap.equipos];
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
    const miembroSet = new Set(item.miembroIds);
    if (item.jefeId) miembroSet.add(item.jefeId);
    const record: Cuadrilla = {
      ...item,
      miembroIds: Array.from(miembroSet),
      id: item.id || `cua-${Date.now()}`,
      empresaId,
    };
    const existe = snap.cuadrillas.some((c) => c.id === record.id);
    snap.cuadrillas = existe
      ? snap.cuadrillas.map((c) => (c.id === record.id ? record : c))
      : [record, ...snap.cuadrillas];
    this.guardarDB();
    return record;
  }

  async actualizarEmpresa(empresa: Empresa): Promise<Empresa> {
    const sesion = this.obtenerSesionRequerida();
    if (!puedeGestionarEmpresa(sesion.rolActivo)) {
      throw new Error('Solo el Administrador de la empresa puede modificar la configuración.');
    }
    this.db.empresas = this.db.empresas.map((e) => (e.id === empresa.id ? empresa : e));
    const snap = this.obtenerSnapshot(empresa.id);
    snap.empresa = empresa;
    this.registrarEvento(snap, {
      entidadTipo: 'empresa',
      entidadId: empresa.id,
      accion: 'Empresa actualizada',
      detalle: `Datos de "${empresa.nombre}" (Plan RD$ ${empresa.planMensualRD}/mes) actualizados.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return empresa;
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
      detalle: `${cleanUser.nombre} (${cleanUser.email}) asignado como ${params.rol}.`,
      usuarioId: sesion.usuario.id,
      usuarioNombre: sesion.usuario.nombre,
    });
    this.guardarDB();
    return { usuario: cleanUser, rol: params.rol };
  }

  async sincronizarConServidor(empresaId: string): Promise<{
    snapshot: EstadoEmpresaSnapshot;
    ocrProcesados: number;
  }> {
    const sesion = this.obtenerSesionRequerida();
    const snap = this.obtenerSnapshot(empresaId);
    let ocrProcesados = 0;

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
      snap.proyectos = reconciliarColeccionLWW(snap.proyectos, serverSnap.proyectos || []).map((p) => ({
        ...p,
        syncStatus: 'synced',
      }));
      snap.rutas = reconciliarColeccionLWW(snap.rutas, serverSnap.rutas || []).map((r) => ({
        ...r,
        syncStatus: 'synced',
      }));
      snap.servicios = reconciliarColeccionLWW(snap.servicios, serverSnap.servicios || []).map((s) => ({
        ...s,
        syncStatus: 'synced',
      }));
      snap.asignaciones = reconciliarColeccionLWW(
        snap.asignaciones,
        serverSnap.asignaciones || []
      ).map((a) => ({ ...a, syncStatus: 'synced' }));
      snap.viaticos = reconciliarColeccionLWW(snap.viaticos, serverSnap.viaticos || []).map((v) =>
        v.syncStatus === 'needs_ocr' ? v : { ...v, syncStatus: 'synced' }
      );
      snap.bitacoras = snap.bitacoras.map((b) => ({ ...b, syncStatus: 'synced' }));
      snap.lastSyncedAt = ack.lastSyncedAt;
    }

    this.guardarDB();
    return {
      snapshot: structuredClone(snap),
      ocrProcesados,
    };
  }
}

export const repositorioOperacion: RepositorioOperacion = new LocalRepositorioOperacion();
