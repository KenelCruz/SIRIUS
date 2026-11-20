import React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Compass,
  FolderKanban,
  Receipt,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import {
  obtenerFechaHoyAST,
  obtenerRentasVencidasSinDevolucion,
  obtenerResumenOnboarding,
} from '../domain';
import type {
  Asignacion,
  Cuadrilla,
  Empresa,
  EstadoOnboardingEmpresa,
  OnboardingPasoId,
  Personal,
  Proyecto,
  Renta,
  Ruta,
  Servicio,
  ServicioCatalogoConfig,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface AdminHoyViewProps {
  empresa: Empresa;
  personal: Personal[];
  proyectos: Proyecto[];
  serviciosConfig: ServicioCatalogoConfig[];
  rutas: Ruta[];
  servicios: Servicio[];
  asignaciones: Asignacion[];
  cuadrillas: Cuadrilla[];
  vehiculos: Vehiculo[];
  viaticos: Viatico[];
  rentas?: Renta[];
  onboarding: EstadoOnboardingEmpresa;
  isDemo: boolean;
  onIrAPasoOnboarding: (pasoId: OnboardingPasoId) => void;
  onAbrirOnboarding: () => void;
  onCerrarTarjetaOnboarding: () => Promise<void>;
  onIrATab: (tab: 'proyectos' | 'agenda' | 'viaticos' | 'catalogos' | 'configuracion') => void;
}

export const AdminHoyView: React.FC<AdminHoyViewProps> = ({
  empresa,
  personal,
  proyectos,
  serviciosConfig,
  rutas,
  servicios,
  asignaciones,
  cuadrillas,
  vehiculos,
  viaticos,
  rentas = [],
  onboarding,
  isDemo,
  onIrAPasoOnboarding,
  onAbrirOnboarding,
  onCerrarTarjetaOnboarding,
  onIrATab,
}) => {
  const hoyIso = obtenerFechaHoyAST();
  const moneda = empresa.moneda || 'RD$';
  const resumenOnboarding = obtenerResumenOnboarding(onboarding, isDemo, {
    empresa,
    personal,
    vehiculos,
    serviciosConfig,
    proyectos,
    esDemo: isDemo,
  });

  const asignacionesHoy = asignaciones.filter(
    (a) => a.fechaInicio <= hoyIso && a.fechaFin >= hoyIso
  );
  const cuadrillasActivasHoyIds = new Set(asignacionesHoy.map((a) => a.cuadrillaId));
  const viaticosPendientes = viaticos.filter((v) => v.estadoAprobacion === 'pendiente');
  const totalPendientesRD = viaticosPendientes.reduce((acc, v) => acc + v.montoRD, 0);
  const vehiculosMantenimiento = vehiculos.filter((v) => v.estado === 'en_mantenimiento');
  const serviciosEnCampo = servicios.filter((s) => s.estado === 'en_campo');
  const rentasVencidas = obtenerRentasVencidasSinDevolucion(rentas, hoyIso);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Hoy en {empresa.nombre}</h2>
          <p className="text-sm text-slate-600 mt-1">
            Resumen operativo del {hoyIso} (hora AST) · {serviciosEnCampo.length} servicio(s) en campo
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => onIrATab('agenda')}
            className="px-3 py-2 text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 rounded-lg whitespace-nowrap"
          >
            Ver Agenda
          </button>
          <button
            type="button"
            onClick={() => onIrATab('configuracion')}
            className="px-3 py-2 text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-lg whitespace-nowrap"
          >
            Configuración
          </button>
        </div>
      </div>

      {/* Tarjeta opcional de Onboarding */}
      {resumenOnboarding.debeMostrarTarjetaHoy && (
        <div className="bg-white border border-slate-300 rounded-xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <span>
                  Puesta en marcha de la empresa ({resumenOnboarding.pasosCompletados.length}/
                  {resumenOnboarding.totalPasos} completos reales)
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Faltan {resumenOnboarding.pasosPendientes.length} de {resumenOnboarding.totalPasos}{' '}
                pasos opcionales para dejar lista la operación de {empresa.nombre}
                {resumenOnboarding.pasosCompletadosManuales.length > 0
                  ? ` · ${resumenOnboarding.pasosCompletadosManuales.length} completado(s) manualmente sin datos.`
                  : '.'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onAbrirOnboarding}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
              >
                Continuar asistente
              </button>
              <button
                type="button"
                onClick={() => {
                  onCerrarTarjetaOnboarding().catch(() => {});
                }}
                title="Ocultar tarjeta de configuración en Hoy"
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all"
              style={{ width: `${resumenOnboarding.porcentajeReal}%` }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {resumenOnboarding.detallePasos.map(({ paso, estado, etiquetaEstado }) => {
              const isPending = estado === 'pendiente';
              const isManual = estado === 'completo_manual';
              return (
                <button
                  key={paso.id}
                  type="button"
                  onClick={() => onIrAPasoOnboarding(paso.id)}
                  className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition-colors ${
                    isPending
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-900'
                      : isManual
                      ? 'bg-amber-50/70 hover:bg-amber-50 border-amber-200 text-amber-900'
                      : 'bg-white border-slate-100 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 ${
                        estado === 'completo'
                          ? 'text-emerald-600'
                          : isManual
                          ? 'text-amber-600'
                          : estado === 'saltado'
                          ? 'text-slate-400'
                          : 'text-slate-300'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-medium">
                        {paso.numero}. {paso.titulo}
                      </div>
                      {isManual && (
                        <div className="text-[10px] font-semibold text-amber-700 truncate">
                          {etiquetaEstado}
                        </div>
                      )}
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerta de rentas vencidas sin devolución */}
      {rentasVencidas.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs text-amber-950">
              <div className="font-bold">
                {rentasVencidas.length} renta(s) vencida(s) sin devolución registrada
              </div>
              <div className="text-amber-900">
                {rentasVencidas
                  .map(
                    (r) =>
                      `${r.recursoEtiqueta || r.recursoId} (${r.proveedor}, venció ${r.fechaFin})`
                  )
                  .join(' · ')}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onIrATab('catalogos')}
            className="px-3 py-1.5 bg-amber-900 hover:bg-amber-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap shrink-0"
          >
            Revisar rentas
          </button>
        </div>
      )}

      {/* 4 Indicadores operativos clave */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onIrATab('agenda')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Rutas programadas hoy</span>
            <CalendarDays className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {asignacionesHoy.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Abrir agenda diaria y semanal</div>
        </button>

        <button
          type="button"
          onClick={() => onIrATab('proyectos')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Cuadrillas activas hoy</span>
            <Compass className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {cuadrillasActivasHoyIds.size}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            De {cuadrillas.filter((c) => c.activa).length} cuadrilla(s) disponibles
          </div>
        </button>

        <button
          type="button"
          onClick={() => onIrATab('viaticos')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Viáticos pendientes</span>
            <Receipt className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {viaticosPendientes.length}
          </div>
          <div className="text-xs text-slate-600 tabular-nums mt-1">
            Total por revisar: {formatRD(totalPendientesRD, moneda)}
          </div>
        </button>

        <button
          type="button"
          onClick={() => onIrATab('catalogos')}
          className="bg-white border border-slate-200 hover:border-slate-300 rounded-xl p-4 text-left transition-colors"
        >
          <div className="flex items-center justify-between text-xs text-slate-500 font-semibold">
            <span>Vehículos en mantenimiento</span>
            <Wrench className="w-4 h-4 text-slate-600" />
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums mt-2">
            {vehiculosMantenimiento.length}
          </div>
          <div className="text-xs text-slate-500 mt-1">Bloqueados para nuevas rutas</div>
        </button>
      </div>

      {/* Detalle operativo rápido */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Brigadas programadas hoy</h3>
            <button
              type="button"
              onClick={() => onIrATab('agenda')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              Ver agenda &rarr;
            </button>
          </div>
          {asignacionesHoy.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">
              No hay cuadrillas asignadas para la fecha de hoy ({hoyIso}).
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {asignacionesHoy.map((a) => {
                const ruta = rutas.find((r) => r.id === a.rutaId);
                const cuadrilla = cuadrillas.find((c) => c.id === a.cuadrillaId);
                return (
                  <div key={a.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 truncate">
                        {ruta?.nombre ?? 'Ruta asignada'}
                      </div>
                      <div className="text-xs text-slate-500">
                        {cuadrilla?.nombre ?? 'Cuadrilla'} · {a.fechaInicio} al {a.fechaFin}
                      </div>
                    </div>
                    <FolderKanban className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Viáticos pendientes de decisión</h3>
            <button
              type="button"
              onClick={() => onIrATab('viaticos')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              Ir a viáticos &rarr;
            </button>
          </div>
          {viaticosPendientes.length === 0 ? (
            <p className="text-sm text-slate-500 py-4">No hay comprobantes pendientes por aprobar.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {viaticosPendientes.slice(0, 5).map((v) => (
                <div key={v.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{v.comercio}</div>
                    <div className="text-xs text-slate-500">
                      {v.categoria} · {v.creadoPorNombre} · {v.fechaIso}
                    </div>
                  </div>
                  <span className="font-bold text-slate-900 tabular-nums shrink-0">
                    {formatRD(v.montoRD, moneda)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
