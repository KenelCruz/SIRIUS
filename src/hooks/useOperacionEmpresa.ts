import { useCallback, useEffect, useMemo, useState } from 'react';
import { repositorioOperacion } from '../data/LocalRepositorioOperacion';
import { obtenerTutorialPorPerfil } from '../data/tutoriales';
import {
  asegurarConfiguracionEmpresa,
  asegurarEstadoOnboarding,
  calcularConteoPendientesPorTipo,
  obtenerCombustiblesVigentes,
  obtenerFactoresTerrenoVigentes,
  obtenerReglasViaticosVigentes,
  obtenerServiciosVigentes,
} from '../domain';
import type { PayloadTransicionServicio } from '../domain/estados';
import type {
  Asignacion,
  AvisoSobrescrituraLWW,
  BitacoraEntrada,
  CargoConfig,
  Cliente,
  ConteoPendientesPorTipo,
  Cuadrilla,
  Empresa,
  EquipoGNSS,
  EstadoAprobacionViatico,
  EstadoOnboardingEmpresa,
  EstadoServicio,
  Personal,
  ProyeccionSnapshotPorRol,
  Proyecto,
  ReglasViaticosVersion,
  RepartoProyecto,
  RolEmpresa,
  Ruta,
  Servicio,
  SesionActiva,
  TarifaServicioVersion,
  TerrenoFactorVersion,
  TutorialTarjeta,
  Vehiculo,
  Viatico,
} from '../types/domain';

const EMPTY_PENDING_COUNTS: ConteoPendientesPorTipo = {
  servicios: 0,
  bitacoras: 0,
  viaticos: 0,
  proyectos: 0,
  rutas: 0,
  asignaciones: 0,
  total: 0,
};

export function useOperacionEmpresa(isOnline: boolean) {
  const [sesion, setSesion] = useState<SesionActiva | null>(() =>
    repositorioOperacion.obtenerSesionGuardada()
  );
  const [empresasDisponibles, setEmpresasDisponibles] = useState<
    Array<{ empresa: Empresa; rol: RolEmpresa }>
  >([]);
  const [requiereElegirEmpresa, setRequiereElegirEmpresa] = useState(false);
  const [proyeccion, setProyeccion] = useState<ProyeccionSnapshotPorRol | null>(null);
  const [isLoadingSnapshot, setIsLoadingSnapshot] = useState(false);
  const [errorSnapshot, setErrorSnapshot] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [avisosLww, setAvisosLww] = useState<AvisoSobrescrituraLWW[]>([]);
  const [tutorialesVistos, setTutorialesVistos] = useState<Partial<Record<RolEmpresa, boolean>>>(() => {
    const guardada = repositorioOperacion.obtenerSesionGuardada();
    return guardada ? repositorioOperacion.obtenerTutorialesVistos(guardada.usuario.id) : {};
  });

  const isDemoActivo = useMemo(() => repositorioOperacion.esModoDemoActivo(), []);
  const cuentasDemo = useMemo(() => repositorioOperacion.listarCuentasDemo(), []);

  const cargarProyeccion = useCallback(
    async (sesionObjetivo: SesionActiva) => {
      setIsLoadingSnapshot(true);
      setErrorSnapshot(null);
      try {
        const mem = sesionObjetivo.membresias.find(
          (m) => m.empresaId === sesionObjetivo.empresaActivaId
        );
        const res = await repositorioOperacion.cargarSnapshotParaRol({
          empresaId: sesionObjetivo.empresaActivaId,
          rol: sesionObjetivo.rolActivo,
          usuarioId: sesionObjetivo.usuario.id,
          personalIdMembresia: mem?.personalId,
        });
        setProyeccion(res);
      } catch (err: unknown) {
        setErrorSnapshot(
          err instanceof Error
            ? err.message
            : 'No se pudieron cargar los datos operativos desde el almacenamiento local.'
        );
      } finally {
        setIsLoadingSnapshot(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!sesion) {
      setTutorialesVistos({});
      return;
    }
    setTutorialesVistos(repositorioOperacion.obtenerTutorialesVistos(sesion.usuario.id));
    let active = true;
    (async () => {
      try {
        const lista = await repositorioOperacion.listarEmpresasDeUsuario(sesion.usuario.id);
        if (!active) return;
        setEmpresasDisponibles(lista);
        await cargarProyeccion(sesion);
      } catch (err: unknown) {
        if (!active) return;
        setErrorSnapshot(
          err instanceof Error ? err.message : 'No se pudo inicializar la sesión operativa.'
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [sesion, cargarProyeccion]);

  const refrescar = useCallback(async () => {
    if (!sesion) return;
    await cargarProyeccion(sesion);
  }, [sesion, cargarProyeccion]);

  const iniciarSesion = useCallback(
    async (email: string, password: string) => {
      const nuevaSesion = await repositorioOperacion.iniciarSesion(email, password);
      const lista = await repositorioOperacion.listarEmpresasDeUsuario(nuevaSesion.usuario.id);
      setEmpresasDisponibles(lista);
      setSesion(nuevaSesion);
      setTutorialesVistos(repositorioOperacion.obtenerTutorialesVistos(nuevaSesion.usuario.id));
      if (lista.length > 1) {
        setRequiereElegirEmpresa(true);
      } else {
        setRequiereElegirEmpresa(false);
        await cargarProyeccion(nuevaSesion);
      }
      return nuevaSesion;
    },
    [cargarProyeccion]
  );

  const entrarConCacheOffline = useCallback(async () => {
    const guardada = repositorioOperacion.obtenerSesionGuardada();
    if (!guardada) return null;
    setSesion(guardada);
    setRequiereElegirEmpresa(false);
    setTutorialesVistos(repositorioOperacion.obtenerTutorialesVistos(guardada.usuario.id));
    await cargarProyeccion(guardada);
    return guardada;
  }, [cargarProyeccion]);

  const seleccionarEmpresa = useCallback(
    async (empresaId: string) => {
      const actualizada = await repositorioOperacion.cambiarEmpresaActiva(empresaId);
      setSesion(actualizada);
      setRequiereElegirEmpresa(false);
      await cargarProyeccion(actualizada);
      return actualizada;
    },
    [cargarProyeccion]
  );

  const cerrarSesion = useCallback(async () => {
    await repositorioOperacion.cerrarSesion();
    setSesion(null);
    setProyeccion(null);
    setEmpresasDisponibles([]);
    setRequiereElegirEmpresa(false);
    setAvisosLww([]);
    setErrorSnapshot(null);
    setTutorialesVistos({});
  }, []);

  const pendingCounts = useMemo<ConteoPendientesPorTipo>(() => {
    if (!proyeccion) return EMPTY_PENDING_COUNTS;
    return calcularConteoPendientesPorTipo(proyeccion);
  }, [proyeccion]);

  const hasConflict = useMemo(() => {
    if (!proyeccion) return false;
    const snap = proyeccion.snapshot;
    if (proyeccion.rol === 'tecnico') {
      return (
        snap.servicios.some((x) => x.syncStatus === 'conflict') ||
        snap.viaticos.some((x) => x.syncStatus === 'conflict') ||
        snap.bitacoras.some((x) => x.syncStatus === 'conflict')
      );
    }
    return (
      snap.proyectos.some((x) => x.syncStatus === 'conflict') ||
      snap.rutas.some((x) => x.syncStatus === 'conflict') ||
      snap.servicios.some((x) => x.syncStatus === 'conflict') ||
      snap.asignaciones.some((x) => x.syncStatus === 'conflict') ||
      snap.viaticos.some((x) => x.syncStatus === 'conflict')
    );
  }, [proyeccion]);

  const sincronizarAhora = useCallback(async (): Promise<{
    ocrProcesados: number;
    sobrescritosLocales: AvisoSobrescrituraLWW[];
  } | null> => {
    if (!isOnline || isSyncing || !sesion) return null;
    setIsSyncing(true);
    try {
      const res = await repositorioOperacion.sincronizarConServidor(sesion.empresaActivaId);
      if (res.sobrescritosLocales.length > 0) {
        setAvisosLww((prev) => [...res.sobrescritosLocales, ...prev].slice(0, 10));
      }
      await cargarProyeccion(sesion);
      return {
        ocrProcesados: res.ocrProcesados,
        sobrescritosLocales: res.sobrescritosLocales,
      };
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, isSyncing, sesion, cargarProyeccion]);

  useEffect(() => {
    if (isOnline && pendingCounts.total > 0 && proyeccion && sesion) {
      sincronizarAhora().catch(() => {
        // Mantiene estado offline/pendiente hasta siguiente reintento manual o reconexión
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const empresaId = sesion?.empresaActivaId ?? '';

  const configuracion = useMemo(() => {
    if (!proyeccion || proyeccion.rol === 'tecnico') return null;
    return asegurarConfiguracionEmpresa(
      proyeccion.snapshot.empresa.id,
      proyeccion.snapshot.configuracion
    );
  }, [proyeccion]);

  const cargos = useMemo<CargoConfig[]>(() => {
    if (!proyeccion) return [];
    if (proyeccion.rol === 'tecnico') return proyeccion.snapshot.cargos;
    return configuracion?.cargos ?? [];
  }, [proyeccion, configuracion]);

  const combustiblesVigentes = useMemo(
    () => (configuracion ? obtenerCombustiblesVigentes(configuracion) : []),
    [configuracion]
  );

  const serviciosVigentes = useMemo(
    () => (configuracion ? obtenerServiciosVigentes(configuracion) : []),
    [configuracion]
  );

  const factoresTerrenoVigentes = useMemo(
    () => (configuracion ? obtenerFactoresTerrenoVigentes(configuracion) : null),
    [configuracion]
  );

  const reglasViaticosVigentes = useMemo(
    () => (configuracion ? obtenerReglasViaticosVigentes(configuracion) : null),
    [configuracion]
  );

  const onboarding = useMemo<EstadoOnboardingEmpresa | null>(() => {
    if (!proyeccion || proyeccion.rol === 'tecnico') return null;
    return asegurarEstadoOnboarding(
      proyeccion.snapshot.empresa.id,
      proyeccion.snapshot.onboarding
    );
  }, [proyeccion]);

  const tutorialesPerfil = useMemo<TutorialTarjeta[]>(() => {
    const rol = sesion?.rolActivo ?? 'tecnico';
    return obtenerTutorialPorPerfil(rol);
  }, [sesion?.rolActivo]);

  const marcarTutorialVisto = useCallback(
    (rolObjetivo?: RolEmpresa) => {
      if (!sesion) return;
      const rol = rolObjetivo ?? sesion.rolActivo;
      const actualizado = repositorioOperacion.marcarTutorialVisto(sesion.usuario.id, rol);
      setTutorialesVistos(actualizado);
    },
    [sesion]
  );

  const actions = useMemo(
    () => ({
      transicionarServicio: async (params: {
        servicioId: string;
        nuevoEstado: EstadoServicio;
        payload?: PayloadTransicionServicio;
      }) => {
        const res = await repositorioOperacion.transicionarServicio({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      agregarBitacora: async (
        datos: Omit<BitacoraEntrada, 'id' | 'empresaId' | 'fechaAST' | 'syncStatus'>
      ) => {
        const res = await repositorioOperacion.agregarBitacora(empresaId, datos);
        await refrescar();
        return res;
      },
      registrarViatico: async (
        datos: Omit<Viatico, 'id' | 'empresaId' | 'estadoAprobacion' | 'version' | 'updatedAt'>
      ) => {
        const res = await repositorioOperacion.registrarViatico(empresaId, datos);
        await refrescar();
        return res;
      },
      editarViatico: async (
        viaticoId: string,
        datos: Omit<
          Viatico,
          | 'id'
          | 'empresaId'
          | 'creadoPorUsuarioId'
          | 'creadoPorNombre'
          | 'estadoAprobacion'
          | 'motivoRechazo'
          | 'aprobadoPorUsuarioId'
          | 'aprobadoEn'
          | 'version'
          | 'updatedAt'
        >
      ) => {
        const res = await repositorioOperacion.editarViatico(empresaId, viaticoId, datos);
        await refrescar();
        return res;
      },
      eliminarViatico: async (viaticoId: string) => {
        await repositorioOperacion.eliminarViatico(empresaId, viaticoId);
        await refrescar();
      },
      crearCliente: async (datos: Omit<Cliente, 'id' | 'empresaId'>) => {
        const res = await repositorioOperacion.crearCliente(empresaId, datos);
        await refrescar();
        return res;
      },
      crearProyecto: async (
        datos: Omit<
          Proyecto,
          'id' | 'empresaId' | 'estado' | 'fechaCreacion' | 'version' | 'updatedAt' | 'syncStatus'
        >
      ) => {
        const res = await repositorioOperacion.crearProyecto(empresaId, datos);
        await refrescar();
        return res;
      },
      actualizarProyecto: async (proyecto: Proyecto) => {
        const res = await repositorioOperacion.actualizarProyecto(empresaId, proyecto);
        await refrescar();
        return res;
      },
      crearRuta: async (
        datos: Omit<Ruta, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
      ) => {
        const res = await repositorioOperacion.crearRuta(empresaId, datos);
        await refrescar();
        return res;
      },
      actualizarRuta: async (ruta: Ruta) => {
        const res = await repositorioOperacion.actualizarRuta(empresaId, ruta);
        await refrescar();
        return res;
      },
      crearServicio: async (
        datos: Omit<Servicio, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'>
      ) => {
        const res = await repositorioOperacion.crearServicio(empresaId, datos);
        await refrescar();
        return res;
      },
      actualizarServicio: async (servicio: Servicio) => {
        const res = await repositorioOperacion.actualizarServicio(empresaId, servicio);
        await refrescar();
        return res;
      },
      guardarAsignacion: async (
        datos: Omit<Asignacion, 'id' | 'empresaId' | 'version' | 'updatedAt' | 'syncStatus'> & {
          id?: string;
        }
      ) => {
        const res = await repositorioOperacion.guardarAsignacion(empresaId, datos);
        await refrescar();
        return res;
      },
      eliminarAsignacion: async (asignacionId: string) => {
        await repositorioOperacion.eliminarAsignacion(empresaId, asignacionId);
        await refrescar();
      },
      actualizarRepartoViatico: async (viaticoId: string, repartos: RepartoProyecto[]) => {
        const res = await repositorioOperacion.actualizarRepartoViatico(
          empresaId,
          viaticoId,
          repartos
        );
        await refrescar();
        return res;
      },
      decidirViatico: async (params: {
        viaticoId: string;
        nuevoEstado: EstadoAprobacionViatico;
        motivoRechazo?: string;
        motivoDecision?: string;
      }) => {
        const res = await repositorioOperacion.decidirViatico({ empresaId, ...params });
        await refrescar();
        return res;
      },
      guardarPersonal: async (
        item: Omit<Personal, 'id' | 'empresaId'> & { id?: string }
      ) => {
        const res = await repositorioOperacion.guardarPersonal(empresaId, item);
        await refrescar();
        return res;
      },
      guardarVehiculo: async (
        item: Omit<Vehiculo, 'id' | 'empresaId'> & { id?: string }
      ) => {
        const res = await repositorioOperacion.guardarVehiculo(empresaId, item);
        await refrescar();
        return res;
      },
      guardarEquipo: async (
        item: Omit<EquipoGNSS, 'id' | 'empresaId'> & { id?: string }
      ) => {
        const res = await repositorioOperacion.guardarEquipo(empresaId, item);
        await refrescar();
        return res;
      },
      guardarCuadrilla: async (
        item: Omit<Cuadrilla, 'id' | 'empresaId'> & { id?: string }
      ) => {
        const res = await repositorioOperacion.guardarCuadrilla(empresaId, item);
        await refrescar();
        return res;
      },
      actualizarEmpresa: async (emp: Empresa) => {
        const res = await repositorioOperacion.actualizarEmpresa(emp);
        await refrescar();
        if (sesion) {
          const lista = await repositorioOperacion.listarEmpresasDeUsuario(sesion.usuario.id);
          setEmpresasDisponibles(lista);
        }
        return res;
      },
      guardarMembresiaUsuario: async (params: {
        email: string;
        nombre: string;
        rol: RolEmpresa;
        personalId?: string;
        activo: boolean;
      }) => {
        const res = await repositorioOperacion.guardarMembresiaUsuario({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      actualizarAccesoMembresia: async (params: {
        usuarioId: string;
        rol: RolEmpresa;
        activo: boolean;
      }) => {
        await repositorioOperacion.actualizarAccesoMembresia({
          empresaId,
          ...params,
        });
        await refrescar();
      },
      guardarCargoConfig: async (cargo: Pick<CargoConfig, 'codigo' | 'etiqueta' | 'activo'>) => {
        const res = await repositorioOperacion.guardarCargoConfig(empresaId, cargo);
        await refrescar();
        return res;
      },
      eliminarCargoConfig: async (codigo: string) => {
        const res = await repositorioOperacion.eliminarCargoConfig(empresaId, codigo);
        await refrescar();
        return res;
      },
      crearTipoCombustible: async (params: {
        nombre: string;
        precioGalonRD: number;
        vigenciaDesde: string;
      }) => {
        const res = await repositorioOperacion.crearTipoCombustible({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      agregarVigenciaCombustible: async (params: {
        combustibleId: string;
        precioGalonRD: number;
        vigenciaDesde: string;
        activo?: boolean;
      }) => {
        const res = await repositorioOperacion.agregarVigenciaCombustible({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      crearServicioCatalogo: async (params: {
        codigo: string;
        nombre: string;
        subtitulo: string;
        tarifaInicial: Omit<TarifaServicioVersion, 'version'>;
      }) => {
        const res = await repositorioOperacion.crearServicioCatalogo({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      agregarVigenciaServicio: async (params: {
        servicioCodigo: string;
        nombre?: string;
        subtitulo?: string;
        activo?: boolean;
        tarifa: Omit<TarifaServicioVersion, 'version'>;
      }) => {
        const res = await repositorioOperacion.agregarVigenciaServicio({
          empresaId,
          ...params,
        });
        await refrescar();
        return res;
      },
      agregarVigenciaFactoresTerreno: async (
        factores: Omit<TerrenoFactorVersion, 'version'>
      ) => {
        const res = await repositorioOperacion.agregarVigenciaFactoresTerreno({
          empresaId,
          factores,
        });
        await refrescar();
        return res;
      },
      agregarVigenciaReglasViaticos: async (reglas: Omit<ReglasViaticosVersion, 'version'>) => {
        const res = await repositorioOperacion.agregarVigenciaReglasViaticos({
          empresaId,
          reglas,
        });
        await refrescar();
        return res;
      },
      guardarOnboarding: async (nuevoEstado: EstadoOnboardingEmpresa) => {
        const res = await repositorioOperacion.guardarOnboarding(empresaId, nuevoEstado);
        await refrescar();
        return res;
      },
      cargarSnapshotParaValidacion: async () =>
        repositorioOperacion.cargarSnapshotEmpresa(empresaId),
    }),
    [empresaId, refrescar, sesion]
  );

  return {
    sesion,
    empresasDisponibles,
    requiereElegirEmpresa,
    proyeccion,
    configuracion,
    cargos,
    combustiblesVigentes,
    serviciosVigentes,
    factoresTerrenoVigentes,
    reglasViaticosVigentes,
    onboarding,
    tutorialesPerfil,
    tutorialesVistos,
    isLoadingSnapshot,
    errorSnapshot,
    isSyncing,
    avisosLww,
    pendingCounts,
    hasConflict,
    isDemoActivo,
    cuentasDemo,
    iniciarSesion,
    entrarConCacheOffline,
    seleccionarEmpresa,
    cerrarSesion,
    refrescar,
    sincronizarAhora,
    marcarTutorialVisto,
    descartarAvisosLww: () => setAvisosLww([]),
    actions,
  };
}
