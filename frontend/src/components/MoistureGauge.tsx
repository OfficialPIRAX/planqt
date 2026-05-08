import { useMemo } from 'react';
import { cn } from '@/lib/utils';

interface MoistureGaugeProps {
  value: number | null;
  min: number;
  max: number;
  critical: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

function getStatusColor(value: number, min: number, critical: number): string {
  if (value <= critical) return 'var(--color-status-danger)';
  if (value < min) return 'var(--color-status-warning)';
  return 'var(--color-status-optimal)';
}

function getStatusLabel(value: number, min: number, max: number, critical: number): string {
  if (value <= critical) return 'Kritisch';
  if (value < min) return 'Trocken';
  if (value > max) return 'Nass';
  return 'Optimal';
}

const sizeConfig = {
  sm: { dim: 48, stroke: 4, fontSize: '0.75rem', labelSize: '0' },
  md: { dim: 80, stroke: 5, fontSize: '1.125rem', labelSize: '0.625rem' },
  lg: { dim: 112, stroke: 6, fontSize: '1.5rem', labelSize: '0.75rem' },
};

export function MoistureGauge({ value, min, max, critical, size = 'md', className }: MoistureGaugeProps) {
  const { dim, stroke, fontSize, labelSize } = sizeConfig[size];
  const radius = (dim - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius * 0.75; // 270° arc
  const displayValue = value ?? 0;
  const normalizedValue = Math.min(100, Math.max(0, displayValue));
  const offset = circumference - (normalizedValue / 100) * circumference;

  const color = useMemo(
    () => (value !== null ? getStatusColor(displayValue, min, critical) : 'var(--color-status-offline)'),
    [value, displayValue, min, critical],
  );

  const label = useMemo(
    () => (value !== null ? getStatusLabel(displayValue, min, max, critical) : 'Offline'),
    [value, displayValue, min, max, critical],
  );

  return (
    <div className={cn('relative inline-flex flex-col items-center', className)}>
      <svg
        width={dim}
        height={dim}
        viewBox={`0 0 ${dim} ${dim}`}
        className="-rotate-[135deg]"
        style={
          {
            '--gauge-circumference': circumference,
            '--gauge-offset': offset,
          } as React.CSSProperties
        }
      >
        {/* Track */}
        <circle
          cx={dim / 2}
          cy={dim / 2}
          r={radius}
          fill="none"
          stroke="var(--color-muted)"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
        />
        {/* Fill */}
        {value !== null && (
          <circle
            cx={dim / 2}
            cy={dim / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              animation: 'gauge-fill 1s ease-out forwards',
              transition: 'stroke 0.4s ease',
            }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: size === 'sm' ? 0 : 4 }}>
        <span
          className="font-display font-semibold leading-none"
          style={{ fontSize, color }}
        >
          {value !== null ? `${Math.round(displayValue)}` : '—'}
        </span>
        {value !== null && size !== 'sm' && (
          <span className="text-muted-foreground font-medium" style={{ fontSize: '0.625rem' }}>%</span>
        )}
      </div>
      {size !== 'sm' && labelSize !== '0' && (
        <span
          className="mt-0.5 font-medium uppercase tracking-wider"
          style={{ fontSize: labelSize, color }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function StatusDot({
  value,
  min,
  critical,
  pulse = false,
  className,
}: {
  value: number | null;
  min: number;
  critical: number;
  pulse?: boolean;
  className?: string;
}) {
  const color =
    value === null
      ? 'bg-status-offline'
      : value <= critical
        ? 'bg-status-danger'
        : value < min
          ? 'bg-status-warning'
          : 'bg-status-optimal';

  const shouldPulse = pulse || (value !== null && value <= critical);

  return (
    <span className={cn('relative inline-flex h-3 w-3', className)}>
      {shouldPulse && (
        <span className={cn('absolute inset-0 rounded-full animate-pulse-soft', color)} />
      )}
      <span className={cn('relative inline-flex h-3 w-3 rounded-full', color)} />
    </span>
  );
}
