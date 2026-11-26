import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Calculator,
  Camera,
  CheckCircle2,
  ClipboardList,
  DollarSign,
  Download,
  FileSpreadsheet,
  FolderKanban,
  FolderPlus,
  LayoutGrid,
  Layers,
  List,
  Map as MapIcon,
  MapPin,
  MessageSquarePlus,
  Plus,
  Receipt,
  Route as RouteIcon,
  Search,
  UploadCloud,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  calcularCotizacionServicioVigente,
  calcularEjecutadoProyectoDesdeFuentes,
  calcularEstadoProyecto,
  calcularGastoPorProyecto,
  calcularProgresoProyecto,
  compararPresupuestoProyecto,
  crearConfiguracionInicialEmpresa,
  ESTADOS_SERVICIO,
  ETIQUETA_ESTADO,
  obtenerEstadosSiguientesPermitidos,
  obtenerFactoresTerrenoVigentes,
  obtenerPresupuestoVigenteProyecto,
  obtenerServiciosVigentes,
  PROGRESO_POR_ESTADO,
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
import {
  downloadProjectsExcelTemplate,
  parseProjectsFromExcelBuffer,
  type ParsedExcelProjectRow,
} from '../utils/excelProjects';
import { formatArea, formatPerimeter, formatRD } from '../utils/geodesy';
import { compressPhotoDataUrl } from '../utils/imageOptimize';
import { MediaThumb } from './MediaThumb';
import { PresupuestoProyectoModal } from './PresupuestoProyectoModal';
import { ProyectosLocationMap } from './ProyectosLocationMap';
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
  onCrearCliente: (datos: Omit<Cliente, 'id' | 'empresaId'>) => Promise<Cliente | void>;
  onCrearProyecto: (
    datos: Omit<
      Proyecto,
      'id' | 'empresaId' | 'estado' | 'fechaCreacion' | 'version' | 'updatedAt' | 'syncStatus'
    > & { estado?: EstadoServicio; progresoPct?: number }
  ) => Promise<Proyecto | void>;
  onActualizarProyecto?: (proyecto: Proyecto) => Promise<void>;
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
  onAbrirPanelPresupuestos?: () => void;
}

const ACCION_ESTADO_SERVICIO: Record<EstadoServicio, string> = {
  cotizado: 'Cotizar',
  aprobado: 'Aprobar',
  programado: 'Programar',
  en_campo: 'Iniciar campo',
  procesando: 'Enviar a proceso',
  entregado: 'Entregar',
  cobrado: 'Registrar cobro',
};

const PROJECT_COVER_IMAGES = [
  '/src/assets/images/project_cover_catastro_1795614820962.jpg',
  '/src/assets/images/project_cover_gnss_1795614821770.jpg',
  '/src/assets/images/project_cover_lidar_1795614822032.jpg',
  '/src/assets/images/auth_topography_hero_1795434660064.jpg',
];

const FOLDER_SURFACES = [
  { tab: 'bg-sky-100', body: 'bg-[#EFF6FF] border-sky-200/80' },
  { tab: 'bg-slate-200', body: 'bg-[#F1F5F9] border-slate-200/90' },
  { tab: 'bg-cyan-100', body: 'bg-[#F0F9FF] border-sky-200/70' },
  { tab: 'bg-slate-100', body: 'bg-[#F8FAFC] border-slate-200/90' },
];

const DEFAULT_CFG_PROY = crearConfiguracionInicialEmpresa('default');
const DEFAULT_SERVICIOS_PROY = obtenerServiciosVigentes(DEFAULT_CFG_PROY);
const DEFAULT_TERRENO_PROY = obtenerFactoresTerrenoVigentes(DEFAULT_CFG_PROY);

function getInitials(nombre: string): string {
  return nombre
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

async function compressPhoto(file: File): Promise<string> {
  return compressPhotoDataUrl(file, 960, 0.78);
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
  onActualizarProyecto,
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
  onAbrirPanelPresupuestos,
}) => {
  const canEdit = puedeCrearOEditarOperacion(rol);
  const canViewFinances = rol === 'admin' || rol === 'coordinador';
  const excelInputRef = useRef<HTMLInputElement>(null);
  const [presupuestoModalProyectoId, setPresupuestoModalProyectoId] = useState<string | null>(null);
  const serviciosActivos = useMemo(
    () => serviciosCatalogo.filter((s) => s.activo),
    [serviciosCatalogo]
  );
  const terrenoActivo = factoresTerreno ?? DEFAULT_TERRENO_PROY;

  const [viewMode, setViewMode] = useState<'tarjetas' | 'mapa' | 'lista'>('tarjetas');
  const [selectedProyectoId, setSelectedProyectoId] = useState<string | null>(null);
  const [clienteFolderFiltro, setClienteFolderFiltro] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState<EstadoServicio | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);
  const [failedCovers, setFailedCovers] = useState<Record<string, boolean>>({});
  const [loadedCovers, setLoadedCovers] = useState<Record<string, boolean>>({});

  // Modal Importar Excel
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelFileName, setExcelFileName] = useState('');
  const [excelRows, setExcelRows] = useState<ParsedExcelProjectRow[]>([]);
  const [excelWarnings, setExcelWarnings] = useState<string[]>([]);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isImportingExcel, setIsImportingExcel] = useState(false);
  const [excelImportBanner, setExcelImportBanner] = useState<string | null>(null);

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

  // Modal F4 agregar servicio a ruta
  const primerServicio = serviciosActivos[0] ?? DEFAULT_SERVICIOS_PROY[0];
  const [rutaParaServicio, setRutaParaServicio] = useState<Ruta | null>(null);
  const [srvTipoCodigo, setSrvTipoCodigo] = useState(primerServicio.codigo);
  const [srvNombre, setSrvNombre] = useState(primerServicio.nombre);
  const [srvCotizacion, setSrvCotizacion] = useState(String(primerServicio.precioBaseRD));

  // Modal transición de estado
  const [transicionTarget, setTransicionTarget] = useState<{
    servicio: Servicio;
    nuevoEstado: EstadoServicio;
  } | null>(null);
  const [fechaInput, setFechaInput] = useState(new Date().toISOString().slice(0, 10));
  const [montoCobradoInput, setMontoCobradoInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal Bitácora F8
  const [bitacoraServicio, setBitacoraServicio] = useState<Servicio | null>(null);
  const [notaBitacora, setNotaBitacora] = useState('');
  const [fotosBitacora, setFotosBitacora] = useState<string[]>([]);

  const gastosPorProyecto = useMemo(() => calcularGastoPorProyecto(viaticos), [viaticos]);

  const proyectosEnriquecidos = useMemo(() => {
    const rutasVisiblesIds = new Set(rutas.map((r) => r.id));
    return proyectos
      .filter((p) => {
        if (rol === 'tecnico') {
          return rutas.some((r) => r.proyectoId === p.id && rutasVisiblesIds.has(r.id));
        }
        return true;
      })
      .map((p) => {
        const cliente = clientes.find((c) => c.id === p.clienteId);
        const rutasProy = rutas.filter((r) => r.proyectoId === p.id);
        const srvsProy = servicios.filter((s) => rutasProy.some((r) => r.id === s.rutaId));
        const estadoActual = calcularEstadoProyecto(srvsProy, p.estado);
        const progresoPct = calcularProgresoProyecto(srvsProy, p);
        const gastoReal = gastosPorProyecto[p.id]?.totalEjecutadoRD || 0;
        const asigsProy = asignaciones.filter((a) =>
          rutasProy.some((r) => r.id === a.rutaId)
        );
        const cuadrillasProy = Array.from(
          new Set(asigsProy.map((a) => a.cuadrillaId))
        )
          .map((cId) => cuadrillas.find((c) => c.id === cId))
          .filter((c): c is Cuadrilla => Boolean(c));

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
          asigsProy,
          cuadrillasProy,
          estadoActual,
          progresoPct,
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

  const proyectosVisibles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return proyectosEnriquecidos.filter((item) => {
      if (clienteFolderFiltro !== 'ALL' && item.proyecto.clienteId !== clienteFolderFiltro) {
        return false;
      }
      const matchesEstado = estadoFiltro === 'ALL' || item.estadoActual === estadoFiltro;
      const matchesSearch =
        !q ||
        item.proyecto.nombre.toLowerCase().includes(q) ||
        item.proyecto.codigoContrato.toLowerCase().includes(q) ||
        (item.cliente?.nombre || '').toLowerCase().includes(q) ||
        item.rutasProy.some(
          (r) =>
            r.codigoParcela.toLowerCase().includes(q) ||
            r.nombre.toLowerCase().includes(q) ||
            r.provincia.toLowerCase().includes(q)
        );
      return matchesEstado && matchesSearch;
    });
  }, [proyectosEnriquecidos, clienteFolderFiltro, estadoFiltro, searchQuery]);

  // Carpetas por Cliente (inspirado en "Folders" del diseño de referencia)
  const carpetasClientes = useMemo(() => {
    const map = new Map<
      string,
      {
        cliente: Cliente;
        proyectosCount: number;
        rutasCount: number;
        inicialesEquipo: string[];
      }
    >();

    for (const item of proyectosEnriquecidos) {
      if (!item.cliente) continue;
      const cur = map.get(item.cliente.id) ?? {
        cliente: item.cliente,
        proyectosCount: 0,
        rutasCount: 0,
        inicialesEquipo: [],
      };
      cur.proyectosCount += 1;
      cur.rutasCount += item.rutasProy.length;
      item.cuadrillasProy.forEach((c) => {
        const jefe = personal.find((p) => p.id === c.jefeId);
        const ini = getInitials(jefe?.nombre || c.nombre);
        if (ini && !cur.inicialesEquipo.includes(ini)) {
          cur.inicialesEquipo.push(ini);
        }
      });
      map.set(item.cliente.id, cur);
    }
    return Array.from(map.values());
  }, [proyectosEnriquecidos, personal]);

  const selectedProyectoItem = useMemo(
    () =>
      selectedProyectoId
        ? proyectosEnriquecidos.find((p) => p.proyecto.id === selectedProyectoId) ?? null
        : null,
    [proyectosEnriquecidos, selectedProyectoId]
  );

  const kpis = useMemo(() => {
    const activos = proyectosEnriquecidos.filter((p) => p.estadoActual !== 'cobrado').length;
    const totalAreaM2 = rutas.reduce((acc, r) => acc + r.totalAreaM2, 0);
    const totalContratoRD = proyectos.reduce((acc, p) => acc + p.valorContratoRD, 0);
    const totalPresupViaticos = proyectos.reduce((acc, p) => acc + p.presupuestoViaticosRD, 0);
    const totalEjecutado = Object.values(gastosPorProyecto).reduce(
      (acc, item) => acc + item.totalEjecutadoRD,
      0
    );
    return { activos, totalAreaM2, totalContratoRD, totalPresupViaticos, totalEjecutado };
  }, [proyectosEnriquecidos, proyectos, rutas, gastosPorProyecto]);

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

  const handleSelectExcelFile = async (file: File) => {
    setExcelError(null);
    setExcelWarnings([]);
    setExcelRows([]);
    setExcelFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      const parsed = parseProjectsFromExcelBuffer(buffer);
      setExcelRows(parsed.rows);
      setExcelWarnings(parsed.warnings);
    } catch (err: unknown) {
      setExcelError(
        err instanceof Error ? err.message : 'No se pudo procesar el archivo de Excel.'
      );
    }
  };

  const handleConfirmExcelImport = async () => {
    const validRows = excelRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsImportingExcel(true);
    setExcelError(null);
    try {
      const clientesCache = [...clientes];
      let creados = 0;

      for (const row of validRows) {
        let clienteId = clientesCache[0]?.id || '';
        const normName = row.clienteNombre.toLowerCase();
        const normRnc = row.clienteRnc.toLowerCase();

        if (normName || normRnc) {
          const match = clientesCache.find(
            (c) =>
              (normRnc && c.rnc.toLowerCase() === normRnc) ||
              (normName && c.nombre.toLowerCase() === normName)
          );
          if (match) {
            clienteId = match.id;
          } else {
            const nuevoCliente = await onCrearCliente({
              nombre: row.clienteNombre || `Cliente ${row.codigoContrato}`,
              rnc: row.clienteRnc || 'N/A',
              contacto: row.clienteNombre || 'Contacto principal',
            });
            if (nuevoCliente && 'id' in nuevoCliente) {
              clientesCache.push(nuevoCliente);
              clienteId = nuevoCliente.id;
            }
          }
        } else if (!clienteId) {
          const fallbackCliente = await onCrearCliente({
            nombre: 'Cliente General',
            rnc: 'N/A',
            contacto: 'Administración',
          });
          if (fallbackCliente && 'id' in fallbackCliente) {
            clientesCache.push(fallbackCliente);
            clienteId = fallbackCliente.id;
          }
        }

        await onCrearProyecto({
          clienteId,
          nombre: row.nombre,
          codigoContrato: row.codigoContrato,
          presupuestoViaticosRD: row.presupuestoViaticosRD,
          valorContratoRD: row.valorContratoRD,
          estado: row.estado,
          progresoPct: row.progresoPct,
          notas: row.notas,
        });
        creados += 1;
      }

      setShowExcelModal(false);
      setExcelRows([]);
      setExcelWarnings([]);
      setExcelFileName('');
      setExcelImportBanner(`Se importaron ${creados} proyecto(s) desde Excel correctamente.`);
    } catch (err: unknown) {
      setExcelError(
        err instanceof Error ? err.message : 'Error al guardar los proyectos importados.'
      );
    } finally {
      setIsImportingExcel(false);
    }
  };

  const handleConfirmAgregarServicio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rutaParaServicio) return;
    setModalError(null);
    const svcCat = serviciosActivos.find((s) => s.codigo === srvTipoCodigo) ?? primerServicio;
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

  // Renderizador reutilizable de tarjeta completa de rutas & servicios (usado en Detalle y en Lista clásica)
  const renderProyectoRutasServicios = (
    item: (typeof proyectosEnriquecidos)[number]
  ) => {
    const { proyecto, rutasProy, srvsProy } = item;
    if (rutasProy.length === 0) {
      return (
        <div className="px-5 py-6 text-xs text-[#43474D] flex flex-wrap items-center justify-between gap-3">
          <span>Este proyecto aún no tiene rutas KMZ/GeoJSON cargadas.</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => onAbrirNuevaRutaKmz(proyecto.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#0284C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              Cargar archivo KMZ
            </button>
          )}
        </div>
      );
    }

    return (
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
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    Ver mapa
                  </button>
                  <button
                    type="button"
                    onClick={() => onCalcularRuta(ruta.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#334155] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                  >
                    <RouteIcon className="h-3.5 w-3.5" />
                    Cotizar ruta
                  </button>
                  <button
                    type="button"
                    onClick={() => onReportarViaticoEnRuta(ruta.id, proyecto.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0284C7] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0369A1] whitespace-nowrap shrink-0 min-h-[36px] transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Registrar viático
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setModalError(null);
                        setRutaParaServicio(ruta);
                      }}
                      className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[36px]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar servicio
                    </button>
                  )}
                </div>
              </div>

              {serviciosRuta.length > 0 && (
                <div className="rounded-xl border border-slate-200/80 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#F8FAFC] border-b border-slate-200/80 text-[11px] font-semibold uppercase tracking-wider text-[#475569]">
                        <th className="px-3.5 py-2.5">Servicio</th>
                        <th className="px-3.5 py-2.5 text-right">Cotización</th>
                        <th className="px-3.5 py-2.5">Fechas / Cobro</th>
                        <th className="px-3.5 py-2.5">Estado</th>
                        <th className="px-3.5 py-2.5 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
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
                          <tr key={srv.id} className="hover:bg-[#F8FAFC] transition-colors">
                            <td className="px-3.5 py-2.5 font-medium text-[#0F2942]">
                              {srv.nombre}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums">
                              {formatRD(srv.cotizacionRD)}
                            </td>
                            <td className="px-3.5 py-2.5 font-mono text-[11px] text-[#475569]">
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
                                    className={`rounded-xl px-2.5 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                      nextSt === 'cobrado'
                                        ? 'bg-[#15803D] text-white hover:bg-[#166534]'
                                        : 'border border-slate-200 bg-white text-[#0F2942] hover:bg-sky-50'
                                    }`}
                                  >
                                    {ACCION_ESTADO_SERVICIO[nextSt]}
                                  </button>
                                ))}

                                {puedeBitacora && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setModalError(null);
                                      setBitacoraServicio(srv);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#334155] hover:bg-slate-100 whitespace-nowrap shrink-0"
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
    );
  };

  if (isLoading && proyectos.length === 0) {
    return <ProyectosViewSkeleton />;
  }

  return (
    <section className="space-y-6">
      {actionError && (
        <div className="rounded-2xl border border-[#FCA5A5] bg-[#FEE2E2] px-4 py-3 text-xs font-medium text-[#93000A]">
          {actionError}
        </div>
      )}

      {excelImportBanner && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-[#15803D]">
          <span>{excelImportBanner}</span>
          <button
            type="button"
            onClick={() => setExcelImportBanner(null)}
            className="rounded-lg p-1 hover:bg-emerald-100"
            aria-label="Cerrar aviso"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* VISTA DEDICADA: DETALLE DE PROYECTO */}
      {selectedProyectoItem ? (
        (() => {
          const {
            proyecto,
            cliente,
            rutasProy,
            srvsProy,
            asigsProy,
            estadoActual,
            progresoPct,
            gastoReal,
            comparacionPresupuesto,
          } = selectedProyectoItem;
          const overBudget = comparacionPresupuesto
            ? comparacionPresupuesto.excedidoTotal
            : gastoReal > proyecto.presupuestoViaticosRD;
          const totalAreaM2 = rutasProy.reduce((acc, r) => acc + r.totalAreaM2, 0);
          const totalCobrado = srvsProy.reduce(
            (acc, s) =>
              acc +
              (s.estado === 'cobrado' && typeof s.montoCobradoRD === 'number'
                ? s.montoCobradoRD
                : 0),
            0
          );
          const viaticosProyecto = viaticos.filter(
            (v) =>
              v.repartos.some((r) => r.proyectoId === proyecto.id) ||
              rutasProy.some((r) => r.id === v.rutaId)
          );
          const coverIndex = Math.max(
            0,
            proyectos.findIndex((p) => p.id === proyecto.id)
          ) % PROJECT_COVER_IMAGES.length;
          const coverSrc = PROJECT_COVER_IMAGES[coverIndex];

          return (
            <div className="space-y-6">
              {/* Breadcrumb / Regreso */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedProyectoId(null)}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Volver a proyectos
                </button>

                <div className="flex flex-wrap items-center gap-2">
                  {rutasProy[0] && (
                    <button
                      type="button"
                      onClick={() => onVerRutaEnMapa(rutasProy[0].id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px]"
                    >
                      <Layers className="h-3.5 w-3.5 text-[#0284C7]" />
                      Ver cartografía
                    </button>
                  )}
                  {canViewFinances && (
                    <button
                      type="button"
                      onClick={() => setPresupuestoModalProyectoId(proyecto.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 min-h-[42px]"
                    >
                      <Calculator className="h-3.5 w-3.5 text-[#0284C7]" />
                      Ver presupuesto
                    </button>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => onAbrirNuevaRutaKmz(proyecto.id)}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] min-h-[42px] transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Agregar ruta KMZ
                    </button>
                  )}
                </div>
              </div>

              {/* Hero del Proyecto */}
              <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
                <div className="relative h-36 sm:h-44 bg-[#0F2942] overflow-hidden">
                  {!failedCovers[coverSrc] && (
                    <img
                      src={coverSrc}
                      alt={proyecto.nombre}
                      loading="eager"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedCovers((prev) => ({ ...prev, [coverSrc]: true }))
                      }
                      className="h-full w-full object-cover"
                    />
                  )}
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-gradient-to-t from-[#091A2C]/90 via-[#0F2942]/45 to-[#091A2C]/25"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end justify-between gap-3 text-white">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-sky-200 font-mono">
                        <span>{proyecto.codigoContrato}</span>
                        <span aria-hidden="true">·</span>
                        <span>Creado {proyecto.fechaCreacion}</span>
                        <span aria-hidden="true">·</span>
                        <span>{rutasProy.length} ruta(s) KMZ</span>
                      </div>
                      <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                        {proyecto.nombre}
                      </h2>
                    </div>
                    <div className="flex flex-col sm:items-end gap-1.5 shrink-0">
                      <WorkflowBadge status={estadoActual} />
                      <span className="font-mono text-xs font-bold text-sky-200 tabular-nums">
                        {progresoPct}% completado
                      </span>
                    </div>
                  </div>
                </div>

                {/* Info del cliente + progreso + notas + KPIs */}
                <div className="p-5 sm:p-6 space-y-5">
                  <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[#0F2942]">Estatus y Progreso General</span>
                        <WorkflowBadge status={estadoActual} />
                      </div>
                      <span className="font-mono text-sm font-bold text-[#0F2942] tabular-nums">
                        {progresoPct}%
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          progresoPct >= 100 ? 'bg-[#15803D]' : 'bg-[#0284C7]'
                        }`}
                        style={{ width: `${progresoPct}%` }}
                      />
                    </div>
                    {canEdit && onActualizarProyecto && (
                      srvsProy.length === 0 ? (
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                          <span className="text-[#475569]">
                            Ajuste manual de estatus/avance (sin servicios registrados aún):
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={proyecto.estado}
                              onChange={(e) => {
                                const nextEstado = e.target.value as EstadoServicio;
                                void onActualizarProyecto({
                                  ...proyecto,
                                  estado: nextEstado,
                                  progresoPct: PROGRESO_POR_ESTADO[nextEstado],
                                });
                              }}
                              aria-label="Cambiar estatus del proyecto"
                              className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-[#0F2942]"
                            >
                              {ESTADOS_SERVICIO.map((st) => (
                                <option key={st} value={st}>
                                  {ETIQUETA_ESTADO[st]}
                                </option>
                              ))}
                            </select>
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step={5}
                                value={progresoPct}
                                onChange={(e) => {
                                  const val = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                                  void onActualizarProyecto({
                                    ...proyecto,
                                    progresoPct: val,
                                  });
                                }}
                                aria-label="Porcentaje de progreso"
                                className="w-20 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 font-mono text-xs font-bold text-[#0F2942] tabular-nums"
                              />
                              <span className="font-mono text-xs text-[#475569]">%</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="text-[11px] text-[#64748B]">
                          Calculado automáticamente según el avance de {srvsProy.length} servicio(s) activo(s).
                        </div>
                      )
                    )}
                  </div>

                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-[11px] font-semibold text-[#475569]">Cliente contratante</div>
                      <div className="text-sm font-bold text-[#0F2942]">
                        {cliente ? cliente.nombre : 'Cliente sin asignar'}
                      </div>
                      {cliente && (
                        <div className="text-[#475569]">
                          RNC {cliente.rnc} · Contacto: {cliente.contacto}
                          {cliente.telefono ? ` · ${cliente.telefono}` : ''}
                        </div>
                      )}
                    </div>
                    {proyecto.notas && (
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] px-3.5 py-2.5 max-w-md text-[#334155]">
                        {proyecto.notas}
                      </div>
                    )}
                  </div>

                  {canViewFinances && comparacionPresupuesto ? (
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Valor de contrato</div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                          {formatRD(proyecto.valorContratoRD, moneda)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Ejecutado / Planificado</div>
                        <div
                          className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                            overBudget ? 'text-[#DC2626]' : 'text-[#0F2942]'
                          }`}
                        >
                          {formatRD(comparacionPresupuesto.totalEjecutadoRD, moneda)}
                        </div>
                        <div className="text-[11px] font-mono text-[#475569]">
                          de {formatRD(comparacionPresupuesto.totalPlanificadoRD, moneda)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Margen real</div>
                        <div
                          className={`mt-1 font-mono text-lg font-bold tabular-nums ${
                            comparacionPresupuesto.margenRealRD < 0
                              ? 'text-[#DC2626]'
                              : 'text-[#15803D]'
                          }`}
                        >
                          {formatRD(comparacionPresupuesto.margenRealRD, moneda)}
                        </div>
                        {comparacionPresupuesto.margenRealPct !== null && (
                          <div className="text-[11px] font-mono text-[#475569]">
                            {comparacionPresupuesto.margenRealPct}% margen
                          </div>
                        )}
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Total cobrado & Área</div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#15803D] tabular-nums">
                          {formatRD(totalCobrado, moneda)}
                        </div>
                        <div className="text-[11px] font-mono text-[#475569]">
                          {formatArea(totalAreaM2, areaUnit)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Rutas asignadas</div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                          {rutasProy.length}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Superficie total</div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#0284C7] tabular-nums">
                          {formatArea(totalAreaM2, areaUnit)}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-4">
                        <div className="text-[11px] text-[#475569]">Servicios activos</div>
                        <div className="mt-1 font-mono text-lg font-bold text-[#0F2942] tabular-nums">
                          {srvsProy.length}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Rutas y Servicios dentro del Proyecto */}
              <div className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden">
                <div className="border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-3.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-[#0F2942]">
                    Rutas KMZ y Servicios ({rutasProy.length})
                  </h3>
                  <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5">
                    {(['m2', 'ha', 'tareas'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => onChangeAreaUnit(u)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
                          areaUnit === u
                            ? 'bg-[#0F2942] text-white'
                            : 'text-[#475569] hover:text-[#0F2942]'
                        }`}
                      >
                        {u === 'm2' ? 'm²' : u === 'ha' ? 'ha' : 'Tareas'}
                      </button>
                    ))}
                  </div>
                </div>
                {renderProyectoRutasServicios(selectedProyectoItem)}
              </div>

              {/* Cuadrillas programadas y Viáticos del Proyecto */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                    <Users className="h-4 w-4 text-[#0284C7]" />
                    Cuadrillas asignadas ({asigsProy.length})
                  </div>
                  {asigsProy.length === 0 ? (
                    <p className="text-xs text-[#475569]">
                      Sin asignaciones de cuadrilla programadas todavía para las rutas de este proyecto.
                    </p>
                  ) : (
                    <div className="space-y-2.5 text-xs">
                      {asigsProy.map((asig) => {
                        const cuad = cuadrillas.find((c) => c.id === asig.cuadrillaId);
                        const ruta = rutasProy.find((r) => r.id === asig.rutaId);
                        return (
                          <div
                            key={asig.id}
                            className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3 flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-[#0F2942] truncate">
                                {cuad?.nombre || asig.cuadrillaId}
                              </div>
                              <div className="text-[11px] text-[#475569] truncate">
                                {ruta?.codigoParcela || asig.rutaId} · {ruta?.provincia || ''}
                              </div>
                            </div>
                            <div className="font-mono text-[11px] font-semibold text-[#0284C7] shrink-0 tabular-nums">
                              {asig.fechaInicio} → {asig.fechaFin}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
                    <Receipt className="h-4 w-4 text-[#0284C7]" />
                    Viáticos vinculados ({viaticosProyecto.length})
                  </div>
                  {viaticosProyecto.length === 0 ? (
                    <p className="text-xs text-[#475569]">
                      No hay viáticos registrados aún para este proyecto.
                    </p>
                  ) : (
                    <div className="space-y-2.5 text-xs max-h-60 overflow-y-auto pr-1">
                      {viaticosProyecto.slice(0, 6).map((v) => (
                        <div
                          key={v.id}
                          className="rounded-xl border border-slate-200/70 bg-[#F8FAFC] p-3 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-[#0F2942] truncate">{v.comercio}</div>
                            <div className="font-mono text-[11px] text-[#475569]">
                              {v.fechaIso} · {v.categoria} · {v.estadoAprobacion}
                            </div>
                          </div>
                          <div className="font-mono font-bold text-[#0F2942] shrink-0 tabular-nums">
                            {formatRD(v.montoRD, moneda)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        <>
          {/* Encabezado Principal + Selector de Modo de Vista */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl sm:text-[26px] font-bold tracking-tight text-[#0F2942]">
                Proyectos y Contratos
              </h2>
              <p className="text-sm text-[#475569] mt-0.5">
                Cartera por cliente, ubicación geográfica de parcelas, detalle operativo y bitácoras.
              </p>
            </div>

            <div className="inline-flex rounded-2xl border border-slate-200/80 bg-white p-1 shadow-xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode('tarjetas')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'tarjetas'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Tarjetas
              </button>
              <button
                type="button"
                onClick={() => setViewMode('mapa')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'mapa'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <MapIcon className="h-3.5 w-3.5" />
                Mapa de ubicación
              </button>
              <button
                type="button"
                onClick={() => setViewMode('lista')}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  viewMode === 'lista'
                    ? 'bg-[#0F2942] text-white shadow-sm'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                <List className="h-3.5 w-3.5" />
                Lista detallada
              </button>
            </div>
          </div>

          {/* KPI Strip + Recharts Chart */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
            <div className="xl:col-span-5 grid grid-cols-2 gap-4">
              <div className="rounded-2xl bg-gradient-to-br from-[#0F2942] to-[#0284C7] p-5 text-white shadow-sm flex flex-col justify-between">
                <div className="text-xs font-medium text-sky-100">Proyectos Activos</div>
                <div className="mt-2 flex items-baseline justify-between gap-2">
                  <span className="font-mono text-2xl font-bold text-white tabular-nums">
                    {kpis.activos}
                  </span>
                  <span className="text-xs text-sky-100/90">{proyectos.length} totales</span>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between">
                <div className="text-xs font-medium text-[#475569]">Superficie en Rutas</div>
                <div className="mt-2 font-mono text-xl font-bold text-[#0284C7] tabular-nums">
                  {formatArea(kpis.totalAreaM2, areaUnit)}
                </div>
              </div>

              {canViewFinances && (
                <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between">
                  <div className="text-xs font-medium text-[#475569]">Viáticos Ejecutados</div>
                  <div>
                    <div className="mt-1 font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums truncate">
                      {formatRD(kpis.totalEjecutado)}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#475569] tabular-nums">
                      Presup.: {formatRD(kpis.totalPresupViaticos)}
                    </div>
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-slate-200/90 bg-white p-5 flex flex-col justify-between">
                <div className="text-xs font-medium text-[#475569]">
                  {canViewFinances ? 'Valor en Contratos' : 'Cola Offline / Sync'}
                </div>
                {canViewFinances ? (
                  <div>
                    <div className="mt-1 font-mono text-lg sm:text-xl font-bold text-[#0F2942] tabular-nums truncate">
                      {formatRD(kpis.totalContratoRD, moneda)}
                    </div>
                    <div className="mt-0.5 font-mono text-[11px] text-[#475569] tabular-nums">
                      {rutas.length} ruta(s) · {pendingSyncCount === 0 ? 'Sync al día' : `${pendingSyncCount} pend.`}
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex items-baseline justify-between">
                    <span
                      className={`font-mono text-2xl font-bold tabular-nums ${
                        pendingSyncCount > 0 ? 'text-[#B45309]' : 'text-[#15803D]'
                      }`}
                    >
                      {pendingSyncCount}
                    </span>
                    <span className="text-xs text-[#475569]">
                      {pendingSyncCount === 0 ? 'Al día' : 'Pendientes'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {canViewFinances && (
              <div className="xl:col-span-7 min-w-0">
                <ViaticosComparisonChart
                  proyectos={proyectos}
                  viaticos={viaticos}
                  onSelectProyecto={(proyId) => setSelectedProyectoId(proyId)}
                />
              </div>
            )}
          </div>

          {/* Barra de búsqueda y acciones rápidas */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar cliente, contrato, ruta KMZ o provincia..."
                className="w-full rounded-xl border border-slate-200 bg-[#F8FAFC] pl-10 pr-3 py-2 text-xs text-[#0F2942] focus:border-[#0284C7] focus:bg-white focus:outline-none min-h-[42px]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={estadoFiltro}
                onChange={(e) => setEstadoFiltro(e.target.value as EstadoServicio | 'ALL')}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-[#334155] min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                aria-label="Filtrar por estado"
              >
                <option value="ALL">Todos los estados</option>
                {ESTADOS_SERVICIO.map((st) => (
                  <option key={st} value={st}>
                    {ETIQUETA_ESTADO[st]}
                  </option>
                ))}
              </select>

              <div className="inline-flex rounded-2xl border border-slate-200/70 bg-[#F1F5F9] p-1">
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
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 min-h-[34px] ${
                      areaUnit === u.id
                        ? 'bg-[#0F2942] text-white shadow-sm'
                        : 'text-[#475569] hover:text-[#0F2942]'
                    }`}
                  >
                    {u.label}
                  </button>
                ))}
              </div>

              {canViewFinances && onAbrirPanelPresupuestos && (
                <button
                  type="button"
                  onClick={onAbrirPanelPresupuestos}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
                >
                  <Calculator className="h-3.5 w-3.5 text-[#0284C7]" />
                  Presupuestos
                </button>
              )}

              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setExcelError(null);
                      setExcelWarnings([]);
                      setExcelRows([]);
                      setExcelFileName('');
                      setShowExcelModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5 text-[#15803D]" />
                    Importar Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => onAbrirNuevaRutaKmz(proyectosVisibles[0]?.proyecto.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#0284C7]" />
                    Importar KMZ
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setShowClienteModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[42px]"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    Nuevo cliente
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setModalError(null);
                      setProyClienteId(clientes[0]?.id || '');
                      setShowProyectoModal(true);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] whitespace-nowrap shrink-0 min-h-[42px] transition-colors"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    Nuevo proyecto
                  </button>
                </>
              )}
            </div>
          </div>

          {/* MODO MAPA DE UBICACIÓN (inspirado en foto 2) */}
          {viewMode === 'mapa' ? (
            <ProyectosLocationMap
              rol={rol}
              items={proyectosVisibles}
              areaUnit={areaUnit}
              moneda={moneda}
              onSelectProyectoDetalle={(proyId) => setSelectedProyectoId(proyId)}
              onVerRutaEnMapa={onVerRutaEnMapa}
              onCalcularRuta={onCalcularRuta}
            />
          ) : viewMode === 'tarjetas' ? (
            /* MODO TARJETAS (inspirado en foto 1: Carpetas por Cliente + Cuadrícula de Proyectos) */
            <div className="space-y-6">
              {/* Sección Carpetas por Cliente */}
              {carpetasClientes.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#0F2942]">
                        Carpetas por Cliente
                      </h3>
                      <span className="font-mono text-xs text-[#475569]">
                        ({carpetasClientes.length})
                      </span>
                    </div>
                    {clienteFolderFiltro !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setClienteFolderFiltro('ALL')}
                        className="text-xs font-semibold text-[#0284C7] hover:underline"
                      >
                        Ver todos los clientes
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {carpetasClientes.map((carpeta, idx) => {
                      const style = FOLDER_SURFACES[idx % FOLDER_SURFACES.length];
                      const isActive = clienteFolderFiltro === carpeta.cliente.id;
                      return (
                        <button
                          key={carpeta.cliente.id}
                          type="button"
                          onClick={() =>
                            setClienteFolderFiltro(
                              isActive ? 'ALL' : carpeta.cliente.id
                            )
                          }
                          className="group text-left focus:outline-none"
                        >
                          {/* Pestaña superior de carpeta */}
                          <div
                            className={`ml-3 h-3 w-24 rounded-t-xl transition-colors ${
                              isActive ? 'bg-[#0284C7]' : style.tab
                            }`}
                          />
                          <div
                            className={`rounded-2xl rounded-tl-none border p-4 space-y-4 transition-all ${
                              isActive
                                ? 'border-[#0284C7] bg-[#0F2942] text-white shadow-sm'
                                : `${style.body} text-[#0F2942] group-hover:border-[#0284C7]`
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-bold truncate">
                                  {carpeta.cliente.nombre}
                                </div>
                                <div
                                  className={`font-mono text-[11px] truncate ${
                                    isActive ? 'text-sky-200' : 'text-[#475569]'
                                  }`}
                                >
                                  RNC {carpeta.cliente.rnc}
                                </div>
                              </div>
                              <FolderKanban
                                className={`h-4 w-4 shrink-0 ${
                                  isActive ? 'text-[#38BDF8]' : 'text-[#0284C7]'
                                }`}
                              />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <div className="flex -space-x-1.5">
                                {carpeta.inicialesEquipo.length > 0 ? (
                                  carpeta.inicialesEquipo.slice(0, 3).map((ini) => (
                                    <span
                                      key={ini}
                                      className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                                        isActive
                                          ? 'border-[#0F2942] bg-[#0284C7] text-white'
                                          : 'border-white bg-[#0F2942] text-white'
                                      }`}
                                    >
                                      {ini}
                                    </span>
                                  ))
                                ) : (
                                  <span
                                    className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-bold ${
                                      isActive
                                        ? 'border-[#0F2942] bg-white/15 text-white'
                                        : 'border-white bg-slate-200 text-[#0F2942]'
                                    }`}
                                  >
                                    {getInitials(carpeta.cliente.nombre)}
                                  </span>
                                )}
                              </div>
                              <span
                                className={`text-[11px] font-semibold tabular-nums ${
                                  isActive ? 'text-sky-100' : 'text-[#475569]'
                                }`}
                              >
                                {carpeta.proyectosCount} proy. · {carpeta.rutasCount} ruta(s)
                              </span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sección Proyectos (inspirada en "Workflows" de la foto 1) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-[#0F2942]">Proyectos</h3>
                    <span className="font-mono text-xs text-[#475569]">
                      ({proyectosVisibles.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setViewMode('mapa')}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0284C7] hover:underline"
                  >
                    <MapPin className="h-3.5 w-3.5" />
                    Ver ubicación en mapa
                  </button>
                </div>

                {proyectosVisibles.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-10 text-center text-xs text-[#475569]">
                    {rol === 'tecnico'
                      ? 'No tienes rutas asignadas en tus cuadrillas activas todavía.'
                      : 'No hay proyectos que coincidan con los filtros seleccionados.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {proyectosVisibles.map((item, idx) => {
                      const {
                        proyecto,
                        cliente,
                        rutasProy,
                        cuadrillasProy,
                        estadoActual,
                        progresoPct,
                      } = item;
                      const coverSrc =
                        PROJECT_COVER_IMAGES[idx % PROJECT_COVER_IMAGES.length];
                      const isCoverLoaded = Boolean(loadedCovers[coverSrc]);
                      const totalAreaM2 = rutasProy.reduce(
                        (acc, r) => acc + r.totalAreaM2,
                        0
                      );
                      const provPrincipal =
                        rutasProy[0]?.provincia || 'Sin rutas KMZ';

                      return (
                        <div
                          key={proyecto.id}
                          onClick={() => setSelectedProyectoId(proyecto.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              setSelectedProyectoId(proyecto.id);
                            }
                          }}
                          className="group rounded-2xl border border-slate-200/90 bg-white overflow-hidden cursor-pointer hover:border-[#0284C7] hover:shadow-md transition-all flex flex-col justify-between"
                        >
                          {/* Cabecera visual fotográfica optimizada */}
                          <div className="relative h-28 bg-[#0F2942] overflow-hidden">
                            {!isCoverLoaded && !failedCovers[coverSrc] && (
                              <div
                                aria-hidden="true"
                                className="absolute inset-0 animate-pulse bg-gradient-to-br from-[#0F2942] to-[#1E3A5F]"
                              />
                            )}
                            {!failedCovers[coverSrc] && (
                              <img
                                src={coverSrc}
                                alt={proyecto.nombre}
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onLoad={() =>
                                  setLoadedCovers((prev) => ({
                                    ...prev,
                                    [coverSrc]: true,
                                  }))
                                }
                                onError={() =>
                                  setFailedCovers((prev) => ({
                                    ...prev,
                                    [coverSrc]: true,
                                  }))
                                }
                                className={`h-full w-full object-cover group-hover:scale-105 transition-all duration-300 ${
                                  isCoverLoaded ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                            )}
                            <div
                              aria-hidden="true"
                              className="absolute inset-0 bg-gradient-to-t from-[#091A2C]/65 via-[#0F2942]/20 to-transparent"
                            />
                            <div className="absolute top-3 right-3 flex items-center gap-1.5">
                              {canEdit && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAbrirNuevaRutaKmz(proyecto.id);
                                  }}
                                  title="Agregar ruta KMZ"
                                  className="inline-flex h-8 items-center gap-1 rounded-full bg-white/95 px-2.5 text-[11px] font-semibold text-[#0F2942] shadow-sm hover:bg-[#0284C7] hover:text-white transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                  KMZ
                                </button>
                              )}
                              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-[#0F2942] shadow-sm group-hover:bg-[#0284C7] group-hover:text-white transition-colors">
                                <ArrowUpRight className="h-3.5 w-3.5" />
                              </span>
                            </div>
                          </div>

                          {/* Cuerpo superpuesto limpio estilo tarjeta de flujo */}
                          <div className="-mt-4 relative rounded-t-2xl bg-white p-5 flex-1 flex flex-col justify-between space-y-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-1.5 text-[11px] text-[#475569] min-w-0 truncate">
                                  <span className="font-mono font-bold text-[#0284C7] shrink-0">
                                    {proyecto.codigoContrato}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{provPrincipal}</span>
                                </div>
                                <WorkflowBadge status={estadoActual} />
                              </div>
                              <h4 className="text-base font-bold tracking-tight text-[#0F2942] line-clamp-1 group-hover:text-[#0284C7] transition-colors">
                                {proyecto.nombre}
                              </h4>
                              <p className="text-xs text-[#475569] truncate">
                                {cliente ? cliente.nombre : 'Cliente sin asignar'}
                              </p>
                            </div>

                            {/* Barra de progreso del proyecto */}
                            <div className="space-y-1">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-medium text-[#475569]">Progreso</span>
                                <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                                  {progresoPct}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    progresoPct >= 100 ? 'bg-[#15803D]' : 'bg-[#0284C7]'
                                  }`}
                                  style={{ width: `${progresoPct}%` }}
                                />
                              </div>
                            </div>

                            <div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="flex -space-x-1.5">
                                  {cuadrillasProy.length > 0 ? (
                                    cuadrillasProy.slice(0, 3).map((c) => {
                                      const jefe = personal.find((p) => p.id === c.jefeId);
                                      return (
                                        <span
                                          key={c.id}
                                          title={c.nombre}
                                          className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-[#0F2942] text-[10px] font-bold text-white"
                                        >
                                          {getInitials(jefe?.nombre || c.nombre)}
                                        </span>
                                      );
                                    })
                                  ) : (
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white bg-slate-100 text-[10px] font-bold text-[#475569]">
                                      {rutasProy.length}R
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-mono text-[#475569] tabular-nums truncate">
                                  {rutasProy.length} ruta(s) ·{' '}
                                  {formatArea(totalAreaM2, areaUnit)}
                                </span>
                              </div>

                              {canViewFinances && (
                                <span className="font-mono text-xs font-bold text-[#0F2942] tabular-nums shrink-0">
                                  {formatRD(proyecto.valorContratoRD, moneda).replace('.00', '')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ) : proyectosVisibles.length === 0 ? (
            <div className="rounded-2xl border border-slate-200/90 bg-white p-10 text-center text-xs text-[#475569]">
              {rol === 'tecnico'
                ? 'No tienes rutas asignadas en tus cuadrillas activas todavía.'
                : 'No hay proyectos que coincidan con los filtros seleccionados.'}
            </div>
          ) : (
            /* MODO LISTA DETALLADA */
            <div className="space-y-5">
              {proyectosVisibles.map((item) => {
                const {
                  proyecto,
                  cliente,
                  srvsProy,
                  estadoActual,
                  progresoPct,
                  gastoReal,
                  comparacionPresupuesto,
                } = item;
                const overBudget = comparacionPresupuesto
                  ? comparacionPresupuesto.excedidoTotal
                  : gastoReal > proyecto.presupuestoViaticosRD;
                return (
                  <div
                    key={proyecto.id}
                    className="rounded-2xl border border-slate-200/90 bg-white overflow-hidden"
                  >
                    <div className="border-b border-slate-200/80 bg-[#F8FAFC] px-5 py-4 space-y-3">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-mono font-bold text-[#0284C7]">
                              {proyecto.codigoContrato}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <WorkflowBadge status={estadoActual} />
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="font-mono font-bold text-[#0F2942] tabular-nums">
                              {progresoPct}% progreso
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            <span className="text-[#475569]">
                              {cliente
                                ? `${cliente.nombre} (RNC ${cliente.rnc})`
                                : 'Cliente sin asignar'}
                            </span>
                          </div>
                          <h3 className="text-base font-bold tracking-tight text-[#0F2942] text-balance">
                            {proyecto.nombre}
                          </h3>
                          <div className="flex items-center gap-2.5 max-w-sm">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  progresoPct >= 100 ? 'bg-[#15803D]' : 'bg-[#0284C7]'
                                }`}
                                style={{ width: `${progresoPct}%` }}
                              />
                            </div>
                            <span className="font-mono text-[11px] font-semibold text-[#475569] tabular-nums">
                              {progresoPct}%
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setSelectedProyectoId(proyecto.id)}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#0284C7] whitespace-nowrap shrink-0 min-h-[40px] transition-colors"
                          >
                            Ver detalle
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </button>
                          {canViewFinances && (
                            <button
                              type="button"
                              onClick={() => setPresupuestoModalProyectoId(proyecto.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[40px]"
                            >
                              <Calculator className="h-3.5 w-3.5 text-[#0284C7]" />
                              Presupuesto
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => onAbrirNuevaRutaKmz(proyecto.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-[#0284C7] bg-white px-3.5 py-2 text-xs font-semibold text-[#0284C7] hover:bg-sky-50 whitespace-nowrap shrink-0 min-h-[40px]"
                            >
                              <Plus className="h-3.5 w-3.5" />
                              Agregar ruta KMZ
                            </button>
                          )}
                        </div>
                      </div>

                      {canViewFinances && comparacionPresupuesto && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-200/80 text-xs">
                          <div>
                            <div className="text-[11px] text-[#43474D]">Valor de contrato</div>
                            <div className="font-mono font-bold text-[#0D1C2F] tabular-nums">
                              {formatRD(proyecto.valorContratoRD, moneda)}
                            </div>
                          </div>
                          <div>
                            <div className="text-[11px] text-[#43474D]">
                              Costo ejecutado / planificado
                            </div>
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
                          <div>
                            <div className="text-[11px] text-[#43474D]">Margen real</div>
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
                          <div>
                            <div className="text-[11px] text-[#43474D]">Total cobrado</div>
                            <div className="font-mono font-bold text-[#15803D] tabular-nums">
                              {formatRD(
                                srvsProy.reduce(
                                  (acc, s) =>
                                    acc +
                                    (s.estado === 'cobrado' &&
                                    typeof s.montoCobradoRD === 'number'
                                      ? s.montoCobradoRD
                                      : 0),
                                  0
                                ),
                                moneda
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                    {renderProyectoRutasServicios(item)}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* MODAL F2: NUEVO CLIENTE */}
      {showClienteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0F2942]">Registrar nuevo cliente</h3>
              <button
                type="button"
                onClick={() => setShowClienteModal(false)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 min-h-[42px] focus:border-[#0284C7] focus:outline-none"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Persona de Contacto</label>
                <input
                  type="text"
                  required
                  value={cliContacto}
                  onChange={(e) => setCliContacto(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Teléfono</label>
                <input
                  type="text"
                  value={cliTelefono}
                  onChange={(e) => setCliTelefono(e.target.value)}
                  placeholder="809-555-0000"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px] focus:border-[#0284C7] focus:outline-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClienteModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold min-h-[42px] hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[42px] transition-colors"
                >
                  Registrar cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL IMPORTAR PROYECTOS DESDE EXCEL */}
      {showExcelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-[#15803D]">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0F2942]">
                    Importar Proyectos desde Excel
                  </h3>
                  <p className="text-[11px] text-[#475569]">
                    Carga archivos .xlsx, .xls o .csv con estatus, avance %, clientes y montos.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowExcelModal(false)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4 flex-1 text-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-3.5">
                <div className="space-y-0.5">
                  <div className="font-semibold text-[#0F2942]">
                    ¿Necesitas la estructura recomendada?
                  </div>
                  <div className="text-[11px] text-[#475569]">
                    Columnas aceptadas: Código Contrato, Nombre, Cliente, RNC, Valor Contrato, Viáticos, Estado y Progreso (%).
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => downloadProjectsExcelTemplate()}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 font-semibold text-[#0F2942] hover:bg-slate-50 whitespace-nowrap shrink-0 min-h-[40px]"
                >
                  <Download className="h-3.5 w-3.5 text-[#0284C7]" />
                  Descargar plantilla .xlsx
                </button>
              </div>

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleSelectExcelFile(f);
                }}
                onClick={() => excelInputRef.current?.click()}
                className="cursor-pointer rounded-2xl border-2 border-dashed border-[#0284C7]/70 bg-[#F8FAFC] p-6 text-center hover:bg-[#EFF6FF] transition-colors"
              >
                <input
                  ref={excelInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleSelectExcelFile(f);
                    e.target.value = '';
                  }}
                />
                <UploadCloud className="mx-auto h-7 w-7 text-[#0284C7]" />
                <div className="mt-2 font-bold text-[#0F2942]">
                  {excelFileName || 'Haz clic o arrastra tu archivo Excel (.xlsx, .xls, .csv)'}
                </div>
                <div className="mt-0.5 text-[11px] text-[#475569]">
                  Los clientes nuevos se registran automáticamente si no existen en tu catálogo.
                </div>
              </div>

              {excelError && (
                <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-3.5 py-2.5 text-xs font-medium text-[#93000A]">
                  {excelError}
                </div>
              )}

              {excelWarnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] text-[#B45309] space-y-1">
                  <div className="font-bold">Ajustes detectados en la hoja:</div>
                  {excelWarnings.slice(0, 5).map((w, idx) => (
                    <div key={idx}>• {w}</div>
                  ))}
                  {excelWarnings.length > 5 && (
                    <div>• y {excelWarnings.length - 5} aviso(s) adicional(es).</div>
                  )}
                </div>
              )}

              {excelRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-[#0F2942]">
                      Vista previa ({excelRows.filter((r) => r.isValid).length} válido(s) de{' '}
                      {excelRows.length})
                    </span>
                    <span className="text-[11px] text-[#475569]">
                      Verifica contrato, estatus y % de avance antes de confirmar.
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[11px] font-semibold text-[#475569]">
                          <th className="px-3 py-2">Fila</th>
                          <th className="px-3 py-2">Contrato</th>
                          <th className="px-3 py-2">Proyecto</th>
                          <th className="px-3 py-2">Cliente</th>
                          <th className="px-3 py-2 text-right">Contrato RD$</th>
                          <th className="px-3 py-2 text-right">Viáticos RD$</th>
                          <th className="px-3 py-2">Estado</th>
                          <th className="px-3 py-2 text-right">Progreso</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {excelRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={row.isValid ? 'bg-white' : 'bg-rose-50/70'}
                          >
                            <td className="px-3 py-2 font-mono text-[#64748B] tabular-nums">
                              {row.rowNumber}
                            </td>
                            <td className="px-3 py-2 font-mono font-semibold text-[#0284C7] whitespace-nowrap">
                              {row.codigoContrato}
                            </td>
                            <td className="px-3 py-2 font-semibold text-[#0F2942]">
                              <div>{row.nombre || '—'}</div>
                              {row.errors.length > 0 && (
                                <div className="text-[11px] font-normal text-[#DC2626]">
                                  {row.errors.join(' ')}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-[#334155]">
                              {row.clienteNombre || 'Cliente General'}
                              {row.clienteRnc ? (
                                <span className="ml-1 font-mono text-[10px] text-[#64748B]">
                                  ({row.clienteRnc})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatRD(row.valorContratoRD, moneda).replace('.00', '')}
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">
                              {formatRD(row.presupuestoViaticosRD, moneda).replace('.00', '')}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <WorkflowBadge status={row.estado} />
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-[#0F2942] tabular-nums">
                              {row.progresoPct}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-slate-200 px-5 py-3.5 text-xs">
              <button
                type="button"
                onClick={() => setShowExcelModal(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 font-semibold text-[#334155] hover:bg-slate-50 min-h-[42px]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  isImportingExcel || excelRows.filter((r) => r.isValid).length === 0
                }
                onClick={() => void handleConfirmExcelImport()}
                className="inline-flex items-center gap-2 rounded-xl bg-[#0F2942] px-4 py-2 font-bold text-white hover:bg-[#0284C7] disabled:opacity-50 min-h-[42px] whitespace-nowrap transition-colors"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {isImportingExcel
                  ? 'Importando...'
                  : `Importar ${excelRows.filter((r) => r.isValid).length} proyecto(s)`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL NUEVO PROYECTO */}
      {showProyectoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0F2942]">Nuevo proyecto</h3>
              <button
                type="button"
                onClick={() => setShowProyectoModal(false)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {modalError && (
              <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
                {modalError}
              </div>
            )}
            <form onSubmit={handleConfirmProyecto} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Cliente</label>
                <select
                  value={proyClienteId}
                  onChange={(e) => setProyClienteId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 min-h-[42px]"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 min-h-[42px]"
                />
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Código de Contrato</label>
                <input
                  type="text"
                  required
                  value={proyCodigo}
                  onChange={(e) => setProyCodigo(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-[#334155] mb-1">Notas</label>
                <input
                  type="text"
                  value={proyNotas}
                  onChange={(e) => setProyNotas(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 min-h-[42px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowProyectoModal(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold min-h-[42px] hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[42px] transition-colors"
                >
                  Crear proyecto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL F4: NUEVO SERVICIO EN RUTA */}
      {rutaParaServicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-sm font-bold text-[#0F2942]">
                Añadir Servicio a {rutaParaServicio.codigoParcela}
              </h3>
              <button
                type="button"
                onClick={() => setRutaParaServicio(null)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 min-h-[42px]"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 min-h-[42px]"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRutaParaServicio(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold min-h-[42px] hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[42px] transition-colors"
                >
                  Agregar servicio
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL TRANSICIÓN DE ESTADO */}
      {transicionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-[#0F2942]">
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
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {modalError && (
              <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono min-h-[42px]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setTransicionTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 font-semibold min-h-[42px] hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[42px] transition-colors"
                >
                  Confirmar transición
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL BITÁCORA */}
      {bitacoraServicio && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0F2942]/65 backdrop-blur-[2px] p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-[#0F2942]">
                  Bitácora de Campo — {bitacoraServicio.nombre}
                </h3>
                <p className="text-[11px] text-[#475569]">
                  Registra avances, puntos monumentados y evidencia fotográfica.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBitacoraServicio(null)}
                className="rounded-xl p-1.5 text-[#475569] hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-5 space-y-4 flex-1">
              {modalError && (
                <div className="rounded-xl border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-xs text-[#93000A]">
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
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:border-[#0284C7] focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer rounded-xl border border-slate-200 bg-[#F8FAFC] px-3 py-2 font-semibold text-[#0F2942] hover:bg-sky-50 min-h-[42px]">
                    <Camera className="h-3.5 w-3.5 text-[#0284C7]" />
                    Adjuntar foto ({fotosBitacora.length}/3)
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
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-4 py-2 font-semibold text-white hover:bg-[#0284C7] min-h-[42px] whitespace-nowrap shrink-0 transition-colors"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" />
                    Registrar nota
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
                  <p className="text-xs text-[#475569]">Aún no hay entradas en esta bitácora.</p>
                ) : (
                  bitacorasDelServicio.map((b) => (
                    <div
                      key={b.id}
                      className="rounded-xl border border-slate-200/80 bg-[#F8FAFC] p-3.5 space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#475569]">
                        <span className="font-semibold text-[#0F2942]">{b.autorNombre}</span>
                        <span className="font-mono">{b.fechaAST}</span>
                      </div>
                      <p className="text-[#0F2942]">{b.nota}</p>
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
