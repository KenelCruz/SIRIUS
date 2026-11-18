import React from 'react';
import type { WorkflowStatus } from '../types/geodesy';

const STATUS_STYLES: Record<WorkflowStatus, string> = {
  COTIZADO: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]',
  APROBADO: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  PROGRAMADO: 'bg-[#F5F3FF] text-[#6D28D9] border-[#DDD6FE]',
  'EN CAMPO': 'bg-[#FEF9C3] text-[#A16207] border-[#FDE047]',
  PROCESANDO: 'bg-[#E0F2FE] text-[#0369A1] border-[#7DD3FC]',
  ENTREGADO: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  COBRADO: 'bg-[#F0FDF4] text-[#15803D] border-[#86EFAC]',
};

interface WorkflowBadgeProps {
  status: WorkflowStatus;
}

export const WorkflowBadge: React.FC<WorkflowBadgeProps> = ({ status }) => {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium whitespace-nowrap shrink-0 ${STATUS_STYLES[status]}`}
    >
      {status === 'EN CAMPO' && (
        <span className="h-1.5 w-1.5 rounded-full bg-[#A16207]" aria-hidden="true" />
      )}
      {status}
    </span>
  );
};
