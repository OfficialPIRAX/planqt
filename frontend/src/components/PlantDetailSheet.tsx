import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MoreHorizontal,
  Droplets,
  Thermometer,
  Sun,
  MapPin,
  Leaf,
  Pencil,
  Trash2,
  Check,
  Battery,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { DashboardSummary } from '@flora-pi/shared';
import { Button } from './ui/button';
import { MoistureGauge } from './MoistureGauge';
import { SensorChart } from './SensorChart';
import { formatRelativeTime, formatMl } from '@/lib/format';
import { markWatered, updatePlant } from '@/lib/api';
import { cn } from '@/lib/utils';

type PlantWithDetails = DashboardSummary['plants'][number];

interface PlantDetailSheetProps {
  plant: PlantWithDetails;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function PlantDetailSheet({ plant, open, onClose, onEdit, onDelete }: PlantDetailSheetProps) {
  const queryClient = useQueryClient();
  const reading = plant.latestReading;
  const template = plant.template;
  const recommendation = plant.openRecommendation;
  const hasOpenRec = recommendation && !recommendation.acknowledged && !recommendation.wateredAt;

  const [editingField, setEditingField] = useState<'name' | 'location' | null>(null);
  const [editValue, setEditValue] = useState('');

  const waterMutation = useMutation({
    mutationFn: (recId: string) => markWatered(recId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name?: string; location?: string }) => updatePlant(plant.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingField(null);
    },
  });

  const startEditing = useCallback((field: 'name' | 'location', currentValue: string) => {
    setEditingField(field);
    setEditValue(currentValue);
  }, []);

  const commitEdit = useCallback(() => {
    if (!editingField || !editValue.trim()) {
      setEditingField(null);
      return;
    }
    updateMutation.mutate({ [editingField]: editValue.trim() });
  }, [editingField, editValue, updateMutation]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className={cn(
              'fixed z-50 flex flex-col bg-card overflow-y-auto overscroll-contain',
              'right-0 top-0 h-full w-full max-w-xl shadow-sheet',
              'max-sm:inset-x-0 max-sm:top-auto max-sm:bottom-0 max-sm:h-[92dvh] max-sm:max-w-none max-sm:rounded-t-2xl',
            )}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-5 py-3 backdrop-blur-sm">
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                <X className="h-5 w-5" />
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                    <MoreHorizontal className="h-5 w-5" />
                  </button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    className="z-[60] min-w-[160px] rounded-xl border border-border bg-card p-1.5 shadow-lg animate-fade-in"
                    sideOffset={4}
                    align="end"
                  >
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm outline-none hover:bg-muted transition-colors"
                      onSelect={onEdit}
                    >
                      <Pencil className="h-4 w-4" />
                      Bearbeiten
                    </DropdownMenu.Item>
                    <DropdownMenu.Separator className="my-1 h-px bg-border" />
                    <DropdownMenu.Item
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-destructive outline-none hover:bg-destructive/8 transition-colors"
                      onSelect={onDelete}
                    >
                      <Trash2 className="h-4 w-4" />
                      Löschen
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>

            {/* Content */}
            <div className="flex flex-col gap-6 p-5">
              {/* Image */}
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl bg-muted">
                {plant.imageUrl ? (
                  <img
                    src={plant.imageUrl}
                    alt={plant.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
                    <Leaf className="h-16 w-16 text-primary/20" strokeWidth={1.5} />
                  </div>
                )}
              </div>

              {/* Name & location */}
              <div className="flex flex-col gap-1">
                {editingField === 'name' ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                    autoFocus
                    className="font-display text-2xl font-bold bg-transparent border-b-2 border-primary outline-none pb-0.5"
                  />
                ) : (
                  <h2
                    onClick={() => startEditing('name', plant.name)}
                    className="font-display text-2xl font-bold cursor-text hover:text-primary/80 transition-colors"
                  >
                    {plant.name}
                  </h2>
                )}
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {editingField === 'location' ? (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" />
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={commitEdit}
                        onKeyDown={(e) => e.key === 'Enter' && commitEdit()}
                        autoFocus
                        className="bg-transparent border-b border-primary outline-none text-sm"
                      />
                    </div>
                  ) : (
                    <span
                      onClick={() => startEditing('location', plant.location)}
                      className="flex items-center gap-1 cursor-text hover:text-foreground transition-colors"
                    >
                      <MapPin className="h-3.5 w-3.5" />
                      {plant.location || 'Standort hinzufügen'}
                    </span>
                  )}
                  {template && (
                    <span className="flex items-center gap-1">
                      <Leaf className="h-3.5 w-3.5" />
                      {template.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Sensor values */}
              <div className="grid grid-cols-3 gap-3">
                <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/50 p-4">
                  <MoistureGauge
                    value={reading?.soilMoisture ?? null}
                    min={template?.optimalSoilMoisture.min ?? 40}
                    max={template?.optimalSoilMoisture.max ?? 70}
                    critical={template?.optimalSoilMoisture.critical ?? 25}
                    size="md"
                  />
                  <span className="text-xs font-medium text-muted-foreground">Bodenfeuchte</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-muted/50 p-4">
                  <Thermometer className="h-6 w-6 text-accent" />
                  <span className="font-display text-xl font-semibold">
                    {reading?.temperature != null ? `${Math.round(reading.temperature)}°` : '—'}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">Temperatur</span>
                </div>
                <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-muted/50 p-4">
                  <Sun className="h-6 w-6 text-status-warning" />
                  <span className="font-display text-xl font-semibold">
                    {reading?.light != null
                      ? reading.light >= 1000
                        ? `${(reading.light / 1000).toFixed(1)}k`
                        : String(Math.round(reading.light))
                      : '—'}
                  </span>
                  <span className="text-xs font-medium text-muted-foreground">Lux</span>
                </div>
              </div>

              {reading && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Letzte Messung: {formatRelativeTime(reading.timestamp)}</span>
                  {reading.battery != null && (
                    <span className="flex items-center gap-1">
                      <Battery className="h-3 w-3" />
                      {Math.round(reading.battery)}%
                    </span>
                  )}
                </div>
              )}

              {/* Recommendation */}
              {hasOpenRec && (
                <div className="flex items-center justify-between gap-3 rounded-xl bg-status-danger/8 px-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-status-danger">
                      {formatMl(recommendation.recommendedAmountMl)} gießen
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {recommendation.reason}
                    </span>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={waterMutation.isPending}
                    onClick={() => waterMutation.mutate(recommendation.id)}
                    className="shrink-0"
                  >
                    <Check className="h-4 w-4" />
                    Gegossen
                  </Button>
                </div>
              )}

              {/* Chart */}
              <SensorChart plantId={plant.id} />

              {/* Care tips */}
              {template && template.careTips.length > 0 && (
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">Pflegetipps</h3>
                  <ul className="flex flex-col gap-1.5">
                    {template.careTips.map((tip, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-sm text-foreground/80"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 border-t border-border pt-4">
                <Button variant="outline" className="flex-1" onClick={onEdit}>
                  <Pencil className="h-4 w-4" />
                  Bearbeiten
                </Button>
                <Button variant="ghost" className="text-destructive hover:bg-destructive/8" onClick={onDelete}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
