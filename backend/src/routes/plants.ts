import type { FastifyPluginAsync } from 'fastify';
import type {
  Plant,
  PlantTemplate,
  SensorReading,
  WateringRecommendation,
  GrowthStage,
} from '@flora-pi/shared';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { broadcast } from '../services/sse.js';

// ── Row types (snake_case from SQLite) ──────────────────────────────

interface PlantRow {
  id: string;
  name: string;
  template_id: string;
  pot_volume_liters: number;
  pot_diameter_cm: number;
  image_url: string | null;
  sensor_id: string | null;
  location: string;
  planted_at: string;
  current_stage: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

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

interface ReadingRow {
  id: number;
  sensor_id: string;
  timestamp: string;
  soil_moisture: number | null;
  soil_moisture_raw: number | null;
  temperature: number | null;
  humidity: number | null;
  light: number | null;
  battery: number | null;
}

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

// ── Mappers ─────────────────────────────────────────────────────────

function rowToPlant(r: PlantRow): Plant {
  return {
    id: r.id,
    name: r.name,
    templateId: r.template_id,
    potVolumeLiters: r.pot_volume_liters,
    potDiameterCm: r.pot_diameter_cm,
    imageUrl: r.image_url ?? undefined,
    sensorId: r.sensor_id ?? undefined,
    location: r.location,
    plantedAt: r.planted_at,
    currentStage: r.current_stage as GrowthStage,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
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

function rowToReading(r: ReadingRow): SensorReading {
  return {
    id: r.id,
    sensorId: r.sensor_id,
    timestamp: r.timestamp,
    soilMoisture: r.soil_moisture ?? 0,
    soilMoistureRaw: r.soil_moisture_raw ?? undefined,
    temperature: r.temperature ?? undefined,
    humidity: r.humidity ?? undefined,
    light: r.light ?? undefined,
    battery: r.battery ?? undefined,
  };
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

// ── Zod schemas ─────────────────────────────────────────────────────

const createPlantSchema = z.object({
  name: z.string().min(1).max(200),
  templateId: z.string().min(1),
  potVolumeLiters: z.number().positive(),
  potDiameterCm: z.number().positive(),
  imageUrl: z.string().optional(),
  sensorId: z.string().optional(),
  location: z.string().min(1).max(300),
  plantedAt: z.string().min(1),
  currentStage: z.enum(['initial', 'mid', 'late']).default('mid'),
  notes: z.string().optional(),
});

const updatePlantSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  templateId: z.string().min(1).optional(),
  potVolumeLiters: z.number().positive().optional(),
  potDiameterCm: z.number().positive().optional(),
  imageUrl: z.string().nullable().optional(),
  sensorId: z.string().nullable().optional(),
  location: z.string().min(1).max(300).optional(),
  plantedAt: z.string().min(1).optional(),
  currentStage: z.enum(['initial', 'mid', 'late']).optional(),
  notes: z.string().nullable().optional(),
});

// ── Prepared statements ─────────────────────────────────────────────

const stmtAllPlants = db.prepare('SELECT * FROM plants ORDER BY name');
const stmtPlantById = db.prepare('SELECT * FROM plants WHERE id = ?');
const stmtTemplateById = db.prepare('SELECT * FROM plant_templates WHERE id = ?');
const stmtSensorById = db.prepare('SELECT * FROM sensors WHERE id = ?');
const stmtLatestReading = db.prepare(
  'SELECT * FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1',
);
const stmtOpenRecommendation = db.prepare(
  `SELECT * FROM watering_recommendations
   WHERE plant_id = ? AND acknowledged = 0 AND expired_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);

const stmtInsertPlant = db.prepare(`
  INSERT INTO plants (id, name, template_id, pot_volume_liters, pot_diameter_cm, image_url,
    sensor_id, location, planted_at, current_stage, notes, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const stmtDeletePlant = db.prepare('DELETE FROM plants WHERE id = ?');
const stmtDeleteReadingsBySensor = db.prepare('DELETE FROM sensor_readings WHERE sensor_id = ?');
const stmtDeleteRecommendations = db.prepare('DELETE FROM watering_recommendations WHERE plant_id = ?');
const stmtFreeSensor = db.prepare('UPDATE sensors SET plant_id = NULL WHERE plant_id = ?');

const stmtReadingsHistory = db.prepare(
  `SELECT * FROM sensor_readings
   WHERE sensor_id = ? AND timestamp >= ?
   ORDER BY timestamp DESC
   LIMIT 1000`,
);

const stmtRecommendationsByPlant = db.prepare(
  'SELECT * FROM watering_recommendations WHERE plant_id = ? ORDER BY created_at DESC',
);

// ── Plugin ──────────────────────────────────────────────────────────

const plantsPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/plants
  app.get('/api/plants', async (_req, reply) => {
    const plantRows = stmtAllPlants.all() as PlantRow[];
    const plants = plantRows.map((row) => {
      const plant = rowToPlant(row);
      const templateRow = stmtTemplateById.get(plant.templateId) as TemplateRow | undefined;
      const template = templateRow ? rowToTemplate(templateRow) : undefined;

      let latestReading: SensorReading | undefined;
      if (plant.sensorId) {
        const readingRow = stmtLatestReading.get(plant.sensorId) as ReadingRow | undefined;
        if (readingRow) latestReading = rowToReading(readingRow);
      }

      const recRow = stmtOpenRecommendation.get(plant.id) as RecommendationRow | undefined;
      const openRecommendation = recRow ? rowToRecommendation(recRow) : undefined;

      return { ...plant, template, latestReading, openRecommendation };
    });

    return reply.send(plants);
  });

  // POST /api/plants
  app.post('/api/plants', async (req, reply) => {
    const parsed = createPlantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const now = new Date().toISOString();
    const id = uuidv4();

    const templateRow = stmtTemplateById.get(data.templateId) as TemplateRow | undefined;
    if (!templateRow) {
      return reply.status(400).send({ error: `Template not found: ${data.templateId}` });
    }

    stmtInsertPlant.run(
      id,
      data.name,
      data.templateId,
      data.potVolumeLiters,
      data.potDiameterCm,
      data.imageUrl ?? null,
      data.sensorId ?? null,
      data.location,
      data.plantedAt,
      data.currentStage,
      data.notes ?? null,
      now,
      now,
    );

    // If sensor was assigned, update sensor's plant_id
    if (data.sensorId) {
      db.prepare('UPDATE sensors SET plant_id = ? WHERE id = ?').run(id, data.sensorId);
    }

    const created = rowToPlant(stmtPlantById.get(id) as PlantRow);
    broadcast({ type: 'plant.created', data: created });

    return reply.status(201).send(created);
  });

  // GET /api/plants/:id
  app.get('/api/plants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plantRow = stmtPlantById.get(id) as PlantRow | undefined;
    if (!plantRow) {
      return reply.status(404).send({ error: 'Plant not found' });
    }

    const plant = rowToPlant(plantRow);
    const templateRow = stmtTemplateById.get(plant.templateId) as TemplateRow | undefined;
    const template = templateRow ? rowToTemplate(templateRow) : undefined;

    let sensor: ReturnType<typeof rowToSensor> | undefined;
    let latestReading: SensorReading | undefined;
    if (plant.sensorId) {
      const sensorRow = stmtSensorById.get(plant.sensorId) as SensorRow | undefined;
      if (sensorRow) sensor = rowToSensor(sensorRow);

      const readingRow = stmtLatestReading.get(plant.sensorId) as ReadingRow | undefined;
      if (readingRow) latestReading = rowToReading(readingRow);
    }

    return reply.send({ ...plant, template, sensor, latestReading });
  });

  // PUT /api/plants/:id
  app.put('/api/plants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = stmtPlantById.get(id) as PlantRow | undefined;
    if (!existing) {
      return reply.status(404).send({ error: 'Plant not found' });
    }

    const parsed = updatePlantSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const data = parsed.data;
    const now = new Date().toISOString();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.templateId !== undefined) { fields.push('template_id = ?'); values.push(data.templateId); }
    if (data.potVolumeLiters !== undefined) { fields.push('pot_volume_liters = ?'); values.push(data.potVolumeLiters); }
    if (data.potDiameterCm !== undefined) { fields.push('pot_diameter_cm = ?'); values.push(data.potDiameterCm); }
    if (data.imageUrl !== undefined) { fields.push('image_url = ?'); values.push(data.imageUrl); }
    if (data.sensorId !== undefined) { fields.push('sensor_id = ?'); values.push(data.sensorId); }
    if (data.location !== undefined) { fields.push('location = ?'); values.push(data.location); }
    if (data.plantedAt !== undefined) { fields.push('planted_at = ?'); values.push(data.plantedAt); }
    if (data.currentStage !== undefined) { fields.push('current_stage = ?'); values.push(data.currentStage); }
    if (data.notes !== undefined) { fields.push('notes = ?'); values.push(data.notes); }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    db.prepare(`UPDATE plants SET ${fields.join(', ')} WHERE id = ?`).run(...values);

    // Handle sensor assignment changes
    if (data.sensorId !== undefined) {
      // Free old sensor
      if (existing.sensor_id && existing.sensor_id !== data.sensorId) {
        db.prepare('UPDATE sensors SET plant_id = NULL WHERE id = ?').run(existing.sensor_id);
      }
      // Assign new sensor
      if (data.sensorId) {
        db.prepare('UPDATE sensors SET plant_id = ? WHERE id = ?').run(id, data.sensorId);
      }
    }

    const updated = rowToPlant(stmtPlantById.get(id) as PlantRow);
    broadcast({ type: 'plant.updated', data: updated });

    return reply.send(updated);
  });

  // DELETE /api/plants/:id
  app.delete('/api/plants/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plantRow = stmtPlantById.get(id) as PlantRow | undefined;
    if (!plantRow) {
      return reply.status(404).send({ error: 'Plant not found' });
    }

    const plant = rowToPlant(plantRow);

    // Delete associated sensor readings
    if (plant.sensorId) {
      stmtDeleteReadingsBySensor.run(plant.sensorId);
    }

    // Delete recommendations
    stmtDeleteRecommendations.run(id);

    // Free sensor
    stmtFreeSensor.run(id);

    // Delete plant
    stmtDeletePlant.run(id);

    broadcast({ type: 'plant.deleted', data: { id } });

    return reply.status(204).send();
  });

  // GET /api/plants/:id/history
  app.get('/api/plants/:id/history', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plantRow = stmtPlantById.get(id) as PlantRow | undefined;
    if (!plantRow) {
      return reply.status(404).send({ error: 'Plant not found' });
    }

    if (!plantRow.sensor_id) {
      return reply.send([]);
    }

    const query = req.query as { days?: string };
    const days = Math.max(1, Math.min(365, parseInt(query.days ?? '7', 10) || 7));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const rows = stmtReadingsHistory.all(plantRow.sensor_id, since) as ReadingRow[];
    return reply.send(rows.map(rowToReading));
  });

  // GET /api/plants/:id/recommendations
  app.get('/api/plants/:id/recommendations', async (req, reply) => {
    const { id } = req.params as { id: string };
    const plantRow = stmtPlantById.get(id) as PlantRow | undefined;
    if (!plantRow) {
      return reply.status(404).send({ error: 'Plant not found' });
    }

    const rows = stmtRecommendationsByPlant.all(id) as RecommendationRow[];
    return reply.send(rows.map(rowToRecommendation));
  });
};

// ── Helpers used in detail endpoint ─────────────────────────────────

function rowToSensor(r: SensorRow) {
  return {
    id: r.id,
    friendlyName: r.friendly_name,
    type: r.type,
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

export default plantsPlugin;
