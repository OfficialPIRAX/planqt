import type { FastifyPluginAsync } from 'fastify';
import type { Sensor } from '@flora-pi/shared';
import { z } from 'zod';
import { db } from '../db/connection.js';

interface SensorRow {
  id: string;
  friendly_name: string;
  type: string;
  plant_id: string | null;
  cal_dry_value: number | null;
  cal_wet_value: number | null;
  last_seen_at: string | null;
  battery_level: number | null;
  created_at: string;
}

function rowToSensor(r: SensorRow): Sensor {
  return {
    id: r.id,
    friendlyName: r.friendly_name,
    type: r.type as Sensor['type'],
    plantId: r.plant_id ?? undefined,
    calibration:
      r.cal_dry_value != null && r.cal_wet_value != null
        ? { dryValue: r.cal_dry_value, wetValue: r.cal_wet_value }
        : undefined,
    lastSeenAt: r.last_seen_at ?? undefined,
    batteryLevel: r.battery_level ?? undefined,
    createdAt: r.created_at,
  };
}

const updateSensorSchema = z.object({
  friendlyName: z.string().min(1).max(200).optional(),
  plantId: z.string().nullable().optional(),
  calibration: z
    .object({
      dryValue: z.number(),
      wetValue: z.number(),
    })
    .nullable()
    .optional(),
});

const stmtAll = db.prepare('SELECT * FROM sensors ORDER BY friendly_name');
const stmtById = db.prepare('SELECT * FROM sensors WHERE id = ?');

const sensorsPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/sensors
  app.get('/api/sensors', async (_req, reply) => {
    const rows = stmtAll.all() as SensorRow[];
    return reply.send(rows.map(rowToSensor));
  });

  // PUT /api/sensors/:id
  app.put('/api/sensors/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = stmtById.get(id) as SensorRow | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'Sensor not found' });
    }

    const parsed = updateSensorSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.friendlyName !== undefined) {
      fields.push('friendly_name = ?');
      values.push(data.friendlyName);
    }
    if (data.plantId !== undefined) {
      fields.push('plant_id = ?');
      values.push(data.plantId);
    }
    if (data.calibration !== undefined) {
      if (data.calibration === null) {
        fields.push('cal_dry_value = NULL, cal_wet_value = NULL');
      } else {
        fields.push('cal_dry_value = ?, cal_wet_value = ?');
        values.push(data.calibration.dryValue, data.calibration.wetValue);
      }
    }

    if (fields.length > 0) {
      values.push(id);
      db.prepare(`UPDATE sensors SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    // When assigning sensor to a plant, also update the plant's sensor_id
    if (data.plantId !== undefined) {
      // Remove this sensor from any previously linked plant
      if (existing.plant_id && existing.plant_id !== data.plantId) {
        db.prepare('UPDATE plants SET sensor_id = NULL WHERE sensor_id = ?').run(id);
      }
      // Assign sensor to the new plant
      if (data.plantId) {
        db.prepare('UPDATE plants SET sensor_id = ? WHERE id = ?').run(id, data.plantId);
      }
    }

    const updated = stmtById.get(id) as SensorRow;
    return reply.send(rowToSensor(updated));
  });
};

export default sensorsPlugin;
