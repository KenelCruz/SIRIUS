import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  Clock,
  Cpu,
  MapPin,
  Phone,
  Play,
  Truck,
  Users,
  WifiOff,
} from 'lucide-react';
import { resolverEtiquetaCargo } from '../../domain';
import type { AreaUnit, GeoPoint, SnapshotTecnico } from '../../types/domain';
import { KmzOsmViewer } from '../KmzOsmViewer';
import { MediaThumb } from '../MediaThumb';
import { WorkflowBadge } from '../WorkflowBadge';

interface TecnicoRutaDetalleViewProps {
  snapshot: SnapshotTecnico;
  rutaId: string;
  areaUnit: AreaUnit;
  onChangeAreaUnit: (unit: AreaUnit) => void;
  liveGpsPoint: GeoPoint | null;
  isCapturingGps: boolean;
  onCaptureLiveGps: () => void;
  isOnline: boolean;
  successBanner?: string | null;
  onVolver: () => void;
  onAbrirTransicion: (servicioId: string) => void;
  onAbrirBitacora: (servicioId?: string) => void;
  onReportarViatico: (rutaId: string, proyectoId: string) => void;
}

export const TecnicoRutaDetalleView: React.FC<TecnicoRutaDetalleViewProps> = ({
  snapshot,
  rutaId,
  areaUnit,
  onChangeAreaUnit,
  liveGpsPoint,
  isCapturingGps,
  onCaptureLiveGps,
  isOnline,
  successBanner,
  onVolver,
  onAbrirTransicion,
  onAbrirBitacora,
  onReportarViatico,
}) => {
  const ruta = useMemo(
    () => snapshot.rutas.find((r) => r.id === rutaId),
    [snapshot.rutas, rutaId]
  );

  const proyecto = useMemo(
    () => (ruta ? snapshot.proyectos.find((p) => p.id === ruta.proyectoId) : undefined),
    [snapshot.proyectos, ruta]
  );

  const cliente = useMemo(
    () =>
      proyecto ? snapshot.clientes.find((c) => c.id === proyecto.clienteId) : undefined,
    [snapshot.clientes, proyecto]
  );

  const asignacionesRuta = useMemo(
    () => snapshot.asignaciones.filter((a) => a.rutaId === rutaId),
    [snapshot.asignaciones, rutaId]
  );

  const serviciosRuta = useMemo(
    () => snapshot.servicios.filter((s) => s.rutaId === rutaId),
    [snapshot.servicios, rutaId]
  );

  const bitacorasRuta = useMemo(
    () =>
      snapshot.bitacoras
        .filter((b) => b.rutaId === rutaId)
        .sort((a, b) => b.fechaAST.localeCompare(a.fechaAST)),
    [snapshot.bitacoras, rutaId]
  );

  const cuadrillasRuta = useMemo(() => {
    const ids = new Set(asignacionesRuta.map((a) => a.cuadrillaId));
    return snapshot.cuadrillas.filter((c) => ids.has(c.id));
  }, [asignacionesRuta, snapshot.cuadrillas]);

  const vehiculosRuta = useMemo(() => {
    const ids = new Set(asignacionesRuta.flatMap((a) => a.vehiculoIds));
    return snapshot.vehiculos.filter((v) => ids.has(v.id));
  }, [asignacionesRuta, snapshot.vehiculos]);

  const equiposRuta = useMemo(() => {
    const ids = new Set(asignacionesRuta.flatMap((a) => a.equipoIds));
    return snapshot.equipos.filter((e) => ids.has(e.id));
  }, [asignacionesRuta, snapshot.equipos]);

  if (!ruta) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-8 text-center space-y-3">
        <AlertTriangle className="h-8 w-8 text-[#B45309] mx-auto" />
        <div className="text-sm font-bold text-slate-900">
          Ruta no encontrada o fuera de tu asignación
        </div>
        <button
          type="button"
          onClick={onVolver}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white min-h-[42px]"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a mis rutas
        </button>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      {/* Encabezado detalle de ruta (solo lectura) */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a rutas
          </button>

          <button
            type="button"
            onClick={() => onReportarViatico(ruta.id, ruta.proyectoId)}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#0284C7] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0369A1] min-h-[40px] whitespace-nowrap transition-colors"
          >
            <Camera className="h-4 w-4" />
            Registrar viático
          </button>
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono font-bold text-[#0284C7]">{ruta.codigoParcela}</span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-slate-600">{ruta.provincia}</span>
          </div>
          <h2 className="mt-1 text-base sm:text-lg font-bold text-slate-900">{ruta.nombre}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {cliente?.nombre || 'Cliente'} · {proyecto?.nombre || 'Proyecto'}{' '}
            {proyecto?.codigoContrato && (
              <span className="font-mono text-[11px]">({proyecto.codigoContrato})</span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-700 border-t border-slate-100 pt-3">
          <div className="flex items-start gap-2">
            <MapPin className="h-4 w-4 text-[#0284C7] shrink-0 mt-0.5" />
            <span>{ruta.ubicacion}</span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-[#0F2942] shrink-0" />
            <span>
              Fecha prevista:{' '}
              <strong className="font-mono">{ruta.fechaPrevista}</strong>
              {ruta.routeSummary && (
                <span className="ml-2 text-slate-500">
                  · {ruta.routeSummary.distanceOneWayKm} km ({ruta.routeSummary.durationMin} min)
                </span>
              )}
            </span>
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          <WifiOff className="h-4 w-4 shrink-0 text-[#B45309]" />
          <span>
            Sin conexión: la capa base OSM puede requerir señal, pero la vista Vector y los vértices UTM funcionan offline.
          </span>
        </div>
      )}

      {successBanner && (
        <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium text-[#15803D]">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Visor KMZ integrado */}
      <KmzOsmViewer
        parcelCode={ruta.codigoParcela}
        fileName={ruta.kmzFileName}
        features={ruta.features}
        centroid={ruta.centroid}
        totalAreaM2={ruta.totalAreaM2}
        totalPerimeterM={ruta.totalPerimeterM}
        areaUnit={areaUnit}
        onChangeAreaUnit={onChangeAreaUnit}
        liveGpsPoint={liveGpsPoint}
        onCaptureLiveGps={onCaptureLiveGps}
        isCapturingGps={isCapturingGps}
      />

      {/* Cuadrilla, vehículos y equipos GNSS en grid balanceado */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-stretch">
        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
            <Users className="h-4 w-4 text-[#0284C7]" />
            <span>Mi Cuadrilla y Asignación</span>
          </div>
          {asignacionesRuta.map((a) => (
            <div key={a.id} className="rounded-md bg-slate-50 px-3 py-2 text-xs">
              <span className="text-slate-500">Rango asignado: </span>
              <span className="font-mono font-semibold text-[#0F2942]">
                {a.fechaInicio} al {a.fechaFin}
              </span>
            </div>
          ))}
          {cuadrillasRuta.map((cua) => {
            const integrantes = snapshot.personal.filter((p) => cua.miembroIds.includes(p.id));
            return (
              <div key={cua.id} className="space-y-1.5 text-xs">
                <div className="font-bold text-slate-900">{cua.nombre}</div>
                <ul className="space-y-1.5">
                  {integrantes.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 text-slate-700"
                    >
                      <span>
                        {p.nombre}{' '}
                        <span className="text-[11px] text-slate-500">
                          ({resolverEtiquetaCargo(p.cargo, snapshot.cargos)})
                        </span>
                      </span>
                      {p.telefono && (
                        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-[#0284C7]">
                          <Phone className="h-3 w-3" />
                          {p.telefono}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#0F2942]">
            <Truck className="h-4 w-4 text-[#0284C7]" />
            <span>Vehículos y Equipos GNSS</span>
          </div>
          <div className="space-y-2 text-xs">
            {vehiculosRuta.length === 0 ? (
              <p className="text-slate-500">Sin vehículos asignados.</p>
            ) : (
              vehiculosRuta.map((v) => (
                <div
                  key={v.id}
                  className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5"
                >
                  <span className="font-medium text-slate-900">{v.etiqueta}</span>
                  <span className="font-mono text-[11px] font-semibold text-[#0F2942]">
                    {v.placa}
                  </span>
                </div>
              ))
            )}
            {equiposRuta.map((eq) => (
              <div
                key={eq.id}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2.5"
              >
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                  <Cpu className="h-3.5 w-3.5 text-[#0284C7]" />
                  {eq.nombre}
                </span>
                <span className="font-mono text-[11px] text-slate-500">{eq.serial}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Servicios en la ruta */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900">
          Servicios de la Ruta ({serviciosRuta.length})
        </h3>

        {serviciosRuta.length === 0 ? (
          <p className="text-xs text-slate-500">No hay servicios registrados en esta ruta.</p>
        ) : (
          <div className="divide-y divide-slate-200">
            {serviciosRuta.map((srv) => {
              const bitacoraSrvCount = bitacorasRuta.filter((b) => b.servicioId === srv.id).length;
              const puedeIniciar = srv.estado === 'programado';
              const puedeCerrar = srv.estado === 'en_campo';

              return (
                <div
                  key={srv.id}
                  className="py-3.5 first:pt-1 last:pb-1 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{srv.nombre}</span>
                      <WorkflowBadge status={srv.estado} />
                      {srv.syncStatus !== 'synced' && (
                        <span className="text-[11px] font-medium text-[#B45309]">
                          · Pendiente de subir
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-3">
                      {srv.fechaRealInicio && (
                        <span>
                          Inicio real: <strong className="font-mono">{srv.fechaRealInicio}</strong>
                        </span>
                      )}
                      {srv.fechaRealFin && (
                        <span>
                          Cierre real: <strong className="font-mono">{srv.fechaRealFin}</strong>
                        </span>
                      )}
                      <span>Bitácoras: {bitacoraSrvCount}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(puedeIniciar || puedeCerrar) && (
                      <button
                        type="button"
                        onClick={() => onAbrirTransicion(srv.id)}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold text-white min-h-[42px] whitespace-nowrap ${
                          puedeIniciar
                            ? 'bg-[#0284C7] hover:bg-[#0369A1]'
                            : 'bg-[#15803D] hover:bg-emerald-800'
                        }`}
                      >
                        {puedeIniciar ? (
                          <>
                            <Play className="h-3.5 w-3.5" />
                            Iniciar campo
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Cerrar servicio
                          </>
                        )}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => onAbrirBitacora(srv.id)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px] whitespace-nowrap"
                    >
                      <ClipboardList className="h-3.5 w-3.5 text-[#0284C7]" />
                      Agregar bitácora
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Historial de bitácora de campo */}
      <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            Bitácora de Campo ({bitacorasRuta.length})
          </h3>
          {serviciosRuta[0] && (
            <button
              type="button"
              onClick={() => onAbrirBitacora(serviciosRuta[0].id)}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap"
            >
              <ClipboardList className="h-3.5 w-3.5" />
              Agregar nota de bitácora
            </button>
          )}
        </div>

        {bitacorasRuta.length === 0 ? (
          <p className="text-xs text-slate-500">
            Aún no hay entradas registradas en la bitácora de esta ruta.
          </p>
        ) : (
          <div className="divide-y divide-slate-200">
            {bitacorasRuta.map((b) => {
              const srv = serviciosRuta.find((s) => s.id === b.servicioId);
              return (
                <div key={b.id} className="py-3.5 first:pt-1 last:pb-1 space-y-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-[#0F2942]">
                      {b.autorNombre}
                      {srv && <span className="ml-2 font-normal text-slate-500">· {srv.nombre}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                        <Clock className="h-3 w-3" />
                        {b.fechaAST}
                      </span>
                      <span
                        className={`font-semibold ${
                          b.syncStatus === 'synced' ? 'text-[#15803D]' : 'text-[#B45309]'
                        }`}
                      >
                        · {b.syncStatus === 'synced' ? 'Sincronizada' : 'Pendiente de subir'}
                      </span>
                    </div>
                  </div>

                  <p className="text-slate-700 leading-relaxed">{b.nota}</p>

                  {b.fotos.length > 0 && (
                    <div className="flex flex-wrap gap-2.5">
                      {b.fotos.map((src, idx) => (
                        <MediaThumb
                          key={idx}
                          src={src}
                          alt={`Foto bitácora ${idx + 1} (${b.autorNombre})`}
                          caption={`Foto ${idx + 1}`}
                          sizeClass="h-20 w-20"
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};
