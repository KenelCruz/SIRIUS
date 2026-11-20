import type {
  CargoConfig,
  CategoriaViatico,
  ConceptoDistanciaGps,
  ConfiguracionEmpresa,
  Empresa,
  FuenteKmRendimiento,
  Personal,
  PresetViaticoConfig,
  ReglaRendimientoFlotaVersion,
  ReglasViaticosVersion,
  RolEmpresa,
  SeccionConfiguracion,
  ServicioCatalogoConfig,
  TarifaCombustibleVersion,
  TarifaServicioVersion,
  TerrenoFactorVersion,
  TipoCombustibleConfig,
  TopeViaticoCargoConfig,
  TopeViaticoCargoVersion,
  Vehiculo,
} from '../types/domain';
import { obtenerFechaHoyAST } from './tecnico';

export const CATEGORIAS_VIATICO: readonly CategoriaViatico[] = [
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro',
] as const;

export const CONCEPTOS_DISTANCIA_GPS: readonly ConceptoDistanciaGps[] = [
  'ida_vuelta',
  'solo_ida',
] as const;

export const FECHA_VIGENCIA_INICIAL = '2026-01-01';

export const ZONAS_HORARIAS_SUGERIDAS = [
  'America/Santo_Domingo',
  'America/Puerto_Rico',
  'America/New_York',
  'UTC',
] as const;

export const MONEDAS_SUGERIDAS = ['RD$', 'USD$', 'EUR€'] as const;

export const ETIQUETA_EJEMPLO_CONFIRMAR = 'EJEMPLO – PENDIENTE DE CONFIRMAR';
export const UMBRAL_CERCANIA_RENTA_KM_DEFAULT = 30;
export const UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT = 15;

export const FUENTES_KM_RENDIMIENTO: readonly FuenteKmRendimiento[] = [
  'ruta_asignada',
  'bitacora',
  'manual',
] as const;

export const CARGOS_BASE_INICIALES: CargoConfig[] = [
  { codigo: 'tecnico', etiqueta: 'Técnico', esBase: true, activo: true },
  { codigo: 'ingeniero', etiqueta: 'Ingeniero', esBase: true, activo: true },
  { codigo: 'jefe_brigada', etiqueta: 'Jefe de Brigada', esBase: true, activo: true },
  { codigo: 'chofer', etiqueta: 'Chofer', esBase: true, activo: true },
  { codigo: 'administrativo', etiqueta: 'Administrativo', esBase: true, activo: true },
];

const TOPES_JEFE_BRIGADA_EJEMPLO: Record<CategoriaViatico, number> = {
  Combustible: 5500,
  Dieta: 2800,
  Hospedaje: 5500,
  Peaje: 1500,
  Materiales: 4500,
  Otro: 2000,
};

export const TOPES_VIATICO_EJEMPLO_POR_CARGO: Record<
  string,
  Record<CategoriaViatico, number>
> = {
  tecnico: {
    Combustible: 4000,
    Dieta: 2200,
    Hospedaje: 4800,
    Peaje: 1200,
    Materiales: 3500,
    Otro: 1500,
  },
  ingeniero: {
    Combustible: 6000,
    Dieta: 3000,
    Hospedaje: 6500,
    Peaje: 1800,
    Materiales: 5000,
    Otro: 2500,
  },
  jefe_brigada: { ...TOPES_JEFE_BRIGADA_EJEMPLO },
  chofer: {
    Combustible: 8500,
    Dieta: 2200,
    Hospedaje: 4800,
    Peaje: 2500,
    Materiales: 1000,
    Otro: 1500,
  },
  administrativo: { ...TOPES_JEFE_BRIGADA_EJEMPLO },
};

export function crearTopesViaticoIniciales(): TopeViaticoCargoConfig[] {
  const resultado: TopeViaticoCargoConfig[] = [];
  for (const cargo of CARGOS_BASE_INICIALES) {
    const montos = TOPES_VIATICO_EJEMPLO_POR_CARGO[cargo.codigo] ?? TOPES_JEFE_BRIGADA_EJEMPLO;
    for (const categoria of CATEGORIAS_VIATICO) {
      resultado.push({
        cargoCodigo: cargo.codigo,
        categoria,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            montoMaximoPorMisionRD: montos[categoria],
            esEjemploPendienteConfirmar: true,
          },
        ],
      });
    }
  }
  return resultado;
}

export const PRESETS_RAPIDOS_INICIALES: PresetViaticoConfig[] = [
  {
    id: 'dieta_brigada',
    etiqueta: 'Dieta Brigada (2 Téc.)',
    categoria: 'Dieta',
    comercio: 'Dieta Estándar Brigada Campo',
    montoRD: 4400,
    notas: 'Desayuno y almuerzo para 2 técnicos (RD$ 2,200 c/u)',
  },
  {
    id: 'dieta_individual',
    etiqueta: 'Dieta Individual',
    categoria: 'Dieta',
    comercio: 'Dieta Individual Topógrafo',
    montoRD: 2200,
    notas: 'Alimentación jornada completa en campo',
  },
  {
    id: 'peaje_rd_vial',
    etiqueta: 'Peaje RD Vial',
    categoria: 'Peaje',
    comercio: 'RD Vial — Paso Rápido Autopista',
    montoRD: 200,
    notas: 'Tarifa ida/vuelta categoría 1',
  },
  {
    id: 'hospedaje_rural',
    etiqueta: 'Hospedaje Rural',
    categoria: 'Hospedaje',
    comercio: 'Hotel / Alojamiento de Brigada',
    montoRD: 4800,
    notas: 'Pernocta de brigada en provincia',
  },
];

export function crearConfiguracionInicialEmpresa(empresaId: string): ConfiguracionEmpresa {
  return {
    empresaId,
    cargos: CARGOS_BASE_INICIALES.map((c) => ({ ...c })),
    combustibles: [
      {
        id: 'diesel_optimo',
        nombre: 'Diésel Óptimo',
        activo: true,
        versiones: [
          { version: 1, vigenciaDesde: FECHA_VIGENCIA_INICIAL, precioGalonRD: 239.1 },
        ],
      },
      {
        id: 'gasolina_regular',
        nombre: 'Gasolina Regular',
        activo: true,
        versiones: [
          { version: 1, vigenciaDesde: FECHA_VIGENCIA_INICIAL, precioGalonRD: 272.5 },
        ],
      },
      {
        id: 'gasolina_premium',
        nombre: 'Gasolina Premium',
        activo: true,
        versiones: [
          { version: 1, vigenciaDesde: FECHA_VIGENCIA_INICIAL, precioGalonRD: 290.1 },
        ],
      },
    ],
    servicios: [
      {
        codigo: 'rtk',
        nombre: 'RTK',
        subtitulo: 'Topografía GNSS',
        activo: true,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            precioBaseRD: 20000,
            recargoCorredorPorKmRD: 0,
            recargoAreaPorHaExtraRD: 3500,
            umbralAreaBaseM2: 10000,
          },
        ],
      },
      {
        codigo: 'drone_lidar',
        nombre: 'Dron & LiDAR',
        subtitulo: 'Fotogrametría MDT',
        activo: true,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            precioBaseRD: 35000,
            recargoCorredorPorKmRD: 0,
            recargoAreaPorHaExtraRD: 3500,
            umbralAreaBaseM2: 10000,
          },
        ],
      },
      {
        codigo: 'deslinde',
        nombre: 'Deslinde',
        subtitulo: 'Catastro y Mensuras',
        activo: true,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            precioBaseRD: 75000,
            recargoCorredorPorKmRD: 0,
            recargoAreaPorHaExtraRD: 3500,
            umbralAreaBaseM2: 10000,
          },
        ],
      },
      {
        codigo: 'ingenieria',
        nombre: 'Ingeniería',
        subtitulo: 'Vial y Nivelación',
        activo: true,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            precioBaseRD: 30000,
            recargoCorredorPorKmRD: 10000,
            recargoAreaPorHaExtraRD: 3500,
            umbralAreaBaseM2: 10000,
          },
        ],
      },
      {
        codigo: 'arquitectura',
        nombre: 'Arquitectura',
        subtitulo: 'Diseño BIM / Planos',
        activo: true,
        versiones: [
          {
            version: 1,
            vigenciaDesde: FECHA_VIGENCIA_INICIAL,
            precioBaseRD: 20000,
            recargoCorredorPorKmRD: 0,
            recargoAreaPorHaExtraRD: 3500,
            umbralAreaBaseM2: 10000,
          },
        ],
      },
    ],
    factoresTerreno: [
      {
        version: 1,
        vigenciaDesde: FECHA_VIGENCIA_INICIAL,
        Llano: 1.0,
        Ondulado: 1.2,
        Montañoso: 1.45,
      },
    ],
    reglasViaticos: [
      {
        version: 1,
        vigenciaDesde: FECHA_VIGENCIA_INICIAL,
        gpsRuta: {
          tarifaPorKmRD: 26.5,
          minimoKm: 12,
          conceptoDistancia: 'ida_vuelta',
        },
        dietaUrbanaRD: 1200,
        dietaCampoRD: 2200,
        umbralDistanciaUrbanaKm: 28,
        hospedajePorNocheRD: 4800,
        umbralHospedajeKm: 105,
        kmzPeajeUmbralKm: 45,
        kmzPeajePorTramo50KmRD: 320,
        kmzPersonasDietaDefault: 2,
        peajesCorredor: {
          urbanoExpresoRD: 150,
          nacionalBaseRD: 100,
          norteExpresoRD: 250,
          suroesteExpresoRD: 250,
          otroExpresoRD: 200,
          esteEstacionesCerca: 2,
          esteEstacionesLejos: 4,
          estePorEstacionRD: 100,
        },
        presetsRapidos: PRESETS_RAPIDOS_INICIALES.map((p) => ({ ...p })),
      },
    ],
    topesViatico: crearTopesViaticoIniciales(),
    rendimientoFlota: [
      {
        version: 1,
        vigenciaDesde: FECHA_VIGENCIA_INICIAL,
        fuenteKm: 'ruta_asignada',
        umbralAlertaPct: UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT,
        umbralCercaniaRentaKm: UMBRAL_CERCANIA_RENTA_KM_DEFAULT,
        esEjemploPendienteConfirmar: true,
      },
    ],
    categoriasViatico: [...CATEGORIAS_VIATICO],
    versionGlobal: 1,
  };
}

export function asegurarConfiguracionEmpresa(
  empresaId: string,
  config?: ConfiguracionEmpresa
): ConfiguracionEmpresa {
  const base = crearConfiguracionInicialEmpresa(empresaId);
  if (!config) return base;

  const cargosExistentes = config.cargos?.length ? config.cargos : base.cargos;
  const codigosCargos = new Set(cargosExistentes.map((c) => c.codigo));
  const cargosCompletos = [
    ...cargosExistentes,
    ...base.cargos.filter((b) => !codigosCargos.has(b.codigo)),
  ];

  const topesExistentes = config.topesViatico?.length ? config.topesViatico : base.topesViatico;
  const clavesTope = new Set(topesExistentes.map((t) => `${t.cargoCodigo}::${t.categoria}`));
  const topesCompletos = [
    ...topesExistentes,
    ...base.topesViatico.filter((b) => !clavesTope.has(`${b.cargoCodigo}::${b.categoria}`)),
  ];

  return {
    empresaId,
    cargos: cargosCompletos,
    combustibles: config.combustibles?.length ? config.combustibles : base.combustibles,
    servicios: config.servicios?.length ? config.servicios : base.servicios,
    factoresTerreno: config.factoresTerreno?.length
      ? config.factoresTerreno
      : base.factoresTerreno,
    reglasViaticos: config.reglasViaticos?.length ? config.reglasViaticos : base.reglasViaticos,
    topesViatico: topesCompletos,
    rendimientoFlota: config.rendimientoFlota?.length
      ? config.rendimientoFlota
      : base.rendimientoFlota,
    categoriasViatico: config.categoriasViatico?.length
      ? config.categoriasViatico
      : base.categoriasViatico,
    versionGlobal: config.versionGlobal ?? 1,
  };
}

export function obtenerVersionVigente<T extends { vigenciaDesde: string; version: number }>(
  versiones: T[],
  fechaCalculoIso: string = obtenerFechaHoyAST()
): T {
  if (!versiones || versiones.length === 0) {
    throw new Error('El concepto configurable no tiene versiones registradas.');
  }
  const ordenadas = [...versiones].sort((a, b) => {
    if (a.vigenciaDesde !== b.vigenciaDesde) {
      return b.vigenciaDesde.localeCompare(a.vigenciaDesde);
    }
    return b.version - a.version;
  });

  const vigente = ordenadas.find((v) => v.vigenciaDesde <= fechaCalculoIso);
  if (vigente) return vigente;

  // Si todas las vigencias son futuras respecto a fechaCalculoIso, devuelve la inicial más antigua
  return ordenadas[ordenadas.length - 1];
}

export interface CombustibleVigente {
  id: string;
  nombre: string;
  activo: boolean;
  precioGalonRD: number;
  version: number;
  vigenciaDesde: string;
}

export function obtenerCombustiblesVigentes(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): CombustibleVigente[] {
  return config.combustibles.map((c) => {
    const v = obtenerVersionVigente(c.versiones, fechaCalculoIso);
    return {
      id: c.id,
      nombre: c.nombre,
      activo: c.activo,
      precioGalonRD: v.precioGalonRD,
      version: v.version,
      vigenciaDesde: v.vigenciaDesde,
    };
  });
}

export interface ServicioCatalogoVigente {
  codigo: string;
  nombre: string;
  subtitulo: string;
  activo: boolean;
  precioBaseRD: number;
  recargoCorredorPorKmRD: number;
  recargoAreaPorHaExtraRD: number;
  umbralAreaBaseM2: number;
  version: number;
  vigenciaDesde: string;
}

export function obtenerServiciosVigentes(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): ServicioCatalogoVigente[] {
  return config.servicios.map((s) => {
    const v = obtenerVersionVigente(s.versiones, fechaCalculoIso);
    return {
      codigo: s.codigo,
      nombre: s.nombre,
      subtitulo: s.subtitulo,
      activo: s.activo,
      precioBaseRD: v.precioBaseRD,
      recargoCorredorPorKmRD: v.recargoCorredorPorKmRD,
      recargoAreaPorHaExtraRD: v.recargoAreaPorHaExtraRD,
      umbralAreaBaseM2: v.umbralAreaBaseM2,
      version: v.version,
      vigenciaDesde: v.vigenciaDesde,
    };
  });
}

export function obtenerFactoresTerrenoVigentes(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): TerrenoFactorVersion {
  return obtenerVersionVigente(config.factoresTerreno, fechaCalculoIso);
}

export function obtenerReglasViaticosVigentes(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): ReglasViaticosVersion {
  return obtenerVersionVigente(config.reglasViaticos, fechaCalculoIso);
}

export interface TopeViaticoVigente {
  cargoCodigo: string;
  categoria: CategoriaViatico;
  montoMaximoPorMisionRD: number;
  version: number;
  vigenciaDesde: string;
  esEjemploPendienteConfirmar: boolean;
}

export function obtenerTopesViaticoVigentes(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): TopeViaticoVigente[] {
  const lista = config.topesViatico?.length ? config.topesViatico : crearTopesViaticoIniciales();
  return lista.map((item) => {
    const v = obtenerVersionVigente(item.versiones, fechaCalculoIso);
    return {
      cargoCodigo: item.cargoCodigo,
      categoria: item.categoria,
      montoMaximoPorMisionRD: v.montoMaximoPorMisionRD,
      version: v.version,
      vigenciaDesde: v.vigenciaDesde,
      esEjemploPendienteConfirmar: Boolean(v.esEjemploPendienteConfirmar),
    };
  });
}

export function obtenerTopeViaticoParaCargoCategoria(params: {
  config: ConfiguracionEmpresa;
  cargoCodigo: string;
  categoria: CategoriaViatico;
  fechaCalculoIso?: string;
}): TopeViaticoVigente | undefined {
  const vigentes = obtenerTopesViaticoVigentes(
    params.config,
    params.fechaCalculoIso ?? obtenerFechaHoyAST()
  );
  return vigentes.find(
    (t) => t.cargoCodigo === params.cargoCodigo && t.categoria === params.categoria
  );
}

export function obtenerRendimientoConfigVigente(
  config: ConfiguracionEmpresa,
  fechaCalculoIso: string = obtenerFechaHoyAST()
): ReglaRendimientoFlotaVersion {
  const lista = config.rendimientoFlota?.length
    ? config.rendimientoFlota
    : [
        {
          version: 1,
          vigenciaDesde: FECHA_VIGENCIA_INICIAL,
          fuenteKm: 'ruta_asignada' as const,
          umbralAlertaPct: UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT,
          umbralCercaniaRentaKm: UMBRAL_CERCANIA_RENTA_KM_DEFAULT,
          esEjemploPendienteConfirmar: true,
        },
      ];
  return obtenerVersionVigente(lista, fechaCalculoIso);
}

export function resolverEtiquetaCargo(codigo: string, cargos: CargoConfig[] = []): string {
  const match = cargos.find((c) => c.codigo === codigo);
  if (match) return match.etiqueta;
  const baseMatch = CARGOS_BASE_INICIALES.find((c) => c.codigo === codigo);
  if (baseMatch) return baseMatch.etiqueta;
  return codigo;
}

export function calcularCombustibleGpsRuta(params: {
  distanciaOneWayKm: number;
  regla: ReglasViaticosVersion['gpsRuta'];
}): {
  distanciaCalculadaKm: number;
  montoRD: number;
  tarifaPorKmRD: number;
  minimoKm: number;
  conceptoDistancia: ConceptoDistanciaGps;
} {
  const { distanciaOneWayKm, regla } = params;
  const factor = regla.conceptoDistancia === 'ida_vuelta' ? 2 : 1;
  const brutaKm = Number((Math.max(0, distanciaOneWayKm) * factor).toFixed(1));
  const distanciaCalculadaKm = Math.max(regla.minimoKm, brutaKm);
  const montoRD = Math.round(distanciaCalculadaKm * regla.tarifaPorKmRD);

  return {
    distanciaCalculadaKm,
    montoRD,
    tarifaPorKmRD: regla.tarifaPorKmRD,
    minimoKm: regla.minimoKm,
    conceptoDistancia: regla.conceptoDistancia,
  };
}

export function calcularCotizacionServicioVigente(params: {
  servicio: ServicioCatalogoVigente;
  areaM2: number;
  corridorKm: number;
  terrain: 'Llano' | 'Ondulado' | 'Montañoso';
  factoresTerreno: TerrenoFactorVersion;
}): {
  precioBaseRD: number;
  corridorExtraRD: number;
  areaSurchargeRD: number;
  terrainMult: number;
  totalRD: number;
} {
  const { servicio, areaM2, corridorKm, terrain, factoresTerreno } = params;
  const terrainMult = factoresTerreno[terrain] ?? 1.0;
  const corridorExtraRD =
    servicio.recargoCorredorPorKmRD > 0
      ? Math.round(Math.max(0, corridorKm) * servicio.recargoCorredorPorKmRD)
      : 0;
  const umbral = servicio.umbralAreaBaseM2;
  const areaSurchargeRD =
    areaM2 > umbral
      ? Math.round(((areaM2 - umbral) / 10000) * servicio.recargoAreaPorHaExtraRD)
      : 0;
  const totalRD = Math.round(
    (servicio.precioBaseRD + corridorExtraRD + areaSurchargeRD) * terrainMult
  );
  return {
    precioBaseRD: servicio.precioBaseRD,
    corridorExtraRD,
    areaSurchargeRD,
    terrainMult,
    totalRD,
  };
}

// Control de acceso a la pantalla de Configuración (Admin edita todo; Coordinador solo lectura en Servicios y Flota; Técnico sin acceso)
export function puedeVerConfiguracion(rol: RolEmpresa): boolean {
  return rol === 'admin' || rol === 'coordinador';
}

export function puedeEditarConfiguracion(rol: RolEmpresa): boolean {
  return rol === 'admin';
}

export function puedeVerSeccionConfiguracion(
  rol: RolEmpresa,
  seccion: SeccionConfiguracion
): boolean {
  if (rol === 'admin') return true;
  if (rol === 'coordinador') {
    return (
      seccion === 'servicios' ||
      seccion === 'flota' ||
      seccion === 'viaticos_categorias' ||
      seccion === 'ayuda'
    );
  }
  return false;
}

// ============================================================================
// Validaciones puras de configuración y vigencias
// ============================================================================

export function esFechaIsoValida(fecha: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return false;
  const dt = new Date(`${fecha}T00:00:00Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().slice(0, 10) === fecha;
}

export function siguienteVersion<T extends { version: number }>(versiones: T[]): number {
  return versiones.reduce((max, item) => Math.max(max, item.version), 0) + 1;
}

export function normalizarCodigoEstable(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function validarEmpresaConfig(
  empresa: Pick<Empresa, 'nombre' | 'rnc' | 'direccionBase' | 'zonaHoraria' | 'moneda' | 'planMensualRD'>
): { valido: boolean; error?: string } {
  if (!empresa.nombre.trim()) {
    return { valido: false, error: 'El nombre de la empresa es obligatorio.' };
  }
  if (!empresa.rnc.trim()) {
    return { valido: false, error: 'El RNC de la empresa es obligatorio.' };
  }
  if (!empresa.direccionBase.trim()) {
    return { valido: false, error: 'La dirección base es obligatoria.' };
  }
  if (!empresa.zonaHoraria.trim()) {
    return { valido: false, error: 'La zona horaria es obligatoria.' };
  }
  if (!empresa.moneda.trim()) {
    return { valido: false, error: 'La moneda es obligatoria.' };
  }
  if (!Number.isFinite(empresa.planMensualRD) || empresa.planMensualRD < 0) {
    return { valido: false, error: 'El plan mensual no puede ser negativo.' };
  }
  return { valido: true };
}

export function validarCargoConfig(params: {
  codigo: string;
  etiqueta: string;
  existentes: CargoConfig[];
  esEdicion?: boolean;
}): { valido: boolean; error?: string; codigoNormalizado?: string } {
  const codigoNormalizado = normalizarCodigoEstable(params.codigo);
  if (!codigoNormalizado) {
    return { valido: false, error: 'El código del cargo es obligatorio.' };
  }
  if (!params.etiqueta.trim()) {
    return { valido: false, error: 'La etiqueta visible del cargo es obligatoria.' };
  }
  if (!params.esEdicion && params.existentes.some((c) => c.codigo === codigoNormalizado)) {
    return {
      valido: false,
      error: `Ya existe un cargo con el código "${codigoNormalizado}".`,
    };
  }
  return { valido: true, codigoNormalizado };
}

export function validarEliminarCargo(params: {
  codigo: string;
  cargos: CargoConfig[];
  personal: Personal[];
}): { valido: boolean; error?: string } {
  const cargo = params.cargos.find((c) => c.codigo === params.codigo);
  if (!cargo) {
    return { valido: false, error: 'El cargo indicado no existe en el catálogo.' };
  }
  if (cargo.esBase) {
    return {
      valido: false,
      error: `El cargo base "${cargo.etiqueta}" no se puede eliminar (puedes editar su etiqueta).`,
    };
  }
  const asignados = params.personal.filter((p) => p.cargo === params.codigo);
  if (asignados.length > 0) {
    return {
      valido: false,
      error: `No se puede eliminar "${cargo.etiqueta}" porque tiene ${asignados.length} integrante(s) asignado(s).`,
    };
  }
  return { valido: true };
}

export function validarSolapamientoVigencia(
  versionesExistentes: Array<{ vigenciaDesde: string }>,
  vigenciaDesde: string
): { valido: boolean; error?: string } {
  if (!esFechaIsoValida(vigenciaDesde)) {
    return { valido: false, error: 'La fecha de vigencia debe tener formato YYYY-MM-DD válido.' };
  }
  if (versionesExistentes.some((v) => v.vigenciaDesde === vigenciaDesde)) {
    return {
      valido: false,
      error: `Ya existe una vigencia desde ${vigenciaDesde} para este concepto. Elige otra fecha para no traslapar vigencias.`,
    };
  }
  return { valido: true };
}

export function validarNuevaVigenciaCombustible(
  versionesExistentes: TarifaCombustibleVersion[],
  nueva: { vigenciaDesde: string; precioGalonRD: number }
): { valido: boolean; error?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;
  if (!Number.isFinite(nueva.precioGalonRD) || nueva.precioGalonRD < 0) {
    return { valido: false, error: 'El precio por galón no puede ser negativo.' };
  }
  return { valido: true };
}

export function validarNuevoTipoCombustible(params: {
  nombre: string;
  existentes: TipoCombustibleConfig[];
  precioGalonRD: number;
  vigenciaDesde: string;
}): { valido: boolean; error?: string; idNormalizado?: string } {
  const nombre = params.nombre.trim();
  if (!nombre) {
    return { valido: false, error: 'El nombre del tipo de combustible es obligatorio.' };
  }
  const idNormalizado = normalizarCodigoEstable(nombre);
  if (!idNormalizado) {
    return { valido: false, error: 'El identificador de combustible es inválido.' };
  }
  if (
    params.existentes.some(
      (c) => c.id === idNormalizado || c.nombre.toLowerCase() === nombre.toLowerCase()
    )
  ) {
    return { valido: false, error: `Ya existe el combustible "${nombre}".` };
  }
  const vig = validarNuevaVigenciaCombustible([], {
    vigenciaDesde: params.vigenciaDesde,
    precioGalonRD: params.precioGalonRD,
  });
  if (!vig.valido) return vig;
  return { valido: true, idNormalizado };
}

export function validarNuevaVigenciaServicio(
  versionesExistentes: TarifaServicioVersion[],
  nueva: Omit<TarifaServicioVersion, 'version'>
): { valido: boolean; error?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;
  if (
    !Number.isFinite(nueva.precioBaseRD) ||
    nueva.precioBaseRD < 0 ||
    !Number.isFinite(nueva.recargoCorredorPorKmRD) ||
    nueva.recargoCorredorPorKmRD < 0 ||
    !Number.isFinite(nueva.recargoAreaPorHaExtraRD) ||
    nueva.recargoAreaPorHaExtraRD < 0
  ) {
    return { valido: false, error: 'Las tarifas y recargos del servicio no pueden ser negativos.' };
  }
  if (!Number.isFinite(nueva.umbralAreaBaseM2) || nueva.umbralAreaBaseM2 <= 0) {
    return {
      valido: false,
      error: 'El umbral de área base (m²) debe ser mayor que 0.',
    };
  }
  return { valido: true };
}

export function validarNuevoServicioCatalogo(params: {
  codigo: string;
  nombre: string;
  subtitulo: string;
  existentes: ServicioCatalogoConfig[];
  tarifaInicial: Omit<TarifaServicioVersion, 'version'>;
}): { valido: boolean; error?: string; codigoNormalizado?: string } {
  const codigoNormalizado = normalizarCodigoEstable(params.codigo || params.nombre);
  if (!codigoNormalizado) {
    return { valido: false, error: 'El código del servicio es obligatorio.' };
  }
  if (!params.nombre.trim()) {
    return { valido: false, error: 'El nombre del servicio es obligatorio.' };
  }
  if (params.existentes.some((s) => s.codigo === codigoNormalizado)) {
    return { valido: false, error: `Ya existe un servicio con el código "${codigoNormalizado}".` };
  }
  const vig = validarNuevaVigenciaServicio([], params.tarifaInicial);
  if (!vig.valido) return vig;
  return { valido: true, codigoNormalizado };
}

export function validarNuevaVigenciaTerreno(
  versionesExistentes: TerrenoFactorVersion[],
  nueva: Omit<TerrenoFactorVersion, 'version'>
): { valido: boolean; error?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;
  if (
    !Number.isFinite(nueva.Llano) ||
    nueva.Llano <= 0 ||
    !Number.isFinite(nueva.Ondulado) ||
    nueva.Ondulado <= 0 ||
    !Number.isFinite(nueva.Montañoso) ||
    nueva.Montañoso <= 0
  ) {
    return { valido: false, error: 'Los multiplicadores de terreno deben ser mayores a 0.' };
  }
  return { valido: true };
}

export function validarNuevaVigenciaReglasViaticos(
  versionesExistentes: ReglasViaticosVersion[],
  nueva: Omit<ReglasViaticosVersion, 'version'>
): { valido: boolean; error?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;

  if (!CONCEPTOS_DISTANCIA_GPS.includes(nueva.gpsRuta.conceptoDistancia)) {
    return {
      valido: false,
      error: 'El concepto de distancia GPS solo acepta "ida_vuelta" o "solo_ida".',
    };
  }

  if (!Number.isFinite(nueva.gpsRuta.minimoKm) || nueva.gpsRuta.minimoKm < 0) {
    return { valido: false, error: 'El mínimo de km para GPS Ruta debe ser mayor o igual a 0.' };
  }

  const numericos = [
    nueva.gpsRuta.tarifaPorKmRD,
    nueva.dietaUrbanaRD,
    nueva.dietaCampoRD,
    nueva.umbralDistanciaUrbanaKm,
    nueva.hospedajePorNocheRD,
    nueva.umbralHospedajeKm,
    nueva.kmzPeajeUmbralKm,
    nueva.kmzPeajePorTramo50KmRD,
    nueva.kmzPersonasDietaDefault,
    nueva.peajesCorredor.urbanoExpresoRD,
    nueva.peajesCorredor.nacionalBaseRD,
    nueva.peajesCorredor.norteExpresoRD,
    nueva.peajesCorredor.suroesteExpresoRD,
    nueva.peajesCorredor.otroExpresoRD,
    nueva.peajesCorredor.esteEstacionesCerca,
    nueva.peajesCorredor.esteEstacionesLejos,
    nueva.peajesCorredor.estePorEstacionRD,
  ];
  if (numericos.some((n) => !Number.isFinite(n) || n < 0)) {
    return {
      valido: false,
      error: 'Las tarifas, umbrales y peajes no pueden contener valores negativos.',
    };
  }

  for (const preset of nueva.presetsRapidos) {
    if (!preset.etiqueta.trim() || !preset.comercio.trim()) {
      return { valido: false, error: 'Cada tarifa rápida debe tener etiqueta y concepto.' };
    }
    if (!Number.isFinite(preset.montoRD) || preset.montoRD < 0) {
      return { valido: false, error: 'El monto de una tarifa rápida no puede ser negativo.' };
    }
  }

  return { valido: true };
}

export function validarVehiculoConfig(
  v: Pick<Vehiculo, 'etiqueta' | 'placa' | 'precioGalonRD' | 'kmPorGal' | 'mantenimientoPorKmRD'>
): { valido: boolean; error?: string } {
  if (!v.etiqueta.trim() || !v.placa.trim()) {
    return { valido: false, error: 'La descripción y la placa del vehículo son obligatorias.' };
  }
  if (!Number.isFinite(v.precioGalonRD) || v.precioGalonRD < 0) {
    return { valido: false, error: 'El precio por galón no puede ser negativo.' };
  }
  if (!Number.isFinite(v.kmPorGal) || v.kmPorGal <= 0) {
    return { valido: false, error: 'El rendimiento (km/gal) debe ser mayor a 0.' };
  }
  if (!Number.isFinite(v.mantenimientoPorKmRD) || v.mantenimientoPorKmRD < 0) {
    return { valido: false, error: 'El costo de mantenimiento por km no puede ser negativo.' };
  }
  return { valido: true };
}

export function validarNuevaVigenciaTopeViatico(
  versionesExistentes: TopeViaticoCargoVersion[],
  nueva: Pick<TopeViaticoCargoVersion, 'vigenciaDesde' | 'montoMaximoPorMisionRD'>
): { valido: boolean; error?: string; advertencia?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;
  if (!Number.isFinite(nueva.montoMaximoPorMisionRD) || nueva.montoMaximoPorMisionRD < 0) {
    return {
      valido: false,
      error: 'El tope máximo por misión no puede ser negativo.',
    };
  }
  if (nueva.montoMaximoPorMisionRD === 0) {
    return {
      valido: true,
      advertencia:
        'Un tope de RD$ 0 indica que la categoría NO está permitida para este cargo; cualquier gasto en esta categoría generará aviso de excedente.',
    };
  }
  return { valido: true };
}

export function validarNuevaVigenciaRendimientoFlota(
  versionesExistentes: ReglaRendimientoFlotaVersion[],
  nueva: Omit<ReglaRendimientoFlotaVersion, 'version'>
): { valido: boolean; error?: string } {
  const solapamiento = validarSolapamientoVigencia(versionesExistentes, nueva.vigenciaDesde);
  if (!solapamiento.valido) return solapamiento;
  if (!FUENTES_KM_RENDIMIENTO.includes(nueva.fuenteKm)) {
    return { valido: false, error: 'La fuente de kilómetros seleccionada no es válida.' };
  }
  if (nueva.fuenteKm !== 'ruta_asignada') {
    return {
      valido: false,
      error: 'Esta fuente de kilómetros estará disponible próximamente.',
    };
  }
  if (!Number.isFinite(nueva.umbralAlertaPct) || nueva.umbralAlertaPct <= 0) {
    return { valido: false, error: 'El umbral de alerta de rendimiento (%) debe ser mayor que 0.' };
  }
  if (!Number.isFinite(nueva.umbralCercaniaRentaKm) || nueva.umbralCercaniaRentaKm <= 0) {
    return { valido: false, error: 'El umbral de cercanía de renta (km) debe ser mayor que 0.' };
  }
  return { valido: true };
}
