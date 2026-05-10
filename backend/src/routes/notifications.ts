import type { FastifyPluginAsync } from 'fastify';
import { db } from '../db/connection.js';

interface NotificationRow {
  id: number;
  title: string;
  body: string;
  type: string;
  plant_id: string | null;
  recommendation_id: string | null;
  created_at: string;
}

const stmtRecent = db.prepare(
  'SELECT * FROM notification_log ORDER BY created_at DESC LIMIT 50',
);

const notificationsPlugin: FastifyPluginAsync = async (app) => {
  app.get('/api/notifications', async (_req, reply) => {
    const rows = stmtRecent.all() as NotificationRow[];
    return reply.send(
      rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        type: r.type,
        plantId: r.plant_id ?? undefined,
        recommendationId: r.recommendation_id ?? undefined,
        createdAt: r.created_at,
      })),
    );
  });
};

export default notificationsPlugin;
