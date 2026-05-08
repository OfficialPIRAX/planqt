import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { fetchPlantHistory } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SensorChartProps {
  plantId: string;
  className?: string;
}

const rangeOptions = [
  { label: '1T', days: 1 },
  { label: '7T', days: 7 },
  { label: '30T', days: 30 },
] as const;

function formatChartTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatChartDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}

export function SensorChart({ plantId, className }: SensorChartProps) {
  const [days, setDays] = useState(7);

  const { data: readings, isLoading } = useQuery({
    queryKey: ['plant-history', plantId, days],
    queryFn: () => fetchPlantHistory(plantId, days),
    staleTime: 60_000,
  });

  const chartData = (readings ?? []).map((r) => ({
    time: r.timestamp,
    moisture: r.soilMoisture,
    temp: r.temperature,
    light: r.light,
  }));

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Verlauf</span>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5">
          {rangeOptions.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setDays(opt.days)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                days === opt.days
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="h-48 rounded-xl animate-shimmer" />
      ) : chartData.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-xl bg-muted/50 text-sm text-muted-foreground">
          Noch keine Messwerte aufgezeichnet
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="moistureGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="time"
                tickFormatter={days <= 1 ? formatChartTime : formatChartDate}
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                minTickGap={40}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                axisLine={false}
                tickLine={false}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--color-card)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8125rem',
                  boxShadow: 'var(--shadow-card)',
                }}
                labelFormatter={(v) => {
                  const d = new Date(v as string);
                  return d.toLocaleString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                }}
                formatter={(val: number) => [`${Math.round(val)}%`, 'Bodenfeuchte']}
              />
              <Area
                type="monotone"
                dataKey="moisture"
                stroke="var(--color-primary)"
                strokeWidth={2}
                fill="url(#moistureGrad)"
                dot={false}
                activeDot={{ r: 4, fill: 'var(--color-primary)', strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
