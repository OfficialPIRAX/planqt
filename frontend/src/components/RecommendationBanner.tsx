import { Droplets, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { WateringRecommendation } from '@flora-pi/shared';

interface RecommendationBannerProps {
  recommendations: WateringRecommendation[];
}

export function RecommendationBanner({ recommendations }: RecommendationBannerProps) {
  const open = recommendations.filter((r) => !r.acknowledged && !r.wateredAt && !r.expiredAt);
  const critical = open.filter((r) => r.urgency === 'critical' || r.urgency === 'high');
  const hasCritical = critical.length > 0;

  return (
    <AnimatePresence>
      {open.length > 0 && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div
            className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
              hasCritical
                ? 'bg-status-danger/10 text-status-danger'
                : 'bg-status-warning/12 text-status-warning'
            }`}
          >
            {hasCritical ? (
              <AlertTriangle className="h-5 w-5 shrink-0" />
            ) : (
              <Droplets className="h-5 w-5 shrink-0" />
            )}
            <span>
              {open.length === 1
                ? '1 Pflanze braucht Wasser'
                : `${open.length} Pflanzen brauchen Wasser`}
              {hasCritical && ' — dringend!'}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
