import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface ChartPoint {
  date: string;
  value: number;
}

interface OrderChartProps {
  title: string;
  dailyData: ChartPoint[];
  yearlyData: ChartPoint[];
  color?: string;
  valuePrefix?: string;
  height?: number;
}

function formatCompactNumber(value: number, prefix?: string): string {
  const formatted =
    value >= 100000
      ? `${(value / 100000).toFixed(1)}L`
      : value >= 1000
      ? `${(value / 1000).toFixed(1)}K`
      : value.toString();
  return prefix ? `${prefix}${formatted}` : formatted;
}

export default function OrderChart({
  title,
  dailyData,
  yearlyData,
  color = '#0d9488',
  valuePrefix,
  height = 260,
}: OrderChartProps) {
  const [range, setRange] = useState<'month' | 'year'>('month');

  const data = range === 'month' ? dailyData : yearlyData;
  const total = useMemo(() => data.reduce((sum, d) => sum + (d.value || 0), 0), [data]);
  const gradientId = `chart-gradient-${title.replace(/\s+/g, '-')}`;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-200 p-3 sm:p-4">
      <div className="flex items-start sm:items-center justify-between mb-1 gap-2">
        <div>
          <h3 className="text-sm sm:text-base font-semibold text-neutral-900">{title}</h3>
          <p className="text-lg sm:text-xl font-bold text-neutral-900 mt-0.5">
            {formatCompactNumber(total, valuePrefix)}
            <span className="text-xs font-medium text-neutral-400 ml-1">
              {range === 'month' ? 'this month' : 'this year'}
            </span>
          </p>
        </div>
        <div className="flex items-center bg-neutral-100 rounded-lg p-0.5 shrink-0">
          {(['month', 'year'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                range === r ? 'bg-white text-teal-700 shadow-sm' : 'text-neutral-500 hover:text-neutral-700'
              }`}
            >
              {r === 'month' ? 'Month' : 'Year'}
            </button>
          ))}
        </div>
      </div>

      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.28} />
                <stop offset="95%" stopColor={color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              interval={range === 'month' ? Math.ceil(data.length / 8) : 0}
              tickLine={false}
              axisLine={{ stroke: '#e5e7eb' }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#6b7280' }}
              tickLine={false}
              axisLine={false}
              width={40}
              tickFormatter={(v) => formatCompactNumber(v, valuePrefix)}
            />
            <Tooltip
              formatter={(value: number | undefined) => {
                const v = value ?? 0;
                return [valuePrefix ? `${valuePrefix}${v.toLocaleString('en-IN')}` : v.toLocaleString('en-IN'), title];
              }}
              contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
