import React, { useMemo, useState } from 'react';
import {
  Calculator,
  Camera,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  FolderPlus,
  Layers,
  MapPin,
  MessageSquarePlus,
  Plus,
  Route as RouteIcon,
  Search,
  UserPlus,
  X,
} from 'lucide-react';
import {
  calcularCotizacionServicioVigente,
  calcularEjecutadoProyectoDesdeFuentes,
  calcularEstadoProyecto,
  calcularGastoPorProyecto,
  compararPresupuestoProyecto,
  crearConfiguracionInicialEmpresa,
  ESTADOS_SERVICIO,
  ETIQUETA_ESTADO,
  obtenerEstadosSiguientesPermitidos,
  obtenerFactoresTerrenoVigentes,
  obtenerPresupuestoVigenteProyecto,
  obtenerServiciosVigentes,
  puedeCrearOEditarOperacion,
  puedeRegistrarBitacoraEnServicio,
  type ComparacionPresupuestoProyecto,
  type ServicioCatalogoVigente,
} from '../domain';
import type { PayloadTransicionServicio } from '../domain/estados';
import type {
  AreaUnit,
  Asignacion,
  BitacoraEntrada,
  Cliente,
  ConfiguracionEmpresa,
  Cuadrilla,
  EstadoPresupuestoProyecto,
  EstadoServicio,
  LineaPresupuestoProyecto,
  Personal,
  PresupuestoProyecto,
  Proyecto,
  Renta,
  RolEmpresa,
  Ruta,
  Servicio,
  TerrenoFactorVersion,
  Vehiculo,
  Viatico,
} from '../types/domain';
import { formatArea, formatPerimeter, formatRD } from '../utils/geodesy';
import { MediaThumb } from './MediaThumb';
import { PresupuestoProyectoModal } from './PresupuestoProyectoModal';
import { ProyectosViewSkeleton } from './Skeletons';
import { ViaticosComparisonChart } from './ViaticosComparisonChart';
import { WorkflowBadge } from './WorkflowBadge';

interface ProyectosViewProps {
  rol: RolEmpresa;
  isLoading?: boolean;
  usuarioActual: { id: string; nombre: string };
  clientes: Cliente[];
  proyectos: Proyecto[];
  rutas: Ruta[];
  servicios: Servicio[];
  bitacoras: BitacoraEntrada[];
  viaticos: Viatico[];
  presupuestos?: PresupuestoProyecto[];
  asignaciones?: Asignacion[];
  cuadrillas?: Cuadrilla[];
  personal?: Personal[];
  vehiculos?: Vehiculo[];
  rentas?: Renta[];
  configuracion?: ConfiguracionEmpresa | null;
  rutasAsignadasIds: Set<string>;
  areaUnit: AreaUnit;
  pendingSyncCount: number;
  serviciosCatalogo?: ServicioCatalogoVigente[];
  factoresTerreno?: TerrenoFactorVersion | null;
  moneda?: string;
  onChangeAreaUnit: (u: AreaUnit) => void;
  onCrearCliente: (datos: Omit<Cliente, 'id' | 'empresaId'>) => Promise<void>;
  onCrearProyecto: (
    datos: Omit<
      Proyecto,
      'id' | 'empresaId' | 'estado' | 'fechaCreacion' | 'version' | 'updatedAt' | 'syncStatus'
    >
  ) => Promise<void>;
  onCrearVersionPresupuesto?: (params: {
    proyectoId: string;
    vigenciaDesde: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
    aprobarInmediatamente?: boolean;
  }) => Promise<void>;
  onEditarBorradorPresupuesto?: (params: {
    presupuestoId: string;
    vigenciaDesde?: string;
    lineas: LineaPresupuestoProyecto[];
    notas?: string;
    motivoCambio?: string;
  }) => Promise<void>;
  onTransicionarPresupuesto?: (params: {
    presupuestoId: string;
    nuevoEstado: EstadoPresupuestoProyecto;
    motivo?: string;
  }) => Promise<void>;
  onAbrirNuevaRutaKmz: (proyectoId?: string) => void;
  onAgregarServicioARuta: (
    datos: Omit<Servicio, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
  ) => Promise<void>;
  onTransicionarServicio: (params: {
    servicioId: string;
    nuevoEstado: EstadoServicio;
    payload?: PayloadTransicionServicio;
  }) => Promise<void>;
  onAgregarBitacora: (
    datos: Omit<BitacoraEntrada, 'id' | 'empresaId' | 'fechaAST' | 'syncStatus'>
  ) => Promise<void>;
  onVerRutaEnMapa: (rutaId: string) => void;
  onCalcularRuta: (rutaId: string) => void;
  onReportarViaticoEnRuta: (rutaId: string, proyectoId: string) => void;
}

const DEFAULT_CFG_PROY = crearConfiguracionInicialEmpresa('default');
const DEFAULT_SERVICIOS_PROY = obtenerServiciosVigentes(DEFAULT_CFG_PROY);
const DEFAULT_TERRENO_PROY = obtenerFactoresTerrenoVigentes(DEFAULT_CFG_PROY);

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la foto.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Formato de imagen inválido.'));
      img.onload = () => {
        const maxDim = 960;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.78));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

export const ProyectosView: React.FC<ProyectosViewProps> = ({
  rol,
  isLoading = false,
  usuarioActual,
  clientes,
  proyectos,
  rutas,
  servicios,
  bitacoras,
  viaticos,
  presupuestos = [],
  asignaciones = [],
  cuadrillas = [],
  personal = [],
  vehiculos = [],
  rentas = [],
  configuracion = null,
  rutasAsignadasIds,
  areaUnit,
  pendingSyncCount,
  serviciosCatalogo = DEFAULT_SERVICIOS_PROY,
  factoresTerreno = DEFAULT_TERRENO_PROY,
  moneda = 'RD$',
  onChangeAreaUnit,
  onCrearCliente,
  onCrearProyecto,
  onCrearVersionPresupuesto,
  onEditarBorradorPresupuesto,
  onTransicionarPresupuesto,
  onAbrirNuevaRutaKmz,
  onAgregarServicioARuta,
  onTransicionarServicio,
  onAgregarBitacora,
  onVerRutaEnMapa,
  onCalcularRuta,
  onReportarViaticoEnRuta,
}) => {
  const canEdit = puedeCrearOEditarOperacion(rol);
  const canViewFinances = rol === 'admin' || rol === 'coordinador';
  const [presupuestoModalProyectoId, setPresupuestoModalProyectoId] = useState<string | null>(null);
  const serviciosActivos = useMemo(
    () => serviciosCatalogo.filter((s) => s.activo),
    [serviciosCatalogo]
  );
  const terrenoActivo = factoresTerreno ?? DEFAULT_TERRENO_PROY;
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoServicio | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  // Modales F2 Cliente / Proyecto
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [cliNombre, setCliNombre] = useState('');
  const [cliRnc, setCliRnc] = useState('');
  const [cliContacto, setCliContacto] = useState('');
  const [cliTelefono, setCliTelefono] = useState('');

  const [showProyectoModal, setShowProyectoModal] = useState(false);
  const [proyClienteId, setProyClienteId] = useState(clientes[0]?.id || '');
  const [proyNombre, setProyNombre] = useState('');
  const [proyCodigo, setProyCodigo] = useState(
    `AIA-${new Date().getFullYear()}-${String(Math.floor(100 + Math.random() * 899))}`
  );
  const [proyPresupuesto, setProyPresupuesto] = useState('15000');
  const [proyValor, setProyValor] = useState('120000');
  const [proyNotas, setProyNotas] = useState('');

  // Modal F4 agregar servicio a ruta (lee catálogo configurable)
  const primerServicio = serviciosActivos[0] ?? DEFAULT_SERVICIOS_PROY[0];
  const [rutaParaServicio, setRutaParaServicio] = useState<Ruta | null>(null);
  const [srvTipoCodigo, setSrvTipoCodigo] = useState(primerServicio.codigo);
  const [srvNombre, setSrvNombre] = useState(primerServicio.nombre);
  const [srvCotizacion, setSrvCotizacion] = useState(String(primerServicio.precioBaseRD));

  // Modal transición de estado (especialmente fechas reales y cobro)
  const [transicionTarget, setTransicionTarget] = useState<{
    servicio: Servicio;
    nuevoEstado: EstadoServicio;
  } | null>(null);
  const [fechaInput, setFechaInput] = useState(new Date().toISOString().slice(0, 10));
  const [montoCobradoInput, setMontoCobradoInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Drawer/Modal de Bitácora F8
  const [bitacoraServicio, setBitacoraServicio] = useState<Servicio | null>(null);
  const [notaBitacora, setNotaBitacora] = useState('');
  const [fotosBitacora, setFotosBitacora] = useState<string[]>([]);

  const gastosPorProyecto = useMemo(() => calcularGastoPorProyecto(viaticos), [viaticos]);

  const proyectosVisibles = useMemo(() => {
    const rutasVisiblesIds = new Set(rutas.map((r) => r.id));
    const q = searchQuery.trim().toLowerCase();

    return proyectos
      .filter((p) => {
        if (rol === 'tecnico') {
          const tieneRutaAsignada = rutas.some(
            (r) => r.proyectoId === p.id && rutasVisiblesIds.has(r.id)
          );
          if (!tieneRutaAsignada) return false;
        }

        const cliente = clientes.find((c) => c.id === p.clienteId);
        const rutasProy = rutas.filter((r) => r.proyectoId === p.id);
        const srvsProy = servicios.filter((s) => rutasProy.some((r) => r.id === s.rutaId));
        const estadoDerivado = calcularEstadoProyecto(srvsProy, p.estado);

        const matchesEstado = estadoFiltro === 'ALL' || estadoDerivado === estadoFiltro;
        const matchesSearch =
          !q ||
          p.nombre.toLowerCase().includes(q) ||
          p.codigoContrato.toLowerCase().includes(q) ||
          (cliente?.nombre || '').toLowerCase().includes(q) ||
          rutasProy.some(
            (r) =>
              r.codigoParcela.toLowerCase().includes(q) ||
              r.nombre.toLowerCase().includes(q) ||
              r.provincia.toLowerCase().includes(q)
          );
        return matchesEstado && matchesSearch;
      })
      .map((p) => {
        const cliente = clientes.find((c) => c.id === p.clienteId);
        const rutasProy = rutas.filter((r) => r.proyectoId === p.id);
        const srvsProy = servicios.filter((s) => rutasProy.some((r) => r.id === s.rutaId));
        const estadoActual = calcularEstadoProyecto(srvsProy, p.estado);
        const gastoReal = gastosPorProyecto[p.id]?.totalEjecutadoRD || 0;
        let comparacionPresupuesto: ComparacionPresupuestoProyecto | undefined;
        if (canViewFinances) {
          const vigente = obtenerPresupuestoVigenteProyecto(presupuestos, p.id);
          const ejecutado = calcularEjecutadoProyectoDesdeFuentes({
            proyectoId: p.id,
            rutas,
            asignaciones,
            cuadrillas,
            personal,
            vehiculos,
            viaticos,
            rentas,
            configuracion: configuracion ?? undefined,
          });
          comparacionPresupuesto = compararPresupuestoProyecto({
            proyecto: p,
            presupuesto: vigente,
            ejecutado,
          });
        }
        return {
          proyecto: p,
          cliente,
          rutasProy,
          srvsProy,
          estadoActual,
          gastoReal,
          comparacionPresupuesto,
        };
      });
  }, [
    proyectos,
    clientes,
    rutas,
    servicios,
    gastosPorProyecto,
    searchQuery,
    estadoFiltro,
    rol,
    canViewFinances,
    presupuestos,
    asignaciones,
    cuadrillas,
    personal,
    vehiculos,
    viaticos,
    rentas,
    configuracion,
  ]);

  const kpis = useMemo(() => {
    const activos = proyectos.filter((p) => {
      const rutasP = rutas.filter((r) => r.proyectoId === p.id);
      const srvsP = servicios.filter((s) => rutasP.some((r) => r.id === s.rutaId));
      return calcularEstadoProyecto(srvsP, p.estado) !== 'cobrado';
    }).length;
    const totalAreaM2 = rutas.reduce((acc, r) => acc + r.totalAreaM2, 0);
    const totalPresupViaticos = proyectos.reduce((acc, p) => acc + p.presupuestoViaticosRD, 0);
    const totalEjecutado = Object.values(gastosPorProyecto).reduce(
      (acc, item) => acc + item.totalEjecutadoRD,
      0
    );
    return { activos, totalAreaM2, totalPresupViaticos, totalEjecutado };
  }, [proyectos, rutas, servicios, gastosPorProyecto]);

  const handleConfirmCliente = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await onCrearCliente({
        nombre: cliNombre,
        rnc: cliRnc,
        contacto: cliContacto,
        telefono: cliTelefono || undefined,
      });
      setCliNombre('');
      setCliRnc('');
      setCliContacto('');
      setCliTelefono('');
      setShowClienteModal(false);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo crear el cliente.');
    }
  };

  const handleConfirmProyecto = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    try {
      await onCrearProyecto({
        clienteId: proyClienteId || clientes[0]?.id || '',
        nombre: proyNombre,
        codigoContrato: proyCodigo,
        presupuestoViaticosRD: Number(proyPresupuesto) || 0,
        valorContratoRD: Number(proyValor) || 0,
        notas: proyNotas.trim() || undefined,
      });
      setProyNombre('');
      setProyNotas('');
      setShowProyectoModal(false);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo crear el proyecto.');
    }
  };

  const handleConfirmAgregarServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rutaParaServicio) return;
    setModalError(null);
    const svcCat =
      serviciosActivos.find((s) => s.codigo === srvTipoCodigo) ?? primerServicio;
    const cotizacionCalc = calcularCotizacionServicioVigente({
      servicio: svcCat,
      areaM2: rutaParaServicio.totalAreaM2,
      corridorKm: 0,
      terrain: 'Llano',
      factoresTerreno: terrenoActivo,
    });
    try {
      await onAgregarServicioARuta({
        rutaId: rutaParaServicio.id,
        tipoServicioId: svcCat.codigo,
        nombre: srvNombre.trim() || svcCat.nombre,
        cotizacionRD: Number(srvCotizacion) || cotizacionCalc.totalRD,
        configVersion: svcCat.version,
        tarifaBaseUsadaRD: svcCat.precioBaseRD,
        recargosUsadosRD: cotizacionCalc.areaSurchargeRD + cotizacionCalc.corridorExtraRD,
        estado: 'cotizado',
      });
      setRutaParaServicio(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error agregando servicio.');
    }
  };

  const handleIniciarTransicion = async (servicio: Servicio, nuevoEstado: EstadoServicio) => {
    setModalError(null);
    setActionError(null);
    if (nuevoEstado === 'en_campo' || nuevoEstado === 'procesando' || nuevoEstado === 'cobrado') {
      setFechaInput(new Date().toISOString().slice(0, 10));
      setMontoCobradoInput(String(servicio.cotizacionRD || ''));
      setTransicionTarget({ servicio, nuevoEstado });
      return;
    }
    try {
      await onTransicionarServicio({ servicioId: servicio.id, nuevoEstado });
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar el estado.');
    }
  };

  const handleConfirmTransicionModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transicionTarget) return;
    setModalError(null);
    const { servicio, nuevoEstado } = transicionTarget;
    try {
      const payload: PayloadTransicionServicio = {};
      if (nuevoEstado === 'en_campo') payload.fechaRealInicio = fechaInput;
      if (nuevoEstado === 'procesando') payload.fechaRealFin = fechaInput;
      if (nuevoEstado === 'cobrado') {
        payload.montoCobradoRD = Number(montoCobradoInput);
        payload.fechaPago = fechaInput;
      }
      await onTransicionarServicio({
        servicioId: servicio.id,
        nuevoEstado,
        payload,
      });
      setTransicionTarget(null);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    }
  };

  const handleGuardarBitacora = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bitacoraServicio || !notaBitacora.trim()) return;
    setModalError(null);
    try {
      await onAgregarBitacora({
        servicioId: bitacoraServicio.id,
        rutaId: bitacoraServicio.rutaId,
        autorUsuarioId: usuarioActual.id,
        autorNombre: usuarioActual.nombre,
        nota: notaBitacora.trim(),
        fotos: fotosBitacora,
      });
      setNotaBitacora('');
      setFotosBitacora([]);
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'No se pudo guardar en la bitácora.');
    }
  };

  const bitacorasDelServicio = useMemo(
    () =>
      bitacoraServicio
        ? bitacoras.filter((b) => b.servicioId === bitacoraServicio.id)
        : [],
    [bitacoras, bitacoraServicio]
  );

  if (isLoading && proyectos.length === 0) {
    return <ProyectosViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      {/* KPI Strip + Recharts Budget vs Actual Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
        <div className="xl:col-span-5 grid grid-cols-2 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div className="text-xs font-medium text-[#43474D]">Proyectos Activos</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="font-mono text-2xl font-bold text-[#0F2942] tabular-nums">
                {kpis.activos}
              </span>
              <span className="text-xs text-[#43474D]">{proyectos.length} totales</span>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div className="text-xs font-medium text-[#43474D]">Superficie en Rutas</div>
            <div className="mt-2 font-mono text-xl font-bold text-[#0284C7] tabular-nums">
              {formatArea(kpis.totalAreaM2, areaUnit)}
            </div>
          </div>

          {canViewFinances && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
              <div className="text-xs font-medium text-[#43474D]">Viáticos Ejecutados</div>
              <div>
                <div className="mt-1 font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums truncate">
                  {formatRD(kpis.totalEjecutado)}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[#43474D] tabular-nums">
                  Presup.: {formatRD(kpis.totalPresupViaticos)}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between">
            <div className="text-xs font-medium text-[#43474D]">Cola Offline / Sync</div>
            <div className="mt-2 flex items-baseline justify-between">
              <span
                className={`font-mono text-2xl font-bold tabular-nums ${
                  pendingSyncCount > 0 ? 'text-[#D97706]' : 'text-[#15803D]'
                }`}
              >
                {pendingSyncCount}
              </span>
              <span className="text-xs text-[#43474D]">
                {pendingSyncCount === 0 ? 'Al día' : 'Pendientes'}
              </span>
            </div>
          </div>
        </div>

        {canViewFinances && (
          <div className="xl:col-span-7 min-w-0">
            <ViaticosComparisonChart
              proyectos={proyectos}
              viaticos={viaticos}
              onSelectProyecto={(proyId) => {
                const firstRuta = rutas.find((r) => r.proyectoId === proyId);
                if (firstRuta) onVerRutaEnMapa(firstRuta.id);
              }}
            />
          </div>
        )}
      </div>

      {actionError && (
        <div className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs font-medium text-[#93000A]">
          {actionError}
        </div>
      )}

      {/* Toolbar & F2 Quick Create Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#74777E]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente, contrato, ruta KMZ o provincia..."
            className="w-full rounded-md border border-slate-200 bg-[#F8FAFC] pl-9 pr-3 py-2 text-xs text-[#0D1C2F] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[40px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value as EstadoServicio | 'ALL')}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[40px]"
            aria-label="Filtrar por estado"
          >
            <option value="ALL">Todos los estados</option>
            {ESTADOS_SERVICIO.map((st) => (
              <option key={st} value={st}>
                {ETIQUETA_ESTADO[st]}
              </option>
            ))}
          </select>

          <div className="inline-flex rounded-md border border-slate-200 bg-[#F8FAFC] p-0.5">
            {(
              [
                { id: 'm2', label: 'm²' },
                { id: 'ha', label: 'ha' },
                { id: 'tareas', label: 'Tareas' },
              ] as const
            ).map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => onChangeAreaUnit(u.id)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                  areaUnit === u.id
                    ? 'bg-[#0F2942] text-white'
                    : 'text-[#43474D] hover:bg-white'
                }`}
              >
                {u.label}
              </button>
            ))}
          </div>

          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setShowClienteModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Nuevo Cliente
              </button>
              <button
                type="button"
                onClick={() => {
                  setModalError(null);
                  setProyClienteId(clientes[0]?.id || '');
                  setShowProyectoModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] whitespace-nowrap shrink-0 min-h-[40px]"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                Nuevo Proyecto
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hierarchy List: Cliente -> Proyecto -> Rutas -> Servicios -> Bitácora */}
      {proyectosVisibles.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-[#43474D]">
          {rol === 'tecnico'
            ? 'No tienes rutas asignadas en tus cuadrillas activas todavía.'
            : 'No hay proyectos que coincidan con los filtros seleccionados.'}
        </div>
      ) : (
        <div className="space-y-5">
          {proyectosVisibles.map(
            ({
              proyecto,
              cliente,
              rutasProy,
              srvsProy,
              estadoActual,
              gastoReal,
              comparacionPresupuesto,
            }) => {
            const overBudget = comparacionPresupuesto
              ? comparacionPresupuesto.excedidoTotal
              : gastoReal > proyecto.presupuestoViaticosRD;
            return (
              <div
                key={proyecto.id}
                className="rounded-lg border border-slate-200 bg-white overflow-hidden"
              >
                {/* Project Header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 bg-[#F8FAFC] px-5 py-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono font-bold text-[#0284C7]">
                        {proyecto.codigoContrato}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <WorkflowBadge status={estadoActual} />
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="text-[#43474D]">
                        {cliente ? `${cliente.nombre} (RNC ${cliente.rnc})` : 'Cliente sin asignar'}
                      </span>
                    </div>
                    <h3 className="text-base font-bold tracking-tight text-[#0D1C2F] text-balance">
                      {proyecto.nombre}
                    </h3>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs shrink-0">
                    {canViewFinances && comparacionPresupuesto && (
                      <>
                        <div className="text-right">
                          <div className="text-[11px] text-[#43474D]">Valor Contrato</div>
                          <div className="font-mono font-bold text-[#0D1C2F] tabular-nums">
                            {formatRD(proyecto.valorContratoRD, moneda)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-[#43474D]">Costo (Real / Pres.)</div>
                          <div
                            className={`font-mono font-bold tabular-nums ${
                              overBudget ? 'text-[#DC2626]' : 'text-[#0F2942]'
                            }`}
                          >
                            {formatRD(comparacionPresupuesto.totalEjecutadoRD, moneda)}{' '}
                            <span className="font-normal text-[#43474D]">
                              / {formatRD(comparacionPresupuesto.totalPlanificadoRD, moneda)}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] text-[#43474D]">Margen Real</div>
                          <div
                            className={`font-mono font-bold tabular-nums ${
                              comparacionPresupuesto.margenRealRD < 0
                                ? 'text-[#DC2626]'
                                : 'text-[#15803D]'
                            }`}
                          >
                            {formatRD(comparacionPresupuesto.margenRealRD, moneda)}
                            {comparacionPresupuesto.margenRealPct !== null
                              ? ` (${comparacionPresupuesto.margenRealPct}%)`
                              : ''}
                          </div>
                        </div>
                        {srvsProy.some((s) => s.estado === 'cobrado' && typeof s.montoCobradoRD === 'number') && (
                          <div className="text-right">
                            <div className="text-[11px] text-[#15803D]">Total Cobrado</div>
                            <div className="font-mono font-bold text-[#15803D] tabular-nums">
                              {formatRD(
                                srvsProy.reduce(
                                  (acc, s) =>
                                    acc +
                                    (s.estado === 'cobrado' && typeof s.montoCobradoRD === 'number'
                                      ? s.montoCobradoRD
                                      : 0),
                                  0
                                ),
                                moneda
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                    {canViewFinances && (
                      <button
                        type="button"
                        onClick={() => setPresupuestoModalProyectoId(proyecto.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[40px]"
                      >
                        <Calculator className="h-3.5 w-3.5 text-[#0284C7]" />
                        Presupuesto
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onAbrirNuevaRutaKmz(proyecto.id)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-[#0284C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 whitespace-nowrap shrink-0 min-h-[40px]"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Ruta KMZ
                      </button>
                    )}
                  </div>
                </div>

                {/* Rutas inside Proyecto */}
                {rutasProy.length === 0 ? (
                  <div className="px-5 py-5 text-xs text-[#43474D] flex items-center justify-between">
                    <span>Este proyecto aún no tiene rutas KMZ/GeoJSON cargadas.</span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => onAbrirNuevaRutaKmz(proyecto.id)}
                        className="font-semibold text-[#0284C7] hover:underline whitespace-nowrap shrink-0"
                      >
                        Cargar primer archivo KMZ →
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200">
                    {rutasProy.map((ruta) => {
                      const serviciosRuta = srvsProy.filter((s) => s.rutaId === ruta.id);
                      return (
                        <div key={ruta.id} className="p-5 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <span className="font-mono font-bold text-[#0F2942]">
                                  {ruta.codigoParcela}
                                </span>
                                <span className="text-slate-300">·</span>
                                <span className="font-semibold text-[#0D1C2F]">{ruta.nombre}</span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#43474D] font-mono tabular-nums">
                                <span className="inline-flex items-center gap-1 font-sans">
                                  <MapPin className="h-3 w-3 text-[#0284C7]" />
                                  {ruta.ubicacion} ({ruta.provincia})
                                </span>
                                <span>·</span>
                                <span>{formatArea(ruta.totalAreaM2, areaUnit)}</span>
                                <span>·</span>
                                <span>P: {formatPerimeter(ruta.totalPerimeterM)}</span>
                                <span>·</span>
                                <span>Prevista: {ruta.fechaPrevista}</span>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => onVerRutaEnMapa(ruta.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                              >
                                <Layers className="h-3.5 w-3.5" />
                                Mapa OSM
                              </button>
                              <button
                                type="button"
                                onClick={() => onCalcularRuta(ruta.id)}
                                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                              >
                                <RouteIcon className="h-3.5 w-3.5" />
                                Calc. Ruta
                              </button>
                              <button
                                type="button"
                                onClick={() => onReportarViaticoEnRuta(ruta.id, proyecto.id)}
                                className="inline-flex items-center gap-1.5 rounded-md bg-[#0284C7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#006398] whitespace-nowrap shrink-0 min-h-[36px]"
                              >
                                <Camera className="h-3.5 w-3.5" />
                                + Viático
                              </button>
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setModalError(null);
                                    setRutaParaServicio(ruta);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  Servicio
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Servicios de la Ruta */}
                          {serviciosRuta.length > 0 && (
                            <div className="rounded-lg border border-slate-200 overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="bg-[#F8FAFC] border-b border-slate-200 text-[11px] font-semibold text-[#43474D]">
                                    <th className="px-3.5 py-2.5">Servicio</th>
                                    <th className="px-3.5 py-2.5 text-right">Cotización</th>
                                    <th className="px-3.5 py-2.5">Fechas / Cobro</th>
                                    <th className="px-3.5 py-2.5">Estado</th>
                                    <th className="px-3.5 py-2.5 text-right">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                  {serviciosRuta.map((srv) => {
                                    const siguientes = obtenerEstadosSiguientesPermitidos({
                                      rol,
                                      servicio: srv,
                                      rutasAsignadasIds,
                                    });
                                    const countBitacora = bitacoras.filter(
                                      (b) => b.servicioId === srv.id
                                    ).length;
                                    const puedeBitacora = puedeRegistrarBitacoraEnServicio({
                                      rol,
                                      servicio: srv,
                                      rutasAsignadasIds,
                                    });

                                    return (
                                      <tr key={srv.id} className="hover:bg-[#F8FAFC]">
                                        <td className="px-3.5 py-2.5 font-medium text-[#0D1C2F]">
                                          {srv.nombre}
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                                          {formatRD(srv.cotizacionRD)}
                                        </td>
                                        <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#43474D]">
                                          <div>
                                            {srv.fechaRealInicio
                                              ? `Inicio: ${srv.fechaRealInicio}`
                                              : 'Sin inicio'}
                                            {srv.fechaRealFin ? ` · Fin: ${srv.fechaRealFin}` : ''}
                                          </div>
                                          {srv.estado === 'cobrado' &&
                                            typeof srv.montoCobradoRD === 'number' && (
                                              <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[#15803D] tabular-nums">
                                                <DollarSign className="h-3 w-3 shrink-0" />
                                                Cobrado {formatRD(srv.montoCobradoRD)} · Pago{' '}
                                                {srv.fechaPago || 'N/D'}
                                              </div>
                                            )}
                                        </td>
                                        <td className="px-3.5 py-2.5">
                                          <WorkflowBadge status={srv.estado} />
                                        </td>
                                        <td className="px-3.5 py-2.5 text-right whitespace-nowrap">
                                          <div className="inline-flex items-center gap-1.5">
                                            {siguientes.map((nextSt) => (
                                              <button
                                                key={nextSt}
                                                type="button"
                                                onClick={() => handleIniciarTransicion(srv, nextSt)}
                                                className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                                  nextSt === 'cobrado'
                                                    ? 'bg-[#15803D] text-white hover:bg-[#166534]'
                                                    : 'border border-slate-200 bg-white text-[#0F2942] hover:bg-sky-50'
                                                }`}
                                              >
                                                → {ETIQUETA_ESTADO[nextSt]}
                                              </button>
                                            ))}

                                            {puedeBitacora && (
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  setModalError(null);
                                                  setBitacoraServicio(srv);
                                                }}
                                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] hover:bg-slate-100 whitespace-nowrap shrink-0"
                                              >
                                                <ClipboardList className="h-3 w-3" />
                                                Bitácora ({countBitacora})
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL F2: NUEVO CLIENTE */}
      {showClienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">Registrar Nuevo Cliente (F2)</h3>
              <button
                type="button"
                onClick={() => setShowClienteModal(false)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmCliente} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Nombre o Razón Social
                </label>
                <input
                  type="text"
                  required
                  value={cliNombre}
                  onChange={(e) => setCliNombre(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">RNC / Cédula</label>
                <input
                  type="text"
                  required
                  value={cliRnc}
                  onChange={(e) => setCliRnc(e.target.value)}
                  placeholder="1-31-00000-0"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Persona de Contacto</label>
                <input
                  type="text"
                  required
                  value={cliContacto}
                  onChange={(e) => setCliContacto(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Teléfono</label>
                <input
                  type="text"
                  value={cliTelefono}
                  onChange={(e) => setCliTelefono(e.target.value)}
                  placeholder="809-555-0000"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClienteModal(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 font-semibold min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL F2: NUEVO PROYECTO (INICIA EN COTIZADO) */}
      {showProyectoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">Crear Proyecto (Estado: Cotizado)</h3>
              <button
                type="button"
                onClick={() => setShowProyectoModal(false)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmProyecto} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Cliente</label>
                <select
                  value={proyClienteId}
                  onChange={(e) => setProyClienteId(e.target.value)}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 min-h-[40px]"
                >
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre} ({c.rnc})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Nombre del Proyecto</label>
                <input
                  type="text"
                  required
                  value={proyNombre}
                  onChange={(e) => setProyNombre(e.target.value)}
                  placeholder="Ej. Saneamiento y Deslinde Parcela 44"
                  className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Código de Contrato</label>
                <input
                  type="text"
                  required
                  value={proyCodigo}
                  onChange={(e) => setProyCodigo(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">
                    Presupuesto Viáticos (RD$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={proyPresupuesto}
                    onChange={(e) => setProyPresupuesto(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">
                    Valor Contrato (RD$)
                  </label>
                  <input
                    type="number"
                    min={0}
                    required
                    value={proyValor}
                    onChange={(e) => setProyValor(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Notas</label>
                <input
                  type="text"
                  value={proyNotas}
                  onChange={(e) => setProyNotas(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProyectoModal(false)}
                  className="rounded-md border border-slate-200 px-4 py-2 font-semibold min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                >
                  Crear Proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL F4: NUEVO SERVICIO EN RUTA */}
      {rutaParaServicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0D1C2F]">
                Añadir Servicio a {rutaParaServicio.codigoParcela}
              </h3>
              <button
                type="button"
                onClick={() => setRutaParaServicio(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleConfirmAgregarServicio} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Servicio del catálogo vigente
                </label>
                <select
                  value={srvTipoCodigo}
                  onChange={(e) => {
                    const nextCode = e.target.value;
                    setSrvTipoCodigo(nextCode);
                    const svc = serviciosActivos.find((s) => s.codigo === nextCode);
                    if (svc && rutaParaServicio) {
                      setSrvNombre(svc.nombre);
                      const calc = calcularCotizacionServicioVigente({
                        servicio: svc,
                        areaM2: rutaParaServicio.totalAreaM2,
                        corridorKm: 0,
                        terrain: 'Llano',
                        factoresTerreno: terrenoActivo,
                      });
                      setSrvCotizacion(String(calc.totalRD));
                    }
                  }}
                  className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 min-h-[40px]"
                >
                  {serviciosActivos.map((s) => (
                    <option key={s.codigo} value={s.codigo}>
                      {s.nombre} — Base {formatRD(s.precioBaseRD, moneda)} (v{s.version})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Nombre visible en contrato
                </label>
                <input
                  type="text"
                  required
                  value={srvNombre}
                  onChange={(e) => setSrvNombre(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 min-h-[40px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  Cotización ({moneda})
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={srvCotizacion}
                  onChange={(e) => setSrvCotizacion(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRutaParaServicio(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 font-semibold min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                >
                  Agregar como Cotizado
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TRANSICIÓN DE ESTADO (FECHAS REALES / COBRO F9) */}
      {transicionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0D1C2F]">
                {transicionTarget.nuevoEstado === 'cobrado' ? (
                  <DollarSign className="h-4 w-4 text-[#15803D]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[#0284C7]" />
                )}
                Pasar "{transicionTarget.servicio.nombre}" a{' '}
                {ETIQUETA_ESTADO[transicionTarget.nuevoEstado]}
              </h3>
              <button
                type="button"
                onClick={() => setTransicionTarget(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}

            <form onSubmit={handleConfirmTransicionModal} className="space-y-3 text-xs">
              {transicionTarget.nuevoEstado === 'cobrado' && (
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">
                    Monto Cobrado (RD$) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={montoCobradoInput}
                    onChange={(e) => setMontoCobradoInput(e.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-[#334155] mb-1">
                  {transicionTarget.nuevoEstado === 'en_campo'
                    ? 'Fecha Real de Inicio en Campo'
                    : transicionTarget.nuevoEstado === 'procesando'
                    ? 'Fecha Real de Cierre de Campo'
                    : 'Fecha de Pago / Cobro *'}
                </label>
                <input
                  type="date"
                  required
                  value={fechaInput}
                  onChange={(e) => setFechaInput(e.target.value)}
                  className="w-full rounded-md border border-slate-200 px-3 py-2 font-mono min-h-[40px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransicionTarget(null)}
                  className="rounded-md border border-slate-200 px-4 py-2 font-semibold min-h-[40px]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px]"
                >
                  Confirmar Cambio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BITÁCORA F8 (NOTAS Y FOTOS) */}
      {bitacoraServicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-[#0D1C2F]">
                  Bitácora de Campo — {bitacoraServicio.nombre}
                </h3>
                <p className="text-[11px] text-[#43474D]">
                  Registra avances, puntos monumentados y evidencia fotográfica.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBitacoraServicio(null)}
                className="rounded-md p-1.5 text-[#43474D] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {modalError && (
                <div className="rounded-md border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                  {modalError}
                </div>
              )}

              <form onSubmit={handleGuardarBitacora} className="space-y-3 text-xs border-b border-slate-200 pb-4">
                <div>
                  <label className="block font-semibold text-[#334155] mb-1">
                    Nueva Nota de Campo
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={notaBitacora}
                    onChange={(e) => setNotaBitacora(e.target.value)}
                    placeholder="Ej. Monumentados vértices V-1 al V-4 con solución RTK fija..."
                    className="w-full rounded-md border border-slate-200 px-3 py-2"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-md border border-slate-200 bg-[#F8FAFC] px-3 py-2 font-semibold text-[#0F2942] hover:bg-sky-50 min-h-[40px]">
                    <Camera className="h-3.5 w-3.5 text-[#0284C7]" />
                    Adjuntar Foto ({fotosBitacora.length}/3)
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={fotosBitacora.length >= 3}
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        try {
                          const dataUrl = await compressPhoto(f);
                          setFotosBitacora((prev) => [...prev, dataUrl].slice(0, 3));
                        } catch {
                          setModalError('No se pudo procesar la foto seleccionada.');
                        }
                      }}
                    />
                  </label>

                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[40px] whitespace-nowrap shrink-0"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Agregar Entrada
                  </button>
                </div>

                {fotosBitacora.length > 0 && (
                  <div className="flex flex-wrap gap-2.5 pt-1">
                    {fotosBitacora.map((src, i) => (
                      <MediaThumb
                        key={i}
                        src={src}
                        alt={`Foto ${i + 1}`}
                        caption="Adjunta"
                        sizeClass="h-16 w-16"
                        onRemove={() =>
                          setFotosBitacora((prev) => prev.filter((_, idx) => idx !== i))
                        }
                      />
                    ))}
                  </div>
                )}
              </form>

              <div className="space-y-3">
                {bitacorasDelServicio.length === 0 ? (
                  <p className="text-xs text-[#43474D]">Aún no hay entradas en esta bitácora.</p>
                ) : (
                  bitacorasDelServicio.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-lg border border-slate-200 bg-[#F8FAFC] p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#43474D]">
                        <span className="font-semibold text-[#0F2942]">{b.autorNombre}</span>
                        <span className="font-mono">{b.fechaAST}</span>
                      </div>
                      <p className="text-[#0D1C2F]">{b.nota}</p>
                      {b.fotos.length > 0 && (
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          {b.fotos.map((src, idx) => (
                            <MediaThumb
                              key={idx}
                              src={src}
                              alt={`Evidencia ${idx + 1}`}
                              caption="Bitácora"
                              sizeClass="h-16 w-16"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {canViewFinances && (
        <PresupuestoProyectoModal
          isOpen={Boolean(presupuestoModalProyectoId)}
          onClose={() => setPresupuestoModalProyectoId(null)}
          rol={rol}
          proyecto={proyectos.find((p) => p.id === presupuestoModalProyectoId) ?? null}
          presupuestos={presupuestos}
          rutas={rutas}
          asignaciones={asignaciones}
          cuadrillas={cuadrillas}
          personal={personal}
          vehiculos={vehiculos}
          viaticos={viaticos}
          rentas={rentas}
          configuracion={configuracion}
          moneda={moneda}
          onCrearVersion={async (params) => {
            if (onCrearVersionPresupuesto) {
              await onCrearVersionPresupuesto(params);
            }
          }}
          onEditarBorrador={async (params) => {
            if (onEditarBorradorPresupuesto) {
              await onEditarBorradorPresupuesto(params);
            }
          }}
          onTransicionarEstado={async (params) => {
            if (onTransicionarPresupuesto) {
              await onTransicionarPresupuesto(params);
            }
          }}
        />
      )}
    </section>
  );
};
