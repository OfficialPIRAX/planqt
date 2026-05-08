import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, Smartphone, Trash2, Send, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatDate } from '@/lib/format';

interface Subscription {
  id: string;
  deviceLabel: string;
  createdAt: string;
  preferences: {
    wateringNeeded: boolean;
    criticalAlerts: boolean;
    dailyStatus: boolean;
    sensorOffline: boolean;
    lowBattery: boolean;
  };
}

async function fetchSubscriptions(): Promise<Subscription[]> {
  const res = await fetch('/api/push/subscriptions');
  if (!res.ok) return [];
  return res.json();
}

export function Settings() {
  const queryClient = useQueryClient();
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [deviceLabel, setDeviceLabel] = useState('');

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['push-subscriptions'],
    queryFn: fetchSubscriptions,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/push/subscriptions/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['push-subscriptions'] }),
  });

  const testMutation = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`/api/push/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: id }),
      });
    },
  });

  return (
    <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Einstellungen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Push-Benachrichtigungen und Geräte-Verwaltung.
        </p>
      </div>

      {/* Push status */}
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          {pushSupported ? (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-status-optimal/10">
              <Bell className="h-5 w-5 text-status-optimal" />
            </div>
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
              <BellOff className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div>
            <h2 className="font-display text-lg font-semibold">Push-Benachrichtigungen</h2>
            <p className="text-sm text-muted-foreground">
              {pushSupported
                ? 'Dieses Gerät unterstützt Push-Benachrichtigungen.'
                : 'Push wird auf diesem Gerät nicht unterstützt. Bitte verwende HTTPS.'}
            </p>
          </div>
        </div>

        {pushSupported && (
          <div className="flex gap-2">
            <input
              value={deviceLabel}
              onChange={(e) => setDeviceLabel(e.target.value)}
              placeholder="Gerätename (z.B. Cedrics iPhone)"
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button disabled={!deviceLabel.trim()}>
              <Bell className="h-4 w-4" />
              Aktivieren
            </Button>
          </div>
        )}
      </div>

      {/* Registered devices */}
      {subscriptions.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold">Registrierte Geräte</h2>
          {subscriptions.map((sub) => (
            <div
              key={sub.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">{sub.deviceLabel}</h3>
                  <p className="text-xs text-muted-foreground">
                    Registriert am {formatDate(sub.createdAt)}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => testMutation.mutate(sub.id)}
                  disabled={testMutation.isPending}
                  title="Test-Push senden"
                >
                  <Send className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:bg-destructive/8"
                  onClick={() => deleteMutation.mutate(sub.id)}
                  title="Gerät entfernen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="flex items-start gap-3 rounded-xl bg-muted/50 p-4">
        <Shield className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground">Datenschutz</p>
          <p className="mt-1">
            PlanQT läuft komplett in deinem Heimnetz. Keine Daten verlassen
            dein Netzwerk — nur anonyme Wetterabfragen gehen an Open-Meteo.
          </p>
        </div>
      </div>
    </div>
  );
}
