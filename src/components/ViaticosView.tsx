import React, { useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle2,
  FileSpreadsheet,
  MapPin,
  Plus,
  Split,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  completarRepartoConSinAsignar,
  puedeAprobarViatico,
  validarRepartoViatico,
} from '../domain';
import type {
  CategoriaViatico,
  EstadoAprobacionViatico,
  Proyecto,
  RepartoProyecto,
  RolEmpresa,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface ViaticosViewProps {
  rol: RolEmpresa;
  viaticos: Viatico[];
  proyectos: Proyecto[];
  onAbrirModalNuevo: () => void;
  onDecidirViatico: (params: {
    viaticoId: string;
    nuevoEstado: EstadoAprobacionViatico;
    motivoRechazo?: string;
  }) => Promise<void>;
  onActualizarReparto: (viaticoId: string, repartos: RepartoProyecto[]) => Promise<void>;
  onEliminarViatico: (viaticoId: string) => Promise<void>;
}

const CATEGORIAS: CategoriaViatico[] = [
  'Combustible',
  'Dieta',
  'Hospedaje',
  'Peaje',
  'Materiales',
  'Otro',
];

export const ViaticosView: React.FC<ViaticosViewProps> = ({
  rol,
  viaticos,
  proyectos,
  onAbrirModalNuevo,
  onDecidirViatico,
  onActualizarReparto,
  onEliminarViatico,
}) => {
  const canDecide = puedeAprobarViatico(rol);
  const [filtroCat, setFiltroCat] = useState<CategoriaViatico | 'ALL'>('ALL');
  const [filtroEstado, setFiltroEstado] = useState<EstadoAprobacionViatico | 'ALL'>('ALL');

  // Modal rechazo
  const [rechazoTarget, setRechazoTarget] = useState<Viatico | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal reparto exacto
  const [repartoTarget, setRepartoTarget] = useState<Viatico | null>(null);
  const [repartoEdicion, setRepartoEdicion] = useState<RepartoProyecto[]>([]);

  const viaticosFiltrados = useMemo(
    () =>
      viaticos.filter((v) => {
        if (filtroCat !== 'ALL' && v.categoria !== filtroCat) return false;
        if (filtroEstado !== 'ALL' && v.estadoAprobacion !== filtroEstado) return false;
        return true;
      }),
    [viaticos, filtroCat, filtroEstado]
  );

  const resumen = useMemo(() => {
    let aprobado = 0;
    let pendiente = 0;
    let rechazado = 0;
    let sinAsignar = 0;
    for (const v of viaticos) {
      if (v.estadoAprobacion === 'aprobado') aprobado += v.montoRD;
      else if (v.estadoAprobacion === 'rechazado') rechazado += v.montoRD;
      else pendiente += v.montoRD;

      if (v.estadoAprobacion !== 'rechazado') {
        for (const r of v.repartos) {
          if (r.proyectoId === 'sin_asignar') sinAsignar += r.montoRD;
        }
      }
    }
    return { aprobado, pendiente, rechazado, sinAsignar };
  }, [viaticos]);

  const proyectoNombre = (proyectoId: string) => {
    if (proyectoId === 'sin_asignar') return 'Sin asignar';
    const p = proyectos.find((x) => x.id === proyectoId);
    return p ? p.codigoContrato : proyectoId;
  };

  const handleExportCsv = () => {
    const header =
      'Fecha,Hora_AST,Registrado_Por,Categoria,Comercio,NCF,ITBIS_RD,Monto_RD,Metodo,Estado,Reparto\n';
    const rows = viaticosFiltrados
      .map((v) => {
        const repartoStr = v.repartos
          .map((r) => `${proyectoNombre(r.proyectoId)}: ${r.montoRD.toFixed(2)}`)
          .join(' | ');
        return `${v.fechaIso},"${v.timestampAST}","${v.creadoPorNombre}",${v.categoria},"${v.comercio.replace(
          /"/g,
          '""'
        )}",${v.ncf || ''},${v.itbisRD.toFixed(2)},${v.montoRD.toFixed(2)},${v.metodo},${
          v.estadoAprobacion
        },"${repartoStr}"`;
      })
      .join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `viaticos_geomatrix_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleConfirmRechazo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rechazoTarget) return;
    setModalError(null);
    try {
      await onDecidirViatico({
        viaticoId: rechazoTarget.id,
        nuevoEstado: 'rechazado',
        motivoRechazo,
      });
      setRechazoTarget(null);
      setMotivoRechazo('');
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo rechazar el viático.');
    }
  };

  const handleConfirmReparto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!repartoTarget) return;
    setModalError(null);
    const check = validarRepartoViatico(repartoTarget.montoRD, repartoEdicion);
    if (!check.valido) {
      setModalError(check.error || 'La suma del reparto debe igualar el gasto.');
      return;
    }
    try {
      await onActualizarReparto(repartoTarget.id, repartoEdicion);
      setRepartoTarget(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo guardar el reparto.');
    }
  };

  const estadoStyle = (estado: EstadoAprobacionViatico) => {
    if (estado === 'aprobado') return 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]';
    if (estado === 'rechazado') return 'border-[#FCA5A5] bg-[#FEE2E2] text-[#93000A]';
    return 'border-[#FDE047] bg-[#FEF9C3]/60 text-[#A16207]';
  };

  return (
    <section className="space-y-5">
      {/* KPI Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-md border border-[#E2E8F0] bg-white p-4">
          <div className="text-xs font-medium text-[#43474D]">Aprobados</div>
          <div className="mt-1 font-mono text-xl font-bold text-[#15803D] tabular-nums">
            {formatRD(resumen.aprobado)}
          </div>
        </div>
        <div className="rounded-md border border-[#E2E8F0] bg-white p-4">
          <div className="text-xs font-medium text-[#43474D]">Pendientes</div>
          <div className="mt-1 font-mono text-xl font-bold text-[#D97706] tabular-nums">
            {formatRD(resumen.pendiente)}
          </div>
        </div>
        <div className="rounded-md border border-[#E2E8F0] bg-white p-4">
          <div className="text-xs font-medium text-[#43474D]">Sin Asignar a Proyecto</div>
          <div className="mt-1 font-mono text-xl font-bold text-[#0284C7] tabular-nums">
            {formatRD(resumen.sinAsignar)}
          </div>
        </div>
        <div className="rounded-md border border-[#E2E8F0] bg-white p-4">
          <div className="text-xs font-medium text-[#43474D]">Rechazados</div>
          <div className="mt-1 font-mono text-xl font-bold text-[#DC2626] tabular-nums">
            {formatRD(resumen.rechazado)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-[#CBD5E1] bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value as CategoriaViatico | 'ALL')}
            className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
          >
            <option value="ALL">Todas las categorías</option>
            {CATEGORIAS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value as EstadoAprobacionViatico | 'ALL')}
            className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
          >
            <option value="ALL">Todos los estados</option>
            <option value="pendiente">Pendientes</option>
            <option value="aprobado">Aprobados</option>
            <option value="rechazado">Rechazados</option>
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 rounded-sm border border-[#CBD5E1] bg-white px-3 py-2 text-xs font-semibold text-[#334155] hover:bg-[#F8FAFC] min-h-[38px]"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Exportar CSV
          </button>
          <button
            type="button"
            onClick={onAbrirModalNuevo}
            className="inline-flex items-center gap-1.5 rounded-sm bg-[#0284C7] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#006398] min-h-[38px]"
          >
            <Camera className="h-4 w-4" />
            Reportar Viático Móvil
          </button>
        </div>
      </div>

      {/* Desktop Ledger Table */}
      <div className="hidden md:block rounded-md border border-[#E2E8F0] bg-white overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="bg-[#0F2942] text-white uppercase tracking-wide text-[11px] font-semibold">
              <th className="px-4 py-3">Fecha / AST</th>
              <th className="px-4 py-3">Comercio / Método</th>
              <th className="px-4 py-3">Reparto a Proyectos</th>
              <th className="px-4 py-3 text-right">ITBIS / NCF</th>
              <th className="px-4 py-3 text-right">Monto RD$</th>
              <th className="px-4 py-3">Aprobación</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E2E8F0]">
            {viaticosFiltrados.map((v, idx) => (
              <tr key={v.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#F8FAFC]'}>
                <td className="px-4 py-2.5 align-top font-mono">
                  <div className="font-semibold text-[#0D1C2F]">{v.fechaIso}</div>
                  <div className="text-[11px] text-[#43474D]">{v.timestampAST}</div>
                  <div className="mt-0.5 font-sans text-[11px] text-[#43474D]">
                    {v.creadoPorNombre}
                  </div>
                </td>
                <td className="px-4 py-2.5 align-top">
                  <div className="font-semibold text-[#0D1C2F]">{v.comercio}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[#43474D]">
                    <span className="font-medium text-[#0F2942]">{v.categoria}</span>
                    <span>·</span>
                    <span>{v.metodo}</span>
                    {typeof v.distanceKm === 'number' && (
                      <span className="inline-flex items-center gap-0.5 font-mono text-[#0284C7]">
                        · <MapPin className="h-3 w-3" />
                        {v.distanceKm} km
                      </span>
                    )}
                  </div>
                  {v.notas && <div className="mt-0.5 text-[11px] text-[#74777E]">{v.notas}</div>}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <div className="space-y-1">
                    {v.repartos.map((r) => (
                      <div
                        key={r.proyectoId}
                        className="flex items-center justify-between gap-2 text-[11px]"
                      >
                        <span
                          className={`font-mono font-semibold ${
                            r.proyectoId === 'sin_asignar' ? 'text-[#D97706]' : 'text-[#0F2942]'
                          }`}
                        >
                          {proyectoNombre(r.proyectoId)}
                        </span>
                        <span className="font-mono tabular-nums text-[#334155]">
                          {formatRD(r.montoRD)}
                        </span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5 align-top text-right font-mono tabular-nums">
                  <div>{formatRD(v.itbisRD)}</div>
                  <div className="text-[11px] text-[#43474D]">{v.ncf || 'Sin NCF'}</div>
                </td>
                <td className="px-4 py-2.5 align-top text-right font-mono font-bold text-[#0D1C2F] tabular-nums">
                  {formatRD(v.montoRD)}
                </td>
                <td className="px-4 py-2.5 align-top">
                  <span
                    className={`inline-block rounded-sm border px-2 py-0.5 text-[11px] font-semibold uppercase ${estadoStyle(
                      v.estadoAprobacion
                    )}`}
                  >
                    {v.estadoAprobacion}
                  </span>
                  {v.motivoRechazo && (
                    <div className="mt-1 text-[11px] text-[#DC2626] max-w-[180px]">
                      {v.motivoRechazo}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2.5 align-top text-right whitespace-nowrap">
                  <div className="inline-flex items-center gap-1">
                    {canDecide && v.estadoAprobacion !== 'aprobado' && (
                      <button
                        type="button"
                        onClick={() =>
                          onDecidirViatico({ viaticoId: v.id, nuevoEstado: 'aprobado' })
                        }
                        title="Aprobar viático"
                        className="rounded-sm bg-[#15803D] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#166534]"
                      >
                        Aprobar
                      </button>
                    )}
                    {canDecide && v.estadoAprobacion !== 'rechazado' && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setRechazoTarget(v);
                        }}
                        title="Rechazar viático"
                        className="rounded-sm border border-[#FCA5A5] bg-white px-2 py-1 text-[11px] font-semibold text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        Rechazar
                      </button>
                    )}
                    {canDecide && (
                      <button
                        type="button"
                        onClick={() => {
                          setModalError(null);
                          setRepartoTarget(v);
                          setRepartoEdicion(v.repartos.map((r) => ({ ...r })));
                        }}
                        title="Editar reparto por proyecto"
                        className="rounded-sm border border-[#CBD5E1] bg-white p-1.5 text-[#0F2942] hover:bg-[#F8FAFC]"
                      >
                        <Split className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {(canDecide || v.estadoAprobacion === 'pendiente') && (
                      <button
                        type="button"
                        onClick={() => onEliminarViatico(v.id)}
                        title="Eliminar viático"
                        className="rounded-sm p-1.5 text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {viaticosFiltrados.length === 0 && (
          <div className="p-8 text-center text-xs text-[#43474D]">
            No hay viáticos registrados con los filtros actuales.
          </div>
        )}
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {viaticosFiltrados.map((v) => (
          <div key={v.id} className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xs font-bold text-[#0D1C2F]">{v.comercio}</div>
                <div className="font-mono text-[11px] text-[#43474D]">
                  {v.fechaIso} · {v.categoria} · {v.metodo}
                </div>
              </div>
              <span className="font-mono text-sm font-bold text-[#0F2942] tabular-nums shrink-0">
                {formatRD(v.montoRD)}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span
                className={`rounded-sm border px-2 py-0.5 font-semibold uppercase ${estadoStyle(
                  v.estadoAprobacion
                )}`}
              >
                {v.estadoAprobacion}
              </span>
              <span className="font-mono text-[#43474D]">
                {v.repartos
                  .map((r) => `${proyectoNombre(r.proyectoId)}: ${formatRD(r.montoRD)}`)
                  .join(' · ')}
              </span>
            </div>

            {canDecide && (
              <div className="grid grid-cols-3 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => onDecidirViatico({ viaticoId: v.id, nuevoEstado: 'aprobado' })}
                  className="inline-flex items-center justify-center gap-1 rounded-sm bg-[#15803D] py-2 text-xs font-semibold text-white min-h-[40px]"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aprobar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setRechazoTarget(v);
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-sm border border-[#FCA5A5] bg-white py-2 text-xs font-semibold text-[#DC2626] min-h-[40px]"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Rechazar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalError(null);
                    setRepartoTarget(v);
                    setRepartoEdicion(v.repartos.map((r) => ({ ...r })));
                  }}
                  className="inline-flex items-center justify-center gap-1 rounded-sm border border-[#CBD5E1] bg-white py-2 text-xs font-semibold text-[#0F2942] min-h-[40px]"
                >
                  <Split className="h-3.5 w-3.5" />
                  Repartir
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Modal Rechazar Viático */}
      {rechazoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 p-4">
          <div className="w-full max-w-md rounded-md border border-[#CBD5E1] bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">
                Rechazar Viático ({formatRD(rechazoTarget.montoRD)})
              </h3>
              <button
                type="button"
                onClick={() => setRechazoTarget(null)}
                className="rounded-sm p-1 text-[#43474D] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmRechazo} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Motivo de rechazo (obligatorio)
                </label>
                <textarea
                  rows={3}
                  required
                  value={motivoRechazo}
                  onChange={(e) => setMotivoRechazo(e.target.value)}
                  placeholder="Ej. Comprobante duplicado o NCF ilegible..."
                  className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRechazoTarget(null)}
                  className="rounded-sm border border-[#CBD5E1] px-3 py-2 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-sm bg-[#DC2626] px-4 py-2 font-semibold text-white hover:bg-[#B91C1C]"
                >
                  Confirmar Rechazo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Redistribuir Reparto Exacto */}
      {repartoTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 p-4">
          <div className="w-full max-w-lg rounded-md border border-[#CBD5E1] bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[#0D1C2F]">
                  Reparto Exacto a Proyectos — {repartoTarget.comercio}
                </h3>
                <p className="text-xs text-[#43474D]">
                  Total del comprobante: <strong>{formatRD(repartoTarget.montoRD)}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRepartoTarget(null)}
                className="rounded-sm p-1 text-[#43474D] hover:bg-[#F1F5F9]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmReparto} className="space-y-3 text-xs">
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {repartoEdicion.map((linea, idx) => (
                  <div key={`${linea.proyectoId}-${idx}`} className="flex items-center gap-2">
                    <select
                      value={linea.proyectoId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setRepartoEdicion((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, proyectoId: val } : item))
                        );
                      }}
                      className="flex-1 rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                    >
                      {proyectos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigoContrato} — {p.nombre}
                        </option>
                      ))}
                      <option value="sin_asignar">Sin asignar</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={linea.montoRD}
                      onChange={(e) => {
                        const val = Number(e.target.value) || 0;
                        setRepartoEdicion((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, montoRD: val } : item))
                        );
                      }}
                      className="w-28 rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono"
                    />
                    {repartoEdicion.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setRepartoEdicion((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="rounded-sm p-1.5 text-[#DC2626] hover:bg-[#FEE2E2]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    const usado = new Set(repartoEdicion.map((r) => r.proyectoId));
                    const libre = proyectos.find((p) => !usado.has(p.id))?.id || 'sin_asignar';
                    setRepartoEdicion((prev) => [...prev, { proyectoId: libre, montoRD: 0 }]);
                  }}
                  className="inline-flex items-center gap-1 rounded-sm border border-[#CBD5E1] px-2.5 py-1.5 font-semibold text-[#0F2942]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Añadir proyecto
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setRepartoEdicion(
                      completarRepartoConSinAsignar(repartoTarget.montoRD, repartoEdicion)
                    )
                  }
                  className="rounded-sm bg-[#FEF3C7] px-2.5 py-1.5 font-semibold text-[#A16207]"
                >
                  Completar saldo en Sin asignar
                </button>
              </div>

              <div className="flex justify-end gap-2 border-t border-[#E2E8F0] pt-3">
                <button
                  type="button"
                  onClick={() => setRepartoTarget(null)}
                  className="rounded-sm border border-[#CBD5E1] px-3 py-2 font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-sm bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7]"
                >
                  Guardar Reparto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
