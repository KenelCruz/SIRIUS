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

export function validarDecisionViatico(params: {
  rol: RolEmpresa;
  nuevoEstado: EstadoAprobacionViatico;
  motivoRechazo?: string;
  motivoDecision?: string;
  excedenteRD?: number;
  decisionExcedente?: DecisionExcedenteViatico;
}): { valido: boolean; error?: string } {
  const {
    rol,
    nuevoEstado,
    motivoRechazo,
    motivoDecision,
    excedenteRD = 0,
    decisionExcedente,
  } = params;
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
  const txt = String(valor ?? '');
  if (/[",\n\r]/.test(txt)) {
    return `"${txt.replace(/"/g, '""')}"`;
  }
  return txt;
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
