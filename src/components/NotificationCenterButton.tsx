import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Bell,
  Check,
  CheckCheck,
  Info,
  X,
} from 'lucide-react';
import type { AlertaOperativa, SeveridadAlerta } from '../domain';

interface NotificationCenterButtonProps {
  alertas: AlertaOperativa[];
  leidasIds: Set<string>;
  onMarcarLeida: (alertaId: string) => void;
  onMarcarTodasLeidas: () => void;
  onEjecutarAccion: (alerta: AlertaOperativa) => void;
  onVerCentroAlertas?: () => void;
}

const SEVERIDAD_META: Record<
  SeveridadAlerta,
  {
    label: string;
    icon: React.FC<{ className?: string }>;
    textClass: string;
    iconBgClass: string;
  }
> = {
  critica: {
    label: 'Crítica',
    icon: AlertOctagon,
    textClass: 'text-[#DC2626]',
    iconBgClass: 'bg-rose-50 text-[#DC2626]',
  },
  advertencia: {
    label: 'Advertencia',
    icon: AlertTriangle,
    textClass: 'text-[#B45309]',
    iconBgClass: 'bg-amber-50 text-[#B45309]',
  },
  informativa: {
    label: 'Aviso',
    icon: Info,
    textClass: 'text-[#0284C7]',
    iconBgClass: 'bg-sky-50 text-[#0284C7]',
  },
};

export const NotificationCenterButton: React.FC<NotificationCenterButtonProps> = ({
  alertas,
  leidasIds,
  onMarcarLeida,
  onMarcarTodasLeidas,
  onEjecutarAccion,
  onVerCentroAlertas,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [filtroSeveridad, setFiltroSeveridad] = useState<'todas' | 'critica' | 'advertencia'>(
    'todas'
  );
  const [soloNoLeidas, setSoloNoLeidas] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen]);

  const noLeidas = useMemo(
    () => alertas.filter((a) => !leidasIds.has(a.id)),
    [alertas, leidasIds]
  );

  const criticasNoLeidas = useMemo(
    () => noLeidas.filter((a) => a.severidad === 'critica').length,
    [noLeidas]
  );

  const advertenciasNoLeidas = useMemo(
    () => noLeidas.filter((a) => a.severidad === 'advertencia').length,
    [noLeidas]
  );

  const conteos = useMemo(() => {
    let criticas = 0;
    let advertencias = 0;
    for (const a of alertas) {
      if (a.severidad === 'critica') criticas++;
      else if (a.severidad === 'advertencia') advertencias++;
    }
    return { total: alertas.length, criticas, advertencias };
  }, [alertas]);

  const alertasVisibles = useMemo(() => {
    return alertas.filter((a) => {
      if (filtroSeveridad !== 'todas' && a.severidad !== filtroSeveridad) return false;
      if (soloNoLeidas && leidasIds.has(a.id)) return false;
      return true;
    });
  }, [alertas, filtroSeveridad, soloNoLeidas, leidasIds]);

  const badgeBgClass =
    criticasNoLeidas > 0
      ? 'bg-[#DC2626] text-white'
      : advertenciasNoLeidas > 0
      ? 'bg-[#B45309] text-white'
      : 'bg-[#0284C7] text-white';

  return (
    <div ref={containerRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={`Notificaciones y alertas (${noLeidas.length} sin leer)`}
        title="Alertas y notificaciones operativas"
        className={`relative inline-flex items-center justify-center rounded-xl border px-2.5 py-2 text-xs font-semibold transition-colors min-h-[40px] min-w-[40px] whitespace-nowrap shrink-0 ${
          isOpen
            ? 'border-[#0284C7] bg-sky-50 text-[#0F2942]'
            : 'border-slate-200 bg-white text-[#0F2942] hover:bg-slate-50'
        }`}
      >
        <Bell className="h-4 w-4 text-[#0F2942]" />
        {noLeidas.length > 0 && (
          <span
            className={`ml-1.5 inline-flex items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums leading-none ${badgeBgClass}`}
          >
            {noLeidas.length > 99 ? '99+' : noLeidas.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Centro de alertas y notificaciones"
          className="fixed inset-x-3 top-18 sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-[430px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 bg-white shadow-xl z-50 flex flex-col max-h-[82vh] overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#0F2942]">Alertas y Notificaciones</h3>
                <span className="font-mono text-[11px] font-semibold text-[#475569] tabular-nums">
                  {noLeidas.length} sin leer
                </span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-0.5">
                Avisos calculados en tiempo real sobre operación vigente
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Cerrar panel de notificaciones"
              className="rounded-lg p-1.5 text-[#64748B] hover:bg-slate-100 hover:text-[#0F2942] transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Filter Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-[#F8FAFC] px-4 py-2.5">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setFiltroSeveridad('todas')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  filtroSeveridad === 'todas'
                    ? 'bg-[#0F2942] text-white'
                    : 'text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                Todas ({conteos.total})
              </button>
              <button
                type="button"
                onClick={() => setFiltroSeveridad('critica')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  filtroSeveridad === 'critica'
                    ? 'bg-[#DC2626] text-white'
                    : 'text-[#475569] hover:text-[#DC2626]'
                }`}
              >
                Críticas ({conteos.criticas})
              </button>
              <button
                type="button"
                onClick={() => setFiltroSeveridad('advertencia')}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  filtroSeveridad === 'advertencia'
                    ? 'bg-[#B45309] text-white'
                    : 'text-[#475569] hover:text-[#B45309]'
                }`}
              >
                Advert. ({conteos.advertencias})
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSoloNoLeidas((prev) => !prev)}
                className={`rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors whitespace-nowrap ${
                  soloNoLeidas
                    ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]'
                    : 'border-slate-200 bg-white text-[#475569] hover:text-[#0F2942]'
                }`}
              >
                No leídas
              </button>
              {noLeidas.length > 0 && (
                <button
                  type="button"
                  onClick={onMarcarTodasLeidas}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#0284C7] hover:bg-sky-50 transition-colors whitespace-nowrap"
                  title="Marcar todas las alertas visibles como leídas"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>Marcar todas</span>
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
            {alertasVisibles.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-[#15803D]">
                  <Check className="h-5 w-5" />
                </div>
                <div className="text-xs font-bold text-[#0F2942]">
                  {alertas.length === 0
                    ? 'Sin alertas activas'
                    : 'No hay alertas para este filtro'}
                </div>
                <p className="mt-1 text-[11px] text-[#64748B]">
                  {alertas.length === 0
                    ? 'Todos los indicadores operativos y de seguimiento están al día.'
                    : 'Prueba cambiando el filtro de severidad o mostrando alertas ya leídas.'}
                </p>
              </div>
            ) : (
              alertasVisibles.map((alerta) => {
                const meta = SEVERIDAD_META[alerta.severidad];
                const Icono = meta.icon;
                const leida = leidasIds.has(alerta.id);

                return (
                  <div
                    key={alerta.id}
                    className={`px-4 py-3.5 transition-colors ${
                      leida ? 'bg-white opacity-75 hover:opacity-100' : 'bg-[#F8FAFC]/80 hover:bg-[#F8FAFC]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${meta.iconBgClass}`}
                      >
                        <Icono className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className={`font-bold uppercase tracking-wide ${meta.textClass}`}>
                            {meta.label}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-semibold text-[#0F2942]">
                            {alerta.moduloEtiqueta}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="font-mono text-[#64748B] tabular-nums">
                            {alerta.fechaIso}
                          </span>
                          {!leida && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">
                                ·
                              </span>
                              <span className="font-semibold text-[#0284C7]">Nueva</span>
                            </>
                          )}
                        </div>

                        <div className="text-xs font-bold text-[#0F2942] leading-snug">
                          {alerta.titulo}
                        </div>
                        <p className="text-[11px] text-[#475569] leading-relaxed">
                          {alerta.detalle}
                        </p>

                        <div className="flex items-center justify-between gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (!leida) onMarcarLeida(alerta.id);
                              setIsOpen(false);
                              onEjecutarAccion(alerta);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0284C7] hover:text-[#0F2942] transition-colors whitespace-nowrap"
                          >
                            <span>{alerta.accionEtiqueta}</span>
                            <ArrowRight className="h-3 w-3" />
                          </button>

                          {!leida ? (
                            <button
                              type="button"
                              onClick={() => onMarcarLeida(alerta.id)}
                              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#64748B] hover:bg-slate-100 hover:text-[#0F2942] transition-colors whitespace-nowrap"
                            >
                              <Check className="h-3 w-3" />
                              <span>Marcar leída</span>
                            </button>
                          ) : (
                            <span className="text-[11px] font-medium text-[#64748B]">Leída</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          {onVerCentroAlertas && (
            <div className="border-t border-slate-100 bg-[#F8FAFC] px-4 py-2.5 flex items-center justify-between">
              <span className="text-[11px] text-[#64748B] font-mono tabular-nums">
                {alertas.length} alerta(s) activa(s)
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onVerCentroAlertas();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#0F2942] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#0284C7] transition-colors whitespace-nowrap"
              >
                <span>Ver centro de auditoría y alertas</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
