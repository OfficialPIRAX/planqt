import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Battery, Clock, Leaf, Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fetchSensors, fetchPlants, updateSensor } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function Sensors() {
  const queryClient = useQueryClient();
  const { data: sensors = [], isLoading } = useQuery({
    queryKey: ['sensors'],
    queryFn: fetchSensors,
  });
  const { data: plants = [] } = useQuery({
    queryKey: ['plants'],
    queryFn: fetchPlants,
  });

  const [editingSensor, setEditingSensor] = useState<string | null>(null);
  const [selectedPlantId, setSelectedPlantId] = useState('');

  const assignMutation = useMutation({
    mutationFn: ({ sensorId, plantId }: { sensorId: string; plantId: string }) =>
      updateSensor(sensorId, { plantId: plantId || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sensors'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setEditingSensor(null);
    },
  });

  const availablePlants = plants.filter((p) => !p.sensorId);

  return (
    <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Sensoren</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Verwalte deine Zigbee-Bodensensoren und ordne sie Pflanzen zu.
        </p>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : sensors.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
            <Radio className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">
            Noch keine Sensoren erkannt. Stelle sicher, dass Zigbee2MQTT läuft
            und deine Sensoren gepairt sind.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sensors.map((sensor) => {
            const linkedPlant = plants.find((p) => p.sensorId === sensor.id);
            const isOnline = sensor.lastSeenAt && (Date.now() - new Date(sensor.lastSeenAt).getTime()) < 3_600_000;
            const isEditing = editingSensor === sensor.id;

            return (
              <div
                key={sensor.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-xl',
                      isOnline ? 'bg-status-optimal/10' : 'bg-muted',
                    )}>
                      <Radio className={cn('h-5 w-5', isOnline ? 'text-status-optimal' : 'text-status-offline')} />
                    </div>
                    <div>
                      <h3 className="font-medium">{sensor.friendlyName}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{sensor.id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {sensor.batteryLevel != null && (
                      <span className="flex items-center gap-1">
                        <Battery className="h-3.5 w-3.5" />
                        {Math.round(sensor.batteryLevel)}%
                      </span>
                    )}
                    {sensor.lastSeenAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatRelativeTime(sensor.lastSeenAt)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
                  {linkedPlant ? (
                    <span className="flex items-center gap-2 text-sm">
                      <Leaf className="h-4 w-4 text-primary" />
                      <span className="font-medium">{linkedPlant.name}</span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Keiner Pflanze zugeordnet</span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isEditing) setEditingSensor(null);
                      else {
                        setEditingSensor(sensor.id);
                        setSelectedPlantId('');
                      }
                    }}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    {isEditing ? 'Abbrechen' : linkedPlant ? 'Ändern' : 'Zuordnen'}
                  </Button>
                </div>

                {isEditing && (
                  <div className="flex flex-col gap-2">
                    {availablePlants.length === 0 && !linkedPlant ? (
                      <p className="text-sm text-muted-foreground">
                        Alle Pflanzen haben bereits einen Sensor.
                      </p>
                    ) : (
                      <>
                        <div className="flex flex-col gap-1.5">
                          {availablePlants.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setSelectedPlantId(p.id)}
                              className={cn(
                                'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors text-left',
                                selectedPlantId === p.id
                                  ? 'bg-primary/10 text-primary'
                                  : 'hover:bg-muted',
                              )}
                            >
                              <Leaf className="h-4 w-4" />
                              {p.name}
                              {selectedPlantId === p.id && <Check className="ml-auto h-4 w-4" />}
                            </button>
                          ))}
                        </div>
                        <Button
                          size="sm"
                          disabled={!selectedPlantId || assignMutation.isPending}
                          onClick={() => assignMutation.mutate({ sensorId: sensor.id, plantId: selectedPlantId })}
                        >
                          Zuordnen
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
