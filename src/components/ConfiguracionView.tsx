import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Building2,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Compass,
  FlaskConical,
  HelpCircle,
  Layers,
  Plus,
  Receipt,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Users,
} from 'lucide-react';
import {
  CATEGORIAS_VIATICO,
  ETIQUETA_EJEMPLO_CONFIRMAR,
  FUENTES_KM_RENDIMIENTO,
  MONEDAS_SUGERIDAS,
  ZONAS_HORARIAS_SUGERIDAS,
  obtenerCombustiblesVigentes,
  obtenerFactoresTerrenoVigentes,
  obtenerFechaHoyAST,
  obtenerReglasViaticosVigentes,
  obtenerRendimientoConfigVigente,
  obtenerServiciosVigentes,
  obtenerTopesViaticoVigentes,
  puedeEditarConfiguracion,
  puedeVerSeccionConfiguracion,
  resolverEtiquetaCargo,
} from '../domain';
import type {
  CategoriaViatico,
  ConceptoDistanciaGps,
  ConfiguracionEmpresa,
  Empresa,
  FuenteKmRendimiento,
  MembresiaEmpresa,
  Personal,
  PresetViaticoConfig,
  ReglaRendimientoFlotaVersion,
  ReglasViaticosVersion,
  RolEmpresa,
  SeccionConfiguracion,
  TarifaServicioVersion,
  TerrenoFactorVersion,
  Usuario,
  Vehiculo,
} from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface ConfiguracionViewProps {
  rol: RolEmpresa;
  usuarioActualId: string;
  empresa: Empresa;
  configuracion: ConfiguracionEmpresa;
  membresias: MembresiaEmpresa[];
  usuarios: Usuario[];
  personal: Personal[];
  vehiculos: Vehiculo[];
  isDemo: boolean;
  seccionInicial?: SeccionConfiguracion;
  onActualizarEmpresa: (empresa: Empresa) => Promise<void>;
  onGuardarMembresiaUsuario: (params: {
    email: string;
    nombre: string;
    rol: RolEmpresa;
    personalId?: string;
    activo: boolean;
  }) => Promise<void>;
  onActualizarAccesoMembresia: (params: {
    usuarioId: string;
    rol: RolEmpresa;
    activo: boolean;
  }) => Promise<void>;
  onGuardarCargoConfig: (cargo: { codigo: string; etiqueta: string; activo: boolean }) => Promise<void>;
  onEliminarCargoConfig: (codigo: string) => Promise<void>;
  onCrearTipoCombustible: (params: {
    nombre: string;
    precioGalonRD: number;
    vigenciaDesde: string;
  }) => Promise<void>;
  onAgregarVigenciaCombustible: (params: {
    combustibleId: string;
    precioGalonRD: number;
    vigenciaDesde: string;
    activo?: boolean;
  }) => Promise<void>;
  onCrearServicioCatalogo: (params: {
    codigo: string;
    nombre: string;
    subtitulo: string;
    tarifaInicial: Omit<TarifaServicioVersion, 'version'>;
  }) => Promise<void>;
  onAgregarVigenciaServicio: (params: {
    servicioCodigo: string;
    nombre?: string;
    subtitulo?: string;
    activo?: boolean;
    tarifa: Omit<TarifaServicioVersion, 'version'>;
  }) => Promise<void>;
  onAgregarVigenciaFactoresTerreno: (factores: Omit<TerrenoFactorVersion, 'version'>) => Promise<void>;
  onAgregarVigenciaReglasViaticos: (reglas: Omit<ReglasViaticosVersion, 'version'>) => Promise<void>;
  onAgregarVigenciaTopeViatico?: (params: {
    cargoCodigo: string;
    categoria: CategoriaViatico;
    vigenciaDesde: string;
    montoMaximoPorMisionRD: number;
  }) => Promise<void>;
  onAgregarVigenciaRendimientoFlota?: (
    regla: Omit<ReglaRendimientoFlotaVersion, 'version'>
  ) => Promise<void>;
  onAbrirTutorial: () => void;
  onReiniciarOnboarding: () => Promise<void>;
}

const SECCIONES_META: Array<{
  id: SeccionConfiguracion;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'empresa', label: 'Empresa', icon: Building2 },
  { id: 'usuarios', label: 'Usuarios y roles', icon: Users },
  { id: 'cargos', label: 'Personal y cargos', icon: ClipboardCheck },
  { id: 'flota', label: 'Flota y combustible', icon: Car },
  { id: 'servicios', label: 'Servicios y terreno', icon: Compass },
  { id: 'viaticos_reglas', label: 'Reglas de viáticos', icon: Receipt },
  { id: 'viaticos_categorias', label: 'Viáticos por cargo', icon: Layers },
  { id: 'ensayos', label: 'Ensayos', icon: FlaskConical },
  { id: 'ayuda', label: 'Ayuda y tutorial', icon: HelpCircle },
];

export const ConfiguracionView: React.FC<ConfiguracionViewProps> = ({
  rol,
  usuarioActualId,
  empresa,
  configuracion,
  membresias,
  usuarios,
  personal,
  vehiculos,
  isDemo,
  seccionInicial,
  onActualizarEmpresa,
  onGuardarMembresiaUsuario,
  onActualizarAccesoMembresia,
  onGuardarCargoConfig,
  onEliminarCargoConfig,
  onCrearTipoCombustible,
  onAgregarVigenciaCombustible,
  onCrearServicioCatalogo,
  onAgregarVigenciaServicio,
  onAgregarVigenciaFactoresTerreno,
  onAgregarVigenciaReglasViaticos,
  onAgregarVigenciaTopeViatico,
  onAgregarVigenciaRendimientoFlota,
  onAbrirTutorial,
  onReiniciarOnboarding,
}) => {
  const canEdit = puedeEditarConfiguracion(rol);
  const visibles = SECCIONES_META.filter((s) => puedeVerSeccionConfiguracion(rol, s.id));

  const [seccion, setSeccion] = useState<SeccionConfiguracion>(() => {
    if (seccionInicial && puedeVerSeccionConfiguracion(rol, seccionInicial)) {
      return seccionInicial;
    }
    return visibles[0]?.id ?? 'servicios';
  });

  useEffect(() => {
    if (seccionInicial && puedeVerSeccionConfiguracion(rol, seccionInicial)) {
      setSeccion(seccionInicial);
    } else if (!puedeVerSeccionConfiguracion(rol, seccion)) {
      setSeccion(visibles[0]?.id ?? 'servicios');
    }
  }, [seccionInicial, rol]);

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const notify = (msg: string) => {
    setError(null);
    setOkMsg(msg);
    setTimeout(() => setOkMsg((prev) => (prev === msg ? null : prev)), 4000);
  };

  const handleAction = async (fn: () => Promise<void>, successMessage: string) => {
    setError(null);
    try {
      await fn();
      notify(successMessage);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo aplicar el cambio.');
    }
  };

  // --- Empresa form ---
  const [empNombre, setEmpNombre] = useState(empresa.nombre);
  const [empRnc, setEmpRnc] = useState(empresa.rnc);
  const [empTelefono, setEmpTelefono] = useState(empresa.telefono ?? '');
  const [empDireccion, setEmpDireccion] = useState(empresa.direccionBase);
  const [empZona, setEmpZona] = useState(empresa.zonaHoraria);
  const [empMoneda, setEmpMoneda] = useState(empresa.moneda);

  useEffect(() => {
    setEmpNombre(empresa.nombre);
    setEmpRnc(empresa.rnc);
    setEmpTelefono(empresa.telefono ?? '');
    setEmpDireccion(empresa.direccionBase);
    setEmpZona(empresa.zonaHoraria);
    setEmpMoneda(empresa.moneda);
  }, [empresa]);

  // --- Nuevo usuario ---
  const [usrEmail, setUsrEmail] = useState('');
  const [usrNombre, setUsrNombre] = useState('');
  const [usrRol, setUsrRol] = useState<RolEmpresa>('tecnico');
  const [usrPersonalId, setUsrPersonalId] = useState('');

  // --- Nuevo cargo ---
  const [cargoCodigo, setCargoCodigo] = useState('');
  const [cargoEtiqueta, setCargoEtiqueta] = useState('');
  const [editingCargoCode, setEditingCargoCode] = useState<string | null>(null);
  const [editingCargoEtiqueta, setEditingCargoEtiqueta] = useState('');

  // --- Flota / Combustibles ---
  const hoyIso = obtenerFechaHoyAST();
  const [newFuelNombre, setNewFuelNombre] = useState('');
  const [newFuelPrecio, setNewFuelPrecio] = useState('');
  const [newFuelVigencia, setNewFuelVigencia] = useState(hoyIso);

  const [fuelVigId, setFuelVigId] = useState<string>(configuracion.combustibles[0]?.id ?? '');
  const [fuelVigPrecio, setFuelVigPrecio] = useState('');
  const [fuelVigFecha, setFuelVigFecha] = useState(hoyIso);

  // --- Servicios ---
  const [newSrvCodigo, setNewSrvCodigo] = useState('');
  const [newSrvNombre, setNewSrvNombre] = useState('');
  const [newSrvSubtitulo, setNewSrvSubtitulo] = useState('');
  const [newSrvPrecioBase, setNewSrvPrecioBase] = useState('25000');
  const [newSrvCorredor, setNewSrvCorredor] = useState('0');
  const [newSrvAreaExtra, setNewSrvAreaExtra] = useState('3500');
  const [newSrvUmbralArea, setNewSrvUmbralArea] = useState('10000');
  const [newSrvVigencia, setNewSrvVigencia] = useState(hoyIso);

  const [srvVigCodigo, setSrvVigCodigo] = useState<string>(configuracion.servicios[0]?.codigo ?? '');
  const [srvVigPrecioBase, setSrvVigPrecioBase] = useState('');
  const [srvVigCorredor, setSrvVigCorredor] = useState('');
  const [srvVigAreaExtra, setSrvVigAreaExtra] = useState('');
  const [srvVigUmbralArea, setSrvVigUmbralArea] = useState('');
  const [srvVigFecha, setSrvVigFecha] = useState(hoyIso);

  // --- Terreno ---
  const terrenoVigente = obtenerFactoresTerrenoVigentes(configuracion);
  const [terVigFecha, setTerVigFecha] = useState(hoyIso);
  const [terLlano, setTerLlano] = useState(String(terrenoVigente.Llano));
  const [terOndulado, setTerOndulado] = useState(String(terrenoVigente.Ondulado));
  const [terMontanoso, setTerMontanoso] = useState(String(terrenoVigente.Montañoso));

  // --- Reglas viáticos ---
  const reglasVigente = obtenerReglasViaticosVigentes(configuracion);
  const [rvVigencia, setRvVigencia] = useState(hoyIso);
  const [rvTarifaKm, setRvTarifaKm] = useState(String(reglasVigente.gpsRuta.tarifaPorKmRD));
  const [rvMinKm, setRvMinKm] = useState(String(reglasVigente.gpsRuta.minimoKm));
  const [rvConceptoDist, setRvConceptoDist] = useState<ConceptoDistanciaGps>(
    reglasVigente.gpsRuta.conceptoDistancia
  );
  const [rvDietaUrbana, setRvDietaUrbana] = useState(String(reglasVigente.dietaUrbanaRD));
  const [rvDietaCampo, setRvDietaCampo] = useState(String(reglasVigente.dietaCampoRD));
  const [rvUmbralUrbana, setRvUmbralUrbana] = useState(String(reglasVigente.umbralDistanciaUrbanaKm));
  const [rvHospedaje, setRvHospedaje] = useState(String(reglasVigente.hospedajePorNocheRD));
  const [rvUmbralHospedaje, setRvUmbralHospedaje] = useState(String(reglasVigente.umbralHospedajeKm));
  const [rvKmzPeajeUmbral, setRvKmzPeajeUmbral] = useState(String(reglasVigente.kmzPeajeUmbralKm));
  const [rvKmzPeajeTramo, setRvKmzPeajeTramo] = useState(String(reglasVigente.kmzPeajePorTramo50KmRD));
  const [rvKmzPersonas, setRvKmzPersonas] = useState(String(reglasVigente.kmzPersonasDietaDefault));
  const [rvPeajes, setRvPeajes] = useState({ ...reglasVigente.peajesCorredor });
  const [rvPresets, setRvPresets] = useState<PresetViaticoConfig[]>(
    reglasVigente.presetsRapidos.map((p) => ({ ...p }))
  );

  useEffect(() => {
    setTerLlano(String(terrenoVigente.Llano));
    setTerOndulado(String(terrenoVigente.Ondulado));
    setTerMontanoso(String(terrenoVigente.Montañoso));
  }, [terrenoVigente]);

  useEffect(() => {
    setRvTarifaKm(String(reglasVigente.gpsRuta.tarifaPorKmRD));
    setRvMinKm(String(reglasVigente.gpsRuta.minimoKm));
    setRvConceptoDist(reglasVigente.gpsRuta.conceptoDistancia);
    setRvDietaUrbana(String(reglasVigente.dietaUrbanaRD));
    setRvDietaCampo(String(reglasVigente.dietaCampoRD));
    setRvUmbralUrbana(String(reglasVigente.umbralDistanciaUrbanaKm));
    setRvHospedaje(String(reglasVigente.hospedajePorNocheRD));
    setRvUmbralHospedaje(String(reglasVigente.umbralHospedajeKm));
    setRvKmzPeajeUmbral(String(reglasVigente.kmzPeajeUmbralKm));
    setRvKmzPeajeTramo(String(reglasVigente.kmzPeajePorTramo50KmRD));
    setRvKmzPersonas(String(reglasVigente.kmzPersonasDietaDefault));
    setRvPeajes({ ...reglasVigente.peajesCorredor });
    setRvPresets(reglasVigente.presetsRapidos.map((p) => ({ ...p })));
  }, [reglasVigente]);

  const combustiblesVigentes = obtenerCombustiblesVigentes(configuracion);
  const serviciosVigentes = obtenerServiciosVigentes(configuracion);
  const rendimientoVigente = obtenerRendimientoConfigVigente(configuracion);
  const topesVigentes = obtenerTopesViaticoVigentes(configuracion);

  const [rfFuenteKm, setRfFuenteKm] = useState<FuenteKmRendimiento>(rendimientoVigente.fuenteKm);
  const [rfUmbralAlertaPct, setRfUmbralAlertaPct] = useState(
    String(rendimientoVigente.umbralAlertaPct)
  );
  const [rfUmbralCercaniaKm, setRfUmbralCercaniaKm] = useState(
    String(rendimientoVigente.umbralCercaniaRentaKm)
  );
  const [rfVigencia, setRfVigencia] = useState(hoyIso);

  useEffect(() => {
    setRfFuenteKm(rendimientoVigente.fuenteKm);
    setRfUmbralAlertaPct(String(rendimientoVigente.umbralAlertaPct));
    setRfUmbralCercaniaKm(String(rendimientoVigente.umbralCercaniaRentaKm));
  }, [rendimientoVigente]);

  const [topeCargo, setTopeCargo] = useState<string>(configuracion.cargos[0]?.codigo ?? 'tecnico');
  const [topeCategoria, setTopeCategoria] = useState<CategoriaViatico>(CATEGORIAS_VIATICO[0]);
  const [topeMonto, setTopeMonto] = useState<string>('2000');
  const [topeVigencia, setTopeVigencia] = useState<string>(hoyIso);

  useEffect(() => {
    const match = topesVigentes.find(
      (t) => t.cargoCodigo === topeCargo && t.categoria === topeCategoria
    );
    if (match) {
      setTopeMonto(String(match.montoMaximoPorMisionRD));
    }
  }, [topeCargo, topeCategoria, configuracion.topesViatico]);

  const selectedSrv =
    configuracion.servicios.find((s) => s.codigo === srvVigCodigo) ?? configuracion.servicios[0];

  useEffect(() => {
    if (!selectedSrv) return;
    const latest = selectedSrv.versiones[selectedSrv.versiones.length - 1];
    if (latest) {
      setSrvVigPrecioBase(String(latest.precioBaseRD));
      setSrvVigCorredor(String(latest.recargoCorredorPorKmRD));
      setSrvVigAreaExtra(String(latest.recargoAreaPorHaExtraRD));
      setSrvVigUmbralArea(String(latest.umbralAreaBaseM2));
    }
  }, [srvVigCodigo, configuracion.servicios]);

  const selectedFuel =
    configuracion.combustibles.find((c) => c.id === fuelVigId) ?? configuracion.combustibles[0];

  useEffect(() => {
    if (!selectedFuel) return;
    const latest = selectedFuel.versiones[selectedFuel.versiones.length - 1];
    if (latest) {
      setFuelVigPrecio(String(latest.precioGalonRD));
    }
  }, [fuelVigId, configuracion.combustibles]);

  const moneda = empresa.moneda || 'RD$';

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Configuración de Empresa y Tarifas</h2>
          <p className="text-sm text-slate-600 mt-1">
            Parámetros versionados por fecha de vigencia. Los registros históricos conservan su tarifa
            original y no se recalculan al crear una nueva vigencia.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-right text-xs text-slate-500">
            <div>Versión global: v{configuracion.versionGlobal}</div>
            <div>{canEdit ? 'Modo: Edición Administrador' : 'Modo: Solo lectura (Coordinador)'}</div>
          </div>
          <button
            type="button"
            onClick={onAbrirTutorial}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg whitespace-nowrap"
          >
            <BookOpen className="w-3.5 h-3.5" />
            Ver tutorial
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-4 py-3 text-sm font-medium">
          {error}
        </div>
      )}
      {okMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{okMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Navegación interna de secciones */}
        <nav className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-2 space-y-1">
          {visibles.map((item) => {
            const Icon = item.icon;
            const active = seccion === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSeccion(item.id);
                  setError(null);
                }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors ${
                  active
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Contenido de la sección */}
        <div className="lg:col-span-9 space-y-6">
          {/* 1. EMPRESA */}
          {seccion === 'empresa' && canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Datos de la Empresa</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Información fiscal, ubicación operativa, zona horaria y moneda predeterminada.
                  </p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-xs">
                  <div className="text-slate-500">Plan de suscripción (solo lectura)</div>
                  <div className="font-bold text-slate-900 tabular-nums mt-0.5">
                    {formatRD(empresa.planMensualRD, moneda)} / mes · {empresa.estadoSuscripcion.toUpperCase()}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre comercial
                  </label>
                  <input
                    type="text"
                    value={empNombre}
                    onChange={(e) => setEmpNombre(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">RNC</label>
                  <input
                    type="text"
                    value={empRnc}
                    onChange={(e) => setEmpRnc(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={empTelefono}
                    onChange={(e) => setEmpTelefono(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Dirección base (salida de rutas)
                  </label>
                  <input
                    type="text"
                    value={empDireccion}
                    onChange={(e) => setEmpDireccion(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Zona horaria
                  </label>
                  <select
                    value={empZona}
                    onChange={(e) => setEmpZona(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {ZONAS_HORARIAS_SUGERIDAS.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Moneda</label>
                  <select
                    value={empMoneda}
                    onChange={(e) => setEmpMoneda(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {MONEDAS_SUGERIDAS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() =>
                    handleAction(
                      () =>
                        onActualizarEmpresa({
                          ...empresa,
                          nombre: empNombre,
                          rnc: empRnc,
                          telefono: empTelefono,
                          direccionBase: empDireccion,
                          zonaHoraria: empZona,
                          moneda: empMoneda,
                        }),
                      'Datos de la empresa actualizados.'
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  Guardar datos de empresa
                </button>
              </div>
            </div>
          )}

          {/* 2. USUARIOS Y ROLES */}
          {seccion === 'usuarios' && canEdit && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-slate-700" />
                  <h3 className="text-base font-bold text-slate-900">
                    Usuarios y Roles en {empresa.nombre}
                  </h3>
                </div>
                <p className="text-xs text-slate-500">
                  Cambia el rol de cada usuario para esta empresa o activa/desactiva su acceso sin
                  alterar las reglas base de permisos.
                </p>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Usuario</th>
                        <th className="px-4 py-2.5 font-semibold">Correo</th>
                        <th className="px-4 py-2.5 font-semibold">Rol en empresa</th>
                        <th className="px-4 py-2.5 font-semibold">Estado</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Acceso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {membresias.map((m) => {
                        const u = usuarios.find((usr) => usr.id === m.usuarioId);
                        if (!u) return null;
                        const isSelf = u.id === usuarioActualId;
                        return (
                          <tr key={m.id}>
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              {u.nombre} {isSelf && <span className="text-xs text-slate-500">(tú)</span>}
                            </td>
                            <td className="px-4 py-2.5 text-slate-600">{u.email}</td>
                            <td className="px-4 py-2.5">
                              <select
                                value={m.rol}
                                disabled={isSelf}
                                onChange={(e) =>
                                  handleAction(
                                    () =>
                                      onActualizarAccesoMembresia({
                                        usuarioId: u.id,
                                        rol: e.target.value as RolEmpresa,
                                        activo: m.activo,
                                      }),
                                    `Rol de ${u.nombre} actualizado.`
                                  )
                                }
                                className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white disabled:bg-slate-100"
                              >
                                <option value="admin">Administrador</option>
                                <option value="coordinador">Coordinador</option>
                                <option value="tecnico">Técnico</option>
                              </select>
                            </td>
                            <td className="px-4 py-2.5 text-xs font-semibold">
                              <span className={m.activo ? 'text-emerald-700' : 'text-slate-500'}>
                                {m.activo ? 'Activo' : 'Desactivado'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                disabled={isSelf}
                                onClick={() =>
                                  handleAction(
                                    () =>
                                      onActualizarAccesoMembresia({
                                        usuarioId: u.id,
                                        rol: m.rol,
                                        activo: !m.activo,
                                      }),
                                    m.activo
                                      ? `Acceso desactivado para ${u.nombre}.`
                                      : `Acceso reactivado para ${u.nombre}.`
                                  )
                                }
                                className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
                              >
                                {m.activo ? 'Desactivar' : 'Activar'}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-slate-900">Agregar o vincular usuario</h4>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
                  <input
                    type="email"
                    placeholder="Correo electrónico"
                    value={usrEmail}
                    onChange={(e) => setUsrEmail(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={usrNombre}
                    onChange={(e) => setUsrNombre(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <select
                    value={usrRol}
                    onChange={(e) => setUsrRol(e.target.value as RolEmpresa)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="tecnico">Técnico</option>
                    <option value="coordinador">Coordinador</option>
                    <option value="admin">Administrador</option>
                  </select>
                  <select
                    value={usrPersonalId}
                    onChange={(e) => setUsrPersonalId(e.target.value)}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    <option value="">Sin vincular a ficha personal</option>
                    {personal.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      handleAction(async () => {
                        await onGuardarMembresiaUsuario({
                          email: usrEmail,
                          nombre: usrNombre,
                          rol: usrRol,
                          personalId: usrPersonalId || undefined,
                          activo: true,
                        });
                        setUsrEmail('');
                        setUsrNombre('');
                        setUsrPersonalId('');
                      }, 'Usuario agregado o actualizado en la empresa.')
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Guardar acceso
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 3. PERSONAL Y CARGOS */}
          {seccion === 'cargos' && canEdit && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Catálogo de Cargos</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cada cargo posee un código estable inmutable. Los cuatro cargos base no pueden
                    eliminarse; tampoco los cargos con personal asignado.
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Código estable</th>
                        <th className="px-4 py-2.5 font-semibold">Etiqueta visible</th>
                        <th className="px-4 py-2.5 font-semibold">Tipo</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Asignados</th>
                        <th className="px-4 py-2.5 font-semibold">Estado</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {configuracion.cargos.map((c) => {
                        const countAsignados = personal.filter((p) => p.cargo === c.codigo).length;
                        const isEditing = editingCargoCode === c.codigo;
                        return (
                          <tr key={c.codigo}>
                            <td className="px-4 py-2.5 font-mono text-xs text-slate-700">
                              {c.codigo}
                            </td>
                            <td className="px-4 py-2.5 font-medium text-slate-900">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingCargoEtiqueta}
                                  onChange={(e) => setEditingCargoEtiqueta(e.target.value)}
                                  className="px-2.5 py-1 border border-slate-300 rounded text-sm w-48"
                                />
                              ) : (
                                c.etiqueta
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">
                              {c.esBase ? 'Base del sistema' : 'Personalizado'}
                            </td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-slate-700">
                              {countAsignados}
                            </td>
                            <td className="px-4 py-2.5 text-xs font-semibold">
                              <span className={c.activo ? 'text-emerald-700' : 'text-slate-500'}>
                                {c.activo ? 'Activo' : 'Inactivo'}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="inline-flex items-center gap-2">
                                {isEditing ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAction(async () => {
                                        await onGuardarCargoConfig({
                                          codigo: c.codigo,
                                          etiqueta: editingCargoEtiqueta,
                                          activo: c.activo,
                                        });
                                        setEditingCargoCode(null);
                                      }, `Etiqueta de cargo "${c.codigo}" actualizada.`)
                                    }
                                    className="px-2.5 py-1 text-xs font-semibold bg-slate-900 text-white rounded hover:bg-slate-800 whitespace-nowrap"
                                  >
                                    Guardar
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCargoCode(c.codigo);
                                      setEditingCargoEtiqueta(c.etiqueta);
                                    }}
                                    className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                                  >
                                    Editar
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAction(
                                      () =>
                                        onGuardarCargoConfig({
                                          codigo: c.codigo,
                                          etiqueta: c.etiqueta,
                                          activo: !c.activo,
                                        }),
                                      c.activo ? 'Cargo desactivado.' : 'Cargo activado.'
                                    )
                                  }
                                  className="px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded hover:bg-slate-50 whitespace-nowrap"
                                >
                                  {c.activo ? 'Desactivar' : 'Activar'}
                                </button>
                                {!c.esBase && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAction(
                                        () => onEliminarCargoConfig(c.codigo),
                                        `Cargo "${c.etiqueta}" eliminado.`
                                      )
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-700 border border-rose-200 rounded hover:bg-rose-50 whitespace-nowrap"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    Eliminar
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

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <h4 className="text-sm font-bold text-slate-900">Agregar nuevo cargo</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      placeholder="Código estable (ej. piloto_dron)"
                      value={cargoCodigo}
                      onChange={(e) => setCargoCodigo(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono"
                    />
                    <input
                      type="text"
                      placeholder="Etiqueta visible (ej. Piloto de Dron)"
                      value={cargoEtiqueta}
                      onChange={(e) => setCargoEtiqueta(e.target.value)}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(async () => {
                          await onGuardarCargoConfig({
                            codigo: cargoCodigo || cargoEtiqueta,
                            etiqueta: cargoEtiqueta,
                            activo: true,
                          });
                          setCargoCodigo('');
                          setCargoEtiqueta('');
                        }, 'Cargo agregado al catálogo.')
                      }
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar cargo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 4. FLOTA Y COMBUSTIBLE */}
          {seccion === 'flota' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Tipos de Combustible y Tarifas por Vigencia
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {canEdit
                      ? 'Define el precio por galón vigente por fecha para cálculos de ruta.'
                      : 'Consulta de solo lectura de los combustibles vigentes de la empresa.'}
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Combustible</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Tarifa vigente</th>
                        <th className="px-4 py-2.5 font-semibold">Vigencia activa</th>
                        <th className="px-4 py-2.5 font-semibold">Historial de versiones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {combustiblesVigentes.map((cv) => {
                        const raw = configuracion.combustibles.find((c) => c.id === cv.id);
                        return (
                          <tr key={cv.id}>
                            <td className="px-4 py-2.5 font-medium text-slate-900">{cv.nombre}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                              {formatRD(cv.precioGalonRD, moneda)} / gal
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums">
                              v{cv.version} · desde {cv.vigenciaDesde}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-slate-600">
                              {raw?.versiones
                                .map((v) => `v${v.version} (${v.vigenciaDesde}: ${formatRD(v.precioGalonRD, moneda)})`)
                                .join(' · ')}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {canEdit && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Programar nueva vigencia de precio
                      </h4>
                      <select
                        value={fuelVigId}
                        onChange={(e) => setFuelVigId(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {configuracion.combustibles.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Precio galón"
                          value={fuelVigPrecio}
                          onChange={(e) => setFuelVigPrecio(e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                        />
                        <input
                          type="date"
                          value={fuelVigFecha}
                          onChange={(e) => setFuelVigFecha(e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(
                            () =>
                              onAgregarVigenciaCombustible({
                                combustibleId: fuelVigId,
                                precioGalonRD: Number(fuelVigPrecio),
                                vigenciaDesde: fuelVigFecha,
                              }),
                            'Nueva vigencia de combustible registrada.'
                          )
                        }
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                      >
                        Registrar vigencia
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Agregar tipo de combustible
                      </h4>
                      <input
                        type="text"
                        placeholder="Nombre (ej. GLP Automotriz)"
                        value={newFuelNombre}
                        onChange={(e) => setNewFuelNombre(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          placeholder="Precio inicial galón"
                          value={newFuelPrecio}
                          onChange={(e) => setNewFuelPrecio(e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums"
                        />
                        <input
                          type="date"
                          value={newFuelVigencia}
                          onChange={(e) => setNewFuelVigencia(e.target.value)}
                          className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(async () => {
                            await onCrearTipoCombustible({
                              nombre: newFuelNombre,
                              precioGalonRD: Number(newFuelPrecio),
                              vigenciaDesde: newFuelVigencia,
                            });
                            setNewFuelNombre('');
                            setNewFuelPrecio('');
                          }, 'Tipo de combustible agregado.')
                        }
                        className="w-full px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg"
                      >
                        Crear combustible
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">
                  Parámetros actuales de flota registrada
                </h4>
                <p className="text-xs text-slate-500">
                  La asignación de combustible, rendimiento (km/gal) y costo de mantenimiento/km por
                  unidad se edita en Catálogos &rarr; Vehículos.
                </p>
                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2 font-semibold">Vehículo</th>
                        <th className="px-4 py-2 font-semibold">Combustible</th>
                        <th className="px-4 py-2 font-semibold text-right">Precio / gal</th>
                        <th className="px-4 py-2 font-semibold text-right">Rendimiento</th>
                        <th className="px-4 py-2 font-semibold text-right">Mant. / km</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {vehiculos.map((v) => (
                        <tr key={v.id}>
                          <td className="px-4 py-2 font-medium text-slate-900">
                            {v.etiqueta} ({v.placa})
                          </td>
                          <td className="px-4 py-2 text-slate-600">{v.tipoCombustible}</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatRD(v.precioGalonRD, moneda)}
                          </td>
                          <td className="px-4 py-2 text-right tabular-nums">{v.kmPorGal} km/gal</td>
                          <td className="px-4 py-2 text-right tabular-nums">
                            {formatRD(v.mantenimientoPorKmRD, moneda)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Reglas de Rendimiento de Flota (B4) y Cercanía de Rentas (B3) */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">
                        Rendimiento de Flota y Umbral de Cercanía en Rentas
                      </h4>
                      {rendimientoVigente.esEjemploPendienteConfirmar && (
                        <span className="rounded bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                          {ETIQUETA_EJEMPLO_CONFIRMAR}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Vigencia activa: v{rendimientoVigente.version} · desde{' '}
                      {rendimientoVigente.vigenciaDesde}.{' '}
                      {canEdit
                        ? 'Define la fuente de km para evaluar cargas aprobadas (mín. 3 cargas), el % de desviación y el radio de cercanía en rentas.'
                        : 'Consulta de solo lectura.'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">
                      Fuente de kilómetros
                    </span>
                    <select
                      disabled={!canEdit}
                      value={rfFuenteKm}
                      onChange={(e) => setRfFuenteKm(e.target.value as FuenteKmRendimiento)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                    >
                      {FUENTES_KM_RENDIMIENTO.map((f) => (
                        <option key={f} value={f}>
                          {f === 'ruta_asignada'
                            ? 'Ruta asignada (ida y vuelta)'
                            : f === 'bitacora'
                            ? 'Bitácora de campo'
                            : 'Captura manual'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">
                      Umbral alerta rendimiento (%)
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="0.5"
                      disabled={!canEdit}
                      value={rfUmbralAlertaPct}
                      onChange={(e) => setRfUmbralAlertaPct(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">
                      Umbral cercanía rentas (km)
                    </span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      disabled={!canEdit}
                      value={rfUmbralCercaniaKm}
                      onChange={(e) => setRfUmbralCercaniaKm(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-50"
                    />
                  </label>
                  {canEdit && (
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Vigencia desde</span>
                      <input
                        type="date"
                        value={rfVigencia}
                        onChange={(e) => setRfVigencia(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </label>
                  )}
                </div>

                {canEdit && onAgregarVigenciaRendimientoFlota && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(
                          () =>
                            onAgregarVigenciaRendimientoFlota({
                              vigenciaDesde: rfVigencia,
                              fuenteKm: rfFuenteKm,
                              umbralAlertaPct: Number(rfUmbralAlertaPct),
                              umbralCercaniaRentaKm: Number(rfUmbralCercaniaKm),
                              esEjemploPendienteConfirmar: false,
                            }),
                          'Regla de rendimiento y cercanía de rentas guardada.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Guardar nueva vigencia
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 5. SERVICIOS Y TERRENO */}
          {seccion === 'servicios' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Catálogo de Servicios y Tarifas Base
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {canEdit
                      ? 'Versiona precios base, recargos de corredor por km y recargos por hectárea adicional.'
                      : 'Vista de solo lectura del catálogo vigente usado al cotizar proyectos y rutas.'}
                  </p>
                </div>

                <div className="overflow-x-auto border border-slate-200 rounded-lg">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-2.5 font-semibold">Servicio</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Precio base</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Recargo corredor/km</th>
                        <th className="px-4 py-2.5 font-semibold text-right">Recargo ha extra</th>
                        <th className="px-4 py-2.5 font-semibold">Vigencia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {serviciosVigentes.map((sv) => (
                        <tr key={sv.codigo}>
                          <td className="px-4 py-2.5">
                            <div className="font-semibold text-slate-900">{sv.nombre}</div>
                            <div className="text-xs text-slate-500">
                              {sv.subtitulo} · {sv.codigo}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold tabular-nums">
                            {formatRD(sv.precioBaseRD, moneda)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatRD(sv.recargoCorredorPorKmRD, moneda)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">
                            {formatRD(sv.recargoAreaPorHaExtraRD, moneda)}
                          </td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 tabular-nums">
                            v{sv.version} · {sv.vigenciaDesde}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {canEdit && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Programar nueva vigencia de servicio
                      </h4>
                      <select
                        value={srvVigCodigo}
                        onChange={(e) => setSrvVigCodigo(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {configuracion.servicios.map((s) => (
                          <option key={s.codigo} value={s.codigo}>
                            {s.nombre} ({s.codigo})
                          </option>
                        ))}
                      </select>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="block">
                          <span className="text-slate-600">Precio base</span>
                          <input
                            type="number"
                            min="0"
                            value={srvVigPrecioBase}
                            onChange={(e) => setSrvVigPrecioBase(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-600">Corredor / km</span>
                          <input
                            type="number"
                            min="0"
                            value={srvVigCorredor}
                            onChange={(e) => setSrvVigCorredor(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-600">Extra ha adicional</span>
                          <input
                            type="number"
                            min="0"
                            value={srvVigAreaExtra}
                            onChange={(e) => setSrvVigAreaExtra(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-600">Vigencia desde</span>
                          <input
                            type="date"
                            value={srvVigFecha}
                            onChange={(e) => setSrvVigFecha(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(
                            () =>
                              onAgregarVigenciaServicio({
                                servicioCodigo: srvVigCodigo,
                                tarifa: {
                                  vigenciaDesde: srvVigFecha,
                                  precioBaseRD: Number(srvVigPrecioBase),
                                  recargoCorredorPorKmRD: Number(srvVigCorredor),
                                  recargoAreaPorHaExtraRD: Number(srvVigAreaExtra),
                                  umbralAreaBaseM2: Number(srvVigUmbralArea) || 10000,
                                },
                              }),
                            'Nueva vigencia de tarifa de servicio registrada.'
                          )
                        }
                        className="w-full px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                      >
                        Guardar nueva vigencia
                      </button>
                    </div>

                    <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Agregar servicio al catálogo
                      </h4>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Código (ej. batimetria)"
                          value={newSrvCodigo}
                          onChange={(e) => setNewSrvCodigo(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-mono"
                        />
                        <input
                          type="text"
                          placeholder="Nombre visible"
                          value={newSrvNombre}
                          onChange={(e) => setNewSrvNombre(e.target.value)}
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Subtítulo o especialidad"
                        value={newSrvSubtitulo}
                        onChange={(e) => setNewSrvSubtitulo(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
                      />
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <label className="block">
                          <span className="text-slate-600">Precio base</span>
                          <input
                            type="number"
                            min="0"
                            value={newSrvPrecioBase}
                            onChange={(e) => setNewSrvPrecioBase(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                          />
                        </label>
                        <label className="block">
                          <span className="text-slate-600">Vigencia inicial</span>
                          <input
                            type="date"
                            value={newSrvVigencia}
                            onChange={(e) => setNewSrvVigencia(e.target.value)}
                            className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
                          />
                        </label>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleAction(async () => {
                            await onCrearServicioCatalogo({
                              codigo: newSrvCodigo || newSrvNombre,
                              nombre: newSrvNombre,
                              subtitulo: newSrvSubtitulo || 'Servicio técnico',
                              tarifaInicial: {
                                vigenciaDesde: newSrvVigencia,
                                precioBaseRD: Number(newSrvPrecioBase),
                                recargoCorredorPorKmRD: Number(newSrvCorredor) || 0,
                                recargoAreaPorHaExtraRD: Number(newSrvAreaExtra) || 0,
                                umbralAreaBaseM2: Number(newSrvUmbralArea) || 10000,
                              },
                            });
                            setNewSrvCodigo('');
                            setNewSrvNombre('');
                            setNewSrvSubtitulo('');
                          }, 'Nuevo servicio añadido al catálogo.')
                        }
                        className="w-full px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg"
                      >
                        Crear servicio
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Factores de terreno */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Multiplicadores por Topografía (Terreno)
                    </h4>
                    <p className="text-xs text-slate-500">
                      Vigencia activa: v{terrenoVigente.version} · desde {terrenoVigente.vigenciaDesde}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Llano</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      disabled={!canEdit}
                      value={terLlano}
                      onChange={(e) => setTerLlano(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Ondulado</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      disabled={!canEdit}
                      value={terOndulado}
                      onChange={(e) => setTerOndulado(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-50"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Montañoso</span>
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      disabled={!canEdit}
                      value={terMontanoso}
                      onChange={(e) => setTerMontanoso(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums disabled:bg-slate-50"
                    />
                  </label>
                  {canEdit && (
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-600">Vigencia desde</span>
                      <input
                        type="date"
                        value={terVigFecha}
                        onChange={(e) => setTerVigFecha(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </label>
                  )}
                </div>
                {canEdit && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(
                          () =>
                            onAgregarVigenciaFactoresTerreno({
                              vigenciaDesde: terVigFecha,
                              Llano: Number(terLlano),
                              Ondulado: Number(terOndulado),
                              Montañoso: Number(terMontanoso),
                            }),
                          'Nueva vigencia de factores de terreno guardada.'
                        )
                      }
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                    >
                      Registrar vigencia de terreno
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 6. REGLAS DE VIÁTICOS Y GPS RUTA */}
          {seccion === 'viaticos_reglas' && canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Reglas de Distancia, GPS Ruta, Viáticos y Tarifas Rápidas
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Vigencia activa: v{reglasVigente.version} · desde {reglasVigente.vigenciaDesde}
                  </p>
                </div>
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-2">
                  Nueva vigencia desde:
                  <input
                    type="date"
                    value={rvVigencia}
                    onChange={(e) => setRvVigencia(e.target.value)}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm"
                  />
                </label>
              </div>

              {/* Regla GPS Ruta */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Regla oficial de GPS Ruta</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">
                      Tarifa por km ({moneda})
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={rvTarifaKm}
                      onChange={(e) => setRvTarifaKm(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Mínimo facturable (km)</span>
                    <input
                      type="number"
                      step="1"
                      min="0"
                      value={rvMinKm}
                      onChange={(e) => setRvMinKm(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-slate-600">Concepto de distancia</span>
                    <select
                      value={rvConceptoDist}
                      onChange={(e) => setRvConceptoDist(e.target.value as ConceptoDistanciaGps)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="ida_vuelta">Ida y vuelta (× 2)</option>
                      <option value="solo_ida">Solo ida (× 1)</option>
                    </select>
                  </label>
                </div>
              </div>

              {/* Dietas, Hospedaje y Umbrales */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">
                  Dietas, Hospedaje y Umbrales de Ruta / KMZ
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                  <label className="block">
                    <span className="text-xs text-slate-600">Dieta urbana ({moneda})</span>
                    <input
                      type="number"
                      min="0"
                      value={rvDietaUrbana}
                      onChange={(e) => setRvDietaUrbana(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Dieta campo ({moneda})</span>
                    <input
                      type="number"
                      min="0"
                      value={rvDietaCampo}
                      onChange={(e) => setRvDietaCampo(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Umbral tarifa urbana (km)</span>
                    <input
                      type="number"
                      min="0"
                      value={rvUmbralUrbana}
                      onChange={(e) => setRvUmbralUrbana(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Hospedaje / noche ({moneda})</span>
                    <input
                      type="number"
                      min="0"
                      value={rvHospedaje}
                      onChange={(e) => setRvHospedaje(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Umbral hospedaje (km)</span>
                    <input
                      type="number"
                      min="0"
                      value={rvUmbralHospedaje}
                      onChange={(e) => setRvUmbralHospedaje(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Peaje KMZ umbral (km)</span>
                    <input
                      type="number"
                      min="0"
                      value={rvKmzPeajeUmbral}
                      onChange={(e) => setRvKmzPeajeUmbral(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Peaje KMZ tramo 50 km ({moneda})</span>
                    <input
                      type="number"
                      min="0"
                      value={rvKmzPeajeTramo}
                      onChange={(e) => setRvKmzPeajeTramo(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-slate-600">Personas dieta KMZ default</span>
                    <input
                      type="number"
                      min="0"
                      value={rvKmzPersonas}
                      onChange={(e) => setRvKmzPersonas(e.target.value)}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg tabular-nums"
                    />
                  </label>
                </div>
              </div>

              {/* Peajes por corredor */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <h4 className="text-sm font-bold text-slate-900">Peajes por Corredor Vial ({moneda})</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {(
                    [
                      ['urbanoExpresoRD', 'Urbano expreso'],
                      ['nacionalBaseRD', 'Nacional base'],
                      ['norteExpresoRD', 'Corredor Norte'],
                      ['suroesteExpresoRD', 'Corredor Suroeste'],
                      ['otroExpresoRD', 'Otros corredores'],
                      ['estePorEstacionRD', 'Este (por estación)'],
                      ['esteEstacionesCerca', 'Este estaciones (<80 km)'],
                      ['esteEstacionesLejos', 'Este estaciones (≥80 km)'],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="block">
                      <span className="text-slate-600">{label}</span>
                      <input
                        type="number"
                        min="0"
                        value={rvPeajes[field]}
                        onChange={(e) =>
                          setRvPeajes((prev) => ({ ...prev, [field]: Number(e.target.value) }))
                        }
                        className="mt-1 w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              </div>

              {/* Tarifas rápidas (presets) */}
              <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-900">
                    Tarifas Rápidas de Captura en Campo
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      setRvPresets((prev) => [
                        ...prev,
                        {
                          id: `preset_${Date.now()}`,
                          etiqueta: 'Nuevo preset',
                          categoria: 'Otro',
                          comercio: 'Concepto estándar',
                          montoRD: 500,
                          notas: '',
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Añadir preset
                  </button>
                </div>

                <div className="space-y-2">
                  {rvPresets.map((preset, idx) => (
                    <div
                      key={preset.id}
                      className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs"
                    >
                      <input
                        type="text"
                        value={preset.etiqueta}
                        onChange={(e) =>
                          setRvPresets((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, etiqueta: e.target.value } : x))
                          )
                        }
                        placeholder="Etiqueta botón"
                        className="md:col-span-3 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      />
                      <select
                        value={preset.categoria}
                        onChange={(e) =>
                          setRvPresets((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, categoria: e.target.value as CategoriaViatico } : x
                            )
                          )
                        }
                        className="md:col-span-2 px-2 py-1.5 border border-slate-300 rounded bg-white"
                      >
                        {CATEGORIAS_VIATICO.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={preset.comercio}
                        onChange={(e) =>
                          setRvPresets((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, comercio: e.target.value } : x))
                          )
                        }
                        placeholder="Comercio / concepto"
                        className="md:col-span-4 px-2.5 py-1.5 border border-slate-300 rounded bg-white"
                      />
                      <input
                        type="number"
                        min="0"
                        value={preset.montoRD}
                        onChange={(e) =>
                          setRvPresets((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, montoRD: Number(e.target.value) } : x
                            )
                          )
                        }
                        className="md:col-span-2 px-2.5 py-1.5 border border-slate-300 rounded bg-white tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => setRvPresets((prev) => prev.filter((_, i) => i !== idx))}
                        className="md:col-span-1 px-2 py-1.5 text-rose-700 hover:bg-rose-100 rounded text-center font-semibold"
                        title="Quitar preset"
                      >
                        <Trash2 className="w-3.5 h-3.5 mx-auto" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    handleAction(
                      () =>
                        onAgregarVigenciaReglasViaticos({
                          vigenciaDesde: rvVigencia,
                          gpsRuta: {
                            tarifaPorKmRD: Number(rvTarifaKm),
                            minimoKm: Number(rvMinKm),
                            conceptoDistancia: rvConceptoDist,
                          },
                          dietaUrbanaRD: Number(rvDietaUrbana),
                          dietaCampoRD: Number(rvDietaCampo),
                          umbralDistanciaUrbanaKm: Number(rvUmbralUrbana),
                          hospedajePorNocheRD: Number(rvHospedaje),
                          umbralHospedajeKm: Number(rvUmbralHospedaje),
                          kmzPeajeUmbralKm: Number(rvKmzPeajeUmbral),
                          kmzPeajePorTramo50KmRD: Number(rvKmzPeajeTramo),
                          kmzPersonasDietaDefault: Number(rvKmzPersonas),
                          peajesCorredor: rvPeajes,
                          presetsRapidos: rvPresets,
                        }),
                      'Nueva vigencia de reglas de viáticos registrada.'
                    )
                  }
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg whitespace-nowrap"
                >
                  <Save className="w-4 h-4" />
                  Registrar nueva vigencia de reglas
                </button>
              </div>
            </div>
          )}

          {/* 7. TOPES DE VIÁTICOS POR CARGO Y CATEGORÍA (B1) */}
          {seccion === 'viaticos_categorias' && (
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Topes de Viáticos por Cargo y Categoría (por Misión)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {canEdit
                      ? 'Define el tope máximo acumulado por persona en cada misión. Un tope de RD$ 0 indica categoría no permitida para ese cargo (avisa y exige motivo).'
                      : 'Consulta de solo lectura de los topes máximos por misión vigentes para cada cargo.'}
                  </p>
                </div>
                {topesVigentes.some((t) => t.esEjemploPendienteConfirmar) && (
                  <span className="rounded bg-amber-100 border border-amber-300 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                    {ETIQUETA_EJEMPLO_CONFIRMAR}
                  </span>
                )}
              </div>

              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">Categoría</th>
                      {configuracion.cargos.map((c) => (
                        <th key={c.codigo} className="px-4 py-2.5 font-semibold text-right">
                          {c.etiqueta}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {CATEGORIAS_VIATICO.map((cat) => (
                      <tr key={cat}>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{cat}</td>
                        {configuracion.cargos.map((c) => {
                          const tope = topesVigentes.find(
                            (t) => t.cargoCodigo === c.codigo && t.categoria === cat
                          );
                          const monto = tope?.montoMaximoPorMisionRD;
                          return (
                            <td key={c.codigo} className="px-4 py-2.5 text-right text-xs">
                              {monto === undefined ? (
                                <span className="text-slate-400">Sin tope</span>
                              ) : monto === 0 ? (
                                <div>
                                  <span className="inline-block rounded bg-rose-100 border border-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-800">
                                    No permitida ({formatRD(0, moneda)})
                                  </span>
                                  <div className="text-[10px] text-slate-400 mt-0.5">
                                    v{tope?.version} · {tope?.vigenciaDesde}
                                  </div>
                                </div>
                              ) : (
                                <div>
                                  <div className="font-semibold text-slate-900 tabular-nums">
                                    {formatRD(monto, moneda)}
                                  </div>
                                  <div className="text-[10px] text-slate-500 tabular-nums">
                                    v{tope?.version} · {tope?.vigenciaDesde}
                                    {tope?.esEjemploPendienteConfirmar && (
                                      <span className="ml-1 text-amber-700 font-semibold">
                                        (Ejemplo)
                                      </span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {canEdit && onAgregarVigenciaTopeViatico && (
                <div className="border border-slate-200 rounded-lg p-4 space-y-3 bg-slate-50/50">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Programar nueva vigencia de tope por cargo y categoría
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                    <label className="block">
                      <span className="font-semibold text-slate-600">Cargo</span>
                      <select
                        value={topeCargo}
                        onChange={(e) => setTopeCargo(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
                      >
                        {configuracion.cargos.map((c) => (
                          <option key={c.codigo} value={c.codigo}>
                            {resolverEtiquetaCargo(c.codigo, configuracion.cargos)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-semibold text-slate-600">Categoría</span>
                      <select
                        value={topeCategoria}
                        onChange={(e) => setTopeCategoria(e.target.value as CategoriaViatico)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg bg-white text-sm"
                      >
                        {CATEGORIAS_VIATICO.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="font-semibold text-slate-600">
                        Tope máximo por misión ({moneda})
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={topeMonto}
                        onChange={(e) => setTopeMonto(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm tabular-nums bg-white"
                      />
                    </label>
                    <label className="block">
                      <span className="font-semibold text-slate-600">Vigencia desde</span>
                      <input
                        type="date"
                        value={topeVigencia}
                        onChange={(e) => setTopeVigencia(e.target.value)}
                        className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </label>
                  </div>

                  {Number(topeMonto) === 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                      Aviso: un tope de {formatRD(0, moneda)} indica que la categoría{' '}
                      <strong>{topeCategoria}</strong> no está permitida para este cargo y exigirá
                      motivo de excedente al registrarse.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(
                          () =>
                            onAgregarVigenciaTopeViatico({
                              cargoCodigo: topeCargo,
                              categoria: topeCategoria,
                              vigenciaDesde: topeVigencia,
                              montoMaximoPorMisionRD: Number(topeMonto),
                            }),
                          'Nueva vigencia de tope por cargo registrada.'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Guardar nueva vigencia de tope
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 8. ENSAYOS (PLACEHOLDER) */}
          {seccion === 'ensayos' && canEdit && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <div className="flex items-center gap-2 text-slate-900">
                <FlaskConical className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold">Módulo de Ensayos</h3>
              </div>
              <p className="text-sm font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-4 py-4">
                Parámetros de evaluación estructural: próximamente
              </p>
            </div>
          )}

          {/* 9. AYUDA Y TUTORIAL */}
          {seccion === 'ayuda' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-slate-900">Ayuda y Tutorial por Perfil</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Revisa la guía visual rápida correspondiente a tu rol o reinicia el asistente de
                  puesta en marcha.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                  <div className="text-sm font-bold text-slate-900">Tutorial visual del perfil</div>
                  <p className="text-xs text-slate-600">
                    Tarjetas visuales con los flujos clave para el rol activo ({rol}).
                  </p>
                  <button
                    type="button"
                    onClick={onAbrirTutorial}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg whitespace-nowrap"
                  >
                    <BookOpen className="w-4 h-4" />
                    Abrir tutorial visual
                  </button>
                </div>

                {canEdit && (
                  <div className="border border-slate-200 rounded-lg p-4 space-y-3">
                    <div className="text-sm font-bold text-slate-900">
                      Asistente de configuración inicial (Onboarding)
                    </div>
                    <p className="text-xs text-slate-600">
                      {isDemo
                        ? 'Modo demo activo: incluye el paso opcional para importar un KMZ de prueba.'
                        : 'Modo producción: guía paso a paso sin generar datos ficticios.'}
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        handleAction(
                          onReiniciarOnboarding,
                          'Asistente de configuración reiniciado en tu panel Hoy.'
                        )
                      }
                      className="inline-flex items-center gap-2 px-4 py-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold rounded-lg whitespace-nowrap"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Reiniciar asistente
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
