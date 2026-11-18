import React, { useState } from 'react';
import { Building2, Car, Compass, Plus, Shield, UserCheck, Users, Wrench } from 'lucide-react';
import { puedeGestionarCatalogos, puedeGestionarEmpresa } from '../domain';
import type {
  CargoPersonal,
  Cliente,
  Cuadrilla,
  Empresa,
  EquipoGNSS,
  EstadoRecurso,
  MembresiaEmpresa,
  Personal,
  RolEmpresa,
  Usuario,
  Vehiculo,
} from '../types/domain';

interface CatalogosViewProps {
  rol: RolEmpresa;
  empresa: Empresa;
  membresias: MembresiaEmpresa[];
  usuarios: Usuario[];
  clientes: Cliente[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  equipos: EquipoGNSS[];
  cuadrillas: Cuadrilla[];
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
  onActualizarEmpresa: (empresa: Empresa) => Promise<void>;
  onGuardarMembresiaUsuario: (params: {
    email: string;
    nombre: string;
    rol: RolEmpresa;
    personalId?: string;
    activo: boolean;
  }) => Promise<void>;
}

type SubTab = 'clientes' | 'personal' | 'vehiculos' | 'equipos' | 'cuadrillas' | 'empresa';

export const CatalogosView: React.FC<CatalogosViewProps> = ({
  rol,
  empresa,
  membresias,
  usuarios,
  clientes,
  personal,
  vehiculos,
  equipos,
  cuadrillas,
  onCrearCliente,
  onGuardarPersonal,
  onGuardarVehiculo,
  onGuardarEquipo,
  onGuardarCuadrilla,
  onActualizarEmpresa,
  onGuardarMembresiaUsuario,
}) => {
  const canManageCatalogs = puedeGestionarCatalogos(rol);
  const isAdmin = puedeGestionarEmpresa(rol);

  const [subTab, setSubTab] = useState<SubTab>('personal');
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // Cliente form
  const [cliNombre, setCliNombre] = useState('');
  const [cliRnc, setCliRnc] = useState('');
  const [cliContacto, setCliContacto] = useState('');

  // Personal form
  const [perNombre, setPerNombre] = useState('');
  const [perCargo, setPerCargo] = useState<CargoPersonal>('tecnico');
  const [perTelefono, setPerTelefono] = useState('');

  // Vehiculo form
  const [vehEtiqueta, setVehEtiqueta] = useState('');
  const [vehPlaca, setVehPlaca] = useState('');
  const [vehKmGal, setVehKmGal] = useState('34');

  // Equipo form
  const [eqNombre, setEqNombre] = useState('');
  const [eqSerial, setEqSerial] = useState('');

  // Cuadrilla form
  const [cuaNombre, setCuaNombre] = useState('');
  const [cuaJefeId, setCuaJefeId] = useState(
    personal.find((p) => p.activo)?.id || personal[0]?.id || ''
  );
  const [cuaMiembros, setCuaMiembros] = useState<string[]>([]);

  // Empresa form (Admin)
  const [empNombre, setEmpNombre] = useState(empresa.nombre);
  const [empRnc, setEmpRnc] = useState(empresa.rnc);
  const [empDireccion, setEmpDireccion] = useState(empresa.direccionBase);
  const [empPlan, setEmpPlan] = useState(String(empresa.planMensualRD));

  // Usuario/Membresia form (Admin)
  const [usrEmail, setUsrEmail] = useState('');
  const [usrNombre, setUsrNombre] = useState('');
  const [usrRol, setUsrRol] = useState<RolEmpresa>('tecnico');
  const [usrPersonalId, setUsrPersonalId] = useState('');

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
            ...(isAdmin
              ? [{ id: 'empresa' as const, label: 'Empresa y Usuarios (Admin)', icon: Shield }]
              : []),
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
              <div key={p.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-[#0D1C2F]">{p.nombre}</div>
                  <div className="text-[11px] text-[#43474D]">
                    Cargo: <span className="font-semibold uppercase">{p.cargo}</span>
                    {p.telefono ? ` · ${p.telefono}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                <option value="tecnico">Técnico</option>
                <option value="ingeniero">Ingeniero</option>
                <option value="jefe_brigada">Jefe de Brigada</option>
                <option value="chofer">Chofer</option>
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
                        {p.nombre} ({p.cargo})
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
            {vehiculos.map((v) => (
              <div
                key={v.id}
                className="rounded-md border border-[#CBD5E1] bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-[#0D1C2F]">
                    {v.etiqueta} <span className="font-mono text-[#0284C7]">({v.placa})</span>
                  </div>
                  <div className="font-mono text-[11px] text-[#43474D]">
                    {v.tipoCombustible} · {v.kmPorGal} km/gal · RD$ {v.precioGalonRD}/gal
                  </div>
                </div>
                {canManageCatalogs ? (
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
                ) : (
                  <span className="font-mono font-semibold">{v.estado}</span>
                )}
              </div>
            ))}
          </div>

          {canManageCatalogs && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onGuardarVehiculo({
                    etiqueta: vehEtiqueta,
                    placa: vehPlaca,
                    tipoCombustible: 'Diésel Óptimo',
                    precioGalonRD: 239.1,
                    kmPorGal: Number(vehKmGal) || 34,
                    mantenimientoPorKmRD: 9.5,
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
              <input
                type="number"
                min={5}
                placeholder="Rendimiento (km/gal)"
                value={vehKmGal}
                onChange={(e) => setVehKmGal(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
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

      {/* EMPRESA & USUARIOS (SOLO ADMIN) */}
      {subTab === 'empresa' && isAdmin && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await onActualizarEmpresa({
                  ...empresa,
                  nombre: empNombre,
                  rnc: empRnc,
                  direccionBase: empDireccion,
                  planMensualRD: Number(empPlan) || empresa.planMensualRD,
                });
                notify('Datos de empresa actualizados.');
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Error actualizando empresa.');
              }
            }}
            className="lg:col-span-5 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
          >
            <h3 className="font-bold text-[#0F2942]">Configuración de Empresa (Suscripción SaaS)</h3>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Nombre Empresa</label>
              <input
                type="text"
                required
                value={empNombre}
                onChange={(e) => setEmpNombre(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">RNC</label>
              <input
                type="text"
                required
                value={empRnc}
                onChange={(e) => setEmpRnc(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">Dirección Base</label>
              <input
                type="text"
                required
                value={empDireccion}
                onChange={(e) => setEmpDireccion(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2"
              />
            </div>
            <div>
              <label className="block font-semibold text-[#334155] mb-1">
                Plan Mensual (RD$)
              </label>
              <input
                type="number"
                value={empPlan}
                onChange={(e) => setEmpPlan(e.target.value)}
                className="w-full rounded-sm border border-[#CBD5E1] px-3 py-2 font-mono"
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
            >
              Guardar Empresa
            </button>
          </form>

          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-md border border-[#E2E8F0] bg-white divide-y divide-[#E2E8F0]">
              {membresias.map((m) => {
                const u = usuarios.find((x) => x.id === m.usuarioId);
                const per = personal.find((p) => p.id === m.personalId);
                return (
                  <div key={m.id} className="p-3.5 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="font-bold text-[#0D1C2F]">{u?.nombre || m.usuarioId}</div>
                      <div className="font-mono text-[11px] text-[#43474D]">
                        {u?.email} {per ? `· Personal: ${per.nombre}` : ''}
                      </div>
                    </div>
                    <span className="font-mono text-xs font-bold uppercase text-[#0284C7]">
                      {m.rol}
                    </span>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await onGuardarMembresiaUsuario({
                    email: usrEmail,
                    nombre: usrNombre,
                    rol: usrRol,
                    personalId: usrPersonalId || undefined,
                    activo: true,
                  });
                  setUsrEmail('');
                  setUsrNombre('');
                  notify('Membresía y rol de usuario guardados.');
                } catch (err: unknown) {
                  setError(err instanceof Error ? err.message : 'Error guardando usuario.');
                }
              }}
              className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
            >
              <h3 className="font-bold text-[#0F2942]">Agregar o Actualizar Rol de Usuario</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  type="email"
                  required
                  placeholder="correo@empresa.do"
                  value={usrEmail}
                  onChange={(e) => setUsrEmail(e.target.value)}
                  className="rounded-sm border border-[#CBD5E1] px-3 py-2"
                />
                <input
                  type="text"
                  required
                  placeholder="Nombre completo"
                  value={usrNombre}
                  onChange={(e) => setUsrNombre(e.target.value)}
                  className="rounded-sm border border-[#CBD5E1] px-3 py-2"
                />
                <select
                  value={usrRol}
                  onChange={(e) => setUsrRol(e.target.value as RolEmpresa)}
                  className="rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
                >
                  <option value="admin">Admin</option>
                  <option value="coordinador">Coordinador</option>
                  <option value="tecnico">Técnico</option>
                </select>
                <select
                  value={usrPersonalId}
                  onChange={(e) => setUsrPersonalId(e.target.value)}
                  className="rounded-sm border border-[#CBD5E1] bg-white px-3 py-2"
                >
                  <option value="">Sin vincular a ficha de personal</option>
                  {personal.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                className="rounded-sm bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7]"
              >
                Guardar Acceso
              </button>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
