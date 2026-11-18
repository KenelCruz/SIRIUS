import React from 'react';
import { ETIQUETA_ESTADO } from '../domain';
import type { EstadoServicio } from '../types/domain';

const STATUS_STYLES: Record<EstadoServicio, string> = {
  cotizado: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  aprobado: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  programado: 'bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]',
  en_campo: 'bg-[#FEF9C3] text-[#A16207] border-[#FDE047]',
  procesando: 'bg-[#E0F2FE] text-[#0369A1] border-[#7DD3FC]',
  entregado: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  cobrado: 'bg-[#F0FDF4] text-[#15803D] border-[#86EFAC]',
};

interface WorkflowBadgeProps {
  status: EstadoServicio;
}

export const WorkflowBadge: React.FC<WorkflowBadgeProps> = ({ status }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${STATUS_STYLES[status]}`}
    >
      {ETIQUETA_ESTADO[status]}
    </span>
  );
};
