import type { RolEmpresa, TutorialTarjeta } from '../types/domain';

export const TUTORIALES_POR_PERFIL: Record<RolEmpresa, TutorialTarjeta[]> = {
  admin: [
    {
      id: 'adm-hoy',
      titulo: 'Panel Hoy y Asistente Inicial',
      fraseCorta:
        'Supervisa rutas del día, cuadrillas en campo y completa la puesta en marcha desde un solo lugar.',
      pantallaClave: 'admin_hoy',
      destacados: [
        'Lista de pasos pendientes con acceso directo',
        'Indicadores del día con un clic a cada módulo',
      ],
    },
    {
      id: 'adm-config',
      titulo: 'Configuración Central y Vigencias',
      fraseCorta:
        'Actualiza combustibles, servicios, cargos y viáticos por fecha sin alterar reportes históricos.',
      pantallaClave: 'admin_config',
      destacados: [
        'Cada tarifa guarda historial con vigenciaDesde',
        'Administra roles y acceso de usuarios por empresa',
      ],
    },
    {
      id: 'adm-kmz',
      titulo: 'Rutas KMZ, Cotizador y Conflictos',
      fraseCorta:
        'Importa polígonos reales, cotiza servicios sumatorios y valida que no falten recursos.',
      pantallaClave: 'admin_kmz',
      destacados: [
        'Cálculo automático de área, peajes y combustible',
        'Bloqueo de vehículos en mantenimiento y alertas',
      ],
    },
    {
      id: 'adm-viaticos',
      titulo: 'Viáticos, Reparto y Auditoría',
      fraseCorta:
        'Revisa comprobantes, reparte montos exactos por proyecto y audita cada cambio con usuario y fecha.',
      pantallaClave: 'admin_viaticos',
      destacados: [
        'Presupuesto vs. ejecutado por contrato en tiempo real',
        'Bitácora inmutable de aprobaciones y tarifas',
      ],
    },
  ],
  coordinador: [
    {
      id: 'coo-proyectos',
      titulo: 'Proyectos, Clientes y Cobros',
      fraseCorta:
        'Registra proyectos en cotizado, aprueba servicios y registra monto y fecha al cobrar.',
      pantallaClave: 'coord_proyectos',
      destacados: [
        'Presupuesto de viáticos y contrato visibles solo para gestión',
        'Transición guiada desde cotizado hasta cobrado',
      ],
    },
    {
      id: 'coo-agenda',
      titulo: 'Agenda de Cuadrillas sin Choques',
      fraseCorta:
        'Programa brigadas, vehículos y equipos GNSS validando todo el rango de fechas.',
      pantallaClave: 'coord_agenda',
      destacados: [
        'Vista diaria y semanal por cuadrilla y equipo',
        'Excepciones permitidas solo con motivo auditado',
      ],
    },
    {
      id: 'coo-rutas',
      titulo: 'Rutas Óptimas y Tarifas Vigentes',
      fraseCorta:
        'Calcula distancias en OpenStreetMap usando los precios vigentes de servicios y flota.',
      pantallaClave: 'coord_rutas',
      destacados: [
        'Consulta tarifas y flota vigente en modo lectura',
        'Aplica presupuesto directo al proyecto vinculado',
      ],
    },
    {
      id: 'coo-viaticos',
      titulo: 'Aprobación y Reparto de Viáticos',
      fraseCorta:
        'Aprueba o rechaza gastos con motivo, ajusta el reparto exacto y exporta detalle CSV.',
      pantallaClave: 'coord_viaticos',
      destacados: [
        'Suma exacta obligatoria entre proyectos o Sin asignar',
        'Exportación con líneas de reparto y saldo disponible',
      ],
    },
  ],
  tecnico: [
    {
      id: 'tec-hoy',
      titulo: 'Tu Jornada en Hoy en Campo',
      fraseCorta:
        'Consulta únicamente tus rutas asignadas de hoy, cuadrilla y acceso rápido a reportar.',
      pantallaClave: 'tec_hoy',
      destacados: [
        'Solo ves tus rutas y tareas asignadas',
        'Funciona incluso sin señal en el campo',
      ],
    },
    {
      id: 'tec-detalle',
      titulo: 'Mapa Parcelario y Estados',
      fraseCorta:
        'Abre el polígono en UTM 19N, inicia trabajo en campo y cierra a Procesando al terminar.',
      pantallaClave: 'tec_detalle',
      destacados: [
        'Captura punto GPS en vivo sobre la parcela',
        'Registra fecha real de inicio y cierre',
      ],
    },
    {
      id: 'tec-bitacora',
      titulo: 'Bitácora de Campo con Fotos',
      fraseCorta:
        'Documenta hitos, monumentación y fotos por servicio para respaldar la entrega.',
      pantallaClave: 'tec_bitacora',
      destacados: [
        'Mínimo 1 nota de bitácora antes de cerrar servicio',
        'Sincroniza automáticamente al recuperar señal',
      ],
    },
    {
      id: 'tec-viaticos',
      titulo: 'Reportar Viáticos y GPS Ruta',
      fraseCorta:
        'Sube foto del recibo, usa tarifas rápidas o calcula combustible automático por distancia.',
      pantallaClave: 'tec_viaticos',
      destacados: [
        'Edita o elimina tus viáticos mientras estén pendientes',
        'Imputa el gasto al proyecto desde el botón Reportar',
      ],
    },
  ],
};

export function obtenerTutorialPorPerfil(rol: RolEmpresa): TutorialTarjeta[] {
  return TUTORIALES_POR_PERFIL[rol] ?? TUTORIALES_POR_PERFIL.tecnico;
}
