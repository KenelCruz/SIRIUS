import type {
  Asignacion,
  BitacoraEntrada,
  ConfiguracionEmpresa,
  FuenteKmRendimiento,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import {
  obtenerRendimientoConfigVigente,
  UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT,
} from './configuracion';

export const MINIMO_CARGAS_RENDIMIENTO = 3;

export type EstadoRendimientoVehiculo = 'datos_insuficientes' | 'normal' | 'alerta_desviacion';

export interface ResumenRendimientoVehiculo {
  vehiculoId: string;
  vehiculoEtiqueta: string;
  placa: string;
  fuenteKm: FuenteKmRendimiento;
  cantidadCargas: number;
  totalGalones: number;
  kmRecorridos: number;
  rendimientoTeoricoKmGal: number;
  rendimientoRealKmGal: number | null;
  desviacionPct: number | null;
  umbralAlertaPct: number;
  estado: EstadoRendimientoVehiculo;
  etiqueta: string;
  alerta: boolean;
}

export function calcularRendimientoFlota(params: {
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  asignaciones: Asignacion[];
  rutas: Ruta[];
  bitacoras: BitacoraEntrada[];
  kmManualPorVehiculo?: Record<string, number>;
  fuenteKm?: FuenteKmRendimiento;
  umbralAlertaPct?: number;
  config?: ConfiguracionEmpresa;
  fechaCalculoIso?: string;
}): ResumenRendimientoVehiculo[] {
  const {
    vehiculos,
    viaticos,
    asignaciones,
    rutas,
    bitacoras,
    kmManualPorVehiculo = {},
    config,
    fechaCalculoIso,
  } = params;

  const reglaVigente = config
    ? obtenerRendimientoConfigVigente(config, fechaCalculoIso)
    : undefined;
  const fuente = params.fuenteKm ?? reglaVigente?.fuenteKm ?? 'ruta_asignada';
  const umbralAlertaPct =
    params.umbralAlertaPct ??
    reglaVigente?.umbralAlertaPct ??
    UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT;

  return vehiculos.map((veh) => {
    const cargasAprobadas = viaticos.filter(
      (v) =>
        v.categoria === 'Combustible' &&
        v.estadoAprobacion === 'aprobado' &&
        v.vehiculoId === veh.id &&
        typeof v.galonesCargados === 'number' &&
        v.galonesCargados > 0
    );

    const cantidadCargas = cargasAprobadas.length;
    const totalGalones = Number(
      cargasAprobadas.reduce((sum, v) => sum + (v.galonesCargados ?? 0), 0).toFixed(2)
    );

    const asigsVehiculo = asignaciones.filter((a) => a.vehiculoIds.includes(veh.id));
    let kmRecorridos = 0;

    if (fuente === 'ruta_asignada') {
      kmRecorridos = asigsVehiculo.reduce((sum, asig) => {
        const ruta = rutas.find((r) => r.id === asig.rutaId);
        const kmOneWay = ruta?.routeSummary?.distanceOneWayKm ?? 0;
        return sum + kmOneWay * 2;
      }, 0);
    } else if (fuente === 'bitacora') {
      const rutaIdsVeh = new Set(asigsVehiculo.map((a) => a.rutaId));
      kmRecorridos = bitacoras
        .filter((b) => rutaIdsVeh.has(b.rutaId) && typeof b.kmRecorridos === 'number' && b.kmRecorridos > 0)
        .reduce((sum, b) => sum + (b.kmRecorridos ?? 0), 0);
    } else {
      kmRecorridos = Math.max(0, kmManualPorVehiculo[veh.id] ?? 0);
    }

    kmRecorridos = Number(kmRecorridos.toFixed(1));

    if (cantidadCargas < MINIMO_CARGAS_RENDIMIENTO || totalGalones <= 0) {
      return {
        vehiculoId: veh.id,
        vehiculoEtiqueta: veh.etiqueta,
        placa: veh.placa,
        fuenteKm: fuente,
        cantidadCargas,
        totalGalones,
        kmRecorridos,
        rendimientoTeoricoKmGal: veh.kmPorGal,
        rendimientoRealKmGal: null,
        desviacionPct: null,
        umbralAlertaPct,
        estado: 'datos_insuficientes',
        etiqueta: 'Datos insuficientes',
        alerta: false,
      };
    }

    const rendimientoRealKmGal = Number((kmRecorridos / totalGalones).toFixed(2));
    const desviacionPct =
      veh.kmPorGal > 0
        ? Number((((rendimientoRealKmGal - veh.kmPorGal) / veh.kmPorGal) * 100).toFixed(1))
        : 0;
    const alerta = Math.abs(desviacionPct) > umbralAlertaPct;

    return {
      vehiculoId: veh.id,
      vehiculoEtiqueta: veh.etiqueta,
      placa: veh.placa,
      fuenteKm: fuente,
      cantidadCargas,
      totalGalones,
      kmRecorridos,
      rendimientoTeoricoKmGal: veh.kmPorGal,
      rendimientoRealKmGal,
      desviacionPct,
      umbralAlertaPct,
      estado: alerta ? 'alerta_desviacion' : 'normal',
      etiqueta: alerta ? 'Desviación de rendimiento' : 'Dentro de rango',
      alerta,
    };
  });
}
