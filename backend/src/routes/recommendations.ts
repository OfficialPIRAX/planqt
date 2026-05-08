import type { FastifyPluginAsync } from 'fastify';
import type { WateringRecommendation } from '@flora-pi/shared';
import { z } from 'zod';
import { db } from '../db/connection.js';
import { broadcast } from '../services/sse.js';

interface RecommendationRow {
  id: string;
  plant_id: string;
  created_at: string;
  recommended_amount_ml: number;
  urgency: string;
  reason: string;
  weather_snapshot: string;
  acknowledged: number;
  watered_at: string | null;
  watered_by: string | null;
  watered_amount_ml: number | null;
  expired_at: string | null;
}

function rowToRecommendation(r: RecommendationRow): WateringRecommendation {
  return {
    id: r.id,
    plantId: r.plant_id,
    createdAt: r.created_at,
    recommendedAmountMl: r.recommended_amount_ml,
    urgency: r.urgency as WateringRecommendation['urgency'],
    reason: r.reason,
    weatherSnapshot: JSON.parse(r.weather_snapshot),
    acknowledged: r.acknowledged === 1,
    wateredAt: r.watered_at ?? undefined,
    wateredBy: r.watered_by ?? undefined,
    wateredAmountMl: r.watered_amount_ml ?? undefined,
    expiredAt: r.expired_at ?? undefined,
  };
}

const wateredSchema = z.object({
  amountMl: z.number().positive().optional(),
  by: z.string().min(1).optional(),
});

const stmtAll = db.prepare(
  'SELECT * FROM watering_recommendations ORDER BY created_at DESC',
);
const stmtOpen = db.prepare(
  `SELECT * FROM watering_recommendations
   WHERE acknowledged = 0 AND expired_at IS NULL
   ORDER BY created_at DESC`,
);
const stmtById = db.prepare('SELECT * FROM watering_recommendations WHERE id = ?');
const stmtAcknowledge = db.prepare(
  'UPDATE watering_recommendations SET acknowledged = 1 WHERE id = ?',
);
const stmtWatered = db.prepare(
  `UPDATE watering_recommendations
   SET acknowledged = 1, watered_at = ?, watered_by = ?, watered_amount_ml = ?
   WHERE id = ?`,
);

const recommendationsPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/recommendations
  app.get('/api/recommendations', async (req, reply) => {
    const query = req.query as { status?: string };
    const rows = query.status === 'open'
      ? (stmtOpen.all() as RecommendationRow[])
      : (stmtAll.all() as RecommendationRow[]);

    return reply.send(rows.map(rowToRecommendation));
  });

  // POST /api/recommendations/:id/acknowledge
  app.post('/api/recommendations/:id/acknowledge', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = stmtById.get(id) as RecommendationRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Recommendation not found' });
    }

    stmtAcknowledge.run(id);

    const updated = stmtById.get(id) as RecommendationRow;
    return reply.send(rowToRecommendation(updated));
  });

  // POST /api/recommendations/:id/watered
  app.post('/api/recommendations/:id/watered', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = stmtById.get(id) as RecommendationRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Recommendation not found' });
    }

    const parsed = wateredSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const now = new Date().toISOString();
    stmtWatered.run(now, parsed.data.by ?? null, parsed.data.amountMl ?? null, id);

    const updated = rowToRecommendation(stmtById.get(id) as RecommendationRow);

    broadcast({ type: 'recommendation.created', data: updated });

    return reply.send(updated);
  });
};

export default recommendationsPlugin;
