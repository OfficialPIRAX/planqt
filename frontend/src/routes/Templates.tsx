import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Leaf, Droplets, ThermometerSun, TreeDeciduous } from 'lucide-react';
import type { PlantCategory } from '@flora-pi/shared';
import { fetchTemplates } from '@/lib/api';
import { cn } from '@/lib/utils';

const categoryLabels: Record<PlantCategory, string> = {
  vegetable: 'Gemüse',
  herb: 'Kräuter',
  flower: 'Blumen',
  shrub: 'Sträucher',
  tree: 'Bäume',
  other: 'Sonstige',
};

const categoryIcons: Record<PlantCategory, typeof Leaf> = {
  vegetable: ThermometerSun,
  herb: Leaf,
  flower: Droplets,
  shrub: TreeDeciduous,
  tree: TreeDeciduous,
  other: Leaf,
};

export function Templates() {
  const [category, setCategory] = useState<PlantCategory | ''>('');
  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchTemplates(),
  });

  const filtered = category ? templates.filter((t) => t.category === category) : templates;

  return (
    <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
      <div>
        <h1 className="font-display text-2xl font-bold">Pflanzen-Vorlagen</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {templates.length} Vorlagen mit optimierten Bewässerungswerten verfügbar.
        </p>
      </div>

      {/* Category filter */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setCategory('')}
          className={cn(
            'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
            !category ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
          )}
        >
          Alle
        </button>
        {(Object.entries(categoryLabels) as [PlantCategory, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              category === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-xl animate-shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((template) => {
            const Icon = categoryIcons[template.category] || Leaf;
            return (
              <div
                key={template.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-card"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold">{template.name}</h3>
                      {template.scientificName && (
                        <p className="text-xs italic text-muted-foreground">{template.scientificName}</p>
                      )}
                    </div>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {categoryLabels[template.category]}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="rounded-lg bg-muted/50 py-2">
                    <span className="block font-semibold text-foreground">
                      {template.optimalSoilMoisture.min}–{template.optimalSoilMoisture.max}%
                    </span>
                    <span className="text-muted-foreground">Optimal</span>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2">
                    <span className="block font-semibold text-foreground">
                      {template.optimalSoilMoisture.critical}%
                    </span>
                    <span className="text-muted-foreground">Kritisch</span>
                  </div>
                  <div className="rounded-lg bg-muted/50 py-2">
                    <span className="block font-semibold text-foreground">
                      {template.rootDepthCm} cm
                    </span>
                    <span className="text-muted-foreground">Wurzel</span>
                  </div>
                </div>

                {template.careTips.length > 0 && (
                  <ul className="flex flex-col gap-1">
                    {template.careTips.slice(0, 2).map((tip, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary/40" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
