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
import type { SurveyProject, ViaticoExpense } from '../types/geodesy';
import { formatRD } from '../utils/geodesy';

interface ViaticosComparisonChartProps {
  surveys: SurveyProject[];
  expenses: ViaticoExpense[];
  onSelectSurvey?: (surveyId: string) => void;
}

interface ChartDatum {
  id: string;
  shortCode: string;
  parcelCode: string;
  title: string;
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
    <div className="rounded-md border border-[#CBD5E1] bg-white p-3 shadow-lg text-xs min-w-[220px]">
      <div className="font-mono text-[11px] font-bold text-[#0284C7]">{item.parcelCode}</div>
      <div className="font-semibold text-[#0D1C2F] mt-0.5 truncate max-w-[240px]">
        {item.title}
      </div>
      <div className="mt-2 space-y-1 border-t border-[#E2E8F0] pt-2">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#43474D]">Presupuesto Viáticos:</span>
          <span className="font-mono font-bold text-[#0F2942] tabular-nums">
            {formatRD(item.presupuesto)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[#43474D]">Gasto Real:</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              item.overBudget ? 'text-[#DC2626]' : 'text-[#0284C7]'
            }`}
          >
            {formatRD(item.gastoReal)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4 border-t border-[#F1F5F9] pt-1">
          <span className="text-[#43474D]">{diff >= 0 ? 'Disponible:' : 'Excedido:'}</span>
          <span
            className={`font-mono font-bold tabular-nums ${
              diff >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
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
  surveys,
  expenses,
  onSelectSurvey,
}) => {
  const data = useMemo<ChartDatum[]>(() => {
    const spentMap: Record<string, number> = {};
    for (const exp of expenses) {
      spentMap[exp.surveyId] = (spentMap[exp.surveyId] || 0) + exp.amountRD;
    }

    return surveys
      .filter((s) => s.status !== 'COBRADO')
      .map((s) => {
        const gastoReal = Math.round(spentMap[s.id] || 0);
        const presupuesto = Math.round(s.budgetViaticosRD);
        const shortPart = s.parcelCode.split('-').slice(-1)[0] || s.parcelCode.slice(0, 8);
        return {
          id: s.id,
          shortCode: `P-${shortPart}`,
          parcelCode: s.parcelCode,
          title: s.title,
          presupuesto,
          gastoReal,
          overBudget: gastoReal > presupuesto,
        };
      });
  }, [surveys, expenses]);

  return (
    <div className="rounded-md border border-[#E2E8F0] bg-white p-4 flex flex-col justify-between h-full">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <h2 className="text-xs font-bold text-[#0F2942]">
            Presupuesto Viáticos vs. Gasto Real (Proyectos Activos)
          </h2>
          <p className="text-[11px] text-[#43474D]">
            Comparativa por parcela en RD$ · Haz clic en una barra para inspeccionar
          </p>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 text-xs text-[#43474D]">
          No hay proyectos activos para comparar viáticos.
        </div>
      ) : (
        <div className="w-full h-[185px] min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              barGap={4}
              onClick={(state) => {
                const idx = state?.activeTooltipIndex;
                if (typeof idx === 'number' && data[idx] && onSelectSurvey) {
                  onSelectSurvey(data[idx].id);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
              <XAxis
                dataKey="shortCode"
                tick={{ fontSize: 11, fill: '#43474D', fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={{ stroke: '#CBD5E1' }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(val: number) =>
                  val >= 1000 ? `${Math.round(val / 1000)}k` : String(val)
                }
                tick={{ fontSize: 11, fill: '#43474D', fontFamily: 'JetBrains Mono, monospace' }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<CustomChartTooltip />} cursor={{ fill: '#F1F5F9' }} />
              <Legend
                wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
                iconType="square"
                iconSize={9}
              />
              <Bar
                dataKey="presupuesto"
                name="Presupuesto Viáticos"
                fill="#0F2942"
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              />
              <Bar
                dataKey="gastoReal"
                name="Gasto Real"
                fill="#0284C7"
                radius={[3, 3, 0, 0]}
                maxBarSize={26}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={entry.overBudget ? '#DC2626' : '#0284C7'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
