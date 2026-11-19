import type {
  ConfiguracionEmpresa,
  Empresa,
  EstadoEfectivoPasoOnboarding,
  EstadoOnboardingEmpresa,
  OnboardingEstadoPaso,
  OnboardingPasoId,
  Personal,
  Proyecto,
  SeccionConfiguracion,
  ServicioCatalogoConfig,
  Vehiculo,
} from '../types/domain';
import { validarEmpresaConfig } from './configuracion';

export interface DefinicionPasoOnboarding {
  id: OnboardingPasoId;
  numero: number;
  titulo: string;
  descripcion: string;
  soloEnDemo: boolean;
  destinoTab: 'configuracion' | 'catalogos' | 'proyectos' | 'kmz';
  seccionConfig?: SeccionConfiguracion;
}

export interface DatosDeteccionOnboarding {
  empresa?: Partial<Empresa> | null;
  personal?: Personal[];
  vehiculos?: Vehiculo[];
  serviciosConfig?: ServicioCatalogoConfig[];
  configuracion?: ConfiguracionEmpresa | null;
  proyectos?: Proyecto[];
  esDemo?: boolean;
}

export const PASOS_ONBOARDING_DEFINICION: readonly DefinicionPasoOnboarding[] = [
  {
    id: 'empresa',
    numero: 1,
    titulo: 'Datos de la empresa',
    descripcion: 'Verifica nombre comercial, RNC, dirección base, zona horaria y moneda.',
    soloEnDemo: false,
    destinoTab: 'configuracion',
    seccionConfig: 'empresa',
  },
  {
    id: 'personal_cargos',
    numero: 2,
    titulo: 'Personal y cargos',
    descripcion: 'Revisa los cargos configurables e integra tu equipo técnico y choferes.',
    soloEnDemo: false,
    destinoTab: 'catalogos',
    seccionConfig: 'cargos',
  },
  {
    id: 'flota',
    numero: 3,
    titulo: 'Flota y equipos GNSS',
    descripcion: 'Registra vehículos con su combustible vigente y receptores GNSS disponibles.',
    soloEnDemo: false,
    destinoTab: 'catalogos',
    seccionConfig: 'flota',
  },
  {
    id: 'servicios',
    numero: 4,
    titulo: 'Servicios y precios',
    descripcion: 'Confirma tarifas base, recargos y vigencias de tus servicios topográficos.',
    soloEnDemo: false,
    destinoTab: 'configuracion',
    seccionConfig: 'servicios',
  },
  {
    id: 'cliente_proyecto',
    numero: 5,
    titulo: 'Primer cliente y proyecto',
    descripcion: 'Crea tu primer cliente y proyecto en estado cotizado para operar.',
    soloEnDemo: false,
    destinoTab: 'proyectos',
  },
  {
    id: 'kmz_demo',
    numero: 6,
    titulo: 'Importar KMZ de prueba',
    descripcion: 'Prueba el asistente con una parcela demostrativa y calcula ruta + viáticos.',
    soloEnDemo: true,
    destinoTab: 'kmz',
  },
] as const;

export function obtenerPasosOnboardingVisibles(
  esDemo: boolean
): DefinicionPasoOnboarding[] {
  return PASOS_ONBOARDING_DEFINICION.filter((p) => (p.soloEnDemo ? esDemo : true));
}

export function detectarEstadoPasoDesdeDatos(
  paso: OnboardingPasoId | DefinicionPasoOnboarding,
  datos: DatosDeteccionOnboarding
): 'completo' | 'pendiente' {
  const pasoId = typeof paso === 'string' ? paso : paso.id;

  switch (pasoId) {
    case 'empresa': {
      const emp = datos.empresa;
      if (!emp) return 'pendiente';
      const check = validarEmpresaConfig({
        nombre: emp.nombre ?? '',
        rnc: emp.rnc ?? '',
        direccionBase: emp.direccionBase ?? '',
        zonaHoraria: emp.zonaHoraria ?? 'America/Santo_Domingo',
        moneda: emp.moneda ?? 'RD$',
        planMensualRD: emp.planMensualRD ?? 0,
      });
      return check.valido ? 'completo' : 'pendiente';
    }
    case 'personal_cargos':
      return (datos.personal?.length ?? 0) > 0 ? 'completo' : 'pendiente';
    case 'flota':
      return (datos.vehiculos?.length ?? 0) > 0 ? 'completo' : 'pendiente';
    case 'servicios': {
      const servicios = datos.serviciosConfig ?? datos.configuracion?.servicios ?? [];
      return servicios.some((s) => s.activo) ? 'completo' : 'pendiente';
    }
    case 'cliente_proyecto':
      return (datos.proyectos?.length ?? 0) > 0 ? 'completo' : 'pendiente';
    case 'kmz_demo':
      return Boolean(datos.esDemo) && (datos.proyectos?.length ?? 0) > 0
        ? 'completo'
        : 'pendiente';
    default:
      return 'pendiente';
  }
}

export function crearEstadoOnboardingInicial(
  empresaId: string,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return {
    empresaId,
    pasoActual: 'empresa',
    pasos: {
      empresa: 'pendiente',
      personal_cargos: 'pendiente',
      flota: 'pendiente',
      servicios: 'pendiente',
      cliente_proyecto: 'pendiente',
      kmz_demo: 'pendiente',
    },
    tarjetaOcultada: false,
    updatedAt: ahoraIso,
  };
}

export function asegurarEstadoOnboarding(
  empresaId: string,
  estado?: EstadoOnboardingEmpresa & { cerradoEnHoy?: boolean }
): EstadoOnboardingEmpresa {
  if (!estado) return crearEstadoOnboardingInicial(empresaId);
  const base = crearEstadoOnboardingInicial(empresaId);
  const tarjetaOcultada =
    typeof estado.tarjetaOcultada === 'boolean'
      ? estado.tarjetaOcultada
      : Boolean(estado.cerradoEnHoy);
  const { cerradoEnHoy: _legacy, ...rest } = estado;
  return {
    ...base,
    ...rest,
    empresaId,
    tarjetaOcultada,
    pasos: {
      ...base.pasos,
      ...estado.pasos,
    },
  };
}

function siguientePasoPendiente(
  pasos: Record<OnboardingPasoId, OnboardingEstadoPaso>,
  visibles: DefinicionPasoOnboarding[],
  desdePasoId: OnboardingPasoId
): OnboardingPasoId {
  const idxActual = visibles.findIndex((p) => p.id === desdePasoId);
  const ordenBusqueda = [
    ...visibles.slice(idxActual + 1),
    ...visibles.slice(0, Math.max(0, idxActual)),
  ];
  const proximo = ordenBusqueda.find((p) => pasos[p.id] === 'pendiente');
  return proximo?.id ?? desdePasoId;
}

function actualizarEstadoPaso(params: {
  estado: EstadoOnboardingEmpresa;
  pasoId: OnboardingPasoId;
  nuevoEstado: OnboardingEstadoPaso;
  esDemo: boolean;
  ahoraIso?: string;
}): EstadoOnboardingEmpresa {
  const { estado, pasoId, nuevoEstado, esDemo, ahoraIso = new Date().toISOString() } = params;
  const visibles = obtenerPasosOnboardingVisibles(esDemo);
  const pasosActualizados: Record<OnboardingPasoId, OnboardingEstadoPaso> = {
    ...estado.pasos,
    [pasoId]: nuevoEstado,
  };

  const todosResueltos = visibles.every((p) => pasosActualizados[p.id] !== 'pendiente');
  const proximoPaso = siguientePasoPendiente(pasosActualizados, visibles, pasoId);

  return {
    ...estado,
    pasos: pasosActualizados,
    pasoActual: todosResueltos ? visibles[visibles.length - 1]?.id ?? pasoId : proximoPaso,
    completadoEn: todosResueltos ? estado.completadoEn ?? ahoraIso : undefined,
    updatedAt: ahoraIso,
  };
}

export function completarPasoOnboarding(
  estado: EstadoOnboardingEmpresa,
  pasoId: OnboardingPasoId,
  esDemo: boolean,
  ahoraIso?: string
): EstadoOnboardingEmpresa {
  return actualizarEstadoPaso({
    estado,
    pasoId,
    nuevoEstado: 'completo',
    esDemo,
    ahoraIso,
  });
}

export function saltarPasoOnboarding(
  estado: EstadoOnboardingEmpresa,
  pasoId: OnboardingPasoId,
  esDemo: boolean,
  ahoraIso?: string
): EstadoOnboardingEmpresa {
  return actualizarEstadoPaso({
    estado,
    pasoId,
    nuevoEstado: 'saltado',
    esDemo,
    ahoraIso,
  });
}

export function seleccionarPasoOnboarding(
  estado: EstadoOnboardingEmpresa,
  pasoId: OnboardingPasoId,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return {
    ...estado,
    pasoActual: pasoId,
    updatedAt: ahoraIso,
  };
}

export function ocultarTarjetaOnboarding(
  estado: EstadoOnboardingEmpresa,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return {
    ...estado,
    tarjetaOcultada: true,
    updatedAt: ahoraIso,
  };
}

export function reiniciarOnboarding(
  empresaId: string,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return crearEstadoOnboardingInicial(empresaId, ahoraIso);
}

export interface DetallePasoResumenOnboarding {
  paso: DefinicionPasoOnboarding;
  estado: EstadoEfectivoPasoOnboarding;
  etiquetaEstado: string;
  completoReal: boolean;
}

export interface ResumenOnboarding {
  pasosVisibles: DefinicionPasoOnboarding[];
  detallePasos: DetallePasoResumenOnboarding[];
  estadoPorPaso: Record<OnboardingPasoId, EstadoEfectivoPasoOnboarding>;
  pasosPendientes: DefinicionPasoOnboarding[];
  pasosCompletados: DefinicionPasoOnboarding[];
  pasosCompletadosManuales: DefinicionPasoOnboarding[];
  pasosSaltados: DefinicionPasoOnboarding[];
  totalPasos: number;
  porcentajeResuelto: number;
  porcentajeReal: number;
  estaFinalizado: boolean;
  debeMostrarTarjetaHoy: boolean;
}

function etiquetaEstadoPaso(estado: EstadoEfectivoPasoOnboarding): string {
  switch (estado) {
    case 'completo':
      return 'Completado';
    case 'completo_manual':
      return 'completado manualmente';
    case 'saltado':
      return 'Saltado';
    default:
      return 'Pendiente';
  }
}

export function obtenerResumenOnboarding(
  estado: EstadoOnboardingEmpresa,
  esDemo: boolean,
  datos?: DatosDeteccionOnboarding
): ResumenOnboarding {
  const pasosVisibles = obtenerPasosOnboardingVisibles(esDemo);

  const estadoPorPaso: Record<OnboardingPasoId, EstadoEfectivoPasoOnboarding> = {
    empresa: 'pendiente',
    personal_cargos: 'pendiente',
    flota: 'pendiente',
    servicios: 'pendiente',
    cliente_proyecto: 'pendiente',
    kmz_demo: 'pendiente',
  };

  for (const paso of PASOS_ONBOARDING_DEFINICION) {
    const manual = estado.pasos[paso.id];
    if (datos) {
      const detectado = detectarEstadoPasoDesdeDatos(paso.id, {
        ...datos,
        esDemo: datos.esDemo ?? esDemo,
      });
      if (detectado === 'completo') {
        estadoPorPaso[paso.id] = 'completo';
      } else if (manual === 'completo') {
        estadoPorPaso[paso.id] = 'completo_manual';
      } else if (manual === 'saltado') {
        estadoPorPaso[paso.id] = 'saltado';
      } else {
        estadoPorPaso[paso.id] = 'pendiente';
      }
    } else {
      estadoPorPaso[paso.id] = manual;
    }
  }

  const detallePasos: DetallePasoResumenOnboarding[] = pasosVisibles.map((paso) => {
    const efectivo = estadoPorPaso[paso.id];
    return {
      paso,
      estado: efectivo,
      etiquetaEstado: etiquetaEstadoPaso(efectivo),
      completoReal: efectivo === 'completo',
    };
  });

  const pasosPendientes = detallePasos
    .filter((d) => d.estado === 'pendiente')
    .map((d) => d.paso);
  const pasosCompletados = detallePasos
    .filter((d) => d.estado === 'completo')
    .map((d) => d.paso);
  const pasosCompletadosManuales = detallePasos
    .filter((d) => d.estado === 'completo_manual')
    .map((d) => d.paso);
  const pasosSaltados = detallePasos
    .filter((d) => d.estado === 'saltado')
    .map((d) => d.paso);

  const totalPasos = pasosVisibles.length;
  const resueltos = totalPasos - pasosPendientes.length;
  const porcentajeResuelto = totalPasos > 0 ? Math.round((resueltos / totalPasos) * 100) : 100;
  const porcentajeReal =
    totalPasos > 0 ? Math.round((pasosCompletados.length / totalPasos) * 100) : 100;
  const estaFinalizado = pasosPendientes.length === 0;
  const debeMostrarTarjetaHoy = !estado.tarjetaOcultada && !estaFinalizado;

  return {
    pasosVisibles,
    detallePasos,
    estadoPorPaso,
    pasosPendientes,
    pasosCompletados,
    pasosCompletadosManuales,
    pasosSaltados,
    totalPasos,
    porcentajeResuelto,
    porcentajeReal,
    estaFinalizado,
    debeMostrarTarjetaHoy,
  };
}
