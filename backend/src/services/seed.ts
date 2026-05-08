import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import templates from '../data/plant-templates.json' with { type: 'json' };

interface TemplateEntry {
  id: string;
  name: string;
  scientificName: string | null;
  category: string;
  cropCoefficient: { initial: number; mid: number; late: number };
  optimalSoilMoisture: { min: number; max: number; critical: number };
  rootDepthCm: number;
  careTips: string[];
  isOutdoor: boolean;
}

export function seedPlantTemplates(): void {
  const insert = db.prepare(`
    INSERT OR IGNORE INTO plant_templates
      (id, name, scientific_name, category, kc_initial, kc_mid, kc_late,
       moisture_min, moisture_max, moisture_critical, root_depth_cm, care_tips, is_outdoor)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((entries: TemplateEntry[]) => {
    let inserted = 0;
    for (const t of entries) {
      const result = insert.run(
        t.id,
        t.name,
        t.scientificName,
        t.category,
        t.cropCoefficient.initial,
        t.cropCoefficient.mid,
        t.cropCoefficient.late,
        t.optimalSoilMoisture.min,
        t.optimalSoilMoisture.max,
        t.optimalSoilMoisture.critical,
        t.rootDepthCm,
        JSON.stringify(t.careTips),
        t.isOutdoor ? 1 : 0,
      );
      if (result.changes > 0) inserted++;
    }
    return inserted;
  });

  const inserted = insertMany(templates as TemplateEntry[]);
  logger.info(`Plant templates seeded (${inserted} new, ${templates.length} total)`);
}
