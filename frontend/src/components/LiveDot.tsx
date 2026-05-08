import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function LiveDot({ connected = true }: { connected?: boolean }) {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!connected) return;
    const handler = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 600);
    };
    window.addEventListener('flora:sse-event', handler);
    return () => window.removeEventListener('flora:sse-event', handler);
  }, [connected]);

  return (
    <span className="relative inline-flex h-3 w-3">
      {connected && pulse && (
        <span
          className="absolute inset-0 rounded-full bg-status-optimal"
          style={{ animation: 'pulse-ring 0.6s ease-out forwards' }}
        />
      )}
      <span
        className={cn(
          'relative inline-flex h-3 w-3 rounded-full transition-colors duration-300',
          connected ? 'bg-status-optimal' : 'bg-status-offline',
        )}
      />
    </span>
  );
}
