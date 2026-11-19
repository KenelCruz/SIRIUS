import React, { useState } from 'react';
import { Building2, Car, Compass, Plus, UserCheck, Users, Wrench } from 'lucide-react';
import {
  puedeGestionarCatalogos,
  resolverEtiquetaCargo,
  type CombustibleVigente,
} from '../domain';
import type {
  CargoConfig,
  CargoPersonal,
  Cliente,
  Cuadrilla,
  EquipoGNSS,
  EstadoRecurso,
  Personal,
  RolEmpresa,
  Vehiculo,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface CatalogosViewProps {
  rol: RolEmpresa;
  clientes: Cliente[];
  personal: Personal[];
  cargos: CargoConfig[];
  vehiculos: Vehiculo[];
  combustiblesVigentes: CombustibleVigente[];
  equipos: EquipoGNSS[];
  cuadrillas: Cuadrilla[];
  moneda?: string;
  onCrearCliente: (datos: Omit<Cliente, 'id' | 'empresaId'>) => Promise<void>;
  onGuardarPersonal: (
    item: Omit<Personal, 'id' | 'empresaId'> & { id?: string }
  ) => Promise<void>;
  onGuardarVehiculo: (
    item: Omit<Vehiculo, 'id' | 'empresaId'> & { id?: string }
  ) => Promise<void>;
  onGuardarEquipo: (
    item: Omit<EquipoGNSS, 'id' | 'empresaId'> & { id?: string }
  ) => Promise<void>;
  onGuardarCuadrilla: (
    item: Omit<Cuadrilla, 'id' | 'empresaId'> & { id?: string }
  ) => Promise<void>;
}

type SubTab = 'clientes' | 'personal' | 'vehiculos' | 'equipos' | 'cuadrillas';

export const CatalogosView: React.FC<CatalogosViewProps> = ({
  rol,
  clientes,
  personal,
  cargos,
  vehiculos,
  combustiblesVigentes,
  equipos,
  cuadrillas,
  moneda = 'RD$',
  onCrearCliente,
  onGuardarPersonal,
  onGuardarVehiculo,
  onGuardarEquipo,
  onGuardarCuadrilla,
}) => {
  const canManageCatalogs = puedeGestionarCatalogos(rol);
  const cargosActivos = cargos.filter((c) => c.activo);
  const combustiblesActivos = combustiblesVigentes.filter((c) => c.activo);

  const [subTab, setSubTab] = useState<SubTab>('personal');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Cliente form
  const [cliNombre, setCliNombre] = useState('');
  const [cliRnc, setCliRnc] = useState('');
  const [cliContacto, setCliContacto] = useState('');

  // Personal form
  const [perNombre, setPerNombre] = useState('');
  const [perCargo, setPerCargo] = useState<CargoPersonal>(
    cargosActivos[0]?.codigo ?? 'tecnico'
  );
  const [perTelefono, setPerTelefono] = useState('');

  // Vehiculo form & edición inline
  const [vehEtiqueta, setVehEtiqueta] = useState('');
  const [vehPlaca, setVehPlaca] = useState('');
  const [vehCombId, setVehCombId] = useState(
    combustiblesActivos[0]?.id ?? combustiblesVigentes[0]?.id ?? ''
  );
  const [vehKmGal, setVehKmGal] = useState('34');
  const [vehMantKm, setVehMantKm] = useState('9.5');

  const [editingVehId, setEditingVehId] = useState<string | null>(null);
  const [editVehCombId, setEditVehCombId] = useState('');
  const [editVehKmGal, setEditVehKmGal] = useState('');
  const [editVehMantKm, setEditVehMantKm] = useState('');

  // Equipo form
  const [eqNombre, setEqNombre] = useState('');
  const [eqSerial, setEqSerial] = useState('');

  // Cuadrilla form
  const [cuaNombre, setCuaNombre] = useState('');
  const [cuaJefeId, setCuaJefeId] = useState(
    personal.find((p) => p.activo)?.id || personal[0]?.id || ''
  );
  const [cuaMiembros, setCuaMiembros] = useState<string[]>([]);

  const notify = (msg: string) => {
    setError(null);
    setOkMsg(msg);
    setTimeout(() => setOkMsg(null), 3500);
  };

  const handleToggleVehiculoEstado = async (v: Vehiculo, nextEstado: EstadoRecurso) => {
    try {
      await onGuardarVehiculo({ ...v, estado: nextEstado });
      notify(`${v.etiqueta} actualizado a "${nextEstado}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar vehículo.');
    }
  };

  const handleToggleEquipoEstado = async (eq: EquipoGNSS, nextEstado: EstadoRecurso) => {
    try {
      await onGuardarEquipo({ ...eq, estado: nextEstado });
      notify(`${eq.nombre} actualizado a "${nextEstado}".`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar equipo.');
    }
  };

  const handleTogglePersonalActivo = async (p: Personal) => {
    try {
      await onGuardarPersonal({ ...p, activo: !p.activo });
      notify(
        p.activo
          ? `${p.nombre} dado de baja (su historial se conserva intacto).`
          : `${p.nombre} reactivado en catálogo.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar personal.');
    }
  };

  const handleToggleCuadrillaActiva = async (c: Cuadrilla) => {
    try {
      await onGuardarCuadrilla({ ...c, activa: !c.activa });
      notify(
        c.activa
          ? `${c.nombre} dada de baja (sus asignaciones históricas se conservan).`
          : `${c.nombre} reactivada para nuevas asignaciones.`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar cuadrilla.');
    }
  };

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-[#CBD5E1] bg-white p-2">
        {(
          [
            { id: 'personal', label: `Personal (${personal.length})`, icon: UserCheck },
            { id: 'cuadrillas', label: `Cuadrillas (${cuadrillas.length})`, icon: Users },
            { id: 'vehiculos', label: `Vehículos (${vehiculos.length})`, icon: Car },
            { id: 'equipos', label: `Equipos GNSS (${equipos.length})`, icon: Compass },
            { id: 'clientes', label: `Clientes (${clientes.length})`, icon: Building2 },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                active ? 'bg-[#0F2942] text-white' : 'text-[#334155] hover:bg-[#F1F5F9]'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-3 py-2 text-xs text-[#15803D]">
          {okMsg}
        </div>
      )}

      {/* PERSONAL */}
      {subTab === 'personal' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 rounded-md border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
            {personal.map((p) => (
              <div key={p.id} className="p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-[#0D1C2F]">{p.nombre}</div>
                  <div className="text-[11px] text-[#43474D]">
                    Cargo:{' '}
                    <span className="font-semibold">
                      {resolverEtiquetaCargo(p.cargo, cargos)}
                    </span>
                    {p.telefono ? ` · ${p.telefono}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {canManageCatalogs && (
                    <select
                      aria-label={`Cargo de ${p.nombre}`}
                      value={p.cargo}
                      onChange={async (e) => {
                        try {
                          await onGuardarPersonal({ ...p, cargo: e.target.value });
                          notify(`Cargo de ${p.nombre} actualizado.`);
                        } catch (err: unknown) {
                          setError(err instanceof Error ? err.message : 'Error actualizando cargo.');
                        }
                      }}
                      className="rounded-sm border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] font-medium"
                    >
                      {cargosActivos.map((c) => (
                        <option key={c.codigo} value={c.codigo}>
                          {c.etiqueta}
                        </option>
                      ))}
                      {!cargosActivos.some((c) => c.codigo === p.cargo) && (
                        <option value={p.cargo}>{resolverEtiquetaCargo(p.cargo, cargos)}</option>
                      )}
                    </select>
                  )}
                  <span
                    className={`rounded-sm border px-2 py-0.5 text-[11px] font-semibold ${
                      p.activo
                        ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                        : 'border-[#FCA5A5] bg-[#FEE2E2] text-[#93000A]'
                    }`}
                  >
                    {p.activo ? 'Activo' : 'De baja'}
                  </span>
                  {canManageCatalogs && (
                    <button
                      type="button"
                      onClick={() => handleTogglePersonalActivo(p)}
                      className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      {p.activo ? 'Dar de baja' : 'Reactivar'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onGuardarPersonal({
                    nombre: perNombre,
                    cargo: perCargo,
                    telefono: perTelefono || undefined,
                    activo: true,
                  });
                  setPerNombre('');
                  setPerTelefono('');
                  notify('Personal registrado.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando personal.');
                }
              }}
              className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Agregar Personal</h3>
              <input
                type="text"
                required
                placeholder="Nombre completo"
                value={perNombre}
                onChange={(e) => setPerNombre(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <select
                value={perCargo}
                onChange={(e) => setPerCargo(e.target.value as CargoPersonal)}
                className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
              >
                {cargosActivos.map((c) => (
                  <option key={c.codigo} value={c.codigo}>
                    {c.etiqueta}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Teléfono (ej. 809-555-0000)"
                value={perTelefono}
                onChange={(e) => setPerTelefono(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                <Plus className="h-3.5 w-3.5" />
                Guardar Personal
              </button>
            </form>
          )}
        </div>
      )}

      {/* CUADRILLAS */}
      {subTab === 'cuadrillas' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {cuadrillas.map((c) => {
              const jefe = personal.find((p) => p.id === c.jefeId);
              const miembros = c.miembroIds
                .map((id) => personal.find((p) => p.id === id)?.nombre || id)
                .join(', ');
              return (
                <div
                  key={c.id}
                  className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-2 text-xs flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-[#0F2942]">{c.nombre}</div>
                      <span
                        className={`rounded-sm border px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                          c.activa
                            ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                            : 'border-[#FCA5A5] bg-[#FEE2E2] text-[#93000A]'
                        }`}
                      >
                        {c.activa ? 'Activa' : 'De baja'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#0284C7] font-semibold">
                      Jefe: {jefe?.nombre || c.jefeId}
                    </div>
                    <div className="text-[11px] text-[#43474D]">Integrantes: {miembros}</div>
                  </div>
                  {canManageCatalogs && (
                    <div className="pt-1 flex justify-end border-t border-[#E2E8F0]">
                      <button
                        type="button"
                        onClick={() => handleToggleCuadrillaActiva(c)}
                        className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                      >
                        {c.activa ? 'Dar de baja' : 'Reactivar'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onGuardarCuadrilla({
                    nombre: cuaNombre,
                    jefeId: cuaJefeId || personal[0]?.id || '',
                    miembroIds: Array.from(new Set([cuaJefeId, ...cuaMiembros].filter(Boolean))),
                    activa: true,
                  });
                  setCuaNombre('');
                  setCuaMiembros([]);
                  notify('Cuadrilla creada.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando cuadrilla.');
                }
              }}
              className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Nueva Cuadrilla</h3>
              <input
                type="text"
                required
                placeholder="Ej. Brigada Cibao Norte"
                value={cuaNombre}
                onChange={(e) => setCuaNombre(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Jefe de Brigada</label>
                <select
                  value={cuaJefeId}
                  onChange={(e) => setCuaJefeId(e.target.value)}
                  className="w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
                >
                  {personal
                    .filter((p) => p.activo)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} ({resolverEtiquetaCargo(p.cargo, cargos)})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Integrantes</label>
                <div className="space-y-1 max-h-32 overflow-y-auto border border-[#E2E8F0] rounded-sm p-2">
                  {personal
                    .filter((p) => p.activo)
                    .map((p) => (
                      <label key={p.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={cuaMiembros.includes(p.id)}
                          onChange={() =>
                            setCuaMiembros((prev) =>
                              prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                            )
                          }
                        />
                        <span>{p.nombre}</span>
                      </label>
                    ))}
                </div>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                <Plus className="h-3.5 w-3.5" />
                Crear Cuadrilla
              </button>
            </form>
          )}
        </div>
      )}

      {/* VEHICULOS */}
      {subTab === 'vehiculos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 space-y-2.5">
            {vehiculos.map((v) => {
              const isEditing = editingVehId === v.id;
              return (
                <div
                  key={v.id}
                  className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="font-bold text-[#0D1C2F]">
                        {v.etiqueta}{' '}
                        <span className="font-mono text-[#0284C7]">({v.placa})</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#43474D]">
                        {v.tipoCombustible} · {v.kmPorGal} km/gal ·{' '}
                        {formatRD(v.precioGalonRD, moneda)}/gal · Mant.{' '}
                        {formatRD(v.mantenimientoPorKmRD, moneda)}/km
                      </div>
                    </div>
                    {canManageCatalogs ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            if (isEditing) {
                              setEditingVehId(null);
                            } else {
                              setEditingVehId(v.id);
                              setEditVehCombId(
                                v.tipoCombustibleId ||
                                  combustiblesVigentes.find((c) => c.nombre === v.tipoCombustible)?.id ||
                                  combustiblesVigentes[0]?.id ||
                                  ''
                              );
                              setEditVehKmGal(String(v.kmPorGal));
                              setEditVehMantKm(String(v.mantenimientoPorKmRD));
                            }
                          }}
                          className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] hover:bg-[#F8FAFC] whitespace-nowrap"
                        >
                          {isEditing ? 'Cerrar' : 'Editar tarifas'}
                        </button>
                        <div className="flex items-center gap-1.5">
                          <Wrench className="h-3.5 w-3.5 text-[#43474D]" />
                          <select
                            value={v.estado}
                            onChange={(e) =>
                              handleToggleVehiculoEstado(v, e.target.value as EstadoRecurso)
                            }
                            className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold"
                          >
                            <option value="disponible">Disponible</option>
                            <option value="en_mantenimiento">En mantenimiento</option>
                            <option value="fuera_servicio">Fuera de servicio</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <span className="font-mono font-semibold">{v.estado}</span>
                    )}
                  </div>

                  {isEditing && canManageCatalogs && (
                    <div className="border-t border-[#E2E8F0] pt-3 grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#43474D]">Combustible</span>
                        <select
                          value={editVehCombId}
                          onChange={(e) => setEditVehCombId(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2 py-1.5 text-xs"
                        >
                          {combustiblesVigentes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.nombre} ({formatRD(c.precioGalonRD, moneda)}/gal)
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#43474D]">km / galón</span>
                        <input
                          type="number"
                          step="0.5"
                          min={1}
                          value={editVehKmGal}
                          onChange={(e) => setEditVehKmGal(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#43474D]">Mant. / km ({moneda})</span>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          value={editVehMantKm}
                          onChange={(e) => setEditVehMantKm(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2 py-1.5 font-mono text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={async () => {
                          const fuel = combustiblesVigentes.find((c) => c.id === editVehCombId);
                          try {
                            await onGuardarVehiculo({
                              ...v,
                              tipoCombustibleId: fuel?.id ?? v.tipoCombustibleId,
                              tipoCombustible: fuel?.nombre ?? v.tipoCombustible,
                              precioGalonRD: fuel?.precioGalonRD ?? v.precioGalonRD,
                              kmPorGal: Number(editVehKmGal),
                              mantenimientoPorKmRD: Number(editVehMantKm),
                            });
                            setEditingVehId(null);
                            notify(`Parámetros de ${v.etiqueta} actualizados.`);
                          } catch (err: unknown) {
                            setError(err instanceof Error ? err.message : 'Error actualizando vehículo.');
                          }
                        }}
                        className="rounded-sm bg-[#0F2942] px-3 py-1.5 font-semibold text-white hover:bg-[#0284C7]"
                      >
                        Guardar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fuel =
                  combustiblesVigentes.find((c) => c.id === vehCombId) ?? combustiblesVigentes[0];
                if (!fuel) {
                  setError('Configura al menos un tipo de combustible en Configuración primero.');
                  return;
                }
                try {
                  await onGuardarVehiculo({
                    etiqueta: vehEtiqueta,
                    placa: vehPlaca,
                    tipoCombustibleId: fuel.id,
                    tipoCombustible: fuel.nombre,
                    precioGalonRD: fuel.precioGalonRD,
                    kmPorGal: Number(vehKmGal),
                    mantenimientoPorKmRD: Number(vehMantKm),
                    estado: 'disponible',
                  });
                  setVehEtiqueta('');
                  setVehPlaca('');
                  notify('Vehículo agregado.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando vehículo.');
                }
              }}
              className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Agregar Vehículo</h3>
              <input
                type="text"
                required
                placeholder="Ej. Toyota Hilux 4x4 Blanco"
                value={vehEtiqueta}
                onChange={(e) => setVehEtiqueta(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <input
                type="text"
                required
                placeholder="Placa (ej. L412890)"
                value={vehPlaca}
                onChange={(e) => setVehPlaca(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
              <label className="block">
                <span className="text-[11px] font-semibold text-[#334155]">Tipo de combustible vigente</span>
                <select
                  value={vehCombId}
                  onChange={(e) => setVehCombId(e.target.value)}
                  className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
                >
                  {combustiblesActivos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({formatRD(c.precioGalonRD, moneda)}/gal)
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] font-semibold text-[#334155]">Rendimiento (km/gal)</span>
                  <input
                    type="number"
                    min={1}
                    step="0.5"
                    required
                    value={vehKmGal}
                    onChange={(e) => setVehKmGal(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] font-semibold text-[#334155]">Mant./km ({moneda})</span>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    required
                    value={vehMantKm}
                    onChange={(e) => setVehMantKm(e.target.value)}
                    className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                <Plus className="h-3.5 w-3.5" />
                Guardar Vehículo
              </button>
            </form>
          )}
        </div>
      )}

      {/* EQUIPOS GNSS */}
      {subTab === 'equipos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 space-y-2.5">
            {equipos.map((eq) => (
              <div
                key={eq.id}
                className="rounded-md border border-[#CBD5E1] bg-white p-4 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-[#0D1C2F]">{eq.nombre}</div>
                  <div className="font-mono text-[11px] text-[#0284C7]">{eq.serial}</div>
                </div>
                {canManageCatalogs ? (
                  <select
                    value={eq.estado}
                    onChange={(e) =>
                      handleToggleEquipoEstado(eq, e.target.value as EstadoRecurso)
                    }
                    className="rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-1.5 text-xs font-semibold"
                  >
                    <option value="disponible">Disponible</option>
                    <option value="en_mantenimiento">En mantenimiento</option>
                    <option value="fuera_servicio">Fuera de servicio</option>
                  </select>
                ) : (
                  <span className="font-mono font-semibold">{eq.estado}</span>
                )}
              </div>
            ))}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onGuardarEquipo({
                    nombre: eqNombre,
                    serial: eqSerial,
                    estado: 'disponible',
                  });
                  setEqNombre('');
                  setEqSerial('');
                  notify('Equipo GNSS registrado.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando equipo.');
                }
              }}
              className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Agregar Equipo GNSS</h3>
              <input
                type="text"
                required
                placeholder="Ej. Trimble R12i Rover"
                value={eqNombre}
                onChange={(e) => setEqNombre(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <input
                type="text"
                required
                placeholder="Serial (ej. TR-8842)"
                value={eqSerial}
                onChange={(e) => setEqSerial(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                <Plus className="h-3.5 w-3.5" />
                Guardar Equipo
              </button>
            </form>
          )}
        </div>
      )}

      {/* CLIENTES */}
      {subTab === 'clientes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-8 rounded-md border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
            {clientes.map((c) => (
              <div key={c.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-[#0D1C2F]">{c.nombre}</div>
                  <div className="text-[11px] text-[#43474D]">
                    Contacto: {c.contacto} {c.telefono ? `· ${c.telefono}` : ''}
                  </div>
                </div>
                <span className="font-mono text-xs font-semibold text-[#0F2942]">
                  RNC {c.rnc}
                </span>
              </div>
            ))}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onCrearCliente({
                    nombre: cliNombre,
                    rnc: cliRnc,
                    contacto: cliContacto,
                  });
                  setCliNombre('');
                  setCliRnc('');
                  setCliContacto('');
                  notify('Cliente guardado.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando cliente.');
                }
              }}
              className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Nuevo Cliente</h3>
              <input
                type="text"
                required
                placeholder="Razón social"
                value={cliNombre}
                onChange={(e) => setCliNombre(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <input
                type="text"
                required
                placeholder="RNC"
                value={cliRnc}
                onChange={(e) => setCliRnc(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
              <input
                type="text"
                required
                placeholder="Contacto principal"
                value={cliContacto}
                onChange={(e) => setCliContacto(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                <Plus className="h-3.5 w-3.5" />
                Guardar Cliente
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
};
