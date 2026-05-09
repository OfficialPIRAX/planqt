import type { FastifyPluginAsync } from 'fastify';
import type { PushSubscription, PushPreferences } from '@flora-pi/shared';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { config } from '../config.js';
import { sendNotification } from '../services/push.js';

interface SubscriptionRow {
  id: string;
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences: string;
  created_at: string;
}

function rowToSubscription(r: SubscriptionRow): PushSubscription {
  return {
    id: r.id,
    deviceLabel: r.device_label,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    preferences: JSON.parse(r.preferences) as PushPreferences,
    createdAt: r.created_at,
  };
}

const DEFAULT_PREFERENCES: PushPreferences = {
  wateringNeeded: true,
  criticalAlerts: true,
  dailyStatus: true,
  sensorOffline: true,
  lowBattery: true,
};

const subscribeSchema = z.object({
  deviceLabel: z.string().min(1).max(200),
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  preferences: z
    .object({
      wateringNeeded: z.boolean(),
      criticalAlerts: z.boolean(),
      dailyStatus: z.boolean(),
      sensorOffline: z.boolean(),
      lowBattery: z.boolean(),
    })
    .optional(),
});

const preferencesSchema = z.object({
  wateringNeeded: z.boolean(),
  criticalAlerts: z.boolean(),
  dailyStatus: z.boolean(),
  sensorOffline: z.boolean(),
  lowBattery: z.boolean(),
});

const testSchema = z.object({
  id: z.string().min(1),
});

const stmtInsert = db.prepare(`
  INSERT INTO push_subscriptions (id, device_label, endpoint, p256dh, auth, preferences, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const stmtAll = db.prepare('SELECT * FROM push_subscriptions ORDER BY created_at DESC');
const stmtById = db.prepare('SELECT * FROM push_subscriptions WHERE id = ?');
const stmtDelete = db.prepare('DELETE FROM push_subscriptions WHERE id = ?');
const stmtUpdatePreferences = db.prepare(
  'UPDATE push_subscriptions SET preferences = ? WHERE id = ?',
);

const pushPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/push/vapid-public-key
  app.get('/api/push/vapid-public-key', async (_req, reply) => {
    return reply.send({ key: config.vapid.publicKey });
  });

  // GET /api/push/subscriptions
  app.get('/api/push/subscriptions', async (_req, reply) => {
    const rows = stmtAll.all() as SubscriptionRow[];
    return reply.send(rows.map(rowToSubscription));
  });

  // POST /api/push/subscribe
  app.post('/api/push/subscribe', async (req, reply) => {
    const parsed = subscribeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const id = uuidv4();
    const now = new Date().toISOString();
    const preferences = data.preferences ?? DEFAULT_PREFERENCES;

    stmtInsert.run(
      id,
      data.deviceLabel,
      data.endpoint,
      data.p256dh,
      data.auth,
      JSON.stringify(preferences),
      now,
    );

    const created = rowToSubscription(stmtById.get(id) as SubscriptionRow);
    return reply.status(201).send(created);
  });

  // DELETE /api/push/subscriptions/:id
  app.delete('/api/push/subscriptions/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = stmtById.get(id) as SubscriptionRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Subscription not found' });
    }

    stmtDelete.run(id);
    return reply.status(204).send();
  });

  // PUT /api/push/subscriptions/:id/preferences
  app.put('/api/push/subscriptions/:id/preferences', async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = stmtById.get(id) as SubscriptionRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Subscription not found' });
    }

    const parsed = preferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    stmtUpdatePreferences.run(JSON.stringify(parsed.data), id);

    const updated = rowToSubscription(stmtById.get(id) as SubscriptionRow);
    return reply.send(updated);
  });

  // POST /api/push/test
  app.post('/api/push/test', async (req, reply) => {
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const row = stmtById.get(parsed.data.id) as SubscriptionRow | undefined;
    if (!row) {
      return reply.status(404).send({ error: 'Subscription not found' });
    }

    const subscription = rowToSubscription(row);
    const success = await sendNotification(subscription, {
      title: 'Flora-Pi Test',
      body: 'Push-Benachrichtigungen funktionieren!',
      icon: '/icons/plant-default.png',
      tag: 'test',
      data: { type: 'test' },
    });

    return reply.send({ success });
  });
};

export default pushPlugin;
