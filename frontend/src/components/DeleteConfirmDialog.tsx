import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui/button';

interface DeleteConfirmDialogProps {
  plantName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  loading?: boolean;
}

export function DeleteConfirmDialog({
  plantName,
  open,
  onOpenChange,
  onConfirm,
  loading,
}: DeleteConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm animate-fade-in" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-6 shadow-lg animate-fade-in">
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
              <div className="flex flex-col gap-1">
                <AlertDialog.Title className="font-display text-lg font-semibold">
                  Pflanze löschen?
                </AlertDialog.Title>
                <AlertDialog.Description className="text-sm text-muted-foreground leading-relaxed">
                  Pflanze <strong>&laquo;{plantName}&raquo;</strong> wirklich löschen?
                  Alle Sensordaten und Empfehlungen werden ebenfalls gelöscht.
                  Der zugeordnete Sensor wird wieder frei.
                </AlertDialog.Description>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <AlertDialog.Cancel asChild>
                <Button variant="outline">Abbrechen</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  variant="destructive"
                  onClick={onConfirm}
                  disabled={loading}
                >
                  {loading ? 'Wird gelöscht...' : 'Löschen'}
                </Button>
              </AlertDialog.Action>
            </div>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
