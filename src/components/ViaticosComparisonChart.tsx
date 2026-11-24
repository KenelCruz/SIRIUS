import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { calcularGastoPorProyecto } from '../domain';
import type { Proyecto, Viatico } from '../types/domain';
import { formatRD } from '../utils/geodesy';

interface ViaticosComparisonChartProps {
  proyectos: Proyecto[];
  viaticos: Viatico[];
  onSelectProyecto?: (proyectoId: string) => void;
}

interface ChartDatum {
  id: string;
  shortCode: string;
  codigoContrato: string;
  nombre: string;
  presupuesto: number;
  gastoReal: number;
  overBudget: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: ChartDatum;
  }>;
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;
  const diff = item.presupuesto - item.gastoReal;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3.5 shadow-xl text-xs min-w-[230px]">
      <div className="font-mono text-[11px] font-bold text-[#0284C7]">{item.codigoContrato}</div>
      <div className="font-semibold text-slate-900 mt-0.5 truncate max-w-[250px]">
        {item.nombre}
      </div>
      <div className="mt-2 space-y-1.5 border-t border-slate-200 pt-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Presupuesto Viáticos:</span>
          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
            {formatRD(item.presupuesto)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-600">Gasto Real (Repartido):</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              item.overBudget ? 'text-[#DC2626]' : 'text-[#0284C7]'
            }`}
          >
            {formatRD(item.gastoReal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5">
          <span className="text-slate-600">{diff >= 0 ? 'Disponible:' : 'Excedido:'}</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              diff >= 0 ? 'text-[#15803D]' : 'text-[#DC2626]'
            }`}
          >
            {formatRD(Math.abs(diff))}
          </span>
        </div>
      </div>
    </div>
  );
};

export const ViaticosComparisonChart: React.FC<ViaticosComparisonChartProps> = ({
  proyectos,
  viaticos,
  onSelectProyecto,
}) => {
  const { data, sinAsignarRD } = useMemo(() => {
    const gastosMap = calcularGastoPorProyecto(viaticos);
    const sinAsignar = gastosMap['sin_asignar']?.totalEjecutadoRD || 0;

    const list: ChartDatum[] = proyectos
      .filter((p) => p.estado !== 'cobrado')
      .map((p) => {
        const gastoReal = Math.round(gastosMap[p.id]?.totalEjecutadoRD || 0);
        const presupuesto = Math.round(p.presupuestoViaticosRD);
        const shortPart = p.codigoContrato.split('-').slice(-1)[0] || p.codigoContrato.slice(0, 8);
        return {
          id: p.id,
          shortCode: `P-${shortPart}`,
          codigoContrato: p.codigoContrato,
          nombre: p.nombre,
          presupuesto,
          gastoReal,
          overBudget: gastoReal > presupuesto,
        };
      });

    return { data: list, sinAsignarRD: sinAsignar };
  }, [proyectos, viaticos]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 flex flex-col justify-between h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">
            Presupuesto Viáticos vs. Gasto Real (Proyectos Activos)
          </h2>
          <p className="text-xs text-slate-500">
            Comparativa según reparto exacto en RD$ (excluye rechazados)
          </p>
        </div>
        {sinAsignarRD > 0 && (
          <div className="font-mono text-xs font-semibold text-[#B45309] tabular-nums">
            Sin asignar: {formatRD(sinAsignarRD)}
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-xs text-slate-500">
          No hay proyectos activos para comparar viáticos.
        </div>
      ) : (
        <div className="w-full h-[195px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barGap={4}
              onClick={(state) => {
                const idx = state?.activeTooltipIndex;
                if (typeof idx === 'number' && data[idx] && onSelectProyecto) {
                  onSelectProyecto(data[idx].id);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="shortCode"
                tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val: number) =>
                  val >= 1000 ? `${Math.round(val / 1000)}k` : String(val)
                }
                tick={{ fontSize: 11, fill: '#475569', fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip content={<CustomChartTooltip />} cursor={{ fill: '#F1F5F9' }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }}
                iconType="square"
                iconSize={9}
              />
              <Bar
                dataKey="presupuesto"
                name="Presupuesto Viáticos"
                fill="#0F2942"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              />
              <Bar
                dataKey="gastoReal"
                name="Gasto Real"
                fill="#0284C7"
                radius={[4, 4, 0, 0]}
                maxBarSize={26}
              >
                {data.map((entry) => (
                  <Cell key={entry.id} fill={entry.overBudget ? '#DC2626' : '#0284C7'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
