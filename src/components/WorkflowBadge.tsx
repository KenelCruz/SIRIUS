import React from 'react';
import { ETIQUETA_ESTADO } from '../domain';
import type { EstadoServicio } from '../types/domain';

const STATUS_STYLES: Record<EstadoServicio, string> = {
  cotizado: 'bg-slate-100 text-slate-700 border-slate-300',
  aprobado: 'bg-sky-50 text-[#0369A1] border-sky-200',
  programado: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  en_campo: 'bg-amber-50 text-[#B45309] border-amber-300',
  procesando: 'bg-sky-100 text-[#0F2942] border-sky-300',
  entregado: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  cobrado: 'bg-emerald-100 text-[#15803D] border-emerald-300',
};

interface WorkflowBadgeProps {
  status: EstadoServicio;
}

export const WorkflowBadge: React.FC<WorkflowBadgeProps> = ({ status }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold whitespace-nowrap shrink-0 ${STATUS_STYLES[status]}`}
    >
      {ETIQUETA_ESTADO[status]}
    </span>
  );
};
