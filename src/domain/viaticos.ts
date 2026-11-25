import type {
  CargoConfig,
  CategoriaViatico,
  ConfiguracionEmpresa,
  DecisionExcedenteViatico,
  EstadoAprobacionViatico,
  Mision,
  Personal,
  Proyecto,
  Renta,
  RepartoProyecto,
  RolEmpresa,
  TopeViaticoUsuarioResumen,
  Viatico,
} from '../types/domain';
import {
  obtenerTopeViaticoParaCargoCategoria,
  resolverEtiquetaCargo,
} from './configuracion';

export const ERROR_TECNICO_SIN_PERSONAL =
  'Tu usuario no está vinculado a un registro de personal. Contacta al administrador.';

// SUPUESTO PENDIENTE: "El reparto de viáticos es por monto exacto, no por porcentaje"
export function validarRepartoViatico(
  montoTotalRD: number,
  repartos: RepartoProyecto[]
): { valido: boolean; error?: string; sumaRD: number } {
  if (!Number.isFinite(montoTotalRD) || montoTotalRD < 0) {
    return { valido: false, error: 'El monto total del viático debe ser mayor o igual a 0.', sumaRD: 0 };
  }
  if (!Array.isArray(repartos) || repartos.length === 0) {
    return {
      valido: false,
      error: 'Debes asignar al menos un proyecto o enviar el monto a "sin_asignar".',
      sumaRD: 0,
    };
  }

  const vistos = new Set<string>();
  let sumaCents = 0;

  for (const r of repartos) {
    if (!r.proyectoId) {
      return { valido: false, error: 'Cada línea de reparto debe tener un proyectoId válido.', sumaRD: 0 };
    }
    if (vistos.has(r.proyectoId)) {
      return {
        valido: false,
        error: `Proyecto duplicado en el reparto (${r.proyectoId}).`,
        sumaRD: 0,
      };
    }
    vistos.add(r.proyectoId);

    if (!Number.isFinite(r.montoRD) || r.montoRD < 0) {
      return {
        valido: false,
        error: 'Los montos de reparto no pueden ser negativos.',
        sumaRD: 0,
      };
    }
    sumaCents += Math.round(r.montoRD * 100);
  }

  const totalCents = Math.round(montoTotalRD * 100);
  const sumaRD = Number((sumaCents / 100).toFixed(2));

  if (sumaCents !== totalCents) {
    const diffRD = ((totalCents - sumaCents) / 100).toFixed(2);
    return {
      valido: false,
      error: `La suma del reparto (${sumaRD.toFixed(2)} RD$) debe igualar exactamente el monto del gasto (${montoTotalRD.toFixed(2)} RD$). Diferencia: ${diffRD} RD$.`,
      sumaRD,
    };
  }

  return { valido: true, sumaRD };
}

export function completarRepartoConSinAsignar(
  montoTotalRD: number,
  repartosProyectos: RepartoProyecto[]
): RepartoProyecto[] {
  const filtrados = repartosProyectos.filter(
    (r) => r.proyectoId !== 'sin_asignar' && r.montoRD > 0
  );
  const sumaAsignadaCents = filtrados.reduce((acc, r) => acc + Math.round(r.montoRD * 100), 0);
  const totalCents = Math.round(montoTotalRD * 100);
  const restanteCents = totalCents - sumaAsignadaCents;

  if (restanteCents > 0) {
    return [
      ...filtrados,
      { proyectoId: 'sin_asignar', montoRD: Number((restanteCents / 100).toFixed(2)) },
    ];
  }
  return filtrados;
}

export function escalarRepartosAMontoEmpresa(
  montoEmpresaRD: number,
  repartosOriginales: RepartoProyecto[]
): RepartoProyecto[] {
  const targetCents = Math.max(0, Math.round(montoEmpresaRD * 100));
  if (repartosOriginales.length === 0) {
    return [{ proyectoId: 'sin_asignar', montoRD: Number((targetCents / 100).toFixed(2)) }];
  }
  if (targetCents === 0) {
    return [{ proyectoId: repartosOriginales[0].proyectoId, montoRD: 0 }];
  }

  const baseCents = repartosOriginales.map((r) => Math.max(0, Math.round(r.montoRD * 100)));
  const totalBaseCents = baseCents.reduce((a, b) => a + b, 0);

  if (totalBaseCents <= 0) {
    return [
      {
        proyectoId: repartosOriginales[0].proyectoId,
        montoRD: Number((targetCents / 100).toFixed(2)),
      },
    ];
  }

  const exactos = baseCents.map((c) => (c * targetCents) / totalBaseCents);
  const pisos = exactos.map((e) => Math.floor(e));
  let restante = targetCents - pisos.reduce((a, b) => a + b, 0);

  const indicesOrdenados = exactos
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac);

  let idx = 0;
  while (restante > 0 && indicesOrdenados.length > 0) {
    const targetIdx = indicesOrdenados[idx % indicesOrdenados.length].i;
    pisos[targetIdx] += 1;
    restante -= 1;
    idx += 1;
  }

  return repartosOriginales
    .map((r, i) => ({
      proyectoId: r.proyectoId,
      montoRD: Number((pisos[i] / 100).toFixed(2)),
    }))
    .filter((r, i) => r.montoRD > 0 || i === 0);
}

export function resolverPersonalYCargoUsuario(params: {
  usuarioId: string;
  rol: RolEmpresa;
  personalIdMembresia?: string;
  personal: Personal[];
}): {
  valido: boolean;
  error?: string;
  personalId?: string;
  cargoCodigo: string;
} {
  const { usuarioId, rol, personalIdMembresia, personal } = params;
  const personByMembresia = personalIdMembresia
    ? personal.find((p) => p.id === personalIdMembresia)
    : undefined;
  const personByUsuario = personal.find((p) => p.usuarioId === usuarioId);
  const persona = personByMembresia ?? personByUsuario;
  const personalId = persona?.id ?? personalIdMembresia;

  if (rol === 'tecnico' && !personalId) {
    return {
      valido: false,
      error: ERROR_TECNICO_SIN_PERSONAL,
      cargoCodigo: 'tecnico',
    };
  }

  if (!personalId) {
    return {
      valido: true,
      personalId: undefined,
      cargoCodigo: 'administrativo',
    };
  }

  return {
    valido: true,
    personalId,
    cargoCodigo: persona?.cargo || (rol === 'tecnico' ? 'tecnico' : 'administrativo'),
  };
}

export interface EvaluacionTopeViatico {
  aplicaTope: boolean;
  cargoCodigo: string;
  acumuladoPrevioRD: number;
  totalConNuevoRD: number;
  topeAplicadoRD?: number;
  excedenteRD: number;
  superaTope: boolean;
  categoriaNoPermitida: boolean;
  motivoExcedenteRequerido: boolean;
  mensajeAviso?: string;
}

export function evaluarTopeViaticoEnMision(params: {
  misionId?: string;
  categoria: CategoriaViatico;
  montoRD: number;
  cargoCodigo: string;
  usuarioId: string;
  personalId?: string;
  viaticosExistentes: Viatico[];
  excluirViaticoId?: string;
  config?: ConfiguracionEmpresa;
  topeDirecto?: TopeViaticoUsuarioResumen;
  fechaCalculoIso?: string;
}): EvaluacionTopeViatico {
  const {
    misionId,
    categoria,
    montoRD,
    cargoCodigo,
    usuarioId,
    personalId,
    viaticosExistentes,
    excluirViaticoId,
    config,
    topeDirecto,
    fechaCalculoIso,
  } = params;

  if (!misionId) {
    return {
      aplicaTope: false,
      cargoCodigo,
      acumuladoPrevioRD: 0,
      totalConNuevoRD: Number(montoRD.toFixed(2)),
      topeAplicadoRD: undefined,
      excedenteRD: 0,
      superaTope: false,
      categoriaNoPermitida: false,
      motivoExcedenteRequerido: false,
    };
  }

  const topeVigente =
    topeDirecto?.montoMaximoPorMisionRD ??
    (config
      ? obtenerTopeViaticoParaCargoCategoria({
          config,
          cargoCodigo,
          categoria,
          fechaCalculoIso,
        })?.montoMaximoPorMisionRD
      : undefined);

  const acumuladoPrevioRD = Number(
    viaticosExistentes
      .filter((v) => {
        if (v.id === excluirViaticoId) return false;
        if (v.estadoAprobacion === 'rechazado') return false;
        if (v.misionId !== misionId) return false;
        if (v.categoria !== categoria) return false;
        if (personalId) {
          return v.personalId
            ? v.personalId === personalId
            : v.creadoPorUsuarioId === usuarioId;
        }
        return v.creadoPorUsuarioId === usuarioId && !v.personalId;
      })
      .reduce((sum, v) => sum + v.montoRD, 0)
      .toFixed(2)
  );

  const totalConNuevoRD = Number((acumuladoPrevioRD + Math.max(0, montoRD)).toFixed(2));

  if (topeVigente === undefined) {
    return {
      aplicaTope: false,
      cargoCodigo,
      acumuladoPrevioRD,
      totalConNuevoRD,
      topeAplicadoRD: undefined,
      excedenteRD: 0,
      superaTope: false,
      categoriaNoPermitida: false,
      motivoExcedenteRequerido: false,
    };
  }

  const categoriaNoPermitida = topeVigente === 0;
  const excedenteBruto = totalConNuevoRD > topeVigente ? totalConNuevoRD - topeVigente : 0;
  const excedenteRD = Number(Math.min(Math.max(0, montoRD), excedenteBruto).toFixed(2));
  const superaTope = excedenteRD > 0 || (categoriaNoPermitida && montoRD > 0);
  const motivoExcedenteRequerido = excedenteRD > 0;

  let mensajeAviso: string | undefined;
  if (categoriaNoPermitida) {
    mensajeAviso = `La categoría "${categoria}" tiene tope RD$ 0 (no permitida) para el cargo ${cargoCodigo}. Debes indicar un motivo para registrarla.`;
  } else if (excedenteRD > 0) {
    mensajeAviso = `Acumulado en misión (${totalConNuevoRD.toLocaleString('es-DO')} RD$) supera el tope de ${topeVigente.toLocaleString('es-DO')} RD$ por ${excedenteRD.toLocaleString('es-DO')} RD$. Indica motivo obligatorio.`;
  }

  return {
    aplicaTope: true,
    cargoCodigo,
    acumuladoPrevioRD,
    totalConNuevoRD,
    topeAplicadoRD: topeVigente,
    excedenteRD,
    superaTope,
    categoriaNoPermitida,
    motivoExcedenteRequerido,
    mensajeAviso,
  };
}

export function validarEdicionViatico(params: {
  viatico: Viatico;
  rol: RolEmpresa;
  usuarioId: string;
}): { valido: boolean; error?: string } {
  const { viatico, rol, usuarioId } = params;
  if (viatico.estadoAprobacion === 'aprobado') {
    return {
      valido: false,
      error: 'Los viáticos aprobados son inmutables y no pueden editarse por ningún rol.',
    };
  }
  if (viatico.estadoAprobacion === 'rechazado') {
    return {
      valido: false,
      error: 'Este viático fue rechazado y es de solo lectura.',
    };
  }
  if (rol === 'tecnico' && viatico.creadoPorUsuarioId !== usuarioId) {
    return {
      valido: false,
      error: 'Solo puedes modificar tus propios viáticos pendientes.',
    };
  }
  return { valido: true };
}

export function validarRedistribucionViatico(params: {
  viatico: Pick<Viatico, 'estadoAprobacion'>;
  rol: RolEmpresa;
}): { valido: boolean; error?: string } {
  const { viatico, rol } = params;
  if (viatico.estadoAprobacion !== 'pendiente') {
    return {
      valido: false,
      error: 'Este viático ya fue revisado y su reparto no puede modificarse.',
    };
  }
  if (rol !== 'admin' && rol !== 'coordinador') {
    return {
      valido: false,
      error: 'Solo Coordinador o Admin pueden redistribuir el reparto a proyectos.',
    };
  }
  return { valido: true };
}

export function validarEliminacionViatico(
  viatico: Pick<Viatico, 'estadoAprobacion'>
): { valido: boolean; error?: string } {
  if (viatico.estadoAprobacion !== 'pendiente') {
    return {
      valido: false,
      error: 'Un viático aprobado o rechazado no puede eliminarse. Si fue un error, regístralo como ajuste.',
    };
  }
  return { valido: true };
}

export function validarDecisionViatico(params: {
  estadoActual: EstadoAprobacionViatico;
  rol: RolEmpresa;
  nuevoEstado: EstadoAprobacionViatico;
  motivoRechazo?: string;
  motivoDecision?: string;
  excedenteRD?: number;
  decisionExcedente?: DecisionExcedenteViatico;
}): { valido: boolean; error?: string } {
  const {
    estadoActual,
    rol,
    nuevoEstado,
    motivoRechazo,
    motivoDecision,
    excedenteRD = 0,
    decisionExcedente,
  } = params;
  if (estadoActual !== 'pendiente') {
    return {
      valido: false,
      error: 'Este viático ya fue revisado y no puede decidirse de nuevo.',
    };
  }
  if (nuevoEstado === 'pendiente') {
    return {
      valido: false,
      error: 'Un viático no puede devolverse a pendiente. Si hubo un error, regístralo como ajuste.',
    };
  }
  if (rol !== 'admin' && rol !== 'coordinador') {
    return { valido: false, error: 'Solo Admin o Coordinador pueden aprobar o rechazar viáticos.' };
  }
  const motivoEfectivo = (motivoRechazo ?? motivoDecision ?? '').trim();
  if (nuevoEstado === 'rechazado' && motivoEfectivo.length < 4) {
    return {
      valido: false,
      error: 'Para rechazar un viático debes indicar el motivo del rechazo.',
    };
  }
  if (nuevoEstado === 'aprobado' && excedenteRD > 0) {
    if (!decisionExcedente) {
      return {
        valido: false,
        error:
          'Este viático excede el tope de misión. Selecciona si la empresa cubre el excedente o si se carga al colaborador.',
      };
    }
    if (motivoEfectivo.length < 4) {
      return {
        valido: false,
        error:
          'Debes registrar el motivo de la decisión sobre el excedente (mínimo 4 caracteres).',
      };
    }
  }
  return { valido: true };
}

export interface ResumenGastoProyecto {
  aprobadoRD: number;
  pendienteRD: number;
  totalEjecutadoRD: number;
}

export function calcularGastoPorProyecto(
  viaticos: Viatico[]
): Record<string, ResumenGastoProyecto> {
  const mapa: Record<string, ResumenGastoProyecto> = {};

  for (const v of viaticos) {
    if (v.estadoAprobacion === 'rechazado') continue;

    for (const r of v.repartos) {
      if (!mapa[r.proyectoId]) {
        mapa[r.proyectoId] = { aprobadoRD: 0, pendienteRD: 0, totalEjecutadoRD: 0 };
      }
      if (v.estadoAprobacion === 'aprobado') {
        mapa[r.proyectoId].aprobadoRD += r.montoRD;
      } else {
        mapa[r.proyectoId].pendienteRD += r.montoRD;
      }
      mapa[r.proyectoId].totalEjecutadoRD += r.montoRD;
    }
  }

  return mapa;
}

export interface FilaReporteProyectoViaticos {
  proyectoId: string;
  codigoContrato: string;
  nombre: string;
  presupuestoRD: number;
  aprobadoRD: number;
  pendienteRD: number;
  ejecutadoRD: number;
  saldoRD: number;
  excedido: boolean;
}

export function calcularReporteViaticosPorProyecto(
  proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre' | 'presupuestoViaticosRD'>>,
  viaticos: Viatico[]
): {
  filas: FilaReporteProyectoViaticos[];
  sinAsignar: { aprobadoRD: number; pendienteRD: number; ejecutadoRD: number };
  totales: {
    presupuestoRD: number;
    aprobadoRD: number;
    pendienteRD: number;
    ejecutadoRD: number;
    saldoRD: number;
  };
} {
  const gastos = calcularGastoPorProyecto(viaticos);

  const filas: FilaReporteProyectoViaticos[] = proyectos.map((p) => {
    const g = gastos[p.id] ?? { aprobadoRD: 0, pendienteRD: 0, totalEjecutadoRD: 0 };
    const presupuestoRD = Number(p.presupuestoViaticosRD.toFixed(2));
    const aprobadoRD = Number(g.aprobadoRD.toFixed(2));
    const pendienteRD = Number(g.pendienteRD.toFixed(2));
    const ejecutadoRD = Number(g.totalEjecutadoRD.toFixed(2));
    const saldoRD = Number((presupuestoRD - ejecutadoRD).toFixed(2));
    return {
      proyectoId: p.id,
      codigoContrato: p.codigoContrato,
      nombre: p.nombre,
      presupuestoRD,
      aprobadoRD,
      pendienteRD,
      ejecutadoRD,
      saldoRD,
      excedido: saldoRD < 0,
    };
  });

  const sin = gastos['sin_asignar'] ?? { aprobadoRD: 0, pendienteRD: 0, totalEjecutadoRD: 0 };
  const sinAsignar = {
    aprobadoRD: Number(sin.aprobadoRD.toFixed(2)),
    pendienteRD: Number(sin.pendienteRD.toFixed(2)),
    ejecutadoRD: Number(sin.totalEjecutadoRD.toFixed(2)),
  };

  const presupuestoTotal = filas.reduce((acc, f) => acc + f.presupuestoRD, 0);
  const aprobadoTotal = filas.reduce((acc, f) => acc + f.aprobadoRD, 0) + sinAsignar.aprobadoRD;
  const pendienteTotal = filas.reduce((acc, f) => acc + f.pendienteRD, 0) + sinAsignar.pendienteRD;
  const ejecutadoTotal = filas.reduce((acc, f) => acc + f.ejecutadoRD, 0) + sinAsignar.ejecutadoRD;

  return {
    filas,
    sinAsignar,
    totales: {
      presupuestoRD: Number(presupuestoTotal.toFixed(2)),
      aprobadoRD: Number(aprobadoTotal.toFixed(2)),
      pendienteRD: Number(pendienteTotal.toFixed(2)),
      ejecutadoRD: Number(ejecutadoTotal.toFixed(2)),
      saldoRD: Number((presupuestoTotal - ejecutadoTotal).toFixed(2)),
    },
  };
}

// ============================================================================
// B5. Reporte de viáticos y rentas por Misión + CSV
// ============================================================================

export interface DesgloseMisionCargoCategoria {
  cargoCodigo: string;
  cargoEtiqueta: string;
  categoria: CategoriaViatico;
  cantidadRegistros: number;
  topeRD?: number;
  gastoTotalRD: number;
  aprobadoEmpresaRD: number;
  cargoColaboradorRD: number;
  pendienteRD: number;
  excedenteRD: number;
}

export interface FilaReporteMisionViaticos {
  misionId: string;
  nombre: string;
  zona: string;
  provincia: string;
  fechaInicio: string;
  fechaFin: string;
  cantidadViaticos: number;
  aprobadoEmpresaRD: number;
  cargoColaboradorRD: number;
  pendienteRD: number;
  excedenteTotalRD: number;
  costoRentasRD: number;
  totalCostoEmpresaRD: number;
  desglose: DesgloseMisionCargoCategoria[];
}

export interface ReporteViaticosPorMision {
  misiones: FilaReporteMisionViaticos[];
  sinMision: {
    cantidadViaticos: number;
    aprobadoEmpresaRD: number;
    pendienteRD: number;
  };
  totales: {
    aprobadoEmpresaRD: number;
    cargoColaboradorRD: number;
    pendienteRD: number;
    costoRentasRD: number;
    totalCostoEmpresaRD: number;
  };
}

export function calcularReporteViaticosPorMision(params: {
  misiones: Mision[];
  viaticos: Viatico[];
  rentas?: Renta[];
  cargos?: CargoConfig[];
  config?: ConfiguracionEmpresa;
}): ReporteViaticosPorMision {
  const { misiones, viaticos, rentas = [], cargos = [], config } = params;

  const filasMision: FilaReporteMisionViaticos[] = misiones.map((m) => {
    const viaticosMision = viaticos.filter(
      (v) => v.misionId === m.id && v.estadoAprobacion !== 'rechazado'
    );
    const desgloseMapa = new Map<string, DesgloseMisionCargoCategoria>();

    let aprobadoEmpresaRD = 0;
    let cargoColaboradorRD = 0;
    let pendienteRD = 0;
    let excedenteTotalRD = 0;

    for (const v of viaticosMision) {
      const cargoCodigo = v.cargoUsado || 'administrativo';
      const key = `${cargoCodigo}::${v.categoria}`;
      const topeCfg =
        v.topeAplicadoRD ??
        (config
          ? obtenerTopeViaticoParaCargoCategoria({
              config,
              cargoCodigo,
              categoria: v.categoria,
              fechaCalculoIso: v.fechaIso || m.fechaInicio,
            })?.montoMaximoPorMisionRD
          : undefined);

      if (!desgloseMapa.has(key)) {
        desgloseMapa.set(key, {
          cargoCodigo,
          cargoEtiqueta: resolverEtiquetaCargo(cargoCodigo, cargos),
          categoria: v.categoria,
          cantidadRegistros: 0,
          topeRD: topeCfg,
          gastoTotalRD: 0,
          aprobadoEmpresaRD: 0,
          cargoColaboradorRD: 0,
          pendienteRD: 0,
          excedenteRD: 0,
        });
      }

      const item = desgloseMapa.get(key)!;
      item.cantidadRegistros += 1;
      item.gastoTotalRD = Number((item.gastoTotalRD + v.montoRD).toFixed(2));
      const exc = v.excedenteRD ?? 0;
      item.excedenteRD = Number((item.excedenteRD + exc).toFixed(2));
      excedenteTotalRD += exc;

      if (v.estadoAprobacion === 'aprobado') {
        const cargoCol = v.montoCargoColaboradorRD ?? 0;
        const empMonto =
          v.montoAprobadoEmpresaRD ?? Math.max(0, Number((v.montoRD - cargoCol).toFixed(2)));
        item.aprobadoEmpresaRD = Number((item.aprobadoEmpresaRD + empMonto).toFixed(2));
        item.cargoColaboradorRD = Number((item.cargoColaboradorRD + cargoCol).toFixed(2));
        aprobadoEmpresaRD += empMonto;
        cargoColaboradorRD += cargoCol;
      } else {
        item.pendienteRD = Number((item.pendienteRD + v.montoRD).toFixed(2));
        pendienteRD += v.montoRD;
      }
    }

    const costoRentasRD = rentas
      .filter((r) => r.misionId === m.id && r.estado !== 'cancelada')
      .reduce((sum, r) => sum + r.costoTotalRD, 0);

    return {
      misionId: m.id,
      nombre: m.nombre,
      zona: m.zona,
      provincia: m.provincia,
      fechaInicio: m.fechaInicio,
      fechaFin: m.fechaFin,
      cantidadViaticos: viaticosMision.length,
      aprobadoEmpresaRD: Number(aprobadoEmpresaRD.toFixed(2)),
      cargoColaboradorRD: Number(cargoColaboradorRD.toFixed(2)),
      pendienteRD: Number(pendienteRD.toFixed(2)),
      excedenteTotalRD: Number(excedenteTotalRD.toFixed(2)),
      costoRentasRD: Number(costoRentasRD.toFixed(2)),
      totalCostoEmpresaRD: Number((aprobadoEmpresaRD + costoRentasRD).toFixed(2)),
      desglose: Array.from(desgloseMapa.values()).sort((a, b) =>
        `${a.cargoEtiqueta}-${a.categoria}`.localeCompare(`${b.cargoEtiqueta}-${b.categoria}`)
      ),
    };
  });

  const sueltos = viaticos.filter((v) => !v.misionId && v.estadoAprobacion !== 'rechazado');
  const sinMision = {
    cantidadViaticos: sueltos.length,
    aprobadoEmpresaRD: Number(
      sueltos
        .filter((v) => v.estadoAprobacion === 'aprobado')
        .reduce((sum, v) => sum + (v.montoAprobadoEmpresaRD ?? v.montoRD), 0)
        .toFixed(2)
    ),
    pendienteRD: Number(
      sueltos
        .filter((v) => v.estadoAprobacion === 'pendiente')
        .reduce((sum, v) => sum + v.montoRD, 0)
        .toFixed(2)
    ),
  };

  const rentasSinMision = rentas
    .filter((r) => !r.misionId && r.estado !== 'cancelada')
    .reduce((sum, r) => sum + r.costoTotalRD, 0);

  const aprobadoTotal =
    filasMision.reduce((s, f) => s + f.aprobadoEmpresaRD, 0) + sinMision.aprobadoEmpresaRD;
  const colaboradorTotal = filasMision.reduce((s, f) => s + f.cargoColaboradorRD, 0);
  const pendienteTotal =
    filasMision.reduce((s, f) => s + f.pendienteRD, 0) + sinMision.pendienteRD;
  const rentasTotal =
    filasMision.reduce((s, f) => s + f.costoRentasRD, 0) + rentasSinMision;

  return {
    misiones: filasMision,
    sinMision,
    totales: {
      aprobadoEmpresaRD: Number(aprobadoTotal.toFixed(2)),
      cargoColaboradorRD: Number(colaboradorTotal.toFixed(2)),
      pendienteRD: Number(pendienteTotal.toFixed(2)),
      costoRentasRD: Number(rentasTotal.toFixed(2)),
      totalCostoEmpresaRD: Number((aprobadoTotal + rentasTotal).toFixed(2)),
    },
  };
}

function escaparCsvCampo(valor: string | number | undefined): string {
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor) : '0';
  }
  const txt = String(valor ?? '');
  const seguro = /^[=+\-@\t\r]/.test(txt) ? `'${txt}` : txt;
  if (/[",\n\r]/.test(seguro)) {
    return `"${seguro.replace(/"/g, '""')}"`;
  }
  return seguro;
}

export function generarCsvReporteMisiones(reporte: ReporteViaticosPorMision): string {
  const encabezados = [
    'Mision',
    'Zona',
    'Provincia',
    'Fecha Inicio',
    'Fecha Fin',
    'Cargo',
    'Categoria',
    'Tope RD$',
    'Gasto Total RD$',
    'Aprobado Empresa RD$',
    'Cargo Colaborador RD$',
    'Pendiente RD$',
    'Rentas Mision RD$',
    'Total Costo Empresa RD$',
  ];
  const lineas: string[] = [encabezados.map(escaparCsvCampo).join(',')];

  for (const m of reporte.misiones) {
    if (m.desglose.length === 0) {
      lineas.push(
        [
          m.nombre,
          m.zona,
          m.provincia,
          m.fechaInicio,
          m.fechaFin,
          'Sin gastos',
          '-',
          '',
          0,
          0,
          0,
          0,
          m.costoRentasRD,
          m.totalCostoEmpresaRD,
        ]
          .map(escaparCsvCampo)
          .join(',')
      );
      continue;
    }

    for (const d of m.desglose) {
      lineas.push(
        [
          m.nombre,
          m.zona,
          m.provincia,
          m.fechaInicio,
          m.fechaFin,
          d.cargoEtiqueta,
          d.categoria,
          d.topeRD !== undefined ? d.topeRD : 'Sin tope',
          d.gastoTotalRD,
          d.aprobadoEmpresaRD,
          d.cargoColaboradorRD,
          d.pendienteRD,
          m.costoRentasRD,
          m.totalCostoEmpresaRD,
        ]
          .map(escaparCsvCampo)
          .join(',')
      );
    }
  }

  return lineas.join('\n');
}

// ============================================================================
// B6. Consolidado mensual de viáticos para rendición administrativa (PDF)
// ============================================================================

const MESES_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

export function extraerMesesDisponiblesViaticos(viaticos: Viatico[]): string[] {
  const meses = new Set<string>();
  for (const v of viaticos) {
    if (typeof v.fechaIso === 'string' && /^\d{4}-\d{2}/.test(v.fechaIso)) {
      meses.add(v.fechaIso.slice(0, 7));
    }
  }
  return Array.from(meses).sort((a, b) => b.localeCompare(a));
}

export function formatearMesIso(mesIso: string): string {
  if (!mesIso || mesIso === 'ALL') return 'Todos los meses';
  const match = /^(\d{4})-(\d{2})$/.exec(mesIso.trim());
  if (!match) return mesIso;
  const anio = match[1];
  const mesIdx = Number(match[2]) - 1;
  const nombreMes = MESES_ES[mesIdx] ?? match[2];
  return `${nombreMes} ${anio}`;
}

export function filtrarViaticosPorMes(viaticos: Viatico[], mesIso: string): Viatico[] {
  if (!mesIso || mesIso === 'ALL') return viaticos;
  return viaticos.filter((v) => typeof v.fechaIso === 'string' && v.fechaIso.startsWith(mesIso));
}

export interface ResumenConsolidadoCategoria {
  categoria: CategoriaViatico;
  cantidad: number;
  itbisRD: number;
  montoTotalRD: number;
  aprobadoEmpresaRD: number;
  cargoColaboradorRD: number;
  pendienteRD: number;
  rechazadoRD: number;
}

export interface ResumenConsolidadoProyecto {
  proyectoId: string;
  codigoContrato: string;
  nombre: string;
  aprobadoEmpresaRD: number;
  pendienteRD: number;
  totalImputadoRD: number;
}

export interface ResumenConsolidadoColaborador {
  nombre: string;
  cargoEtiqueta: string;
  cantidad: number;
  aprobadoEmpresaRD: number;
  cargoColaboradorRD: number;
  pendienteRD: number;
  rechazadoRD: number;
  totalSolicitadoRD: number;
}

export interface DetalleConsolidadoViatico {
  id: string;
  fechaIso: string;
  timestampAST: string;
  creadoPorNombre: string;
  cargoEtiqueta: string;
  categoria: CategoriaViatico;
  comercio: string;
  metodo: string;
  ncf: string;
  misionNombre?: string;
  proyectosResumen: string;
  itbisRD: number;
  montoRD: number;
  montoAprobadoEmpresaRD: number;
  montoCargoColaboradorRD: number;
  estadoAprobacion: EstadoAprobacionViatico;
  motivo: string;
}

export interface ConsolidadoViaticosMensual {
  mesIso: string;
  etiquetaPeriodo: string;
  resumen: {
    cantidadRegistros: number;
    cantidadAprobados: number;
    cantidadPendientes: number;
    cantidadRechazados: number;
    montoTotalRD: number;
    itbisTotalRD: number;
    aprobadoEmpresaRD: number;
    cargoColaboradorRD: number;
    pendienteRD: number;
    rechazadoRD: number;
  };
  porCategoria: ResumenConsolidadoCategoria[];
  porProyecto: ResumenConsolidadoProyecto[];
  porColaborador: ResumenConsolidadoColaborador[];
  detalle: DetalleConsolidadoViatico[];
}

export function consolidarViaticosMensual(params: {
  viaticos: Viatico[];
  proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre'>>;
  misiones?: Mision[];
  cargos?: CargoConfig[];
  mesIso?: string;
}): ConsolidadoViaticosMensual {
  const { viaticos, proyectos, misiones = [], cargos = [], mesIso = 'ALL' } = params;
  const filtrados = filtrarViaticosPorMes(viaticos, mesIso);

  let cantidadAprobados = 0;
  let cantidadPendientes = 0;
  let cantidadRechazados = 0;
  let montoTotalRD = 0;
  let itbisTotalRD = 0;
  let aprobadoEmpresaRD = 0;
  let cargoColaboradorRD = 0;
  let pendienteRD = 0;
  let rechazadoRD = 0;

  const mapaCategoria = new Map<CategoriaViatico, ResumenConsolidadoCategoria>();
  const mapaProyecto = new Map<string, { aprobadoRD: number; pendienteRD: number }>();
  const mapaColaborador = new Map<string, ResumenConsolidadoColaborador>();

  const detalle: DetalleConsolidadoViatico[] = [];

  const ordenados = [...filtrados].sort((a, b) => {
    const cmpFecha = a.fechaIso.localeCompare(b.fechaIso);
    if (cmpFecha !== 0) return cmpFecha;
    return a.timestampAST.localeCompare(b.timestampAST);
  });

  for (const v of ordenados) {
    montoTotalRD += v.montoRD;
    itbisTotalRD += v.itbisRD;

    let empMonto = 0;
    let colCargo = 0;
    let pendMonto = 0;
    let rechMonto = 0;

    if (v.estadoAprobacion === 'aprobado') {
      cantidadAprobados += 1;
      colCargo = v.montoCargoColaboradorRD ?? 0;
      empMonto =
        v.montoAprobadoEmpresaRD ?? Math.max(0, Number((v.montoRD - colCargo).toFixed(2)));
      aprobadoEmpresaRD += empMonto;
      cargoColaboradorRD += colCargo;
    } else if (v.estadoAprobacion === 'rechazado') {
      cantidadRechazados += 1;
      rechMonto = v.montoRD;
      rechazadoRD += rechMonto;
    } else {
      cantidadPendientes += 1;
      pendMonto = v.montoRD;
      pendienteRD += pendMonto;
    }

    // Por categoría
    if (!mapaCategoria.has(v.categoria)) {
      mapaCategoria.set(v.categoria, {
        categoria: v.categoria,
        cantidad: 0,
        itbisRD: 0,
        montoTotalRD: 0,
        aprobadoEmpresaRD: 0,
        cargoColaboradorRD: 0,
        pendienteRD: 0,
        rechazadoRD: 0,
      });
    }
    const catItem = mapaCategoria.get(v.categoria)!;
    catItem.cantidad += 1;
    catItem.itbisRD = Number((catItem.itbisRD + v.itbisRD).toFixed(2));
    catItem.montoTotalRD = Number((catItem.montoTotalRD + v.montoRD).toFixed(2));
    catItem.aprobadoEmpresaRD = Number((catItem.aprobadoEmpresaRD + empMonto).toFixed(2));
    catItem.cargoColaboradorRD = Number((catItem.cargoColaboradorRD + colCargo).toFixed(2));
    catItem.pendienteRD = Number((catItem.pendienteRD + pendMonto).toFixed(2));
    catItem.rechazadoRD = Number((catItem.rechazadoRD + rechMonto).toFixed(2));

    // Por colaborador
    const cargoEtiqueta = v.cargoUsado
      ? resolverEtiquetaCargo(v.cargoUsado, cargos)
      : 'Sin cargo';
    const colabKey = `${v.creadoPorNombre}::${cargoEtiqueta}`;
    if (!mapaColaborador.has(colabKey)) {
      mapaColaborador.set(colabKey, {
        nombre: v.creadoPorNombre,
        cargoEtiqueta,
        cantidad: 0,
        aprobadoEmpresaRD: 0,
        cargoColaboradorRD: 0,
        pendienteRD: 0,
        rechazadoRD: 0,
        totalSolicitadoRD: 0,
      });
    }
    const colabItem = mapaColaborador.get(colabKey)!;
    colabItem.cantidad += 1;
    colabItem.aprobadoEmpresaRD = Number((colabItem.aprobadoEmpresaRD + empMonto).toFixed(2));
    colabItem.cargoColaboradorRD = Number((colabItem.cargoColaboradorRD + colCargo).toFixed(2));
    colabItem.pendienteRD = Number((colabItem.pendienteRD + pendMonto).toFixed(2));
    colabItem.rechazadoRD = Number((colabItem.rechazadoRD + rechMonto).toFixed(2));
    colabItem.totalSolicitadoRD = Number((colabItem.totalSolicitadoRD + v.montoRD).toFixed(2));

    // Por proyecto (excluye rechazados, consistente con calcularGastoPorProyecto)
    const lineasReparto =
      v.repartos.length > 0 ? v.repartos : [{ proyectoId: 'sin_asignar', montoRD: v.montoRD }];
    if (v.estadoAprobacion !== 'rechazado') {
      for (const r of lineasReparto) {
        if (!mapaProyecto.has(r.proyectoId)) {
          mapaProyecto.set(r.proyectoId, { aprobadoRD: 0, pendienteRD: 0 });
        }
        const proyItem = mapaProyecto.get(r.proyectoId)!;
        if (v.estadoAprobacion === 'aprobado') {
          proyItem.aprobadoRD += r.montoRD;
        } else {
          proyItem.pendienteRD += r.montoRD;
        }
      }
    }

    const misionNombre = v.misionId
      ? misiones.find((m) => m.id === v.misionId)?.nombre
      : undefined;

    const proyectosResumen = lineasReparto
      .map((r) => {
        if (r.proyectoId === 'sin_asignar') {
          return `Sin asignar (${r.montoRD.toFixed(2)})`;
        }
        const proy = proyectos.find((p) => p.id === r.proyectoId);
        const label = proy ? proy.codigoContrato : r.proyectoId;
        return `${label} (${r.montoRD.toFixed(2)})`;
      })
      .join(', ');

    detalle.push({
      id: v.id,
      fechaIso: v.fechaIso,
      timestampAST: v.timestampAST,
      creadoPorNombre: v.creadoPorNombre,
      cargoEtiqueta,
      categoria: v.categoria,
      comercio: v.comercio,
      metodo: v.metodo,
      ncf: v.ncf || '—',
      misionNombre,
      proyectosResumen,
      itbisRD: Number(v.itbisRD.toFixed(2)),
      montoRD: Number(v.montoRD.toFixed(2)),
      montoAprobadoEmpresaRD: Number(empMonto.toFixed(2)),
      montoCargoColaboradorRD: Number(colCargo.toFixed(2)),
      estadoAprobacion: v.estadoAprobacion,
      motivo: v.motivoRechazo || v.motivoDecision || v.motivoExcedente || v.notas || '—',
    });
  }

  const porCategoria = Array.from(mapaCategoria.values()).sort(
    (a, b) => b.montoTotalRD - a.montoTotalRD
  );

  const porProyecto: ResumenConsolidadoProyecto[] = Array.from(mapaProyecto.entries())
    .map(([proyectoId, vals]) => {
      const aprobado = Number(vals.aprobadoRD.toFixed(2));
      const pendiente = Number(vals.pendienteRD.toFixed(2));
      if (proyectoId === 'sin_asignar') {
        return {
          proyectoId,
          codigoContrato: 'SIN ASIGNAR',
          nombre: 'Gastos sin asignar a proyecto',
          aprobadoEmpresaRD: aprobado,
          pendienteRD: pendiente,
          totalImputadoRD: Number((aprobado + pendiente).toFixed(2)),
        };
      }
      const p = proyectos.find((x) => x.id === proyectoId);
      return {
        proyectoId,
        codigoContrato: p ? p.codigoContrato : proyectoId,
        nombre: p ? p.nombre : proyectoId,
        aprobadoEmpresaRD: aprobado,
        pendienteRD: pendiente,
        totalImputadoRD: Number((aprobado + pendiente).toFixed(2)),
      };
    })
    .sort((a, b) => b.totalImputadoRD - a.totalImputadoRD);

  const porColaborador = Array.from(mapaColaborador.values()).sort(
    (a, b) => b.totalSolicitadoRD - a.totalSolicitadoRD
  );

  return {
    mesIso,
    etiquetaPeriodo: formatearMesIso(mesIso),
    resumen: {
      cantidadRegistros: ordenados.length,
      cantidadAprobados,
      cantidadPendientes,
      cantidadRechazados,
      montoTotalRD: Number(montoTotalRD.toFixed(2)),
      itbisTotalRD: Number(itbisTotalRD.toFixed(2)),
      aprobadoEmpresaRD: Number(aprobadoEmpresaRD.toFixed(2)),
      cargoColaboradorRD: Number(cargoColaboradorRD.toFixed(2)),
      pendienteRD: Number(pendienteRD.toFixed(2)),
      rechazadoRD: Number(rechazadoRD.toFixed(2)),
    },
    porCategoria,
    porProyecto,
    porColaborador,
    detalle,
  };
}

// ============================================================================
// B7. Normalización de análisis IA de comprobantes de viáticos
// ============================================================================

export interface CargoReciboExtraido {
  descripcion: string;
  montoRD: number;
}

export interface ResultadoAnalisisRecibo {
  merchant: string;
  amountRD: number;
  subtotalRD: number;
  itbisRD: number;
  otrosCargosRD: number;
  cargos: CargoReciboExtraido[];
  ncf: string;
  requiereNcf: boolean;
  category: CategoriaViatico;
  dateIso: string;
  notes: string;
  confidence: 'alta' | 'media' | 'baja';
}

const CATEGORIAS_VALIDAS_RECEIPT: CategoriaViatico[] = [
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro',
];

function normalizarNumeroPositivo(val: unknown): number {
  const n = typeof val === 'number' ? val : Number(String(val ?? '').replace(/,/g, '').trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number(n.toFixed(2));
}

function normalizarFechaRecibo(rawDate: unknown, fallbackDateIso: string): string {
  const txt = String(rawDate ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(txt)) {
    const [, mm, dd] = txt.split('-').map(Number);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) return txt;
  }
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(txt);
  if (dmy) {
    const dd = Number(dmy[1]);
    const mm = Number(dmy[2]);
    const yyyy = dmy[3];
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
  }
  return fallbackDateIso;
}

function normalizarCategoriaRecibo(rawCat: unknown): CategoriaViatico {
  const norm = String(rawCat ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const found = CATEGORIAS_VALIDAS_RECEIPT.find(
    (c) =>
      c
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') === norm
  );
  return found ?? 'Otro';
}

function normalizarNcfRecibo(rawNcf: unknown): string {
  const limpio = String(rawNcf ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (
    !limpio ||
    limpio === 'N/A' ||
    limpio === 'NA' ||
    limpio === 'NOAPLICA' ||
    limpio === 'NINGUNO' ||
    limpio === 'NULL' ||
    limpio === '-'
  ) {
    return '';
  }
  return limpio;
}

export function normalizarResultadoAnalisisRecibo(
  raw: unknown,
  fallbackDateIso: string = new Date().toISOString().slice(0, 10)
): ResultadoAnalisisRecibo {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};

  const merchant = String(obj.merchant ?? '').trim();
  const subtotalRD = normalizarNumeroPositivo(obj.subtotalRD);
  const itbisRD = normalizarNumeroPositivo(obj.itbisRD);
  const otrosCargosRD = normalizarNumeroPositivo(obj.otrosCargosRD);

  const cargosCrudos = Array.isArray(obj.cargos) ? obj.cargos : [];
  const cargos: CargoReciboExtraido[] = [];
  for (const c of cargosCrudos) {
    if (!c || typeof c !== 'object') continue;
    const rec = c as Record<string, unknown>;
    const descripcion = String(rec.descripcion ?? '').trim();
    const montoRD = normalizarNumeroPositivo(rec.montoRD);
    if (descripcion && montoRD >= 0) {
      cargos.push({ descripcion, montoRD });
    }
  }

  let amountRD = normalizarNumeroPositivo(obj.amountRD);
  if (amountRD <= 0 && (subtotalRD > 0 || itbisRD > 0 || otrosCargosRD > 0)) {
    amountRD = Number((subtotalRD + itbisRD + otrosCargosRD).toFixed(2));
  }

  const ncf = normalizarNcfRecibo(obj.ncf);
  const requiereNcf = Boolean(ncf) || obj.requiereNcf === true;
  const category = normalizarCategoriaRecibo(obj.category);
  const dateIso = normalizarFechaRecibo(obj.dateIso, fallbackDateIso);

  let notes = String(obj.notes ?? '').trim();
  if (!notes && cargos.length > 0) {
    notes = cargos.map((c) => `${c.descripcion}: RD$ ${c.montoRD.toFixed(2)}`).join(' · ');
  }

  const confRaw = String(obj.confidence ?? '')
    .trim()
    .toLowerCase();
  const confidence: 'alta' | 'media' | 'baja' =
    confRaw === 'alta' || confRaw === 'media' || confRaw === 'baja' ? confRaw : 'media';

  return {
    merchant,
    amountRD,
    subtotalRD,
    itbisRD,
    otrosCargosRD,
    cargos,
    ncf,
    requiereNcf,
    category,
    dateIso,
    notes,
    confidence,
  };
}

export interface AlertaTopeCategoriaRecibo {
  aplicaTope: boolean;
  superaTope: boolean;
  categoriaNoPermitida: boolean;
  topePermitidoRD?: number;
  excedenteReciboRD: number;
  cargoCodigo: string;
}

export function evaluarAlertaTopeCategoriaRecibo(params: {
  categoria: CategoriaViatico;
  montoReciboRD: number;
  cargoCodigo: string;
  config?: ConfiguracionEmpresa;
  topeDirecto?: TopeViaticoUsuarioResumen;
  fechaCalculoIso?: string;
}): AlertaTopeCategoriaRecibo {
  const {
    categoria,
    montoReciboRD,
    cargoCodigo,
    config,
    topeDirecto,
    fechaCalculoIso,
  } = params;

  const montoSeguro =
    Number.isFinite(montoReciboRD) && montoReciboRD > 0
      ? Number(montoReciboRD.toFixed(2))
      : 0;

  const topeVigente =
    topeDirecto?.montoMaximoPorMisionRD ??
    (config
      ? obtenerTopeViaticoParaCargoCategoria({
          config,
          cargoCodigo,
          categoria,
          fechaCalculoIso,
        })?.montoMaximoPorMisionRD
      : undefined);

  if (topeVigente === undefined) {
    return {
      aplicaTope: false,
      superaTope: false,
      categoriaNoPermitida: false,
      topePermitidoRD: undefined,
      excedenteReciboRD: 0,
      cargoCodigo,
    };
  }

  const categoriaNoPermitida = topeVigente === 0;
  const excedenteBruto = montoSeguro > topeVigente ? montoSeguro - topeVigente : 0;
  const excedenteReciboRD = Number(excedenteBruto.toFixed(2));
  const superaTope = excedenteReciboRD > 0 || (categoriaNoPermitida && montoSeguro > 0);

  return {
    aplicaTope: true,
    superaTope,
    categoriaNoPermitida,
    topePermitidoRD: topeVigente,
    excedenteReciboRD,
    cargoCodigo,
  };
}

// ============================================================================
// B8. Exportación CSV contable de viáticos filtrados
// ============================================================================

export interface ResultadoCsvViaticosContable {
  csv: string;
  cantidadComprobantes: number;
  cantidadLineas: number;
}

export function generarCsvViaticosContable(params: {
  viaticos: Viatico[];
  proyectos: Array<Pick<Proyecto, 'id' | 'codigoContrato' | 'nombre'>>;
  misiones?: Mision[];
  cargos?: CargoConfig[];
}): ResultadoCsvViaticosContable {
  const { viaticos, proyectos, misiones = [], cargos = [] } = params;

  const ordenados = [...viaticos].sort((a, b) => {
    const fechaCmp = a.fechaIso.localeCompare(b.fechaIso);
    if (fechaCmp !== 0) return fechaCmp;
    return a.timestampAST.localeCompare(b.timestampAST);
  });

  const encabezados = [
    'Viatico_ID',
    'Fecha',
    'Hora_AST',
    'Registrado_Por',
    'Cargo',
    'Categoria',
    'Comercio',
    'NCF',
    'Subtotal_Gravado_RD',
    'ITBIS_RD',
    'Monto_Total_Viatico_RD',
    'Monto_Aprobado_Empresa_RD',
    'Monto_Cargo_Colaborador_RD',
    'Proyecto_Codigo',
    'Proyecto_Nombre',
    'Monto_Reparto_RD',
    'Mision',
    'Metodo',
    'Estado',
    'Decision_Excedente',
    'Motivo_Decision_Notas',
  ];

  const filas: string[] = [encabezados.map(escaparCsvCampo).join(',')];
  let cantidadLineas = 0;

  for (const v of ordenados) {
    const lineasReparto =
      v.repartos.length > 0 ? v.repartos : [{ proyectoId: 'sin_asignar', montoRD: v.montoRD }];
    const cargoEtiqueta = v.cargoUsado
      ? resolverEtiquetaCargo(v.cargoUsado, cargos)
      : 'Sin cargo';
    const misionNombre = v.misionId
      ? misiones.find((m) => m.id === v.misionId)?.nombre || ''
      : '';
    const subtotalGravado = Math.max(0, Number((v.montoRD - v.itbisRD).toFixed(2)));
    const aprobadoEmpresa =
      v.estadoAprobacion === 'aprobado' ? v.montoAprobadoEmpresaRD ?? v.montoRD : 0;
    const cargoColaborador =
      v.estadoAprobacion === 'aprobado' ? v.montoCargoColaboradorRD ?? 0 : 0;
    const motivoNotas = v.motivoRechazo || v.motivoDecision || v.motivoExcedente || v.notas || '';

    for (const r of lineasReparto) {
      const proyecto =
        r.proyectoId === 'sin_asignar'
          ? undefined
          : proyectos.find((p) => p.id === r.proyectoId);
      const proyectoCodigo =
        r.proyectoId === 'sin_asignar'
          ? 'SIN_ASIGNAR'
          : proyecto?.codigoContrato || r.proyectoId;
      const proyectoNombre =
        r.proyectoId === 'sin_asignar'
          ? 'Sin asignar a proyecto'
          : proyecto?.nombre || r.proyectoId;

      filas.push(
        [
          v.id,
          v.fechaIso,
          v.timestampAST,
          v.creadoPorNombre,
          cargoEtiqueta,
          v.categoria,
          v.comercio,
          v.ncf || '',
          subtotalGravado.toFixed(2),
          v.itbisRD.toFixed(2),
          v.montoRD.toFixed(2),
          aprobadoEmpresa.toFixed(2),
          cargoColaborador.toFixed(2),
          proyectoCodigo,
          proyectoNombre,
          r.montoRD.toFixed(2),
          misionNombre,
          v.metodo,
          v.estadoAprobacion,
          v.decisionExcedente || '',
          motivoNotas,
        ]
          .map(escaparCsvCampo)
          .join(',')
      );
      cantidadLineas += 1;
    }
  }

  return {
    csv: filas.join('\n'),
    cantidadComprobantes: ordenados.length,
    cantidadLineas,
  };
}


