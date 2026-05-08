import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Leaf, Sprout } from 'lucide-react';
import type { DashboardSummary } from '@flora-pi/shared';
import { PlantCard, AddPlantCard, type PlantCardAction } from '@/components/PlantCard';
import { RecommendationBanner } from '@/components/RecommendationBanner';
import { PlantDetailSheet } from '@/components/PlantDetailSheet';
import { PlantFormSheet } from '@/components/PlantFormSheet';
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog';
import { Button } from '@/components/ui/button';
import { fetchDashboard, deletePlant, markWatered } from '@/lib/api';

export function Dashboard() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedPlantId = searchParams.get('plant');
  const isNewOpen = searchParams.get('new') === '1';
  const isEditOpen = searchParams.get('edit') === '1';

  const [deleteTarget, setDeleteTarget] = useState<DashboardSummary['plants'][number] | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchDashboard,
    refetchInterval: 60_000,
  });

  const plants = data?.plants ?? [];
  const selectedPlant = plants.find((p) => p.id === selectedPlantId);
  const openRecommendations = plants
    .map((p) => p.openRecommendation)
    .filter((r): r is NonNullable<typeof r> => r != null && !r.acknowledged && !r.wateredAt);

  const waterMutation = useMutation({
    mutationFn: (recId: string) => markWatered(recId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deletePlant(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDeleteTarget(null);
      setSearchParams({});
    },
  });

  const openDetail = useCallback(
    (id: string) => setSearchParams({ plant: id }),
    [setSearchParams],
  );

  const openNew = useCallback(() => setSearchParams({ new: '1' }), [setSearchParams]);
  const openEdit = useCallback(
    (id: string) => setSearchParams({ plant: id, edit: '1' }),
    [setSearchParams],
  );
  const closeSheet = useCallback(() => setSearchParams({}), [setSearchParams]);

  const handleCardAction = useCallback(
    (plant: DashboardSummary['plants'][number], action: PlantCardAction) => {
      switch (action) {
        case 'detail':
          openDetail(plant.id);
          break;
        case 'watered':
          if (plant.openRecommendation) waterMutation.mutate(plant.openRecommendation.id);
          break;
        case 'edit':
          openEdit(plant.id);
          break;
        case 'delete':
          setDeleteTarget(plant);
          break;
      }
    },
    [openDetail, openEdit, waterMutation],
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-5">
        <div className="h-10 w-48 rounded-xl animate-shimmer" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-[4/3] rounded-2xl animate-shimmer" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-4 py-5 sm:px-5">
      {/* Alert banner */}
      <RecommendationBanner recommendations={openRecommendations} />

      {/* Plant grid or empty state */}
      {plants.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-6 py-16 text-center"
        >
          <div className="relative">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-secondary">
              <Sprout className="h-12 w-12 text-primary" strokeWidth={1.5} />
            </div>
            <motion.div
              animate={{ y: [-2, 2, -2] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground text-xs font-bold"
            >
              <Leaf className="h-4 w-4" />
            </motion.div>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="font-display text-2xl font-bold">Willkommen bei PlanQT!</h2>
            <p className="max-w-sm text-sm text-muted-foreground leading-relaxed">
              Lege deine erste Pflanze an, um Gießempfehlungen zu bekommen.
              Verbinde sie mit einem Sensor für Live-Bodenfeuchtedaten.
            </p>
          </div>
          <Button size="lg" onClick={openNew}>
            <Leaf className="h-5 w-5" />
            Erste Pflanze anlegen
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
          {plants.map((plant, i) => (
            <PlantCard
              key={plant.id}
              plant={plant}
              template={plant.template}
              reading={plant.latestReading}
              recommendation={plant.openRecommendation}
              index={i}
              onClick={() => openDetail(plant.id)}
              onAction={(action) => handleCardAction(plant, action)}
            />
          ))}
          <AddPlantCard onClick={openNew} />
        </div>
      )}

      {/* Detail sheet */}
      {selectedPlant && !isEditOpen && (
        <PlantDetailSheet
          plant={selectedPlant}
          open
          onClose={closeSheet}
          onEdit={() => openEdit(selectedPlant.id)}
          onDelete={() => setDeleteTarget(selectedPlant)}
        />
      )}

      {/* Add/Edit sheet */}
      <PlantFormSheet
        mode={isEditOpen ? 'edit' : 'add'}
        plant={isEditOpen && selectedPlant ? selectedPlant : undefined}
        open={isNewOpen || (isEditOpen && !!selectedPlant)}
        onClose={closeSheet}
      />

      {/* Delete dialog */}
      <DeleteConfirmDialog
        plantName={deleteTarget?.name ?? ''}
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
        loading={deleteMutation.isPending}
      />
    </div>
  );
}
