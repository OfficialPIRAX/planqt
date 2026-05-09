import type { FastifyPluginAsync } from 'fastify';
import type {
  Plant,
  PlantTemplate,
  Sensor,
  SensorReading,
  WateringRecommendation,
  DashboardSummary,
  GrowthStage,
} from '@flora-pi/shared';
import { db } from '../db/connection.js';
import { fetchWeatherForecast, getCurrentWeather } from '../services/weather.js';

// ── Row types ───────────────────────────────────────────────────────

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

// ── Prepared statements ─────────────────────────────────────────────

const stmtAllPlants = db.prepare('SELECT * FROM plants ORDER BY name');
const stmtTemplateById = db.prepare('SELECT * FROM plant_templates WHERE id = ?');
const stmtSensorById = db.prepare('SELECT * FROM sensors WHERE id = ?');
const stmtLatestReadings = db.prepare(
  'SELECT * FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 5',
);
const stmtOpenRecommendation = db.prepare(
  `SELECT * FROM watering_recommendations
   WHERE plant_id = ? AND acknowledged = 0 AND expired_at IS NULL
   ORDER BY created_at DESC LIMIT 1`,
);
const stmtAlertCount = db.prepare(
  `SELECT COUNT(*) AS cnt FROM watering_recommendations
   WHERE acknowledged = 0 AND expired_at IS NULL AND urgency IN ('high', 'critical')`,
);

// ── Plugin ──────────────────────────────────────────────────────────

const dashboardPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/dashboard/summary
  app.get('/api/dashboard/summary', async (_req, reply) => {
    const plantRows = stmtAllPlants.all() as PlantRow[];

    const plants: DashboardSummary['plants'] = plantRows.map((row) => {
      const plant = rowToPlant(row);

      const templateRow = stmtTemplateById.get(plant.templateId) as TemplateRow | undefined;
      const template = templateRow ? rowToTemplate(templateRow) : undefined;

      let sensor: Sensor | undefined;
      let latestReading: SensorReading | undefined;
      if (plant.sensorId) {
        const sensorRow = stmtSensorById.get(plant.sensorId) as SensorRow | undefined;
        if (sensorRow) sensor = rowToSensor(sensorRow);

        const recentRows = stmtLatestReadings.all(plant.sensorId) as ReadingRow[];
        if (recentRows.length > 0) {
          latestReading = rowToReading(recentRows[0]);
          if (recentRows.length > 1) {
            const avgMoisture = recentRows.reduce((sum, r) => sum + (r.soil_moisture ?? 0), 0) / recentRows.length;
            latestReading.soilMoisture = Math.round(avgMoisture * 10) / 10;
          }
        }
      }

      const recRow = stmtOpenRecommendation.get(plant.id) as RecommendationRow | undefined;
      const openRecommendation = recRow ? rowToRecommendation(recRow) : undefined;

      return { ...plant, template, sensor, latestReading, openRecommendation };
    });

    // Weather
    const [current, forecast] = await Promise.all([
      getCurrentWeather(),
      fetchWeatherForecast(),
    ]);

    const weather: DashboardSummary['weather'] = {
      tempCurrent: current.tempCurrent,
      description: current.description,
      et0Today: forecast.et0Next24h,
      rainToday: forecast.rainNext24h,
    };

    // Alert count
    const alertRow = stmtAlertCount.get() as { cnt: number };
    const alertCount = alertRow.cnt;

    const summary: DashboardSummary = { plants, weather, alertCount };
    return reply.send(summary);
  });
};

export default dashboardPlugin;
