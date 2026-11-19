import type {
  EstadoOnboardingEmpresa,
  OnboardingEstadoPaso,
  OnboardingPasoId,
  SeccionConfiguracion,
} from '../types/domain';

export interface DefinicionPasoOnboarding {
  id: OnboardingPasoId;
  numero: number;
  titulo: string;
  descripcion: string;
  soloEnDemo: boolean;
  destinoTab: 'configuracion' | 'catalogos' | 'proyectos' | 'kmz';
  seccionConfig?: SeccionConfiguracion;
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
    cerradoEnHoy: false,
    updatedAt: ahoraIso,
  };
}

export function asegurarEstadoOnboarding(
  empresaId: string,
  estado?: EstadoOnboardingEmpresa
): EstadoOnboardingEmpresa {
  if (!estado) return crearEstadoOnboardingInicial(empresaId);
  const base = crearEstadoOnboardingInicial(empresaId);
  return {
    ...base,
    ...estado,
    empresaId,
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

export function cerrarTarjetaOnboardingEnHoy(
  estado: EstadoOnboardingEmpresa,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return {
    ...estado,
    cerradoEnHoy: true,
    updatedAt: ahoraIso,
  };
}

export function reiniciarOnboarding(
  empresaId: string,
  ahoraIso: string = new Date().toISOString()
): EstadoOnboardingEmpresa {
  return crearEstadoOnboardingInicial(empresaId, ahoraIso);
}

export interface ResumenOnboarding {
  pasosVisibles: DefinicionPasoOnboarding[];
  pasosPendientes: DefinicionPasoOnboarding[];
  pasosCompletados: DefinicionPasoOnboarding[];
  pasosSaltados: DefinicionPasoOnboarding[];
  totalPasos: number;
  porcentajeResuelto: number;
  estaFinalizado: boolean;
  debeMostrarTarjetaHoy: boolean;
}

export function obtenerResumenOnboarding(
  estado: EstadoOnboardingEmpresa,
  esDemo: boolean
): ResumenOnboarding {
  const pasosVisibles = obtenerPasosOnboardingVisibles(esDemo);
  const pasosPendientes = pasosVisibles.filter((p) => estado.pasos[p.id] === 'pendiente');
  const pasosCompletados = pasosVisibles.filter((p) => estado.pasos[p.id] === 'completo');
  const pasosSaltados = pasosVisibles.filter((p) => estado.pasos[p.id] === 'saltado');
  const totalPasos = pasosVisibles.length;
  const resueltos = totalPasos - pasosPendientes.length;
  const porcentajeResuelto = totalPasos > 0 ? Math.round((resueltos / totalPasos) * 100) : 100;
  const estaFinalizado = pasosPendientes.length === 0;
  const debeMostrarTarjetaHoy = !estado.cerradoEnHoy && !estaFinalizado;

  return {
    pasosVisibles,
    pasosPendientes,
    pasosCompletados,
    pasosSaltados,
    totalPasos,
    porcentajeResuelto,
    estaFinalizado,
    debeMostrarTarjetaHoy,
  };
}
