import type {
  Asignacion,
  BitacoraEntrada,
  ConceptoDistanciaGps,
  ConfiguracionEmpresa,
  FuenteKmRendimiento,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import {
  obtenerReglasViaticosVigentes,
  obtenerRendimientoConfigVigente,
  UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT,
} from './configuracion';
import { rangosSeSolapan } from './conflictos';
import { obtenerFechaHoyAST } from './tecnico';

export const MINIMO_CARGAS_RENDIMIENTO = 3;
export const DIAS_VENTANA_RENDIMIENTO_DEFAULT = 90;

export type EstadoRendimientoVehiculo =
  | 'datos_insuficientes'
  | 'normal'
  | 'mejor_que_esperado'
  | 'alerta_desviacion';

export interface ResumenRendimientoVehiculo {
  vehiculoId: string;
  vehiculoEtiqueta: string;
  placa: string;
  fuenteKm: FuenteKmRendimiento;
  conceptoDistancia: ConceptoDistanciaGps;
  fechaInicioVentana: string;
  fechaFinVentana: string;
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

function restarDiasIso(fechaIso: string, dias: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return fechaIso;
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
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
  conceptoDistancia?: ConceptoDistanciaGps;
  config?: ConfiguracionEmpresa;
  fechaCalculoIso?: string;
  fechaInicioVentana?: string;
  fechaFinVentana?: string;
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

  const fechaFinVentana = params.fechaFinVentana ?? fechaCalculoIso ?? obtenerFechaHoyAST();
  const fechaInicioVentana =
    params.fechaInicioVentana ?? restarDiasIso(fechaFinVentana, DIAS_VENTANA_RENDIMIENTO_DEFAULT);

  const reglaVigente = config
    ? obtenerRendimientoConfigVigente(config, fechaFinVentana)
    : undefined;
  const reglasViaticosVigentes = config
    ? obtenerReglasViaticosVigentes(config, fechaFinVentana)
    : undefined;

  const fuente = params.fuenteKm ?? reglaVigente?.fuenteKm ?? 'ruta_asignada';
  const umbralAlertaPct =
    params.umbralAlertaPct ??
    reglaVigente?.umbralAlertaPct ??
    UMBRAL_ALERTA_RENDIMIENTO_PCT_DEFAULT;
  const conceptoDistancia: ConceptoDistanciaGps =
    params.conceptoDistancia ?? reglasViaticosVigentes?.gpsRuta.conceptoDistancia ?? 'ida_vuelta';
  const factorDistancia = conceptoDistancia === 'solo_ida' ? 1 : 2;

  return vehiculos.map((veh) => {
    const cargasAprobadas = viaticos.filter(
      (v) =>
        v.categoria === 'Combustible' &&
        v.estadoAprobacion === 'aprobado' &&
        v.vehiculoId === veh.id &&
        typeof v.galonesCargados === 'number' &&
        v.galonesCargados > 0 &&
        v.fechaIso >= fechaInicioVentana &&
        v.fechaIso <= fechaFinVentana
    );

    const cantidadCargas = cargasAprobadas.length;
    const totalGalones = Number(
      cargasAprobadas.reduce((sum, v) => sum + (v.galonesCargados ?? 0), 0).toFixed(2)
    );

    const asigsVehiculo = asignaciones.filter(
      (a) =>
        a.vehiculoIds.includes(veh.id) &&
        rangosSeSolapan(a.fechaInicio, a.fechaFin, fechaInicioVentana, fechaFinVentana)
    );
    let kmRecorridos = 0;

    if (fuente === 'ruta_asignada') {
      const rutaIdsUnicas = new Set(asigsVehiculo.map((a) => a.rutaId));
      kmRecorridos = Array.from(rutaIdsUnicas).reduce((sum, rutaId) => {
        const ruta = rutas.find((r) => r.id === rutaId);
        const kmOneWay = ruta?.routeSummary?.distanceOneWayKm ?? 0;
        return sum + kmOneWay * factorDistancia;
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

    if (cantidadCargas < MINIMO_CARGAS_RENDIMIENTO || totalGalones <= 0 || kmRecorridos <= 0) {
      return {
        vehiculoId: veh.id,
        vehiculoEtiqueta: veh.etiqueta,
        placa: veh.placa,
        fuenteKm: fuente,
        conceptoDistancia,
        fechaInicioVentana,
        fechaFinVentana,
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
    const alerta = desviacionPct < -umbralAlertaPct;
    const estado: EstadoRendimientoVehiculo = alerta
      ? 'alerta_desviacion'
      : desviacionPct > 0
      ? 'mejor_que_esperado'
      : 'normal';
    const etiqueta = alerta
      ? 'Desviación de rendimiento'
      : desviacionPct > 0
      ? 'Mejor que lo esperado'
      : 'Dentro de rango';

    return {
      vehiculoId: veh.id,
      vehiculoEtiqueta: veh.etiqueta,
      placa: veh.placa,
      fuenteKm: fuente,
      conceptoDistancia,
      fechaInicioVentana,
      fechaFinVentana,
      cantidadCargas,
      totalGalones,
      kmRecorridos,
      rendimientoTeoricoKmGal: veh.kmPorGal,
      rendimientoRealKmGal,
      desviacionPct,
      umbralAlertaPct,
      estado,
      etiqueta,
      alerta,
    };
  });
}
