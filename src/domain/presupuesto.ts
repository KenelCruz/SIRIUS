import type {
  Asignacion,
  CategoriaPresupuesto,
  ConfiguracionEmpresa,
  Cuadrilla,
  EstadoEmpresaSnapshot,
  EstadoPresupuestoProyecto,
  LineaPresupuestoProyecto,
  Personal,
  PresupuestoProyecto,
  Proyecto,
  Renta,
  RolEmpresa,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { ETIQUETA_EJEMPLO_CONFIRMAR, esFechaIsoValida, obtenerReglasViaticosVigentes } from './configuracion';
import { validarRangoFechas } from './conflictos';
import { puedeGestionarPresupuesto } from './permisos';
import { obtenerFechaHoyAST } from './tecnico';
import { escalarRepartosAMontoEmpresa } from './viaticos';

export const CATEGORIAS_PRESUPUESTO: readonly CategoriaPresupuesto[] = [
  'viaticos',
  'rentas',
  'personal',
  'vehiculos',
  'equipos_gnss',
  'otros',
] as const;

export const ETIQUETAS_CATEGORIA_PRESUPUESTO: Record<CategoriaPresupuesto, string> = {
  viaticos: 'Viáticos',
  rentas: 'Rentas',
  personal: 'Personal',
  vehiculos: 'Vehículos (combustible y mantenimiento)',
  equipos_gnss: 'Equipos GNSS',
  otros: 'Otros',
};

export const ESTADOS_PRESUPUESTO: readonly EstadoPresupuestoProyecto[] = [
  'borrador',
  'aprobado',
  'cerrado',
] as const;

export const ETIQUETAS_ESTADO_PRESUPUESTO: Record<EstadoPresupuestoProyecto, string> = {
  borrador: 'Borrador',
  aprobado: 'Aprobado',
  cerrado: 'Cerrado',
};

export interface TarifaViaticoProvisionalPuesto {
  puesto: string;
  cargoCodigoSugerido: string;
  desayunoRD: number;
  almuerzoRD: number;
  cenaRD: number;
  dietaTotalRD: number;
  alojamientoRD: number;
  montoViaticosRD: number;
  esProvisional: true;
  etiquetaEstado: string;
}

/**
 * Montos provisionales por puesto tomados de referencia para planificación de presupuestos.
 * Se mantienen separados de TOPES_VIATICO_EJEMPLO_POR_CARGO (módulo de topes por misión).
 */
export const TARIFAS_VIATICOS_PROVISIONALES_PUESTO: readonly TarifaViaticoProvisionalPuesto[] = [
  {
    puesto: 'Director Ejecutivo',
    cargoCodigoSugerido: 'administrativo',
    desayunoRD: 800,
    almuerzoRD: 1200,
    cenaRD: 1000,
    dietaTotalRD: 3000,
    alojamientoRD: 6000,
    montoViaticosRD: 9000,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Encargado de Departamento',
    cargoCodigoSugerido: 'jefe_brigada',
    desayunoRD: 600,
    almuerzoRD: 900,
    cenaRD: 800,
    dietaTotalRD: 2300,
    alojamientoRD: 4500,
    montoViaticosRD: 6800,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Analista',
    cargoCodigoSugerido: 'ingeniero',
    desayunoRD: 450,
    almuerzoRD: 700,
    cenaRD: 600,
    dietaTotalRD: 1750,
    alojamientoRD: 3500,
    montoViaticosRD: 5250,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Técnico',
    cargoCodigoSugerido: 'tecnico',
    desayunoRD: 400,
    almuerzoRD: 600,
    cenaRD: 500,
    dietaTotalRD: 1500,
    alojamientoRD: 3000,
    montoViaticosRD: 4500,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Asistente',
    cargoCodigoSugerido: 'administrativo',
    desayunoRD: 350,
    almuerzoRD: 500,
    cenaRD: 450,
    dietaTotalRD: 1300,
    alojamientoRD: 2500,
    montoViaticosRD: 3800,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Chofer',
    cargoCodigoSugerido: 'chofer',
    desayunoRD: 350,
    almuerzoRD: 500,
    cenaRD: 450,
    dietaTotalRD: 1300,
    alojamientoRD: 2500,
    montoViaticosRD: 3800,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
  {
    puesto: 'Consultor Externo',
    cargoCodigoSugerido: 'ingeniero',
    desayunoRD: 500,
    almuerzoRD: 800,
    cenaRD: 700,
    dietaTotalRD: 2000,
    alojamientoRD: 4000,
    montoViaticosRD: 6000,
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  },
] as const;

export const TARIFAS_COSTO_OPERATIVO_PROVISIONAL = {
  tarifaDiariaPersonalPorCargoRD: {
    jefe_brigada: 4200,
    ingeniero: 4500,
    tecnico: 3000,
    chofer: 2200,
    administrativo: 3500,
  } as Record<string, number>,
  tarifaDiariaPersonalDefaultRD: 3000,
  tarifaDiariaEquipoGnssRD: 1800,
  esProvisional: true as const,
  etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
};

function redondear2(val: number): number {
  return Number((Number.isFinite(val) ? val : 0).toFixed(2));
}

export function crearLineasBasePresupuesto(
  parciales?: Partial<Record<CategoriaPresupuesto, number>>
): LineaPresupuestoProyecto[] {
  return CATEGORIAS_PRESUPUESTO.map((categoria) => ({
    categoria,
    montoPlanificadoRD: redondear2(Math.max(0, parciales?.[categoria] ?? 0)),
  }));
}

export function normalizarLineasPresupuesto(
  lineas: LineaPresupuestoProyecto[]
): LineaPresupuestoProyecto[] {
  const mapa = new Map<CategoriaPresupuesto, LineaPresupuestoProyecto>();
  for (const linea of lineas) {
    if (!CATEGORIAS_PRESUPUESTO.includes(linea.categoria)) continue;
    mapa.set(linea.categoria, {
      categoria: linea.categoria,
      montoPlanificadoRD: redondear2(linea.montoPlanificadoRD),
      notas: linea.notas?.trim() ? linea.notas.trim() : undefined,
    });
  }
  return CATEGORIAS_PRESUPUESTO.map((categoria) => {
    const item = mapa.get(categoria);
    return (
      item ?? {
        categoria,
        montoPlanificadoRD: 0,
      }
    );
  });
}

export function calcularTotalPlanificadoPresupuesto(lineas: LineaPresupuestoProyecto[]): number {
  const sum = lineas.reduce((acc, l) => acc + (Number.isFinite(l.montoPlanificadoRD) ? l.montoPlanificadoRD : 0), 0);
  return redondear2(sum);
}

export function validarLineasPresupuesto(
  lineas: LineaPresupuestoProyecto[]
): { valido: boolean; error?: string } {
  if (!Array.isArray(lineas) || lineas.length === 0) {
    return {
      valido: false,
      error: 'El presupuesto debe incluir al menos una línea de categoría.',
    };
  }

  const vistas = new Set<CategoriaPresupuesto>();
  for (const linea of lineas) {
    if (!CATEGORIAS_PRESUPUESTO.includes(linea.categoria)) {
      return {
        valido: false,
        error: `Categoría de presupuesto no válida: "${String(linea.categoria)}".`,
      };
    }
    if (vistas.has(linea.categoria)) {
      return {
        valido: false,
        error: `La categoría "${ETIQUETAS_CATEGORIA_PRESUPUESTO[linea.categoria]}" está duplicada.`,
      };
    }
    vistas.add(linea.categoria);
    if (!Number.isFinite(linea.montoPlanificadoRD) || linea.montoPlanificadoRD < 0) {
      return {
        valido: false,
        error: `El monto planificado de "${ETIQUETAS_CATEGORIA_PRESUPUESTO[linea.categoria]}" no puede ser negativo.`,
      };
    }
  }

  return { valido: true };
}

export function migrarProyectoAPresupuestoInicial(
  proyecto: Pick<
    Proyecto,
    'id' | 'empresaId' | 'presupuestoViaticosRD' | 'fechaCreacion' | 'updatedAt'
  >,
  opts?: {
    estado?: EstadoPresupuestoProyecto;
    usuarioId?: string;
    usuarioNombre?: string;
    otrasLineas?: Partial<Record<CategoriaPresupuesto, number>>;
  }
): PresupuestoProyecto {
  const estado = opts?.estado ?? 'aprobado';
  const lineas = crearLineasBasePresupuesto({
    ...opts?.otrasLineas,
    viaticos: proyecto.presupuestoViaticosRD,
  });
  const totalPlanificadoRD = calcularTotalPlanificadoPresupuesto(lineas);
  const vigenciaDesde = esFechaIsoValida(proyecto.fechaCreacion)
    ? proyecto.fechaCreacion
    : obtenerFechaHoyAST();

  return {
    id: `pre-${proyecto.id}-v1`,
    empresaId: proyecto.empresaId,
    proyectoId: proyecto.id,
    version: 1,
    vigenciaDesde,
    estado,
    lineas,
    totalPlanificadoRD,
    notas: 'Presupuesto inicial migrado desde presupuestoViaticosRD del proyecto.',
    creadoPorUsuarioId: opts?.usuarioId ?? 'sistema',
    creadoPorNombre: opts?.usuarioNombre ?? 'Migración SIRIUS',
    aprobadoPorUsuarioId: estado !== 'borrador' ? (opts?.usuarioId ?? 'sistema') : undefined,
    aprobadoEn: estado !== 'borrador' ? (proyecto.updatedAt || `${vigenciaDesde}T08:00:00-04:00`) : undefined,
    motivoCambio: 'Migración inicial de presupuesto por proyecto',
    esMigracionInicial: true,
    updatedAt: proyecto.updatedAt || new Date().toISOString(),
    syncStatus: 'synced',
  };
}

export function asegurarPresupuestosProyectos(
  empresaId: string,
  proyectos: Proyecto[],
  existentes: PresupuestoProyecto[] = []
): PresupuestoProyecto[] {
  const resultado = existentes.map((p) => ({
    ...p,
    empresaId: p.empresaId || empresaId,
    lineas: normalizarLineasPresupuesto(p.lineas),
    totalPlanificadoRD: calcularTotalPlanificadoPresupuesto(p.lineas),
  }));

  const proyectosConPresupuesto = new Set(resultado.map((p) => p.proyectoId));
  for (const proy of proyectos) {
    if (!proyectosConPresupuesto.has(proy.id)) {
      resultado.push(
        migrarProyectoAPresupuestoInicial({
          ...proy,
          empresaId: proy.empresaId || empresaId,
        })
      );
    }
  }

  return resultado;
}

export function obtenerHistorialPresupuestosProyecto(
  presupuestos: PresupuestoProyecto[],
  proyectoId: string
): PresupuestoProyecto[] {
  return presupuestos
    .filter((p) => p.proyectoId === proyectoId)
    .sort((a, b) => {
      if (a.vigenciaDesde !== b.vigenciaDesde) {
        return b.vigenciaDesde.localeCompare(a.vigenciaDesde);
      }
      return b.version - a.version;
    });
}

export function obtenerPresupuestoVigenteProyecto(
  presupuestos: PresupuestoProyecto[],
  proyectoId: string,
  fechaCalculoIso: string = obtenerFechaHoyAST(),
  opts?: { incluirBorrador?: boolean; soloAprobados?: boolean }
): PresupuestoProyecto | undefined {
  const historial = obtenerHistorialPresupuestosProyecto(presupuestos, proyectoId);
  if (historial.length === 0) return undefined;

  const ordenAscendente = [...historial].reverse();
  const aprobadosOCerrados = historial.filter((p) => p.estado !== 'borrador');

  const resolverDesdeLista = (listaDesc: PresupuestoProyecto[]) => {
    if (listaDesc.length === 0) return undefined;
    const vigente = listaDesc.find((p) => p.vigenciaDesde <= fechaCalculoIso);
    if (vigente) return vigente;
    return listaDesc[listaDesc.length - 1];
  };

  if (opts?.incluirBorrador) {
    return resolverDesdeLista(historial);
  }

  if (aprobadosOCerrados.length > 0) {
    return resolverDesdeLista(aprobadosOCerrados);
  }

  if (opts?.soloAprobados) {
    return undefined;
  }

  return ordenAscendente[ordenAscendente.length - 1];
}

export function validarNuevoPresupuestoVersion(params: {
  rol: RolEmpresa;
  existentesProyecto: PresupuestoProyecto[];
  vigenciaDesde: string;
  lineas: LineaPresupuestoProyecto[];
}): { valido: boolean; error?: string } {
  const { rol, existentesProyecto, vigenciaDesde, lineas } = params;
  if (!puedeGestionarPresupuesto(rol)) {
    return {
      valido: false,
      error: 'Solo Admin o Coordinador pueden crear versiones de presupuesto.',
    };
  }

  if (existentesProyecto.some((p) => p.estado === 'cerrado')) {
    return {
      valido: false,
      error: 'El presupuesto de este proyecto está cerrado y no admite nuevas versiones.',
    };
  }

  if (existentesProyecto.some((p) => p.estado === 'borrador')) {
    return {
      valido: false,
      error: 'Ya existe un borrador abierto para este proyecto. Edítalo o apruébalo antes de crear otra versión.',
    };
  }

  if (!esFechaIsoValida(vigenciaDesde)) {
    return {
      valido: false,
      error: 'La fecha de vigencia debe tener formato YYYY-MM-DD válido.',
    };
  }

  if (existentesProyecto.some((p) => p.vigenciaDesde === vigenciaDesde)) {
    return {
      valido: false,
      error: `Ya existe una versión de presupuesto vigente desde ${vigenciaDesde}. Elige otra fecha para evitar traslapes.`,
    };
  }

  return validarLineasPresupuesto(lineas);
}

export function validarEdicionPresupuesto(params: {
  rol: RolEmpresa;
  presupuesto: PresupuestoProyecto;
  existentesProyecto: PresupuestoProyecto[];
  vigenciaDesde?: string;
  lineas: LineaPresupuestoProyecto[];
}): { valido: boolean; error?: string } {
  const { rol, presupuesto, existentesProyecto, vigenciaDesde, lineas } = params;
  if (!puedeGestionarPresupuesto(rol)) {
    return {
      valido: false,
      error: 'Solo Admin o Coordinador pueden editar presupuestos en borrador.',
    };
  }

  if (presupuesto.estado === 'aprobado') {
    return {
      valido: false,
      error:
        'Un presupuesto aprobado es inmutable y no puede editarse. Crea una nueva versión con su fecha de vigencia.',
    };
  }

  if (presupuesto.estado === 'cerrado') {
    return {
      valido: false,
      error: 'Un presupuesto cerrado es inmutable y de solo lectura.',
    };
  }

  if (vigenciaDesde !== undefined) {
    if (!esFechaIsoValida(vigenciaDesde)) {
      return {
        valido: false,
        error: 'La fecha de vigencia debe tener formato YYYY-MM-DD válido.',
      };
    }
    const choca = existentesProyecto.some(
      (p) => p.id !== presupuesto.id && p.vigenciaDesde === vigenciaDesde
    );
    if (choca) {
      return {
        valido: false,
        error: `Ya existe otra versión con vigencia desde ${vigenciaDesde}.`,
      };
    }
  }

  return validarLineasPresupuesto(lineas);
}

export function validarTransicionPresupuesto(params: {
  rol: RolEmpresa;
  presupuesto: Pick<PresupuestoProyecto, 'estado'>;
  nuevoEstado: EstadoPresupuestoProyecto;
}): { valido: boolean; error?: string } {
  const { rol, presupuesto, nuevoEstado } = params;
  if (!puedeGestionarPresupuesto(rol)) {
    return {
      valido: false,
      error: 'Solo Admin o Coordinador pueden aprobar o cerrar presupuestos.',
    };
  }

  if (nuevoEstado === presupuesto.estado) {
    return {
      valido: false,
      error: `El presupuesto ya se encuentra en estado "${ETIQUETAS_ESTADO_PRESUPUESTO[nuevoEstado]}".`,
    };
  }

  if (nuevoEstado === 'borrador') {
    return {
      valido: false,
      error:
        'Un presupuesto no puede devolverse a borrador. Si necesitas ajustes, crea una nueva versión.',
    };
  }

  if (presupuesto.estado === 'cerrado') {
    return {
      valido: false,
      error: 'Un presupuesto cerrado es definitivo y no puede cambiar de estado.',
    };
  }

  if (presupuesto.estado === 'borrador' && nuevoEstado === 'cerrado') {
    return {
      valido: false,
      error: 'Debes aprobar el presupuesto antes de poder cerrarlo.',
    };
  }

  return { valido: true };
}

export interface ItemEstimadoViaticoPuesto {
  puesto: string;
  dias: number;
  personas: number;
  incluirAlojamiento?: boolean;
}

export interface ResultadoEstimadoViaticosPuesto {
  desglose: Array<{
    puesto: string;
    personas: number;
    dias: number;
    incluirAlojamiento: boolean;
    tarifaDiariaRD: number;
    subtotalRD: number;
  }>;
  totalEstimadoRD: number;
  esProvisional: true;
  etiquetaEstado: string;
}

export function calcularEstimadoViaticosPorPuesto(
  items: ItemEstimadoViaticoPuesto[]
): ResultadoEstimadoViaticosPuesto {
  const desglose = items
    .filter((item) => item.personas > 0 && item.dias > 0)
    .map((item) => {
      const tarifa = TARIFAS_VIATICOS_PROVISIONALES_PUESTO.find(
        (t) =>
          t.puesto.toLowerCase() === item.puesto.trim().toLowerCase() ||
          t.cargoCodigoSugerido === item.puesto.trim().toLowerCase()
      );
      const incluirAlojamiento = item.incluirAlojamiento ?? true;
      const tarifaDiariaRD = tarifa
        ? incluirAlojamiento
          ? tarifa.montoViaticosRD
          : tarifa.dietaTotalRD
        : 0;
      const subtotalRD = redondear2(tarifaDiariaRD * item.dias * item.personas);
      return {
        puesto: tarifa?.puesto ?? item.puesto,
        personas: item.personas,
        dias: item.dias,
        incluirAlojamiento,
        tarifaDiariaRD,
        subtotalRD,
      };
    });

  return {
    desglose,
    totalEstimadoRD: redondear2(desglose.reduce((sum, d) => sum + d.subtotalRD, 0)),
    esProvisional: true,
    etiquetaEstado: ETIQUETA_EJEMPLO_CONFIRMAR,
  };
}

export function diasEnRangoInclusivo(fechaInicio: string, fechaFin: string): number {
  if (!validarRangoFechas(fechaInicio, fechaFin)) return 0;
  const start = new Date(`${fechaInicio}T00:00:00Z`).getTime();
  const end = new Date(`${fechaFin}T00:00:00Z`).getTime();
  const diffDays = Math.round((end - start) / 86400000);
  return Math.max(1, diffDays + 1);
}

export type SnapshotFuentesPresupuesto = Pick<
  EstadoEmpresaSnapshot,
  | 'proyectos'
  | 'presupuestos'
  | 'rutas'
  | 'asignaciones'
  | 'cuadrillas'
  | 'personal'
  | 'vehiculos'
  | 'viaticos'
  | 'rentas'
  | 'configuracion'
>;

export interface EjecutadoPorCategoriaProyecto {
  proyectoId: string;
  porCategoria: Record<CategoriaPresupuesto, number>;
  totalEjecutadoRD: number;
  viaticosPendientesRD: number;
  combustibleEnViaticosRD: number;
  diasCampoAsignados: number;
}

export function calcularEjecutadoProyectoDesdeFuentes(params: {
  proyectoId: string;
  rutas: Ruta[];
  asignaciones: Asignacion[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  rentas: Renta[];
  configuracion?: ConfiguracionEmpresa;
  otrosEjecutadosRD?: number;
}): EjecutadoPorCategoriaProyecto {
  const {
    proyectoId,
    rutas,
    asignaciones,
    cuadrillas,
    personal,
    vehiculos,
    viaticos,
    rentas,
    configuracion,
    otrosEjecutadosRD = 0,
  } = params;

  const rutasProyecto = rutas.filter((r) => r.proyectoId === proyectoId);
  const rutaMap = new Map(rutasProyecto.map((r) => [r.id, r]));
  const asignacionesProyecto = asignaciones.filter((a) => rutaMap.has(a.rutaId));

  let viaticosAprobadosRD = 0;
  let viaticosPendientesRD = 0;
  let combustibleEnViaticosRD = 0;

  for (const v of viaticos) {
    if (v.estadoAprobacion === 'rechazado') continue;

    // Si un excedente fue cargado al colaborador, solo el monto aprobado a empresa entra en gastos reales.
    const repartosEfectivos =
      v.estadoAprobacion === 'aprobado' &&
      v.decisionExcedente === 'cargo_colaborador' &&
      v.montoAprobadoEmpresaRD !== undefined
        ? escalarRepartosAMontoEmpresa(v.montoAprobadoEmpresaRD, v.repartos)
        : v.repartos;

    for (const r of repartosEfectivos) {
      if (r.proyectoId !== proyectoId) continue;
      if (v.estadoAprobacion === 'aprobado') {
        viaticosAprobadosRD += r.montoRD;
        if (v.categoria === 'Combustible') {
          combustibleEnViaticosRD += r.montoRD;
        }
      } else {
        viaticosPendientesRD += r.montoRD;
      }
    }
  }

  let rentasRD = 0;
  for (const renta of rentas) {
    if (renta.estado === 'cancelada') continue;
    if (Array.isArray(renta.repartos) && renta.repartos.length > 0) {
      for (const r of renta.repartos) {
        if (r.proyectoId === proyectoId) {
          rentasRD += r.montoRD;
        }
      }
    } else if (renta.rutaId && rutaMap.has(renta.rutaId)) {
      rentasRD += renta.costoTotalRD;
    }
  }

  let personalRD = 0;
  let vehiculosRD = 0;
  let equiposGnssRD = 0;
  let diasCampoAsignados = 0;

  for (const asig of asignacionesProyecto) {
    const dias = diasEnRangoInclusivo(asig.fechaInicio, asig.fechaFin);
    if (dias <= 0) continue;
    diasCampoAsignados += dias;

    const conceptoDistancia = configuracion
      ? obtenerReglasViaticosVigentes(configuracion, asig.fechaInicio).gpsRuta.conceptoDistancia
      : 'ida_vuelta';
    const factorDistancia = conceptoDistancia === 'solo_ida' ? 1 : 2;

    const cuad = cuadrillas.find((c) => c.id === asig.cuadrillaId);
    if (cuad) {
      const miembrosUnicos = new Set<string>();
      if (cuad.jefeId) miembrosUnicos.add(cuad.jefeId);
      for (const mId of cuad.miembroIds) {
        miembrosUnicos.add(mId);
      }
      for (const personaId of miembrosUnicos) {
        const persona = personal.find((p) => p.id === personaId);
        const cargo = persona?.cargo ?? 'tecnico';
        const tarifaDiaria =
          TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaPersonalPorCargoRD[cargo] ??
          TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaPersonalDefaultRD;
        personalRD += dias * tarifaDiaria;
      }
    }

    const ruta = rutaMap.get(asig.rutaId);
    const distanceOneWayKm = ruta?.routeSummary?.distanceOneWayKm ?? 0;
    const kmViaje = distanceOneWayKm * factorDistancia;
    if (kmViaje > 0) {
      const vehiculosUnicos = new Set(asig.vehiculoIds);
      for (const vehId of vehiculosUnicos) {
        const veh = vehiculos.find((v) => v.id === vehId);
        if (!veh) continue;
        const costoCombustible = veh.kmPorGal > 0 ? (kmViaje / veh.kmPorGal) * veh.precioGalonRD : 0;
        const costoMantenimiento = kmViaje * veh.mantenimientoPorKmRD;
        vehiculosRD += costoCombustible + costoMantenimiento;
      }
    }

    const equiposUnicos = new Set(asig.equipoIds);
    equiposGnssRD +=
      dias * equiposUnicos.size * TARIFAS_COSTO_OPERATIVO_PROVISIONAL.tarifaDiariaEquipoGnssRD;
  }

  const porCategoria: Record<CategoriaPresupuesto, number> = {
    viaticos: redondear2(viaticosAprobadosRD),
    rentas: redondear2(rentasRD),
    personal: redondear2(personalRD),
    vehiculos: redondear2(vehiculosRD),
    equipos_gnss: redondear2(equiposGnssRD),
    otros: redondear2(Math.max(0, otrosEjecutadosRD)),
  };

  const totalEjecutadoRD = redondear2(
    CATEGORIAS_PRESUPUESTO.reduce((acc, cat) => acc + porCategoria[cat], 0)
  );

  return {
    proyectoId,
    porCategoria,
    totalEjecutadoRD,
    viaticosPendientesRD: redondear2(viaticosPendientesRD),
    combustibleEnViaticosRD: redondear2(combustibleEnViaticosRD),
    diasCampoAsignados,
  };
}

export function calcularEjecutadoProyectoDesdeSnapshot(
  snapshot: SnapshotFuentesPresupuesto,
  proyectoId: string,
  opts?: { otrosEjecutadosRD?: number }
): EjecutadoPorCategoriaProyecto {
  return calcularEjecutadoProyectoDesdeFuentes({
    proyectoId,
    rutas: snapshot.rutas ?? [],
    asignaciones: snapshot.asignaciones ?? [],
    cuadrillas: snapshot.cuadrillas ?? [],
    personal: snapshot.personal ?? [],
    vehiculos: snapshot.vehiculos ?? [],
    viaticos: snapshot.viaticos ?? [],
    rentas: snapshot.rentas ?? [],
    configuracion: snapshot.configuracion,
    otrosEjecutadosRD: opts?.otrosEjecutadosRD,
  });
}

export interface FilaComparacionPresupuestoCategoria {
  categoria: CategoriaPresupuesto;
  etiqueta: string;
  planificadoRD: number;
  ejecutadoRD: number;
  diferenciaRD: number;
  variacionPct: number | null;
  porcentajeEjecucionPct: number | null;
  excedido: boolean;
}

export interface ComparacionPresupuestoProyecto {
  proyectoId: string;
  codigoContrato: string;
  nombreProyecto: string;
  valorContratoRD: number;
  presupuestoVigente?: PresupuestoProyecto;
  versionVigente?: number;
  estadoPresupuesto?: EstadoPresupuestoProyecto;
  vigenciaDesde?: string;
  esMigracionInicial: boolean;
  filas: FilaComparacionPresupuestoCategoria[];
  totalPlanificadoRD: number;
  totalEjecutadoRD: number;
  diferenciaTotalRD: number;
  variacionTotalPct: number | null;
  porcentajeEjecucionTotalPct: number | null;
  excedidoTotal: boolean;
  margenPlanificadoRD: number;
  margenPlanificadoPct: number | null;
  margenRealRD: number;
  margenRealPct: number | null;
  viaticosPendientesRD: number;
  combustibleEnViaticosRD: number;
  diasCampoAsignados: number;
}

export function compararPresupuestoProyecto(params: {
  proyecto: Pick<
    Proyecto,
    'id' | 'codigoContrato' | 'nombre' | 'valorContratoRD' | 'presupuestoViaticosRD' | 'fechaCreacion' | 'empresaId' | 'updatedAt'
  >;
  presupuesto?: PresupuestoProyecto;
  ejecutado: EjecutadoPorCategoriaProyecto;
}): ComparacionPresupuestoProyecto {
  const { proyecto, presupuesto, ejecutado } = params;

  const lineasPlan = presupuesto
    ? normalizarLineasPresupuesto(presupuesto.lineas)
    : crearLineasBasePresupuesto({ viaticos: proyecto.presupuestoViaticosRD });

  const filas: FilaComparacionPresupuestoCategoria[] = lineasPlan.map((linea) => {
    const planificadoRD = redondear2(linea.montoPlanificadoRD);
    const ejecutadoRD = redondear2(ejecutado.porCategoria[linea.categoria] ?? 0);
    const diferenciaRD = redondear2(planificadoRD - ejecutadoRD);
    const variacionPct =
      planificadoRD > 0
        ? Number((((ejecutadoRD - planificadoRD) / planificadoRD) * 100).toFixed(1))
        : null;
    const porcentajeEjecucionPct =
      planificadoRD > 0
        ? Number(((ejecutadoRD / planificadoRD) * 100).toFixed(1))
        : null;
    return {
      categoria: linea.categoria,
      etiqueta: ETIQUETAS_CATEGORIA_PRESUPUESTO[linea.categoria],
      planificadoRD,
      ejecutadoRD,
      diferenciaRD,
      variacionPct,
      porcentajeEjecucionPct,
      excedido: ejecutadoRD > planificadoRD,
    };
  });

  const totalPlanificadoRD = redondear2(
    filas.reduce((acc, f) => acc + f.planificadoRD, 0)
  );
  const totalEjecutadoRD = redondear2(
    filas.reduce((acc, f) => acc + f.ejecutadoRD, 0)
  );
  const diferenciaTotalRD = redondear2(totalPlanificadoRD - totalEjecutadoRD);
  const variacionTotalPct =
    totalPlanificadoRD > 0
      ? Number((((totalEjecutadoRD - totalPlanificadoRD) / totalPlanificadoRD) * 100).toFixed(1))
      : null;
  const porcentajeEjecucionTotalPct =
    totalPlanificadoRD > 0
      ? Number(((totalEjecutadoRD / totalPlanificadoRD) * 100).toFixed(1))
      : null;
  const valorContratoRD = redondear2(proyecto.valorContratoRD);
  const margenPlanificadoRD = redondear2(valorContratoRD - totalPlanificadoRD);
  const margenRealRD = redondear2(valorContratoRD - totalEjecutadoRD);

  return {
    proyectoId: proyecto.id,
    codigoContrato: proyecto.codigoContrato,
    nombreProyecto: proyecto.nombre,
    valorContratoRD,
    presupuestoVigente: presupuesto,
    versionVigente: presupuesto?.version,
    estadoPresupuesto: presupuesto?.estado,
    vigenciaDesde: presupuesto?.vigenciaDesde,
    esMigracionInicial: Boolean(presupuesto?.esMigracionInicial),
    filas,
    totalPlanificadoRD,
    totalEjecutadoRD,
    diferenciaTotalRD,
    variacionTotalPct,
    porcentajeEjecucionTotalPct,
    excedidoTotal: totalEjecutadoRD > totalPlanificadoRD,
    margenPlanificadoRD,
    margenPlanificadoPct:
      valorContratoRD > 0
        ? Number(((margenPlanificadoRD / valorContratoRD) * 100).toFixed(1))
        : null,
    margenRealRD,
    margenRealPct:
      valorContratoRD > 0
        ? Number(((margenRealRD / valorContratoRD) * 100).toFixed(1))
        : null,
    viaticosPendientesRD: ejecutado.viaticosPendientesRD,
    combustibleEnViaticosRD: ejecutado.combustibleEnViaticosRD,
    diasCampoAsignados: ejecutado.diasCampoAsignados,
  };
}

export function compararVersionPresupuestoConSnapshot(params: {
  presupuesto: PresupuestoProyecto;
  snapshot: SnapshotFuentesPresupuesto;
  proyecto?: Pick<
    Proyecto,
    'id' | 'codigoContrato' | 'nombre' | 'valorContratoRD' | 'presupuestoViaticosRD' | 'fechaCreacion' | 'empresaId' | 'updatedAt'
  >;
  otrosEjecutadosRD?: number;
}): ComparacionPresupuestoProyecto {
  const { presupuesto, snapshot, otrosEjecutadosRD } = params;
  const proyecto =
    params.proyecto ?? snapshot.proyectos.find((p) => p.id === presupuesto.proyectoId);

  if (!proyecto) {
    throw new Error(`El proyecto "${presupuesto.proyectoId}" no existe en el snapshot.`);
  }

  const ejecutado = calcularEjecutadoProyectoDesdeSnapshot(snapshot, proyecto.id, {
    otrosEjecutadosRD,
  });

  return compararPresupuestoProyecto({
    proyecto,
    presupuesto,
    ejecutado,
  });
}

export function compararPresupuestoProyectoConSnapshot(params: {
  proyectoId: string;
  snapshot: SnapshotFuentesPresupuesto;
  version?: number;
  fechaCalculoIso?: string;
  incluirBorrador?: boolean;
  otrosEjecutadosRD?: number;
}): ComparacionPresupuestoProyecto {
  const {
    proyectoId,
    snapshot,
    version,
    fechaCalculoIso = obtenerFechaHoyAST(),
    incluirBorrador,
    otrosEjecutadosRD,
  } = params;

  const proyecto = snapshot.proyectos.find((p) => p.id === proyectoId);
  if (!proyecto) {
    throw new Error(`El proyecto "${proyectoId}" no existe en el snapshot.`);
  }

  const presupuestosProyecto = (snapshot.presupuestos ?? []).filter(
    (p) => p.proyectoId === proyectoId
  );

  let presupuestoSeleccionado: PresupuestoProyecto | undefined;
  if (version !== undefined) {
    presupuestoSeleccionado = presupuestosProyecto.find((p) => p.version === version);
    if (!presupuestoSeleccionado) {
      throw new Error(
        `La versión v${version} del presupuesto no existe para el proyecto "${proyecto.nombre}".`
      );
    }
  } else {
    presupuestoSeleccionado = obtenerPresupuestoVigenteProyecto(
      snapshot.presupuestos ?? [],
      proyectoId,
      fechaCalculoIso,
      { incluirBorrador }
    );
  }

  const ejecutado = calcularEjecutadoProyectoDesdeSnapshot(snapshot, proyectoId, {
    otrosEjecutadosRD,
  });

  return compararPresupuestoProyecto({
    proyecto,
    presupuesto: presupuestoSeleccionado,
    ejecutado,
  });
}

export interface ReportePresupuestosEmpresa {
  comparaciones: ComparacionPresupuestoProyecto[];
  totales: {
    valorContratoRD: number;
    totalPlanificadoRD: number;
    totalEjecutadoRD: number;
    margenPlanificadoRD: number;
    margenPlanificadoPct: number | null;
    margenRealRD: number;
    margenRealPct: number | null;
  };
}

export function calcularReportePresupuestosEmpresa(params: {
  proyectos: Proyecto[];
  presupuestos: PresupuestoProyecto[];
  rutas: Ruta[];
  asignaciones: Asignacion[];
  cuadrillas: Cuadrilla[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  rentas: Renta[];
  configuracion?: ConfiguracionEmpresa;
  fechaCalculoIso?: string;
}): ReportePresupuestosEmpresa {
  const {
    proyectos,
    presupuestos,
    rutas,
    asignaciones,
    cuadrillas,
    personal,
    vehiculos,
    viaticos,
    rentas,
    configuracion,
    fechaCalculoIso = obtenerFechaHoyAST(),
  } = params;

  const comparaciones = proyectos.map((proyecto) => {
    const vigente = obtenerPresupuestoVigenteProyecto(
      presupuestos,
      proyecto.id,
      fechaCalculoIso
    );
    const ejecutado = calcularEjecutadoProyectoDesdeFuentes({
      proyectoId: proyecto.id,
      rutas,
      asignaciones,
      cuadrillas,
      personal,
      vehiculos,
      viaticos,
      rentas,
      configuracion,
    });
    return compararPresupuestoProyecto({
      proyecto,
      presupuesto: vigente,
      ejecutado,
    });
  });

  const valorContratoRD = redondear2(
    comparaciones.reduce((acc, c) => acc + c.valorContratoRD, 0)
  );
  const totalPlanificadoRD = redondear2(
    comparaciones.reduce((acc, c) => acc + c.totalPlanificadoRD, 0)
  );
  const totalEjecutadoRD = redondear2(
    comparaciones.reduce((acc, c) => acc + c.totalEjecutadoRD, 0)
  );
  const margenPlanificadoRD = redondear2(valorContratoRD - totalPlanificadoRD);
  const margenRealRD = redondear2(valorContratoRD - totalEjecutadoRD);

  return {
    comparaciones,
    totales: {
      valorContratoRD,
      totalPlanificadoRD,
      totalEjecutadoRD,
      margenPlanificadoRD,
      margenPlanificadoPct:
        valorContratoRD > 0
          ? Number(((margenPlanificadoRD / valorContratoRD) * 100).toFixed(1))
          : null,
      margenRealRD,
      margenRealPct:
        valorContratoRD > 0
          ? Number(((margenRealRD / valorContratoRD) * 100).toFixed(1))
          : null,
    },
  };
}

export function calcularReportePresupuestosDesdeSnapshot(
  snapshot: SnapshotFuentesPresupuesto,
  opts?: { fechaCalculoIso?: string }
): ReportePresupuestosEmpresa {
  return calcularReportePresupuestosEmpresa({
    proyectos: snapshot.proyectos ?? [],
    presupuestos: snapshot.presupuestos ?? [],
    rutas: snapshot.rutas ?? [],
    asignaciones: snapshot.asignaciones ?? [],
    cuadrillas: snapshot.cuadrillas ?? [],
    personal: snapshot.personal ?? [],
    vehiculos: snapshot.vehiculos ?? [],
    viaticos: snapshot.viaticos ?? [],
    rentas: snapshot.rentas ?? [],
    configuracion: snapshot.configuracion,
    fechaCalculoIso: opts?.fechaCalculoIso,
  });
}
