import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FolderKanban,
  MapPin,
  Receipt,
  Settings,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { RolEmpresa, TutorialTarjeta } from '../types/domain';

interface TutorialVisualModalProps {
  isOpen: boolean;
  rol: RolEmpresa;
  tarjetas: TutorialTarjeta[];
  onClose: () => void;
  onCompletar: () => void;
}

const ETIQUETA_ROL: Record<RolEmpresa, string> = {
  admin: 'Administrador',
  coordinador: 'Coordinador',
  tecnico: 'Técnico de Campo',
};

const DiagramaPantalla: React.FC<{ pantallaClave: TutorialTarjeta['pantallaClave'] }> = ({
  pantallaClave,
}) => {
  switch (pantallaClave) {
    case 'admin_hoy':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2.5 text-xs">
          <div className="flex items-center justify-between bg-white border border-slate-200/90 rounded-xl px-3 py-2">
            <span className="font-semibold text-[#0F2942]">Puesta en marcha · 40%</span>
            <span className="text-[#0284C7] font-semibold">Continuar &rarr;</span>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {['Rutas hoy', 'Cuadrillas', 'Viáticos', 'Flota'].map((k, idx) => (
              <div key={k} className="bg-white border border-slate-200/90 rounded-xl p-2">
                <div className="text-[10px] text-[#475569] truncate">{k}</div>
                <div className="font-mono text-sm font-bold text-[#0F2942] tabular-nums mt-0.5">
                  {idx + 2}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'admin_config':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 grid grid-cols-12 gap-2.5 text-xs">
          <div className="col-span-4 space-y-1 bg-white border border-slate-200/90 rounded-xl p-2">
            <div className="px-2 py-1 bg-[#0F2942] text-white rounded-lg font-semibold flex items-center gap-1">
              <Settings className="w-3 h-3" /> Tarifas
            </div>
            <div className="px-2 py-1 text-[#475569]">Empresa</div>
            <div className="px-2 py-1 text-[#475569]">Cargos</div>
          </div>
          <div className="col-span-8 bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1.5">
            <div className="font-semibold text-[#0F2942]">Historial de vigencias</div>
            <div className="flex justify-between text-[11px] text-[#475569] border-b border-slate-100 pb-1">
              <span>v1 · 2026-01-01</span>
              <span className="font-mono tabular-nums font-semibold">RD$ 26.50 / km</span>
            </div>
            <div className="flex justify-between text-[11px] text-[#15803D]">
              <span>v2 · Nueva fecha</span>
              <span className="font-semibold">Sin recalcular histórico</span>
            </div>
          </div>
        </div>
      );
    case 'admin_kmz':
    case 'coord_rutas':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 grid grid-cols-12 gap-2.5 text-xs">
          <div className="col-span-7 bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 font-semibold text-[#0F2942]">
              <Compass className="w-3.5 h-3.5 text-[#0284C7]" /> Polígono &amp; Ruta OSM
            </div>
            <div className="h-14 bg-[#F1F5F9] border border-dashed border-slate-300 rounded-xl flex items-center justify-center text-[11px] text-[#475569]">
              Polígono parcelario + trazado carretera
            </div>
          </div>
          <div className="col-span-5 bg-white border border-slate-200/90 rounded-xl p-2.5 space-y-1">
            <div className="text-[11px] text-[#475569]">Cotización vigente</div>
            <div className="font-mono font-bold text-[#0F2942] tabular-nums">RD$ 98,400</div>
            <div className="text-[10px] text-[#15803D] font-medium">Aplica directo a proyecto</div>
          </div>
        </div>
      );
    case 'admin_viaticos':
    case 'coord_viaticos':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-[#0284C7]" />
              <span className="font-semibold text-[#0F2942]">Reparto exacto por proyecto</span>
            </div>
            <span className="font-mono font-bold tabular-nums text-[#15803D]">100% cuadrado</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {['Presupuesto', 'Ejecutado', 'Saldo'].map((c) => (
              <div key={c} className="bg-white border border-slate-200/90 rounded-xl p-2 text-center">
                <div className="text-[10px] text-[#475569]">{c}</div>
                <div className="font-mono font-bold text-[#0F2942] tabular-nums">RD$ —</div>
              </div>
            ))}
          </div>
        </div>
      );
    case 'coord_proyectos':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-[#0F2942]">
            <FolderKanban className="w-4 h-4 text-[#0284C7]" /> Flujo de estados
          </div>
          <div className="grid grid-cols-4 gap-1.5 text-[10px] text-center font-semibold">
            <div className="bg-white border border-slate-200/90 rounded-xl py-1.5">Cotizado</div>
            <div className="bg-white border border-slate-200/90 rounded-xl py-1.5">Aprobado</div>
            <div className="bg-white border border-slate-200/90 rounded-xl py-1.5">Entregado</div>
            <div className="bg-[#15803D] text-white rounded-xl py-1.5">Cobrado</div>
          </div>
        </div>
      );
    case 'coord_agenda':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#0F2942] flex items-center gap-1.5">
              <CalendarDays className="w-3.5 h-3.5 text-[#0284C7]" /> Agenda por rango de fechas
            </span>
            <span className="text-[#DC2626] font-semibold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Valida choques
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-[10px] text-center">
            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie'].map((d) => (
              <div key={d} className="bg-white border border-slate-200/90 rounded-xl py-2 font-medium">
                {d}
              </div>
            ))}
          </div>
        </div>
      );
    case 'tec_hoy':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between">
            <div>
              <div className="font-semibold text-[#0F2942]">Tus rutas de hoy</div>
              <div className="text-[11px] text-[#475569]">Solo asignaciones de tu cuadrilla</div>
            </div>
            <span className="px-2.5 py-1 bg-[#0284C7] text-white rounded-xl font-semibold">
              Reportar
            </span>
          </div>
        </div>
      );
    case 'tec_detalle':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between">
            <span className="font-semibold text-[#0F2942] flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-[#0284C7]" /> Polígono UTM 19N + GPS en vivo
            </span>
            <span className="text-[#15803D] font-semibold">En campo &rarr; Procesando</span>
          </div>
        </div>
      );
    case 'tec_bitacora':
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between">
            <span className="font-semibold text-[#0F2942] flex items-center gap-1.5">
              <Camera className="w-4 h-4 text-[#0284C7]" /> Nota de campo + Fotos comprimidas
            </span>
            <span className="text-[#475569]">Funciona offline</span>
          </div>
        </div>
      );
    case 'tec_viaticos':
    default:
      return (
        <div className="bg-[#F8FAFC] border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
          <div className="bg-white border border-slate-200/90 rounded-xl p-2.5 flex items-center justify-between">
            <span className="font-semibold text-[#0F2942] flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-[#0284C7]" /> Recibo + GPS Ruta + Tarifas rápidas
            </span>
            <span className="text-[#15803D] font-semibold">Editable en pendiente</span>
          </div>
        </div>
      );
  }
};

export const TutorialVisualModal: React.FC<TutorialVisualModalProps> = ({
  isOpen,
  rol,
  tarjetas,
  onClose,
  onCompletar,
}) => {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setIndice(0);
    }
  }, [isOpen, rol]);

  if (!isOpen || tarjetas.length === 0) return null;

  const actual = tarjetas[Math.min(indice, tarjetas.length - 1)];
  const esPrimera = indice === 0;
  const esUltima = indice >= tarjetas.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#0F2942]/65 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-tutorial-visual"
    >
      <div className="bg-white border border-slate-200/90 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl">
        <div className="px-5 py-4 border-b border-slate-200/80 bg-[#F8FAFC] flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold text-[#0284C7]">
              Guía rápida · {ETIQUETA_ROL[rol]}
            </div>
            <h3 id="titulo-tutorial-visual" className="text-base font-bold tracking-tight text-[#0F2942] mt-0.5">
              {actual.titulo}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-[#475569] hover:text-[#0F2942] hover:bg-slate-200/70 rounded-xl shrink-0 transition-colors"
            aria-label="Omitir tutorial"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[#475569] leading-relaxed">{actual.fraseCorta}</p>

          <DiagramaPantalla pantallaClave={actual.pantallaClave} />

          <ul className="space-y-2">
            {actual.destacados.map((punto) => (
              <li key={punto} className="flex items-start gap-2 text-xs text-slate-700">
                <CheckCircle2 className="w-4 h-4 text-[#15803D] shrink-0 mt-0.5" />
                <span>{punto}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-center gap-1.5 pt-1">
            {tarjetas.map((t, i) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setIndice(i)}
                aria-label={`Tarjeta ${i + 1}`}
                className={`h-2 rounded-full transition-all ${
                  i === indice ? 'w-6 bg-[#0F2942]' : 'w-2 bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200/80 bg-[#F8FAFC] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-semibold text-[#475569] hover:text-[#0F2942] min-h-[40px] px-2 transition-colors"
          >
            Omitir tutorial
          </button>
          <div className="flex items-center gap-2">
            {!esPrimera && (
              <button
                type="button"
                onClick={() => setIndice((prev) => Math.max(0, prev - 1))}
                className="min-h-[40px] inline-flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold text-[#0F2942] rounded-xl whitespace-nowrap transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Paso anterior
              </button>
            )}
            {!esUltima ? (
              <button
                type="button"
                onClick={() => setIndice((prev) => Math.min(tarjetas.length - 1, prev + 1))}
                className="min-h-[40px] inline-flex items-center gap-1 px-4 py-1.5 bg-[#0F2942] hover:bg-[#0284C7] text-white text-xs font-semibold rounded-xl whitespace-nowrap transition-colors shadow-sm"
              >
                Siguiente paso
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onCompletar}
                className="min-h-[40px] px-4 py-1.5 bg-[#0284C7] hover:bg-[#0369A1] text-white text-xs font-semibold rounded-xl whitespace-nowrap transition-colors shadow-sm"
              >
                Finalizar guía
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
