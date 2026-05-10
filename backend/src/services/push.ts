import webpush from 'web-push';
import type { WateringRecommendation, Plant, PushSubscription } from '@flora-pi/shared';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';

interface SubscriptionRow {
  id: string;
  device_label: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  preferences: string;
  created_at: string;
}

if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(
    config.vapid.contact || 'mailto:noreply@flora-pi.local',
    config.vapid.publicKey,
    config.vapid.privateKey,
  );
}

const stmtAllSubscriptions = db.prepare(`
  SELECT * FROM push_subscriptions
`);

const stmtDeleteSubscription = db.prepare(`
  DELETE FROM push_subscriptions WHERE id = ?
`);

const stmtLogNotification = db.prepare(`
  INSERT INTO notification_log (title, body, type, plant_id, recommendation_id, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const stmtRecentDuplicate = db.prepare(`
  SELECT id FROM notification_log
  WHERE type = ? AND title = ? AND created_at > ?
  LIMIT 1
`);

export function logNotification(title: string, body: string, type: string, plantId?: string, recommendationId?: string) {
  const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();
  const existing = stmtRecentDuplicate.get(type, title, oneMinuteAgo);
  if (existing) return;
  stmtLogNotification.run(title, body, type, plantId ?? null, recommendationId ?? null, new Date().toISOString());
}

function rowToSubscription(r: SubscriptionRow): PushSubscription {
  return {
    id: r.id,
    deviceLabel: r.device_label,
    endpoint: r.endpoint,
    p256dh: r.p256dh,
    auth: r.auth,
    preferences: JSON.parse(r.preferences),
    createdAt: r.created_at,
  };
}

function buildPushSubscription(sub: PushSubscription): webpush.PushSubscription {
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
  };
}

export async function sendNotification(
  subscription: PushSubscription,
  payload: Record<string, unknown>,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      buildPushSubscription(subscription),
      JSON.stringify(payload),
      { TTL: 3600 },
    );
    return true;
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 410 || statusCode === 404) {
      logger.info(`Removing expired subscription: ${subscription.id} (${subscription.deviceLabel})`);
      stmtDeleteSubscription.run(subscription.id);
    } else {
      logger.error(`Push failed for ${subscription.deviceLabel}`, err);
    }
    return false;
  }
}

function urgencyToEmoji(urgency: string): string {
  switch (urgency) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '💧';
    default: return '🌱';
  }
}

function urgencyToTitle(urgency: string): string {
  switch (urgency) {
    case 'critical': return 'Dringend: Pflanze braucht Wasser!';
    case 'high': return 'Pflanze braucht bald Wasser';
    case 'medium': return 'Giessempfehlung';
    default: return 'Giesshinweis';
  }
}

export async function notifyWatering(
  recommendation: WateringRecommendation,
  plant: Plant,
): Promise<void> {
  const subscriptions = (stmtAllSubscriptions.all() as SubscriptionRow[]).map(rowToSubscription);

  const payload = {
    title: `${urgencyToEmoji(recommendation.urgency)} ${urgencyToTitle(recommendation.urgency)}`,
    body: `${plant.name}: ${recommendation.recommendedAmountMl}ml giessen. ${recommendation.reason}`,
    icon: plant.imageUrl ?? '/icons/plant-default.png',
    badge: '/icons/badge.png',
    tag: `watering-${plant.id}`,
    data: {
      type: 'watering',
      plantId: plant.id,
      recommendationId: recommendation.id,
    },
    actions: [
      { action: 'water', title: 'Gegossen' },
      { action: 'dismiss', title: 'Spaeter' },
    ],
  };

  stmtLogNotification.run(
    payload.title,
    payload.body,
    'watering',
    plant.id,
    recommendation.id,
    new Date().toISOString(),
  );

  for (const sub of subscriptions) {
    const prefs = sub.preferences;
    if (recommendation.urgency === 'critical' && !prefs.criticalAlerts) continue;
    if (recommendation.urgency !== 'critical' && !prefs.wateringNeeded) continue;

    await sendNotification(sub, payload);
  }
}

export async function sendDailyStatus(
  plants: { name: string; moisture?: number; urgency?: string }[],
): Promise<void> {
  const subscriptions = (stmtAllSubscriptions.all() as SubscriptionRow[])
    .map(rowToSubscription)
    .filter((s) => s.preferences.dailyStatus);

  if (subscriptions.length === 0) return;

  const needsWater = plants.filter((p) => p.urgency && p.urgency !== 'low');
  const lines: string[] = [];

  if (needsWater.length === 0) {
    lines.push('Alles in Ordnung! Keine Pflanzen brauchen heute Wasser.');
  } else {
    lines.push(`${needsWater.length} Pflanze(n) brauchen Aufmerksamkeit:`);
    for (const p of needsWater.slice(0, 5)) {
      const moistureStr = p.moisture != null ? ` (${p.moisture}%)` : '';
      lines.push(`- ${p.name}${moistureStr}`);
    }
    if (needsWater.length > 5) {
      lines.push(`...und ${needsWater.length - 5} weitere`);
    }
  }

  const payload = {
    title: '🌿 PlanQT Tagesbericht',
    body: lines.join('\n'),
    icon: '/icons/daily-status.png',
    tag: 'daily-status',
    data: { type: 'daily-status' },
  };

  stmtLogNotification.run(
    payload.title,
    payload.body,
    'daily-status',
    null,
    null,
    new Date().toISOString(),
  );

  for (const sub of subscriptions) {
    await sendNotification(sub, payload);
  }

  logger.info(`Daily status sent to ${subscriptions.length} subscribers`);
}
