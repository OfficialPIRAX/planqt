import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  MoreHorizontal,
  Droplets,
  Pencil,
  Trash2,
  Radio,
  Leaf,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type {
  Plant,
  PlantTemplate,
  SensorReading,
  WateringRecommendation,
} from '@flora-pi/shared';
import { StatusDot } from './MoistureGauge';
import { formatRelativeTime, formatMl } from '@/lib/format';
import { cn } from '@/lib/utils';

export type PlantCardAction = 'detail' | 'watered' | 'edit' | 'assign-sensor' | 'delete';

interface PlantCardProps {
  plant: Plant;
  template?: PlantTemplate;
  reading?: SensorReading;
  recommendation?: WateringRecommendation;
  index?: number;
  onClick: () => void;
  onAction: (action: PlantCardAction) => void;
}

export function PlantCard({
  plant,
  template,
  reading,
  recommendation,
  index = 0,
  onClick,
  onAction,
}: PlantCardProps) {
  const [imgError, setImgError] = useState(false);
  const moisture = reading?.soilMoisture ?? null;
  const min = template?.optimalSoilMoisture.min ?? 40;
  const critical = template?.optimalSoilMoisture.critical ?? 25;
  const hasRecommendation = recommendation && !recommendation.acknowledged && !recommendation.wateredAt;

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest('[data-menu]')) return;
      onClick();
    },
    [onClick],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={handleCardClick}
      className={cn(
        'group relative flex cursor-pointer flex-col overflow-hidden rounded-2xl bg-card transition-all duration-200',
        'shadow-card hover:shadow-card-hover hover:-translate-y-0.5',
        hasRecommendation && 'ring-2 ring-status-danger/30',
      )}
    >
      {/* Image area */}
      <div className="relative aspect-[4/3] overflow-hidden bg-muted">
        {plant.imageUrl && !imgError ? (
          <img
            src={plant.imageUrl}
            alt={plant.name}
            loading="lazy"
            onError={() => setImgError(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <Leaf className="h-12 w-12 text-primary/30" strokeWidth={1.5} />
          </div>
        )}

        {/* Gradient overlay at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/30 to-transparent" />

        {/* Status dot — top left */}
        <div className="absolute left-3 top-3">
          <StatusDot value={moisture} min={min} critical={critical} />
        </div>

        {/* Menu — top right */}
        <div data-menu className="absolute right-2 top-2">
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-full bg-black/30 text-white backdrop-blur-sm transition-colors hover:bg-black/50"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[180px] rounded-xl border border-border bg-card p-1.5 shadow-lg animate-fade-in"
                sideOffset={4}
                align="end"
              >
                {hasRecommendation && (
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium text-primary outline-none hover:bg-secondary transition-colors"
                    onSelect={() => onAction('watered')}
                  >
                    <Droplets className="h-4 w-4" />
                    Habe gegossen
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted transition-colors"
                  onSelect={() => onAction('edit')}
                >
                  <Pencil className="h-4 w-4" />
                  Bearbeiten
                </DropdownMenu.Item>
                {!plant.sensorId && (
                  <DropdownMenu.Item
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted transition-colors"
                    onSelect={() => onAction('assign-sensor')}
                  >
                    <Radio className="h-4 w-4" />
                    Sensor zuordnen
                  </DropdownMenu.Item>
                )}
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
                <DropdownMenu.Item
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-destructive outline-none hover:bg-destructive/8 transition-colors"
                  onSelect={() => onAction('delete')}
                >
                  <Trash2 className="h-4 w-4" />
                  Löschen
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>

        {/* Recommendation badge */}
        {hasRecommendation && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1.5 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-status-danger backdrop-blur-sm shadow-sm">
            <Droplets className="h-3 w-3" />
            {formatMl(recommendation.recommendedAmountMl)}
          </div>
        )}
      </div>

      {/* Info area */}
      <div className="flex flex-col gap-1 px-3.5 py-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base font-semibold leading-tight text-card-foreground truncate">
            {plant.name}
          </h3>
          {moisture !== null && (
            <span
              className="shrink-0 text-sm font-semibold tabular-nums"
              style={{
                color:
                  moisture <= critical
                    ? 'var(--color-status-danger)'
                    : moisture < min
                      ? 'var(--color-status-warning)'
                      : 'var(--color-status-optimal)',
              }}
            >
              {Math.round(moisture)}%
            </span>
          )}
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="truncate">{plant.location || template?.name || ''}</span>
          {reading && (
            <span className="shrink-0">{formatRelativeTime(reading.timestamp)}</span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function AddPlantCard({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      onClick={onClick}
      className="group flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card/50 transition-all duration-200 hover:border-primary/40 hover:bg-secondary/50 hover:shadow-card min-h-[200px]"
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Leaf className="h-6 w-6" />
      </div>
      <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
        Neue Pflanze
      </span>
    </motion.button>
  );
}
