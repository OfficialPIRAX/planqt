import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bell, Droplets, Sun, FlaskConical, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

interface Notification {
  id: number;
  title: string;
  body: string;
  type: string;
  plantId?: string;
  recommendationId?: string;
  createdAt: string;
}

const LAST_READ_KEY = 'planqt-notifications-last-read';

function getLastRead(): string {
  return localStorage.getItem(LAST_READ_KEY) ?? '1970-01-01T00:00:00.000Z';
}

function setLastRead(iso: string) {
  localStorage.setItem(LAST_READ_KEY, iso);
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'watering':
      return <Droplets className="h-4 w-4 text-status-optimal" />;
    case 'daily-status':
      return <Sun className="h-4 w-4 text-status-warning" />;
    default:
      return <FlaskConical className="h-4 w-4 text-muted-foreground" />;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [lastRead, setLastReadState] = useState(getLastRead);
  const panelRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications');
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const unreadCount = notifications.filter((n) => n.createdAt > lastRead).length;

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleOpen() {
    setOpen((prev) => {
      if (!prev && notifications.length > 0) {
        const newest = notifications[0].createdAt;
        setLastRead(newest);
        setLastReadState(newest);
      }
      return !prev;
    });
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={handleOpen}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Benachrichtigungen"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-status-danger px-1 text-[0.6rem] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border bg-card shadow-lg sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-display text-sm font-semibold">Benachrichtigungen</h3>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto overscroll-contain">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Bell className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">
                    Noch keine Benachrichtigungen
                  </p>
                </div>
              ) : (
                notifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex gap-3 border-b border-border/50 px-4 py-3 last:border-0',
                      n.createdAt > lastRead && 'bg-primary/4',
                    )}
                  >
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <TypeIcon type={n.type} />
                    </div>
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="text-sm font-medium leading-tight">{n.title}</span>
                      <span className="text-xs leading-snug text-muted-foreground line-clamp-2">
                        {n.body}
                      </span>
                      <span className="mt-0.5 text-[0.65rem] text-muted-foreground/70">
                        {formatRelativeTime(n.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
