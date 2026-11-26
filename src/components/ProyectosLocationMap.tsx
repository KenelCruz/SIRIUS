import React, { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  ArrowRight,
  Compass,
  FolderKanban,
  Layers,
  MapPin,
  Route as RouteIcon,
  Ruler,
} from 'lucide-react';
import type { AreaUnit, Cliente, Proyecto, RolEmpresa, Ruta, Servicio } from '../types/domain';
import { formatArea, formatRD } from '../utils/geodesy';
import { SANTO_DOMINGO_ORIGIN } from '../utils/routingEngine';
import { ETIQUETA_ESTADO } from '../domain';
import { WorkflowBadge } from './WorkflowBadge';
import type { EstadoServicio } from '../types/domain';

export interface ProyectoUbicacionItem {
  proyecto: Proyecto;
  cliente?: Cliente;
  rutasProy: Ruta[];
  srvsProy: Servicio[];
  estadoActual: EstadoServicio;
  progresoPct: number;
  gastoReal: number;
}

interface ProyectosLocationMapProps {
  rol: RolEmpresa;
  items: ProyectoUbicacionItem[];
  areaUnit: AreaUnit;
  moneda?: string;
  onSelectProyectoDetalle: (proyectoId: string) => void;
  onVerRutaEnMapa: (rutaId: string) => void;
  onCalcularRuta: (rutaId: string) => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ProyectosLocationMap: React.FC<ProyectosLocationMapProps> = ({
  rol,
  items,
  areaUnit,
  moneda = 'RD$',
  onSelectProyectoDetalle,
  onVerRutaEnMapa,
  onCalcularRuta,
}) => {
  const canViewFinances = rol === 'admin' || rol === 'coordinador';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.FeatureGroup | null>(null);

  const [selectedProyectoId, setSelectedProyectoId] = useState<string>(
    () => items[0]?.proyecto.id ?? ''
  );
  const [provinciaFiltro, setProvinciaFiltro] = useState<string>('ALL');

  const itemsFiltrados = useMemo(() => {
    if (provinciaFiltro === 'ALL') return items;
    return items.filter((item) =>
      item.rutasProy.some((r) => r.provincia === provinciaFiltro)
    );
  }, [items, provinciaFiltro]);

  const proyectosGeorreferenciados = useMemo(() => {
    return itemsFiltrados
      .map((item) => {
        const rutasConCoord = item.rutasProy.filter(
          (r) =>
            r.centroid &&
            Number.isFinite(r.centroid.lat) &&
            Number.isFinite(r.centroid.lon)
        );
        if (rutasConCoord.length === 0) return null;
        const avgLat =
          rutasConCoord.reduce((acc, r) => acc + r.centroid.lat, 0) /
          rutasConCoord.length;
        const avgLon =
          rutasConCoord.reduce((acc, r) => acc + r.centroid.lon, 0) /
          rutasConCoord.length;
        const totalAreaM2 = rutasConCoord.reduce((acc, r) => acc + r.totalAreaM2, 0);
        const provincias = Array.from(
          new Set(rutasConCoord.map((r) => r.provincia).filter(Boolean))
        );
        return {
          ...item,
          lat: avgLat,
          lon: avgLon,
          totalAreaM2,
          provinciaPrincipal: provincias[0] || 'República Dominicana',
          provincias,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [itemsFiltrados]);

  useEffect(() => {
    if (
      itemsFiltrados.length > 0 &&
      !itemsFiltrados.some((i) => i.proyecto.id === selectedProyectoId)
    ) {
      setSelectedProyectoId(itemsFiltrados[0].proyecto.id);
    }
  }, [itemsFiltrados, selectedProyectoId]);

  const selectedItem = useMemo(
    () =>
      itemsFiltrados.find((i) => i.proyecto.id === selectedProyectoId) ??
      itemsFiltrados[0] ??
      null,
    [itemsFiltrados, selectedProyectoId]
  );

  // Estadísticas globales del mapa (estilo barra lateral ORION adaptada a SIRIUS)
  const stats = useMemo(() => {
    const totalRutas = itemsFiltrados.reduce((acc, i) => acc + i.rutasProy.length, 0);
    const totalAreaM2 = itemsFiltrados.reduce(
      (acc, i) => acc + i.rutasProy.reduce((s, r) => s + r.totalAreaM2, 0),
      0
    );
    const totalContratoRD = itemsFiltrados.reduce(
      (acc, i) => acc + i.proyecto.valorContratoRD,
      0
    );
    const totalServicios = itemsFiltrados.reduce((acc, i) => acc + i.srvsProy.length, 0);
    const serviciosCompletos = itemsFiltrados.reduce(
      (acc, i) =>
        acc +
        i.srvsProy.filter((s) => s.estado === 'entregado' || s.estado === 'cobrado')
          .length,
      0
    );
    const pctAvance =
      itemsFiltrados.length > 0
        ? Math.round(
            itemsFiltrados.reduce((acc, i) => acc + i.progresoPct, 0) /
              itemsFiltrados.length
          )
        : 0;
    const pctGeorref =
      itemsFiltrados.length > 0
        ? Math.round((proyectosGeorreferenciados.length / itemsFiltrados.length) * 100)
        : 0;

    const porProvincia = new Map<string, { proyectos: Set<string>; rutas: number }>();
    items.forEach((item) => {
      item.rutasProy.forEach((r) => {
        const prov = r.provincia || 'Sin provincia';
        const cur = porProvincia.get(prov) ?? { proyectos: new Set<string>(), rutas: 0 };
        cur.proyectos.add(item.proyecto.id);
        cur.rutas += 1;
        porProvincia.set(prov, cur);
      });
    });

    const provinciasBarras = Array.from(porProvincia.entries())
      .map(([provincia, data]) => ({
        provincia,
        proyectosCount: data.proyectos.size,
        rutasCount: data.rutas,
      }))
      .sort((a, b) => b.rutasCount - a.rutasCount);

    return {
      totalRutas,
      totalAreaM2,
      totalContratoRD,
      totalServicios,
      serviciosCompletos,
      pctAvance,
      pctGeorref,
      provinciasBarras,
    };
  }, [items, itemsFiltrados, proyectosGeorreferenciados.length]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [SANTO_DOMINGO_ORIGIN.lat, SANTO_DOMINGO_ORIGIN.lon],
      zoom: 8,
      zoomControl: true,
    });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map);
    const overlay = L.featureGroup().addTo(map);

    mapRef.current = map;
    overlayRef.current = overlay;

    const t = setTimeout(() => map.invalidateSize(), 120);
    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
    };
  }, []);

  const lastBoundsKeyRef = useRef<string>('');
  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;

    overlay.clearLayers();

    proyectosGeorreferenciados.forEach((proj) => {
      const isSelected = proj.proyecto.id === selectedItem?.proyecto.id;

      // Renderizar polígonos/rutas KMZ del proyecto en el mapa
      proj.rutasProy.forEach((ruta) => {
        ruta.features.forEach((feat) => {
          if (feat.geometryType === 'Polygon' && feat.points.length >= 3) {
            const poly = L.polygon(
              feat.points.map((p) => [p.lat, p.lon] as [number, number]),
              {
                color: isSelected ? '#0284C7' : '#0F2942',
                weight: isSelected ? 3 : 1.5,
                fillColor: isSelected ? '#0284C7' : '#64748B',
                fillOpacity: isSelected ? 0.28 : 0.12,
              }
            ).addTo(overlay);
            poly.on('click', () => setSelectedProyectoId(proj.proyecto.id));
          } else if (feat.geometryType === 'LineString' && feat.points.length >= 2) {
            const line = L.polyline(
              feat.points.map((p) => [p.lat, p.lon] as [number, number]),
              {
                color: isSelected ? '#0284C7' : '#0F2942',
                weight: isSelected ? 3.5 : 2,
                opacity: isSelected ? 0.95 : 0.6,
              }
            ).addTo(overlay);
            line.on('click', () => setSelectedProyectoId(proj.proyecto.id));
          }
        });
      });

      // Pin central + tarjeta flotante estilo ORION en paleta SIRIUS
      const valorTexto = canViewFinances
        ? formatRD(proj.proyecto.valorContratoRD, moneda).replace('.00', '')
        : formatArea(proj.totalAreaM2, areaUnit);

      const iconHtml = `
        <div style="transform:translate(-50%,-100%);display:flex;flex-direction:column;align-items:center;cursor:pointer;">
          <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:12px;background:${
            isSelected ? '#0F2942' : '#FFFFFF'
          };color:${isSelected ? '#FFFFFF' : '#0F2942'};border:1.5px solid ${
        isSelected ? '#0284C7' : '#CBD5E1'
      };box-shadow:0 10px 24px -6px rgba(15,41,66,0.28);white-space:nowrap;">
            <div style="width:24px;height:24px;border-radius:8px;background:${
              isSelected ? '#0284C7' : '#EFF6FF'
            };color:${
        isSelected ? '#FFFFFF' : '#0284C7'
      };display:flex;align-items:center;justify-content:center;font-family:ui-monospace,monospace;font-size:10px;font-weight:700;flex-shrink:0;">
              ${escapeHtml(String(proj.rutasProy.length))}R
            </div>
            <div style="line-height:1.15;text-align:left;">
              <div style="font-size:11px;font-weight:700;max-width:140px;overflow:hidden;text-overflow:ellipsis;">
                ${escapeHtml(proj.proyecto.codigoContrato)}
              </div>
              <div style="font-family:ui-monospace,monospace;font-size:10px;font-weight:700;color:${
                isSelected ? '#7DD3FC' : '#0284C7'
              };">
                ${escapeHtml(valorTexto)}
              </div>
            </div>
          </div>
          <div style="width:10px;height:10px;border-radius:9999px;margin-top:3px;background:${
            isSelected ? '#0284C7' : '#0F2942'
          };border:2px solid #FFFFFF;box-shadow:0 2px 6px rgba(15,41,66,0.4);"></div>
        </div>
      `;

      const marker = L.marker([proj.lat, proj.lon], {
        zIndexOffset: isSelected ? 500 : 100,
        icon: L.divIcon({
          className: '',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
          html: iconHtml,
        }),
      }).addTo(overlay);

      marker.on('click', () => {
        setSelectedProyectoId(proj.proyecto.id);
      });
    });

    const boundsKey = `${provinciaFiltro}:${proyectosGeorreferenciados
      .map((p) => p.proyecto.id)
      .join(',')}`;
    if (boundsKey !== lastBoundsKeyRef.current) {
      lastBoundsKeyRef.current = boundsKey;
      const bounds = overlay.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12 });
      }
      setTimeout(() => map.invalidateSize(), 100);
    }
  }, [
    proyectosGeorreferenciados,
    selectedItem?.proyecto.id,
    canViewFinances,
    moneda,
    areaUnit,
    provinciaFiltro,
  ]);

  const focusProyectoOnMap = (proyectoId: string) => {
    setSelectedProyectoId(proyectoId);
    const geo = proyectosGeorreferenciados.find((p) => p.proyecto.id === proyectoId);
    if (!geo || !mapRef.current) return;

    const coords = geo.rutasProy.flatMap((r) =>
      r.features.flatMap((f) => f.points.map((pt) => [pt.lat, pt.lon] as [number, number]))
    );
    if (coords.length >= 2) {
      const polyBounds = L.latLngBounds(coords);
      if (polyBounds.isValid()) {
        const ne = polyBounds.getNorthEast();
        const sw = polyBounds.getSouthWest();
        if (Math.abs(ne.lat - sw.lat) >= 1e-6 || Math.abs(ne.lng - sw.lng) >= 1e-6) {
          mapRef.current.flyToBounds(polyBounds, { padding: [56, 56], maxZoom: 16, duration: 0.5 });
          return;
        }
      }
    }
    mapRef.current.flyTo([geo.lat, geo.lon], 14, { duration: 0.5 });
  };

  const maxRutasProv = Math.max(1, ...stats.provinciasBarras.map((p) => p.rutasCount));

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-12">
        {/* Columna izquierda: Estadísticas y selector de proyectos (inspirado en ORION en colores SIRIUS) */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-slate-200/80 p-5 sm:p-6 flex flex-col justify-between gap-5 bg-[#F8FAFC]/60">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#0F2942]">
                  Ubicación de Proyectos
                </h3>
                <p className="text-xs text-[#475569] mt-0.5">
                  Haz clic en un marcador del mapa o en la lista para seleccionar.
                </p>
              </div>
              {provinciaFiltro !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setProvinciaFiltro('ALL')}
                  className="text-[11px] font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
                >
                  Ver todas
                </button>
              )}
            </div>

            <div>
              <div className="text-[11px] font-medium text-[#475569]">
                Proyectos georreferenciados
              </div>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-[#0F2942] tabular-nums">
                  {proyectosGeorreferenciados.length}
                </span>
                <span className="text-xs text-[#475569]">
                  de {itemsFiltrados.length} visibles
                </span>
              </div>
            </div>

            {/* 3 filas de métricas con icono SIRIUS */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0F2942] text-white">
                  <RouteIcon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#475569]">Rutas KMZ activas</div>
                  <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                    {stats.totalRutas} ruta(s) · {stats.provinciasBarras.length} prov.
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0284C7] text-white">
                  <Ruler className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#475569]">Superficie total</div>
                  <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                    {formatArea(stats.totalAreaM2, areaUnit)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#15803D] text-white">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-[#475569]">
                    {canViewFinances ? 'Cartera contratada' : 'Servicios completados'}
                  </div>
                  <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                    {canViewFinances
                      ? formatRD(stats.totalContratoRD, moneda)
                      : `${stats.serviciosCompletos} de ${stats.totalServicios}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Dos anillos circulares de progreso con datos reales */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              {[
                { label: 'Avance entregas', pct: stats.pctAvance, stroke: '#0284C7' },
                { label: 'Con mapa KMZ', pct: stats.pctGeorref, stroke: '#15803D' },
              ].map((ring) => {
                const r = 20;
                const c = 2 * Math.PI * r;
                const offset = c - (ring.pct / 100) * c;
                return (
                  <div
                    key={ring.label}
                    className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-white p-2.5"
                  >
                    <svg className="h-12 w-12 shrink-0 -rotate-90" viewBox="0 0 48 48">
                      <circle
                        cx="24"
                        cy="24"
                        r={r}
                        fill="none"
                        stroke="#E2E8F0"
                        strokeWidth="4.5"
                      />
                      <circle
                        cx="24"
                        cy="24"
                        r={r}
                        fill="none"
                        stroke={ring.stroke}
                        strokeWidth="4.5"
                        strokeDasharray={c}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="min-w-0">
                      <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                        {ring.pct}%
                      </div>
                      <div className="text-[11px] text-[#475569] leading-tight truncate">
                        {ring.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lista rápida de selección de proyectos */}
          <div className="space-y-2">
            <div className="text-[11px] font-semibold text-[#475569]">
              Seleccionar proyecto ({itemsFiltrados.length})
            </div>
            <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
              {itemsFiltrados.map((item) => {
                const isSel = selectedItem?.proyecto.id === item.proyecto.id;
                const prov = item.rutasProy[0]?.provincia || 'Sin rutas KMZ';
                return (
                  <button
                    key={item.proyecto.id}
                    type="button"
                    onClick={() => focusProyectoOnMap(item.proyecto.id)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors space-y-1.5 ${
                      isSel
                        ? 'border-[#0284C7] bg-[#0F2942] text-white'
                        : 'border-slate-200/80 bg-white text-[#0F2942] hover:bg-sky-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-xs font-bold truncate">{item.proyecto.nombre}</div>
                        <div
                          className={`text-[11px] font-mono truncate ${
                            isSel ? 'text-sky-200' : 'text-[#475569]'
                          }`}
                        >
                          {item.proyecto.codigoContrato} · {ETIQUETA_ESTADO[item.estadoActual]} · {prov}
                        </div>
                      </div>
                      <span
                        className={`font-mono text-[11px] font-bold tabular-nums shrink-0 ${
                          isSel ? 'text-[#38BDF8]' : 'text-[#0284C7]'
                        }`}
                      >
                        {item.progresoPct}%
                      </span>
                    </div>
                    <div
                      className={`h-1.5 w-full overflow-hidden rounded-full ${
                        isSel ? 'bg-white/15' : 'bg-slate-100'
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          item.progresoPct >= 100
                            ? 'bg-[#22C55E]'
                            : isSel
                            ? 'bg-[#38BDF8]'
                            : 'bg-[#0284C7]'
                        }`}
                        style={{ width: `${item.progresoPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Columna derecha: Mapa interactivo + ficha del proyecto seleccionado */}
        <div className="lg:col-span-8 flex flex-col justify-between">
          <div className="relative flex-1 min-h-[380px] sm:min-h-[440px]">
            <div ref={mapContainerRef} className="w-full h-full min-h-[380px] sm:min-h-[440px] z-0" />

            {proyectosGeorreferenciados.length === 0 && (
              <div className="absolute inset-0 z-[400] flex items-center justify-center bg-[#F8FAFC]/90 p-6 text-center">
                <div className="max-w-sm space-y-2">
                  <Compass className="mx-auto h-7 w-7 text-[#0284C7]" />
                  <div className="text-sm font-bold text-[#0F2942]">
                    Sin coordenadas KMZ en este filtro
                  </div>
                  <p className="text-xs text-[#475569]">
                    Agrega una ruta KMZ/GeoJSON a un proyecto para visualizar su ubicación en el mapa.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Ficha contextual del proyecto seleccionado en el mapa */}
          {selectedItem && (
            <div className="border-t border-slate-200/80 bg-white p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono font-bold text-[#0284C7]">
                    {selectedItem.proyecto.codigoContrato}
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <WorkflowBadge status={selectedItem.estadoActual} />
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                    {selectedItem.progresoPct}% avance
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 text-[#475569]">
                    <MapPin className="h-3.5 w-3.5 text-[#0284C7]" />
                    {selectedItem.rutasProy[0]?.provincia || 'Sin ubicación'}
                  </span>
                </div>
                <div className="text-sm font-bold text-[#0F2942] truncate">
                  {selectedItem.proyecto.nombre}
                </div>
                <div className="flex items-center gap-2.5 max-w-xs pt-0.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        selectedItem.progresoPct >= 100 ? 'bg-[#15803D]' : 'bg-[#0284C7]'
                      }`}
                      style={{ width: `${selectedItem.progresoPct}%` }}
                    />
                  </div>
                  <span className="font-mono text-[11px] font-semibold text-[#475569] tabular-nums">
                    {selectedItem.progresoPct}%
                  </span>
                </div>
                <div className="text-xs text-[#475569] truncate">
                  {selectedItem.cliente?.nombre || 'Cliente sin asignar'} ·{' '}
                  {selectedItem.rutasProy.length} ruta(s) ·{' '}
                  {formatArea(
                    selectedItem.rutasProy.reduce((acc, r) => acc + r.totalAreaM2, 0),
                    areaUnit
                  )}
                  {canViewFinances
                    ? ` · ${formatRD(selectedItem.proyecto.valorContratoRD, moneda)}`
                    : ''}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {selectedItem.rutasProy[0] && (
                  <>
                    <button
                      type="button"
                      onClick={() => onVerRutaEnMapa(selectedItem.rutasProy[0].id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap"
                    >
                      <Layers className="h-3.5 w-3.5 text-[#0284C7]" />
                      Ver KMZ
                    </button>
                    <button
                      type="button"
                      onClick={() => onCalcularRuta(selectedItem.rutasProy[0].id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[40px] whitespace-nowrap"
                    >
                      <RouteIcon className="h-3.5 w-3.5" />
                      Cotizar ruta
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => onSelectProyectoDetalle(selectedItem.proyecto.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap transition-colors"
                >
                  Abrir detalle
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Barra inferior de distribución por provincia (inspirada en barra inferior de ORION) */}
          {stats.provinciasBarras.length > 0 && (
            <div className="border-t border-slate-200/80 bg-[#F8FAFC] px-4 py-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold text-[#475569] mr-1">
                Por provincia:
              </span>
              {stats.provinciasBarras.map((prov) => {
                const isActiva = provinciaFiltro === prov.provincia;
                const widthPct = Math.max(20, Math.round((prov.rutasCount / maxRutasProv) * 100));
                return (
                  <button
                    key={prov.provincia}
                    type="button"
                    onClick={() =>
                      setProvinciaFiltro(isActiva ? 'ALL' : prov.provincia)
                    }
                    className={`rounded-xl border px-3 py-1.5 text-left transition-colors ${
                      isActiva
                        ? 'border-[#0284C7] bg-[#0F2942] text-white'
                        : 'border-slate-200 bg-white text-[#0F2942] hover:border-[#0284C7]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                      <span>{prov.provincia}</span>
                      <span
                        className={`font-mono ${
                          isActiva ? 'text-[#38BDF8]' : 'text-[#0284C7]'
                        }`}
                      >
                        {prov.proyectosCount}P · {prov.rutasCount}R
                      </span>
                    </div>
                    <div className="mt-1 h-1 w-full rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          isActiva ? 'bg-[#38BDF8]' : 'bg-[#0284C7]'
                        }`}
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
