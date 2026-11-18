import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Compass,
  Download,
  LocateFixed,
  Maximize2,
  Map as MapIcon,
  Mountain,
  Grid,
} from 'lucide-react';
import type { AreaUnit, GeoPoint, KmzFeature } from '../types/geodesy';
import { formatArea, formatPerimeter } from '../utils/geodesy';

type BaseLayerMode = 'osm' | 'topo' | 'grid';

interface KmzOsmViewerProps {
  parcelCode: string;
  fileName: string;
  features: KmzFeature[];
  centroid: GeoPoint;
  totalAreaM2: number;
  totalPerimeterM: number;
  areaUnit: AreaUnit;
  onChangeAreaUnit: (unit: AreaUnit) => void;
  liveGpsPoint?: GeoPoint | null;
  onCaptureLiveGps?: () => void;
  isCapturingGps?: boolean;
  compact?: boolean;
  onDropFile?: (file: File) => void;
}

export const KmzOsmViewer: React.FC<KmzOsmViewerProps> = ({
  parcelCode,
  fileName,
  features,
  centroid,
  totalAreaM2,
  totalPerimeterM,
  areaUnit,
  onChangeAreaUnit,
  liveGpsPoint,
  onCaptureLiveGps,
  isCapturingGps = false,
  compact = false,
  onDropFile,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const vectorGroupRef = useRef<L.FeatureGroup | null>(null);

  const [baseLayer, setBaseLayer] = useState<BaseLayerMode>('osm');
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number>(0);
  const [isDragOver, setIsDragOver] = useState(false);

  const primaryFeature = features[0];
  const activeVertex =
    primaryFeature?.points[selectedVertexIdx] ?? primaryFeature?.points[0] ?? centroid;

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [centroid.lat, centroid.lon],
      zoom: 16,
      zoomControl: true,
      attributionControl: true,
    });

    const vectorGroup = L.featureGroup().addTo(map);
    mapRef.current = map;
    vectorGroupRef.current = vectorGroup;

    // Ensure proper sizing inside modals or dynamic tabs
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      vectorGroupRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch OpenStreetMap / OpenTopoMap / Offline Grid base layer
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (baseLayer === 'osm') {
      tileLayerRef.current = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);
      tileLayerRef.current.bringToBack();
    } else if (baseLayer === 'topo') {
      tileLayerRef.current = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxNativeZoom: 17,
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap, SRTM | OpenTopoMap',
      }).addTo(map);
      tileLayerRef.current.bringToBack();
    }

    if (vectorGroupRef.current) {
      vectorGroupRef.current.bringToFront();
    }
    map.invalidateSize();
  }, [baseLayer]);

  // Render KMZ geometries, vertices, popups, and live GPS point
  useEffect(() => {
    const map = mapRef.current;
    const group = vectorGroupRef.current;
    if (!map || !group) return;

    group.clearLayers();
    setSelectedVertexIdx(0);

    features.forEach((feature, fIdx) => {
      if (feature.geometryType === 'Polygon' && feature.points.length >= 3) {
        const latlngs: L.LatLngExpression[] = feature.points.map((p) => [p.lat, p.lon]);
        const poly = L.polygon(latlngs, {
          color: '#0284C7',
          weight: 3,
          opacity: 0.95,
          fillColor: '#0284C7',
          fillOpacity: 0.22,
        }).addTo(group);

        const attrRows = feature.attributes
          ? Object.entries(feature.attributes)
              .slice(0, 4)
              .map(([k, v]) => `<div><strong>${k}:</strong> ${v}</div>`)
              .join('')
          : '';

        poly.bindPopup(
          `<div style="font-family: Plus Jakarta Sans, sans-serif; font-size: 12px; min-width: 180px;">
            <div style="font-weight: 700; color: #0F2942; margin-bottom: 4px;">${feature.name}</div>
            <div><strong>Área:</strong> ${formatArea(feature.areaM2, areaUnit)}</div>
            <div><strong>Perímetro:</strong> ${formatPerimeter(feature.perimeterM)}</div>
            ${attrRows}
          </div>`
        );

        // Plot clickable vertex markers for primary polygon
        if (fIdx === 0) {
          feature.points.forEach((pt, vIdx) => {
            const first = feature.points[0];
            const isClosingDuplicate =
              vIdx === feature.points.length - 1 &&
              feature.points.length > 3 &&
              Math.abs(pt.lat - first.lat) < 1e-6 &&
              Math.abs(pt.lon - first.lon) < 1e-6;
            if (isClosingDuplicate) return;

            const isSelected = vIdx === selectedVertexIdx;
            const marker = L.circleMarker([pt.lat, pt.lon], {
              radius: isSelected ? 7 : 5,
              color: isSelected ? '#D97706' : '#0F2942',
              weight: 2,
              fillColor: isSelected ? '#FEF08A' : '#FFFFFF',
              fillOpacity: 1,
            }).addTo(group);

            marker.bindTooltip(`V${vIdx + 1}`, {
              permanent: !compact && feature.points.length <= 18,
              direction: 'top',
              offset: [0, -6],
              className: 'font-mono text-[10px] font-bold',
            });

            marker.on('click', () => {
              setSelectedVertexIdx(vIdx);
            });
          });
        }
      } else if (feature.geometryType === 'LineString' && feature.points.length >= 2) {
        const latlngs: L.LatLngExpression[] = feature.points.map((p) => [p.lat, p.lon]);
        const line = L.polyline(latlngs, {
          color: '#D97706',
          weight: 3.5,
        }).addTo(group);
        line.bindPopup(
          `<div style="font-size:12px;"><strong>${feature.name}</strong><br/>Longitud: ${formatPerimeter(
            feature.perimeterM
          )}</div>`
        );
        if (fIdx === 0) {
          feature.points.forEach((pt, vIdx) => {
            const isSelected = vIdx === selectedVertexIdx;
            const marker = L.circleMarker([pt.lat, pt.lon], {
              radius: isSelected ? 6 : 4,
              color: isSelected ? '#0F2942' : '#B45309',
              weight: 2,
              fillColor: isSelected ? '#FEF08A' : '#FFFFFF',
              fillOpacity: 1,
            }).addTo(group);
            if (!compact && feature.points.length <= 18) {
              marker.bindTooltip(`V${vIdx + 1}`, {
                permanent: true,
                direction: 'top',
                offset: [0, -5],
                className: 'font-mono text-[10px] font-bold',
              });
            }
            marker.on('click', () => {
              setSelectedVertexIdx(vIdx);
            });
          });
        }
      } else {
        feature.points.forEach((pt) => {
          const pin = L.circleMarker([pt.lat, pt.lon], {
            radius: 6,
            color: '#FFFFFF',
            weight: 2,
            fillColor: '#16A34A',
            fillOpacity: 1,
          }).addTo(group);
          pin.bindPopup(
            `<div style="font-size:12px;"><strong>${feature.name}</strong><br/>UTM 19N: ${pt.easting.toFixed(
              2
            )}E, ${pt.northing.toFixed(2)}N</div>`
          );
        });
      }
    });

    if (liveGpsPoint) {
      const gpsPin = L.circleMarker([liveGpsPoint.lat, liveGpsPoint.lon], {
        radius: 8,
        color: '#FFFFFF',
        weight: 2.5,
        fillColor: '#16A34A',
        fillOpacity: 1,
      }).addTo(group);
      gpsPin.bindTooltip('GPS CAMPO', { permanent: true, direction: 'right' });
    }

    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 });
    } else {
      map.setView([centroid.lat, centroid.lon], 15);
    }
    setTimeout(() => map.invalidateSize(), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [features, centroid, liveGpsPoint, areaUnit, compact]);

  const handleFitBounds = () => {
    const map = mapRef.current;
    const group = vectorGroupRef.current;
    if (!map || !group) return;
    const bounds = group.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 18 });
    }
  };

  const handleExportCsvVertices = () => {
    if (!primaryFeature) return;
    const header = 'Vertice,Este_X_m,Norte_Y_m,Elevacion_Z_m,Latitud,Longitud,Zona_UTM\n';
    const rows = primaryFeature.points
      .map(
        (p, idx) =>
          `V${idx + 1},${p.easting.toFixed(2)},${p.northing.toFixed(2)},${p.elev.toFixed(2)},${p.lat.toFixed(
            6
          )},${p.lon.toFixed(6)},${p.zone}`
      )
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${parcelCode}_vertices_19N.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-md border border-[#CBD5E1] bg-white overflow-hidden">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#E2E8F0] bg-[#F8FAFC] px-3.5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Compass className="h-4 w-4 text-[#0284C7] shrink-0" />
            <span className="font-mono text-xs font-bold text-[#0F2942] truncate">{parcelCode}</span>
            <span className="text-xs text-[#43474D]">·</span>
            <span className="text-xs font-medium text-[#334155] truncate">{fileName}</span>
          </div>
          {!compact && (
            <p className="mt-0.5 text-[11px] text-[#43474D]">
              Visualizador KMZ / KML / GeoJSON sobre OpenStreetMap · Proyección WGS84 / UTM Zona 19N (EPSG:32619)
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Base Map Switcher: OpenStreetMap / Topo / Offline Grid */}
          <div className="inline-flex rounded-sm border border-[#CBD5E1] bg-white p-0.5" role="group" aria-label="Capa base del mapa">
            <button
              type="button"
              onClick={() => setBaseLayer('osm')}
              className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                baseLayer === 'osm' ? 'bg-[#0284C7] text-white' : 'text-[#43474D] hover:bg-[#F1F5F9]'
              }`}
            >
              <MapIcon className="h-3 w-3" />
              OSM
            </button>
            <button
              type="button"
              onClick={() => setBaseLayer('topo')}
              className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                baseLayer === 'topo' ? 'bg-[#0284C7] text-white' : 'text-[#43474D] hover:bg-[#F1F5F9]'
              }`}
            >
              <Mountain className="h-3 w-3" />
              Topo
            </button>
            <button
              type="button"
              onClick={() => setBaseLayer('grid')}
              className={`inline-flex items-center gap-1 rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                baseLayer === 'grid' ? 'bg-[#0F2942] text-white' : 'text-[#43474D] hover:bg-[#F1F5F9]'
              }`}
              title="Solo polígono vectorial sin tiles externos"
            >
              <Grid className="h-3 w-3" />
              Vector
            </button>
          </div>

          {/* Dynamic Cadastral Unit Switcher */}
          <div className="inline-flex rounded-sm border border-[#CBD5E1] bg-white p-0.5" role="group" aria-label="Unidad catastral">
            {(
              [
                { id: 'm2', label: 'm²' },
                { id: 'ha', label: 'ha' },
                { id: 'tareas', label: 'Tareas' },
              ] as const
            ).map((unit) => (
              <button
                key={unit.id}
                type="button"
                onClick={() => onChangeAreaUnit(unit.id)}
                className={`rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors ${
                  areaUnit === unit.id
                    ? 'bg-[#0F2942] text-white'
                    : 'text-[#43474D] hover:bg-[#F1F5F9]'
                }`}
              >
                {unit.label}
              </button>
            ))}
          </div>

          {!compact && (
            <button
              type="button"
              onClick={handleExportCsvVertices}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#334155] hover:bg-[#F1F5F9]"
            >
              <Download className="h-3.5 w-3.5" />
              CSV Vértices
            </button>
          )}
        </div>
      </div>

      {/* Leaflet OpenStreetMap Canvas */}
      <div
        className="relative"
        onDragOver={(e) => {
          if (!onDropFile) return;
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={(e) => {
          if (!onDropFile) return;
          e.preventDefault();
          setIsDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) onDropFile(f);
        }}
      >
        <div
          ref={mapContainerRef}
          style={{ backgroundColor: baseLayer === 'grid' ? '#0B1C2E' : '#E6EEFF' }}
          className={`w-full ${
            compact ? 'h-[210px]' : 'h-[340px] sm:h-[420px]'
          } z-0`}
        />
        {isDragOver && onDropFile && (
          <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center bg-[#0F2942]/70 backdrop-blur-[1px] border-2 border-dashed border-[#5BB8FE] m-2 rounded-md">
            <div className="rounded-sm bg-white px-4 py-2 text-xs font-bold text-[#0F2942] shadow">
              Suelta aquí tu archivo .KMZ, .KML o .GeoJSON para visualizarlo
            </div>
          </div>
        )}

        {/* Map Utility Floating Controls */}
        <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
          <button
            type="button"
            onClick={handleFitBounds}
            className="flex h-8 w-8 items-center justify-center rounded-sm border border-[#CBD5E1] bg-white text-[#0F2942] shadow-sm hover:bg-[#F1F5F9]"
            title="Centrar en polígono KMZ"
            aria-label="Centrar en polígono KMZ"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>

        {onCaptureLiveGps && !compact && (
          <div className="absolute bottom-4 left-3 z-[400]">
            <button
              type="button"
              onClick={onCaptureLiveGps}
              disabled={isCapturingGps}
              className="inline-flex items-center gap-1.5 rounded-sm border border-[#0F2942]/30 bg-[#0F2942]/95 px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#0284C7] disabled:opacity-60 transition-colors min-h-[38px]"
            >
              <LocateFixed className="h-3.5 w-3.5 text-[#5BB8FE]" />
              {isCapturingGps ? 'Fijando GPS...' : 'Fijar Posición GPS'}
            </button>
          </div>
        )}
      </div>

      {/* Geodetic Coordinate Matrix & Cadastral Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-[#E2E8F0] border-t border-[#E2E8F0] bg-white">
        <div className="p-2.5 sm:p-3">
          <div className="text-[11px] font-medium text-[#43474D]">
            Superficie ({areaUnit === 'tareas' ? 'Tareas RD' : areaUnit})
          </div>
          <div className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#0D1C2F] tabular-nums">
            {formatArea(totalAreaM2, areaUnit)}
          </div>
        </div>
        <div className="p-2.5 sm:p-3">
          <div className="text-[11px] font-medium text-[#43474D]">Perímetro Total</div>
          <div className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#0D1C2F] tabular-nums">
            {formatPerimeter(totalPerimeterM)}
          </div>
        </div>
        <div className="p-2.5 sm:p-3">
          <div className="text-[11px] font-medium text-[#43474D]">
            X (Este) · V{selectedVertexIdx + 1}
          </div>
          <div className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#0284C7] tabular-nums">
            {activeVertex.easting.toFixed(2)} m
          </div>
        </div>
        <div className="p-2.5 sm:p-3">
          <div className="text-[11px] font-medium text-[#43474D]">
            Y (Norte) · V{selectedVertexIdx + 1}
          </div>
          <div className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#0284C7] tabular-nums">
            {activeVertex.northing.toFixed(2)} m
          </div>
        </div>
        <div className="p-2.5 sm:p-3 col-span-2 sm:col-span-1">
          <div className="text-[11px] font-medium text-[#43474D]">
            Z (Elevación) · {activeVertex.zone}
          </div>
          <div className="mt-0.5 font-mono text-xs sm:text-sm font-semibold text-[#0D1C2F] tabular-nums">
            {activeVertex.elev.toFixed(2)} msnm
          </div>
        </div>
      </div>
    </div>
  );
};
