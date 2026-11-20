import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CalendarRange,
  Car,
  CheckCircle2,
  Compass,
  FileText,
  Fuel,
  Plus,
  RotateCcw,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import {
  calcularRendimientoFlota,
  calcularTotalesRenta,
  completarRepartoConSinAsignar,
  detectarConflictosRenta,
  puedeGestionarCatalogos,
  rentaEstaActivaOReservada,
  resolverEtiquetaCargo,
  validarRenta,
  type CombustibleVigente,
} from '../domain';
import type {
  Asignacion,
  BitacoraEntrada,
  CargoConfig,
  CargoPersonal,
  Cliente,
  ConflictDetail,
  Cuadrilla,
  EquipoGNSS,
  EstadoRenta,
  EstadoRecurso,
  Mision,
  ModalidadTarifaRenta,
  OverrideConflicto,
  Personal,
  Proyecto,
  ReglaRendimientoFlotaVersion,
  ReglasViaticosVersion,
  Renta,
  RentaRecursoTipo,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';
import { ResourceConflictModal } from './ResourceConflictModal';

type RentaPayload = Omit<Renta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
  id?: string;
};

type MisionPayload = Omit<Mision, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>;

interface CatalogosViewProps {
  rol: RolEmpresa;
  clientes: Cliente[];
  personal: Personal[];
  cargos: CargoConfig[];
  vehiculos: Vehiculo[];
  combustiblesVigentes: CombustibleVigente[];
  equipos: EquipoGNSS[];
  cuadrillas: Cuadrilla[];
  misiones?: Mision[];
  rutas?: Ruta[];
  proyectos?: Proyecto[];
  asignaciones?: Asignacion[];
  viaticos?: Viatico[];
  bitacoras?: BitacoraEntrada[];
  rentas?: Renta[];
  rendimientoConfig?: ReglaRendimientoFlotaVersion | null;
  reglasViaticos?: ReglasViaticosVersion | null;
  usuarioActual?: { id: string; nombre: string };
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
  onGuardarRenta?: (datos: RentaPayload) => Promise<void>;
  onDevolverRenta?: (params: {
    rentaId: string;
    fechaDevolucion?: string;
    notas?: string;
  }) => Promise<void>;
  onCrearMision?: (datos: MisionPayload) => Promise<void>;
}

type SubTab = 'clientes' | 'personal' | 'vehiculos' | 'equipos' | 'cuadrillas' | 'rentas';

export const CatalogosView: React.FC<CatalogosViewProps> = ({
  rol,
  clientes,
  personal,
  cargos,
  vehiculos,
  combustiblesVigentes,
  equipos,
  cuadrillas,
  misiones = [],
  rutas = [],
  proyectos = [],
  asignaciones = [],
  viaticos = [],
  bitacoras = [],
  rentas = [],
  rendimientoConfig,
  reglasViaticos,
  usuarioActual,
  moneda = 'RD$',
  onCrearCliente,
  onGuardarPersonal,
  onGuardarVehiculo,
  onGuardarEquipo,
  onGuardarCuadrilla,
  onGuardarRenta,
  onDevolverRenta,
  onCrearMision,
}) => {
  const canManageCatalogs = puedeGestionarCatalogos(rol);
  const cargosActivos = cargos.filter((c) => c.activo);
  const combustiblesActivos = combustiblesVigentes.filter((c) => c.activo);
  const hoyIso = new Date().toISOString().slice(0, 10);

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

  // Vehiculo form & edición inline & km manuales para rendimiento
  const [vehEtiqueta, setVehEtiqueta] = useState('');
  const [vehPlaca, setVehPlaca] = useState('');
  const [vehCombId, setVehCombId] = useState(
    combustiblesActivos[0]?.id ?? combustiblesVigentes[0]?.id ?? ''
  );
  const [vehKmGal, setVehKmGal] = useState('34');
  const [vehMantKm, setVehMantKm] = useState('9.5');
  const [kmManualPorVehiculo, setKmManualPorVehiculo] = useState<Record<string, number>>({});

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

  // Renta form
  const [rentaTipo, setRentaTipo] = useState<RentaRecursoTipo>('vehiculo');
  const [rentaRecursoId, setRentaRecursoId] = useState<string>(vehiculos[0]?.id ?? '');
  const [rentaProveedor, setRentaProveedor] = useState('');
  const [rentaMisionId, setRentaMisionId] = useState('');
  const [rentaRutaId, setRentaRutaId] = useState('');
  const [rentaFechaInicio, setRentaFechaInicio] = useState(hoyIso);
  const [rentaFechaFin, setRentaFechaFin] = useState(hoyIso);
  const [rentaModalidad, setRentaModalidad] = useState<ModalidadTarifaRenta>('por_dia');
  const [rentaTarifa, setRentaTarifa] = useState('4500');
  const [rentaCantidad, setRentaCantidad] = useState('1');
  const [rentaIncluyeItbis, setRentaIncluyeItbis] = useState(true);
  const [rentaEstadoInicial, setRentaEstadoInicial] = useState<Extract<EstadoRenta, 'reservada' | 'activa'>>('activa');
  const [rentaComprobante, setRentaComprobante] = useState<string | undefined>(undefined);
  const [rentaComprobanteNombre, setRentaComprobanteNombre] = useState<string>('');
  const [rentaNotas, setRentaNotas] = useState('');
  const [rentaProyectoId, setRentaProyectoId] = useState<string>(proyectos[0]?.id ?? 'sin_asignar');
  const [rentaProyectoSecundarioId, setRentaProyectoSecundarioId] = useState<string>('');
  const [rentaMontoProyectoSecundario, setRentaMontoProyectoSecundario] = useState<string>('0');

  const [pendingRentaPayload, setPendingRentaPayload] = useState<RentaPayload | null>(null);
  const [rentaConflictos, setRentaConflictos] = useState<ConflictDetail[]>([]);

  // Nueva misión form
  const [misionNombre, setMisionNombre] = useState('');
  const [misionZona, setMisionZona] = useState('');
  const [misionProvincia, setMisionProvincia] = useState('Santo Domingo');
  const [misionFechaInicio, setMisionFechaInicio] = useState(hoyIso);
  const [misionFechaFin, setMisionFechaFin] = useState(hoyIso);
  const [misionRutaIds, setMisionRutaIds] = useState<string[]>([]);
  const [misionNotas, setMisionNotas] = useState('');

  const notify = (msg: string) => {
    setError(null);
    setOkMsg(msg);
    setTimeout(() => setOkMsg(null), 3500);
  };

  const fuenteKmActiva = rendimientoConfig?.fuenteKm ?? 'ruta_asignada';
  const umbralAlertaPct = rendimientoConfig?.umbralAlertaPct ?? 15;
  const umbralCercaniaKm = rendimientoConfig?.umbralCercaniaRentaKm ?? 30;
  const conceptoDistanciaActivo = reglasViaticos?.gpsRuta.conceptoDistancia ?? 'ida_vuelta';

  const resumenRendimiento = useMemo(
    () =>
      calcularRendimientoFlota({
        vehiculos,
        viaticos,
        asignaciones,
        rutas,
        bitacoras,
        kmManualPorVehiculo,
        fuenteKm: fuenteKmActiva,
        umbralAlertaPct,
        conceptoDistancia: conceptoDistanciaActivo,
      }),
    [
      vehiculos,
      viaticos,
      asignaciones,
      rutas,
      bitacoras,
      kmManualPorVehiculo,
      fuenteKmActiva,
      umbralAlertaPct,
      conceptoDistanciaActivo,
    ]
  );

  const totalesRentaPreview = useMemo(
    () =>
      calcularTotalesRenta({
        tarifaRD: Number(rentaTarifa) || 0,
        cantidadEstimada: Number(rentaCantidad) || 0,
        incluyeItbis: rentaIncluyeItbis,
      }),
    [rentaTarifa, rentaCantidad, rentaIncluyeItbis]
  );

  const buildRepartosRenta = (costoTotalRD: number): RepartoProyecto[] => {
    if (!rentaProyectoId || rentaProyectoId === 'sin_asignar') {
      return [{ proyectoId: 'sin_asignar', montoRD: costoTotalRD }];
    }
    const secMonto = Math.max(0, Number(rentaMontoProyectoSecundario) || 0);
    if (
      rentaProyectoSecundarioId &&
      rentaProyectoSecundarioId !== rentaProyectoId &&
      secMonto > 0 &&
      secMonto < costoTotalRD
    ) {
      const principalMonto = Number((costoTotalRD - secMonto).toFixed(2));
      return [
        { proyectoId: rentaProyectoId, montoRD: principalMonto },
        { proyectoId: rentaProyectoSecundarioId, montoRD: secMonto },
      ];
    }
    return completarRepartoConSinAsignar(costoTotalRD, [
      { proyectoId: rentaProyectoId, montoRD: costoTotalRD },
    ]);
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

  const handleRentaFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setRentaComprobante(undefined);
      setRentaComprobanteNombre('');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setRentaComprobante(reader.result);
        setRentaComprobanteNombre(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const resetRentaForm = () => {
    setRentaProveedor('');
    setRentaMisionId('');
    setRentaRutaId('');
    setRentaComprobante(undefined);
    setRentaComprobanteNombre('');
    setRentaNotas('');
    setRentaMontoProyectoSecundario('0');
    setRentaProyectoSecundarioId('');
  };

  const handleSubmitRenta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onGuardarRenta) return;
    setError(null);

    const recursoEtiqueta =
      rentaTipo === 'vehiculo'
        ? vehiculos.find((v) => v.id === rentaRecursoId)?.etiqueta
        : equipos.find((eq) => eq.id === rentaRecursoId)?.nombre;

    const repartos = buildRepartosRenta(totalesRentaPreview.costoTotalRD);

    const payload: RentaPayload = {
      recursoTipo: rentaTipo,
      recursoId: rentaRecursoId,
      recursoEtiqueta,
      proveedor: rentaProveedor.trim(),
      misionId: rentaMisionId || undefined,
      rutaId: rentaRutaId || undefined,
      fechaInicio: rentaFechaInicio,
      fechaFin: rentaFechaFin,
      modalidadTarifa: rentaModalidad,
      tarifaRD: Number(rentaTarifa) || 0,
      cantidadEstimada: Number(rentaCantidad) || 0,
      incluyeItbis: rentaIncluyeItbis,
      itbisRD: totalesRentaPreview.itbisRD,
      costoTotalRD: totalesRentaPreview.costoTotalRD,
      comprobanteBase64: rentaComprobante,
      estado: rentaEstadoInicial,
      notas: rentaNotas.trim() || undefined,
      repartos,
      configVersion: rendimientoConfig?.version,
      umbralDistanciaKmUsado: umbralCercaniaKm,
    };

    const validacion = validarRenta(payload);
    if (!validacion.valido) {
      setError(validacion.error || 'Datos de renta inválidos.');
      return;
    }

    const conflictos = detectarConflictosRenta({
      candidata: {
        id: 'renta-nueva',
        recursoTipo: payload.recursoTipo,
        recursoId: payload.recursoId,
        misionId: payload.misionId,
        rutaId: payload.rutaId,
        fechaInicio: payload.fechaInicio,
        fechaFin: payload.fechaFin,
        estado: payload.estado,
      },
      rentasExistentes: rentas,
      asignacionesExistentes: asignaciones,
      rutas,
      misiones,
      vehiculos,
      equipos,
      umbralCercaniaKm,
    });

    if (conflictos.length > 0) {
      setPendingRentaPayload(payload);
      setRentaConflictos(conflictos);
      return;
    }

    try {
      await onGuardarRenta(payload);
      resetRentaForm();
      notify(`Renta con ${payload.proveedor} registrada.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la renta.');
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
            { id: 'rentas', label: `Rentas y Misiones (${rentas.length})`, icon: CalendarRange },
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

      {/* VEHICULOS + RENDIMIENTO DE FLOTA (B4) */}
      {subTab === 'vehiculos' && (
        <div className="space-y-4">
          <div className="rounded-md border border-[#CBD5E1] bg-white p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Fuel className="h-4 w-4 text-[#0284C7] shrink-0" />
              <div>
                <span className="font-bold text-[#0F2942]">
                  Seguimiento de rendimiento real vs teórico
                </span>
                <span className="ml-2 text-[11px] text-[#43474D]">
                  Fuente km:{' '}
                  <strong className="text-[#0F2942]">
                    {fuenteKmActiva === 'ruta_asignada'
                      ? `Rutas asignadas (${conceptoDistanciaActivo === 'solo_ida' ? 'solo ida' : 'ida y vuelta'})`
                      : fuenteKmActiva === 'bitacora'
                      ? 'Bitácora de campo (Próximamente)'
                      : 'Km manuales (Próximamente)'}
                  </strong>{' '}
                  · Ventana 90 días · Alerta si cae &gt; {umbralAlertaPct}% por debajo del teórico (mínimo 3 cargas aprobadas).
                </span>
              </div>
            </div>
            {rendimientoConfig?.esEjemploPendienteConfirmar && (
              <span className="rounded-sm border border-[#FCD34D] bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                EJEMPLO – PENDIENTE DE CONFIRMAR
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 space-y-2.5">
              {vehiculos.map((v) => {
                const isEditing = editingVehId === v.id;
                const rend = resumenRendimiento.find((r) => r.vehiculoId === v.id);
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

                    {/* Panel de rendimiento real por vehículo (B4) */}
                    {rend && (
                      <div className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] p-2.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                          <span>
                            Cargas aprobadas:{' '}
                            <strong className="font-mono text-[#0F2942]">{rend.cantidadCargas}</strong>
                          </span>
                          <span>
                            Galones:{' '}
                            <strong className="font-mono text-[#0F2942]">{rend.totalGalones}</strong>
                          </span>
                          <span>
                            Km ({fuenteKmActiva}):{' '}
                            <strong className="font-mono text-[#0F2942]">{rend.kmRecorridos} km</strong>
                          </span>
                          <span>
                            Real vs Teórico:{' '}
                            <strong className="font-mono text-[#0F2942]">
                              {rend.rendimientoRealKmGal !== null
                                ? `${rend.rendimientoRealKmGal} vs ${rend.rendimientoTeoricoKmGal} km/gal`
                                : `— vs ${rend.rendimientoTeoricoKmGal} km/gal`}
                            </strong>
                            {rend.desviacionPct !== null && (
                              <span
                                className={`ml-1 font-mono font-bold ${
                                  rend.alerta ? 'text-[#B91C1C]' : 'text-[#15803D]'
                                }`}
                              >
                                ({rend.desviacionPct > 0 ? '+' : ''}
                                {rend.desviacionPct}%)
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {fuenteKmActiva === 'manual' && (
                            <label className="inline-flex items-center gap-1">
                              <span className="text-[10px] text-[#43474D]">Km manual:</span>
                              <input
                                type="number"
                                min={0}
                                step="1"
                                value={kmManualPorVehiculo[v.id] ?? 0}
                                onChange={(e) =>
                                  setKmManualPorVehiculo((prev) => ({
                                    ...prev,
                                    [v.id]: Number(e.target.value) || 0,
                                  }))
                                }
                                className="w-20 rounded-sm border border-[#CBD5E1] bg-white px-1.5 py-0.5 font-mono text-[11px]"
                              />
                            </label>
                          )}
                          <span
                            className={`inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[10px] font-bold ${
                              rend.estado === 'datos_insuficientes'
                                ? 'border-[#CBD5E1] bg-white text-[#475569]'
                                : rend.alerta
                                ? 'border-[#FCA5A5] bg-[#FEE2E2] text-[#93000A]'
                                : rend.estado === 'mejor_que_esperado'
                                ? 'border-[#7DD3FC] bg-[#F0F9FF] text-[#0369A1]'
                                : 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                            }`}
                          >
                            {rend.alerta ? (
                              <AlertTriangle className="h-3 w-3" />
                            ) : rend.estado === 'normal' || rend.estado === 'mejor_que_esperado' ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : null}
                            {rend.etiqueta}
                          </span>
                        </div>
                      </div>
                    )}

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
                className="lg:col-span-4 rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs self-start"
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

      {/* RENTAS Y MISIONES (B3) */}
      {subTab === 'rentas' && (
        <div className="space-y-4">
          <div className="rounded-md border border-[#CBD5E1] bg-white p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div>
              <span className="font-bold text-[#0F2942]">
                Renta de vehículos y equipos por misión o ruta
              </span>
              <span className="ml-2 text-[11px] text-[#43474D]">
                Regla de solapamiento: bloqueo entre rentas activas; contra otra misión permite
                excepción con motivo solo si distancia &lt; {umbralCercaniaKm} km.
              </span>
            </div>
            {rendimientoConfig?.esEjemploPendienteConfirmar && (
              <span className="rounded-sm border border-[#FCD34D] bg-[#FEF3C7] px-2 py-0.5 text-[10px] font-bold text-[#92400E]">
                EJEMPLO – PENDIENTE DE CONFIRMAR ({umbralCercaniaKm} km)
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-7 space-y-3">
              {/* Lista de Rentas */}
              <div className="rounded-md border border-[#CBD5E1] bg-white divide-y divide-[#E2E8F0]">
                <div className="px-4 py-3 bg-[#F8FAFC] flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#0F2942]">
                    Rentas registradas ({rentas.length})
                  </h3>
                </div>
                {rentas.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[#64748B]">
                    No hay rentas de vehículos ni equipos registradas todavía.
                  </div>
                ) : (
                  rentas.map((r) => {
                    const vencida =
                      rentaEstaActivaOReservada(r) && Boolean(r.fechaFin) && r.fechaFin < hoyIso;
                    const misionObj = r.misionId ? misiones.find((m) => m.id === r.misionId) : undefined;
                    const rutaObj = r.rutaId ? rutas.find((rt) => rt.id === r.rutaId) : undefined;
                    return (
                      <div key={r.id} className="p-4 space-y-2 text-xs">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="rounded-sm bg-[#EFF6FF] border border-[#BFDBFE] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#1E40AF]">
                                {r.recursoTipo === 'vehiculo' ? 'Vehículo' : 'Equipo GNSS'}
                              </span>
                              <span className="font-bold text-[#0F2942]">
                                {r.recursoEtiqueta || r.recursoId}
                              </span>
                              <span className="text-[#64748B]">· Proveedor: {r.proveedor}</span>
                            </div>
                            <div className="mt-1 text-[11px] text-[#43474D] font-mono">
                              {r.fechaInicio} → {r.fechaFin} · {r.cantidadEstimada}{' '}
                              {r.modalidadTarifa === 'por_dia' ? 'día(s)' : 'km'} ×{' '}
                              {formatRD(r.tarifaRD, moneda)}
                              {r.incluyeItbis ? ` + ITBIS ${formatRD(r.itbisRD, moneda)}` : ' (sin ITBIS)'}
                            </div>
                            {(misionObj || rutaObj) && (
                              <div className="mt-1 text-[11px] text-[#0284C7] font-medium">
                                {misionObj ? `Misión: ${misionObj.nombre}` : ''}
                                {misionObj && rutaObj ? ' · ' : ''}
                                {rutaObj ? `Ruta: ${rutaObj.codigoParcela}` : ''}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="font-mono font-bold text-sm text-[#0F2942]">
                              {formatRD(r.costoTotalRD, moneda)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              {vencida && (
                                <span className="inline-flex items-center gap-1 rounded-sm border border-[#FCA5A5] bg-[#FEE2E2] px-1.5 py-0.5 text-[10px] font-bold text-[#93000A]">
                                  <AlertTriangle className="h-3 w-3" />
                                  Vencida sin devolución
                                </span>
                              )}
                              <span
                                className={`rounded-sm border px-2 py-0.5 text-[10px] font-bold uppercase ${
                                  r.estado === 'finalizada'
                                    ? 'border-[#86EFAC] bg-[#F0FDF4] text-[#15803D]'
                                    : r.estado === 'cancelada'
                                    ? 'border-[#CBD5E1] bg-[#F1F5F9] text-[#475569]'
                                    : 'border-[#93C5FD] bg-[#EFF6FF] text-[#1D4ED8]'
                                }`}
                              >
                                {r.estado}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-[#43474D]">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {r.repartos.map((rep) => {
                              const proyNombre =
                                rep.proyectoId === 'sin_asignar'
                                  ? 'Sin asignar'
                                  : proyectos.find((p) => p.id === rep.proyectoId)?.codigoContrato ||
                                    rep.proyectoId;
                              return (
                                <span
                                  key={rep.proyectoId}
                                  className="rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-1.5 py-0.5 font-mono text-[10px]"
                                >
                                  {proyNombre}: {formatRD(rep.montoRD, moneda)}
                                </span>
                              );
                            })}
                            {r.comprobanteBase64 && (
                              <span className="inline-flex items-center gap-1 rounded-sm border border-[#86EFAC] bg-[#F0FDF4] px-1.5 py-0.5 text-[10px] text-[#15803D]">
                                <FileText className="h-3 w-3" />
                                Comprobante adjunto
                              </span>
                            )}
                          </div>

                          {canManageCatalogs && rentaEstaActivaOReservada(r) && onDevolverRenta && (
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await onDevolverRenta({
                                    rentaId: r.id,
                                    fechaDevolucion: hoyIso,
                                  });
                                  notify(`Renta (${r.recursoEtiqueta || r.recursoId}) marcada como devuelta.`);
                                } catch (err: unknown) {
                                  setError(
                                    err instanceof Error
                                      ? err.message
                                      : 'No se pudo marcar la devolución.'
                                  );
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-sm border border-[#0F2942] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#0F2942] hover:bg-[#0F2942] hover:text-white transition-colors"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Marcar devuelta
                            </button>
                          )}
                        </div>

                        {r.overrideConflicto && (
                          <div className="rounded-sm border border-[#FCD34D] bg-[#FFFBEB] px-2.5 py-1 text-[11px] text-[#92400E]">
                            Excepción cercanía ({r.overrideConflicto.fecha}): {r.overrideConflicto.motivo}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Lista de Misiones */}
              <div className="rounded-md border border-[#CBD5E1] bg-white divide-y divide-[#E2E8F0]">
                <div className="px-4 py-3 bg-[#F8FAFC]">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-[#0F2942]">
                    Misiones activas ({misiones.length})
                  </h3>
                </div>
                {misiones.length === 0 ? (
                  <div className="p-4 text-xs text-[#64748B]">
                    Sin misiones creadas aún.
                  </div>
                ) : (
                  misiones.map((m) => (
                    <div key={m.id} className="p-3.5 text-xs flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-[#0F2942]">{m.nombre}</div>
                        <div className="text-[11px] text-[#43474D]">
                          {m.zona} ({m.provincia}) · <span className="font-mono">{m.fechaInicio} → {m.fechaFin}</span>
                        </div>
                      </div>
                      <span className="rounded-sm border border-[#CBD5E1] bg-[#F8FAFC] px-2 py-0.5 font-mono text-[11px]">
                        {m.rutaIds.length} ruta(s)
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {canManageCatalogs && (
              <div className="lg:col-span-5 space-y-4">
                {onGuardarRenta && (
                  <form
                    onSubmit={handleSubmitRenta}
                    className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-3 text-xs"
                  >
                    <h3 className="font-bold text-[#0F2942]">Registrar Renta (sin chofer)</h3>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Tipo de recurso</span>
                        <select
                          value={rentaTipo}
                          onChange={(e) => {
                            const nextTipo = e.target.value as RentaRecursoTipo;
                            setRentaTipo(nextTipo);
                            setRentaRecursoId(
                              nextTipo === 'vehiculo'
                                ? vehiculos[0]?.id ?? ''
                                : equipos[0]?.id ?? ''
                            );
                          }}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          <option value="vehiculo">Vehículo</option>
                          <option value="equipo">Equipo GNSS</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Recurso</span>
                        <select
                          value={rentaRecursoId}
                          onChange={(e) => setRentaRecursoId(e.target.value)}
                          required
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          {rentaTipo === 'vehiculo'
                            ? vehiculos.map((v) => (
                                <option key={v.id} value={v.id}>
                                  {v.etiqueta} ({v.placa})
                                </option>
                              ))
                            : equipos.map((eq) => (
                                <option key={eq.id} value={eq.id}>
                                  {eq.nombre} ({eq.serial})
                                </option>
                              ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Proveedor</span>
                        <input
                          type="text"
                          required
                          placeholder="Ej. Rent-a-Car Cibao"
                          value={rentaProveedor}
                          onChange={(e) => setRentaProveedor(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Estado inicial</span>
                        <select
                          value={rentaEstadoInicial}
                          onChange={(e) =>
                            setRentaEstadoInicial(e.target.value as 'reservada' | 'activa')
                          }
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          <option value="activa">Activa</option>
                          <option value="reservada">Reservada</option>
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Misión (opcional)</span>
                        <select
                          value={rentaMisionId}
                          onChange={(e) => setRentaMisionId(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          <option value="">Sin misión específica</option>
                          {misiones.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Ruta (opcional)</span>
                        <select
                          value={rentaRutaId}
                          onChange={(e) => setRentaRutaId(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          <option value="">Sin ruta directa</option>
                          {rutas.map((rt) => (
                            <option key={rt.id} value={rt.id}>
                              {rt.codigoParcela} — {rt.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Fecha inicio</span>
                        <input
                          type="date"
                          required
                          value={rentaFechaInicio}
                          onChange={(e) => setRentaFechaInicio(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Fecha fin</span>
                        <input
                          type="date"
                          required
                          value={rentaFechaFin}
                          onChange={(e) => setRentaFechaFin(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2 font-mono"
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Modalidad</span>
                        <select
                          value={rentaModalidad}
                          onChange={(e) =>
                            setRentaModalidad(e.target.value as ModalidadTarifaRenta)
                          }
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2 py-2"
                        >
                          <option value="por_dia">Por día</option>
                          <option value="por_km">Por km</option>
                        </select>
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">Tarifa ({moneda})</span>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          required
                          value={rentaTarifa}
                          onChange={(e) => setRentaTarifa(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2 py-2 font-mono"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">
                          {rentaModalidad === 'por_dia' ? 'Días est.' : 'Km est.'}
                        </span>
                        <input
                          type="number"
                          min={1}
                          step="1"
                          required
                          value={rentaCantidad}
                          onChange={(e) => setRentaCantidad(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2 py-2 font-mono"
                        />
                      </label>
                    </div>

                    <div className="flex items-center justify-between rounded-sm border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
                      <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-[#334155]">
                        <input
                          type="checkbox"
                          checked={rentaIncluyeItbis}
                          onChange={(e) => setRentaIncluyeItbis(e.target.checked)}
                        />
                        <span>Aplicar ITBIS (18%)</span>
                      </label>
                      <div className="text-right font-mono">
                        <div className="text-[10px] text-[#64748B]">
                          ITBIS: {formatRD(totalesRentaPreview.itbisRD, moneda)}
                        </div>
                        <div className="font-bold text-[#0F2942]">
                          Total: {formatRD(totalesRentaPreview.costoTotalRD, moneda)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[11px] font-semibold text-[#334155]">
                          Proyecto principal (reparto)
                        </span>
                        <select
                          value={rentaProyectoId}
                          onChange={(e) => setRentaProyectoId(e.target.value)}
                          className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-2.5 py-2"
                        >
                          <option value="sin_asignar">Sin asignar a proyecto</option>
                          {proyectos.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.codigoContrato} — {p.nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                      {proyectos.length > 1 && rentaProyectoId !== 'sin_asignar' && (
                        <div className="grid grid-cols-2 gap-1.5">
                          <label className="block">
                            <span className="text-[11px] font-semibold text-[#334155]">2do proy. (opc.)</span>
                            <select
                              value={rentaProyectoSecundarioId}
                              onChange={(e) => setRentaProyectoSecundarioId(e.target.value)}
                              className="mt-1 w-full rounded-sm border border-[#CBD5E1] bg-white px-1.5 py-2 text-[11px]"
                            >
                              <option value="">Ninguno</option>
                              {proyectos
                                .filter((p) => p.id !== rentaProyectoId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.codigoContrato}
                                  </option>
                                ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-[11px] font-semibold text-[#334155]">Monto 2do</span>
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={rentaMontoProyectoSecundario}
                              onChange={(e) => setRentaMontoProyectoSecundario(e.target.value)}
                              className="mt-1 w-full rounded-sm border border-[#CBD5E1] px-2 py-2 font-mono text-[11px]"
                            />
                          </label>
                        </div>
                      )}
                    </div>

                    <label className="block">
                      <span className="text-[11px] font-semibold text-[#334155]">
                        Comprobante / factura (opcional)
                      </span>
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={handleRentaFileChange}
                        className="mt-1 block w-full text-[11px] text-[#43474D]"
                      />
                      {rentaComprobanteNombre && (
                        <span className="text-[10px] text-[#15803D]">
                          Adjunto: {rentaComprobanteNombre}
                        </span>
                      )}
                    </label>

                    <input
                      type="text"
                      placeholder="Notas de entrega o condiciones (opcional)"
                      value={rentaNotas}
                      onChange={(e) => setRentaNotas(e.target.value)}
                      className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2"
                    />

                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm bg-[#0F2942] py-2 font-semibold text-white hover:bg-[#0284C7]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Guardar Renta
                    </button>
                  </form>
                )}

                {onCrearMision && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      try {
                        await onCrearMision({
                          nombre: misionNombre.trim(),
                          zona: misionZona.trim(),
                          provincia: misionProvincia.trim(),
                          fechaInicio: misionFechaInicio,
                          fechaFin: misionFechaFin,
                          rutaIds: misionRutaIds,
                          notas: misionNotas.trim() || undefined,
                        });
                        setMisionNombre('');
                        setMisionZona('');
                        setMisionRutaIds([]);
                        setMisionNotas('');
                        notify('Misión creada.');
                      } catch (err: unknown) {
                        setError(
                          err instanceof Error ? err.message : 'No se pudo crear la misión.'
                        );
                      }
                    }}
                    className="rounded-md border border-[#CBD5E1] bg-white p-4 space-y-2.5 text-xs"
                  >
                    <h3 className="font-bold text-[#0F2942]">Nueva Misión de Campo</h3>
                    <input
                      type="text"
                      required
                      placeholder="Nombre (ej. Misión Deslinde Norte)"
                      value={misionNombre}
                      onChange={(e) => setMisionNombre(e.target.value)}
                      className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        placeholder="Zona (ej. Región Cibao)"
                        value={misionZona}
                        onChange={(e) => setMisionZona(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2"
                      />
                      <input
                        type="text"
                        required
                        placeholder="Provincia"
                        value={misionProvincia}
                        onChange={(e) => setMisionProvincia(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-2"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="date"
                        required
                        value={misionFechaInicio}
                        onChange={(e) => setMisionFechaInicio(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-1.5 font-mono"
                      />
                      <input
                        type="date"
                        required
                        value={misionFechaFin}
                        onChange={(e) => setMisionFechaFin(e.target.value)}
                        className="w-full rounded-sm border border-[#CBD5E1] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    {rutas.length > 0 && (
                      <div>
                        <span className="block text-[11px] font-semibold text-[#334155] mb-1">
                          Rutas agrupadas
                        </span>
                        <div className="max-h-24 overflow-y-auto space-y-1 border border-[#E2E8F0] rounded-sm p-2">
                          {rutas.map((rt) => (
                            <label key={rt.id} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={misionRutaIds.includes(rt.id)}
                                onChange={() =>
                                  setMisionRutaIds((prev) =>
                                    prev.includes(rt.id)
                                      ? prev.filter((x) => x !== rt.id)
                                      : [...prev, rt.id]
                                  )
                                }
                              />
                              <span className="truncate">
                                {rt.codigoParcela} — {rt.nombre}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    <button
                      type="submit"
                      className="w-full inline-flex items-center justify-center gap-1.5 rounded-sm border border-[#0F2942] bg-white py-2 font-semibold text-[#0F2942] hover:bg-[#0F2942] hover:text-white"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Crear Misión
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
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

      <ResourceConflictModal
        conflicts={rentaConflictos}
        onCancel={() => {
          setPendingRentaPayload(null);
          setRentaConflictos([]);
        }}
        onConfirmWithOverride={async (motivo) => {
          if (!pendingRentaPayload || !onGuardarRenta) return;
          const overrideConflicto: OverrideConflicto | undefined = motivo
            ? {
                motivo,
                usuarioId: usuarioActual?.id ?? 'sistema',
                usuarioNombre: usuarioActual?.nombre ?? 'Usuario',
                fecha: hoyIso,
              }
            : undefined;
          try {
            await onGuardarRenta({
              ...pendingRentaPayload,
              overrideConflicto,
            });
            setPendingRentaPayload(null);
            setRentaConflictos([]);
            resetRentaForm();
            notify('Renta guardada con excepción auditada.');
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'No se pudo guardar la renta.');
          }
        }}
      />
    </section>
  );
};

