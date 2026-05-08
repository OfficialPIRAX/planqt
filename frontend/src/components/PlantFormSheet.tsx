import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Search,
  Check,
  Leaf,
  Radio,
  Ruler,
} from 'lucide-react';
import type { PlantTemplate, Plant, Sensor, GrowthStage, PlantCategory } from '@flora-pi/shared';
import { Button } from './ui/button';
import { PlantImageUploader } from './PlantImageUploader';
import { fetchTemplates, fetchSensors, createPlant, updatePlant } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PlantFormSheetProps {
  mode: 'add' | 'edit';
  plant?: Plant & { template?: PlantTemplate; sensor?: Sensor };
  open: boolean;
  onClose: () => void;
}

const categoryLabels: Record<PlantCategory, string> = {
  vegetable: 'Gemüse',
  herb: 'Kräuter',
  flower: 'Blumen',
  shrub: 'Sträucher',
  tree: 'Bäume',
  other: 'Sonstige',
};

const stageLabels: Record<GrowthStage, string> = {
  initial: 'Anfang',
  mid: 'Wachstum',
  late: 'Reife',
};

const STEPS = ['Foto', 'Vorlage', 'Details', 'Sensor', 'Fertig'] as const;

export function PlantFormSheet({ mode, plant, open, onClose }: PlantFormSheetProps) {
  const queryClient = useQueryClient();
  const isEdit = mode === 'edit';

  const [step, setStep] = useState(isEdit ? 2 : 0);
  const [imageUrl, setImageUrl] = useState(plant?.imageUrl);
  const [templateId, setTemplateId] = useState(plant?.templateId ?? '');
  const [name, setName] = useState(plant?.name ?? '');
  const [location, setLocation] = useState(plant?.location ?? '');
  const [potVolume, setPotVolume] = useState(String(plant?.potVolumeLiters ?? '10'));
  const [potDiameter, setPotDiameter] = useState(String(plant?.potDiameterCm ?? '30'));
  const [stage, setStage] = useState<GrowthStage>(plant?.currentStage ?? 'mid');
  const [notes, setNotes] = useState(plant?.notes ?? '');
  const [sensorId, setSensorId] = useState(plant?.sensorId ?? '');
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<PlantCategory | ''>('');

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchTemplates(),
  });

  const { data: sensors = [] } = useQuery({
    queryKey: ['sensors'],
    queryFn: fetchSensors,
  });

  const availableSensors = sensors.filter((s) => !s.plantId || s.id === plant?.sensorId);

  const filteredTemplates = useMemo(() => {
    let result = templates;
    if (categoryFilter) result = result.filter((t) => t.category === categoryFilter);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) => t.name.toLowerCase().includes(q) || t.scientificName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [templates, categoryFilter, searchQuery]);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const createMutation = useMutation({
    mutationFn: () =>
      createPlant({
        name: name || selectedTemplate?.name || 'Neue Pflanze',
        templateId,
        potVolumeLiters: parseFloat(potVolume) || 10,
        potDiameterCm: parseFloat(potDiameter) || 30,
        imageUrl,
        sensorId: sensorId || undefined,
        location,
        plantedAt: new Date().toISOString(),
        currentStage: stage,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePlant(plant!.id, {
        name,
        templateId,
        potVolumeLiters: parseFloat(potVolume) || 10,
        potDiameterCm: parseFloat(potDiameter) || 30,
        imageUrl,
        sensorId: sensorId || undefined,
        location,
        currentStage: stage,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
  });

  const handleSave = () => {
    if (isEdit) updateMutation.mutate();
    else createMutation.mutate();
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            onClick={onClose}
          />
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
              <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
              <span className="font-display text-base font-semibold">
                {isEdit ? 'Pflanze bearbeiten' : 'Neue Pflanze'}
              </span>
              <div className="w-9" />
            </div>

            {/* Step indicators */}
            {!isEdit && (
              <div className="flex gap-1.5 px-5 pt-4">
                {STEPS.map((label, i) => (
                  <button
                    key={label}
                    onClick={() => i <= step && setStep(i)}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className={cn(
                        'h-1 w-full rounded-full transition-all duration-300',
                        i <= step ? 'bg-primary' : 'bg-muted',
                      )}
                    />
                    <span
                      className={cn(
                        'text-[0.6rem] font-medium transition-colors',
                        i <= step ? 'text-primary' : 'text-muted-foreground',
                      )}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Edit: tab navigation */}
            {isEdit && (
              <div className="flex gap-1 border-b border-border px-5 pt-2">
                {(['Foto', 'Details', 'Sensor'] as const).map((label, i) => {
                  const tabIndex = label === 'Foto' ? 0 : label === 'Details' ? 2 : 3;
                  return (
                    <button
                      key={label}
                      onClick={() => setStep(tabIndex)}
                      className={cn(
                        'px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
                        step === tabIndex
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Content */}
            <div className="flex flex-1 flex-col gap-5 p-5">
              {/* Step 0: Photo */}
              {step === 0 && (
                <div className="flex flex-col gap-4">
                  <h3 className="font-display text-lg font-semibold">Foto hinzufügen</h3>
                  <PlantImageUploader value={imageUrl} onChange={setImageUrl} />
                </div>
              )}

              {/* Step 1: Template */}
              {step === 1 && (
                <div className="flex flex-col gap-4">
                  <h3 className="font-display text-lg font-semibold">Vorlage wählen</h3>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Pflanze suchen..."
                      className="w-full rounded-lg border border-input bg-background py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      onClick={() => setCategoryFilter('')}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                        !categoryFilter ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                      )}
                    >
                      Alle
                    </button>
                    {(Object.entries(categoryLabels) as [PlantCategory, string][]).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setCategoryFilter(key)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                          categoryFilter === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filteredTemplates.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          setTemplateId(t.id);
                          if (!name) setName(t.name);
                        }}
                        className={cn(
                          'flex flex-col items-center gap-2 rounded-xl border-2 p-3 text-center transition-all',
                          templateId === t.id
                            ? 'border-primary bg-primary/5'
                            : 'border-transparent bg-muted/50 hover:bg-muted',
                        )}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                          <Leaf className="h-5 w-5 text-primary" />
                        </div>
                        <span className="text-sm font-medium">{t.name}</span>
                        {t.scientificName && (
                          <span className="text-[0.65rem] italic text-muted-foreground">{t.scientificName}</span>
                        )}
                        {templateId === t.id && (
                          <Check className="h-4 w-4 text-primary" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Details */}
              {step === 2 && (
                <div className="flex flex-col gap-4">
                  <h3 className="font-display text-lg font-semibold">Details</h3>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">Name</span>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={selectedTemplate?.name || 'Meine Pflanze'}
                      className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">Standort</span>
                    <input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="z.B. Terrasse links"
                      className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex flex-col gap-1.5">
                      <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
                        <Ruler className="h-3.5 w-3.5" /> Volumen (L)
                      </span>
                      <input
                        type="number"
                        value={potVolume}
                        onChange={(e) => setPotVolume(e.target.value)}
                        min="0.5"
                        step="0.5"
                        className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="text-sm font-medium text-muted-foreground">Durchmesser (cm)</span>
                      <input
                        type="number"
                        value={potDiameter}
                        onChange={(e) => setPotDiameter(e.target.value)}
                        min="5"
                        step="1"
                        className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">Wachstumsphase</span>
                    <div className="flex gap-2">
                      {(Object.entries(stageLabels) as [GrowthStage, string][]).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setStage(key)}
                          className={cn(
                            'flex-1 rounded-lg py-2 text-sm font-medium transition-all',
                            stage === key
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground hover:bg-muted/80',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-muted-foreground">Notizen (optional)</span>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none resize-none focus:ring-2 focus:ring-ring"
                    />
                  </label>
                </div>
              )}

              {/* Step 3: Sensor */}
              {step === 3 && (
                <div className="flex flex-col gap-4">
                  <h3 className="font-display text-lg font-semibold">Sensor zuordnen</h3>
                  {availableSensors.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 rounded-xl bg-muted/50 py-8 text-center">
                      <Radio className="h-10 w-10 text-muted-foreground/50" />
                      <p className="text-sm text-muted-foreground">
                        Keine Sensoren verfügbar. Du kannst diesen Schritt überspringen.
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {availableSensors.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => setSensorId(sensorId === s.id ? '' : s.id)}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-all',
                            sensorId === s.id
                              ? 'border-primary bg-primary/5'
                              : 'border-transparent bg-muted/50 hover:bg-muted',
                          )}
                        >
                          <Radio className={cn('h-5 w-5', sensorId === s.id ? 'text-primary' : 'text-muted-foreground')} />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">{s.friendlyName}</span>
                            <span className="text-xs text-muted-foreground">{s.id}</span>
                          </div>
                          {sensorId === s.id && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Summary */}
              {step === 4 && (
                <div className="flex flex-col gap-4">
                  <h3 className="font-display text-lg font-semibold">Zusammenfassung</h3>
                  <div className="flex flex-col gap-3 rounded-xl bg-muted/50 p-4">
                    {imageUrl && (
                      <img src={imageUrl} alt="" className="h-32 w-full rounded-lg object-cover" />
                    )}
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{name || selectedTemplate?.name || '—'}</span>
                      <span className="text-muted-foreground">Vorlage</span>
                      <span className="font-medium">{selectedTemplate?.name || 'Keine'}</span>
                      <span className="text-muted-foreground">Standort</span>
                      <span className="font-medium">{location || '—'}</span>
                      <span className="text-muted-foreground">Topf</span>
                      <span className="font-medium">{potVolume} L / {potDiameter} cm</span>
                      <span className="text-muted-foreground">Phase</span>
                      <span className="font-medium">{stageLabels[stage]}</span>
                      <span className="text-muted-foreground">Sensor</span>
                      <span className="font-medium">
                        {sensorId
                          ? availableSensors.find((s) => s.id === sensorId)?.friendlyName || sensorId
                          : 'Keiner'}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer navigation */}
            <div className="sticky bottom-0 flex gap-3 border-t border-border bg-card/95 px-5 py-4 backdrop-blur-sm pb-[calc(1rem+env(safe-area-inset-bottom))]">
              {!isEdit && step > 0 && (
                <Button variant="outline" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                  Zurück
                </Button>
              )}
              <div className="flex-1" />
              {!isEdit && step < 4 ? (
                <Button onClick={() => setStep(step + 1)}>
                  Weiter
                  <ChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Speichern...' : isEdit ? 'Speichern' : 'Pflanze anlegen'}
                  {!isSaving && <Check className="h-4 w-4" />}
                </Button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
