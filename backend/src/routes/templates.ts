import type { FastifyPluginAsync } from 'fastify';
import type { PlantTemplate } from '@flora-pi/shared';
import { db } from '../db/connection.js';

interface TemplateRow {
  id: string;
  name: string;
  scientific_name: string | null;
  category: string;
  kc_initial: number;
  kc_mid: number;
  kc_late: number;
  moisture_min: number;
  moisture_max: number;
  moisture_critical: number;
  root_depth_cm: number;
  care_tips: string;
  is_outdoor: number;
}

function rowToTemplate(r: TemplateRow): PlantTemplate {
  return {
    id: r.id,
    name: r.name,
    scientificName: r.scientific_name ?? undefined,
    category: r.category as PlantTemplate['category'],
    cropCoefficient: { initial: r.kc_initial, mid: r.kc_mid, late: r.kc_late },
    optimalSoilMoisture: { min: r.moisture_min, max: r.moisture_max, critical: r.moisture_critical },
    rootDepthCm: r.root_depth_cm,
    careTips: JSON.parse(r.care_tips) as string[],
    isOutdoor: r.is_outdoor === 1,
  };
}

const stmtAll = db.prepare('SELECT * FROM plant_templates ORDER BY name');
const stmtByCategory = db.prepare('SELECT * FROM plant_templates WHERE category = ? ORDER BY name');
const stmtById = db.prepare('SELECT * FROM plant_templates WHERE id = ?');

const templatesPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/templates
  app.get('/api/templates', async (req, reply) => {
    const query = req.query as { category?: string };

    const rows = query.category
      ? (stmtByCategory.all(query.category) as TemplateRow[])
      : (stmtAll.all() as TemplateRow[]);

    return reply.send(rows.map(rowToTemplate));
  });

  // GET /api/templates/:id
  app.get('/api/templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = stmtById.get(id) as TemplateRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Template not found' });
    }
    return reply.send(rowToTemplate(row));
  });
};

export default templatesPlugin;
