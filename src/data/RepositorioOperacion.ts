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
  EstadoPresupuestoProyecto,
  EstadoServicio,
  LineaPresupuestoProyecto,
  Mision,
  Personal,
  PresupuestoProyecto,
  ProyeccionSnapshotPorRol,
  Proyecto,
  ReglaRendimientoFlotaVersion,
  ReglasViaticosVersion,
  Renta,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Servicio,
  SesionActiva,
  TarifaServicioVersion,
  TerrenoFactorVersion,
  Usuario,
  Vehiculo,
  Viatico,
} from '../types/domain';
import type { PayloadTransicionServicio } from '../domain/estados';

export interface CuentaDemoInfo {
  email: string;
  passwordDemo: string;
  nombre: string;
  descripcion: string;
}

export interface RepositorioOperacion {
  // F1: Autenticación, multiempresa y caché offline
  esModoDemoActivo(): boolean;
  listarCuentasDemo(): CuentaDemoInfo[];
  iniciarSesion(email: string, password: string): Promise<SesionActiva>;
  obtenerSesionGuardada(): SesionActiva | null;
  cerrarSesion(): Promise<void>;
  listarEmpresasDeUsuario(usuarioId: string): Promise<Array<{ empresa: Empresa; rol: RolEmpresa }>>;
  cambiarEmpresaActiva(empresaId: string): Promise<SesionActiva>;

  // Snapshot operativo proyectado por rol (admin/coordinador vs SnapshotTecnico)
  cargarSnapshotEmpresa(empresaId: string): Promise<EstadoEmpresaSnapshot>;
  cargarSnapshotParaRol(params: {
    empresaId: string;
    rol: RolEmpresa;
    usuarioId: string;
    personalIdMembresia?: string;
  }): Promise<ProyeccionSnapshotPorRol>;

  // F2: Clientes y Proyectos
  crearCliente(
    empresaId: string,
    datos: Omit<Cliente, 'id' | 'empresaId'>
  ): Promise<Cliente>;
  actualizarCliente(empresaId: string, cliente: Cliente): Promise<Cliente>;
  crearProyecto(
    empresaId: string,
    datos: Omit<
      Proyecto,
      'id' | 'empresaId' | 'estado' | 'fechaCreacion' | 'version' | 'updatedAt' | 'syncStatus'
    > & { estado?: EstadoServicio; progresoPct?: number }
  ): Promise<Proyecto>;
  actualizarProyecto(empresaId: string, proyecto: Proyecto): Promise<Proyecto>;
  crearVersionPresupuestoProyecto(params: {
    empresaId: string;
    proyectoId: string;
    vigenciaDesde: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
    aprobarInmediatamente?: boolean;
  }): Promise<PresupuestoProyecto>;
  editarBorradorPresupuestoProyecto(params: {
    empresaId: string;
    presupuestoId: string;
    vigenciaDesde?: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
  }): Promise<PresupuestoProyecto>;
  transicionarPresupuestoProyecto(params: {
    empresaId: string;
    presupuestoId: string;
    nuevoEstado: EstadoPresupuestoProyecto;
    motivo?: string;
  }): Promise<PresupuestoProyecto>;

  // F3: Rutas desde KMZ/KML/GeoJSON
  crearRuta(
    empresaId: string,
    datos: Omit<Ruta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Ruta>;
  actualizarRuta(empresaId: string, ruta: Ruta): Promise<Ruta>;

  // F4, F7, F8: Servicios y Bitácora
  crearServicio(
    empresaId: string,
    datos: Omit<Servicio, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Servicio>;
  actualizarServicio(empresaId: string, servicio: Servicio): Promise<Servicio>;
  transicionarServicio(params: {
    empresaId: string;
    servicioId: string;
    nuevoEstado: EstadoServicio;
    payload?: PayloadTransicionServicio;
  }): Promise<Servicio>;
  agregarBitacora(
    empresaId: string,
    datos: Omit<BitacoraEntrada, 'id' | 'empresaId' | 'fechaAST' | 'syncStatus'>
  ): Promise<BitacoraEntrada>;

  // F5, F6: Asignaciones por rango de fechas y conflictos
  guardarAsignacion(
    empresaId: string,
    datos: Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ): Promise<Asignacion>;
  eliminarAsignacion(empresaId: string, asignacionId: string): Promise<void>;

  // F9, F10, F11: Viáticos y reparto exacto
  registrarViatico(
    empresaId: string,
    datos: Omit<
      Viatico,
      'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'
    >
  ): Promise<Viatico>;
  editarViatico(
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
  ): Promise<Viatico>;
  actualizarRepartoViatico(
    empresaId: string,
    viaticoId: string,
    repartos: RepartoProyecto[]
  ): Promise<Viatico>;
  decidirViatico(params: {
    empresaId: string;
    viaticoId: string;
    nuevoEstado: EstadoAprobacionViatico;
    motivoRechazo?: string;
    motivoDecision?: string;
    decisionExcedente?: DecisionExcedenteViatico;
  }): Promise<Viatico>;
  eliminarViatico(empresaId: string, viaticoId: string): Promise<void>;

  // B3: Misiones y rentas de vehículos/equipos
  crearMision(
    empresaId: string,
    datos: Omit<Mision, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ): Promise<Mision>;
  guardarRenta(
    empresaId: string,
    datos: Omit<Renta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
      id?: string;
    }
  ): Promise<Renta>;
  devolverRenta(params: {
    empresaId: string;
    rentaId: string;
    fechaDevolucion?: string;
    notas?: string;
  }): Promise<Renta>;

  // Catálogos y Administración de Empresa / Usuarios
  guardarPersonal(empresaId: string, item: Omit<Personal, 'id' | 'empresaId'> & { id?: string }): Promise<Personal>;
  guardarVehiculo(empresaId: string, item: Omit<Vehiculo, 'id' | 'empresaId'> & { id?: string }): Promise<Vehiculo>;
  guardarEquipo(empresaId: string, item: Omit<EquipoGNSS, 'id' | 'empresaId'> & { id?: string }): Promise<EquipoGNSS>;
  guardarCuadrilla(empresaId: string, item: Omit<Cuadrilla, 'id' | 'empresaId'> & { id?: string }): Promise<Cuadrilla>;
  actualizarEmpresa(empresa: Empresa): Promise<Empresa>;
  guardarMembresiaUsuario(params: {
    empresaId: string;
    email: string;
    nombre: string;
    rol: RolEmpresa;
    personalId?: string;
    activo: boolean;
  }): Promise<{ usuario: Usuario; rol: RolEmpresa }>;
  actualizarAccesoMembresia(params: {
    empresaId: string;
    usuarioId: string;
    rol: RolEmpresa;
    activo: boolean;
  }): Promise<void>;

  // A1: Configuración versionada con vigencias
  guardarCargoConfig(
    empresaId: string,
    cargo: Pick<CargoConfig, 'codigo' | 'etiqueta' | 'activo'>
  ): Promise<ConfiguracionEmpresa>;
  eliminarCargoConfig(empresaId: string, codigo: string): Promise<ConfiguracionEmpresa>;
  crearTipoCombustible(params: {
    empresaId: string;
    nombre: string;
    precioGalonRD: number;
    vigenciaDesde: string;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaCombustible(params: {
    empresaId: string;
    combustibleId: string;
    precioGalonRD: number;
    vigenciaDesde: string;
    activo?: boolean;
  }): Promise<ConfiguracionEmpresa>;
  crearServicioCatalogo(params: {
    empresaId: string;
    codigo: string;
    nombre: string;
    subtitulo: string;
    tarifaInicial: Omit<TarifaServicioVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaServicio(params: {
    empresaId: string;
    servicioCodigo: string;
    nombre?: string;
    subtitulo?: string;
    activo?: boolean;
    tarifa: Omit<TarifaServicioVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaFactoresTerreno(params: {
    empresaId: string;
    factores: Omit<TerrenoFactorVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaReglasViaticos(params: {
    empresaId: string;
    reglas: Omit<ReglasViaticosVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaTopeViatico(params: {
    empresaId: string;
    cargoCodigo: string;
    categoria: CategoriaViatico;
    vigenciaDesde: string;
    montoMaximoPorMisionRD: number;
  }): Promise<ConfiguracionEmpresa>;
  agregarVigenciaRendimientoFlota(params: {
    empresaId: string;
    regla: Omit<ReglaRendimientoFlotaVersion, 'version'>;
  }): Promise<ConfiguracionEmpresa>;

  // A2: Onboarding opcional por empresa
  guardarOnboarding(
    empresaId: string,
    onboarding: EstadoOnboardingEmpresa
  ): Promise<EstadoOnboardingEmpresa>;

  // A3: Estado de tutorial visual por usuario/perfil
  obtenerTutorialesVistos(usuarioId: string): Partial<Record<RolEmpresa, boolean>>;
  marcarTutorialVisto(usuarioId: string, rol: RolEmpresa): Partial<Record<RolEmpresa, boolean>>;

  // F15: Sincronización LWW y OCR pendiente
  sincronizarConServidor(empresaId: string): Promise<{
    snapshot: EstadoEmpresaSnapshot;
    ocrProcesados: number;
    sobrescritosLocales: AvisoSobrescrituraLWW[];
  }>;
}

