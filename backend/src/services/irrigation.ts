import type {
  Plant,
  PlantTemplate,
  SensorReading,
  WeatherForecast,
  WateringRecommendation,
  Urgency,
  WeatherSnapshot,
} from '@flora-pi/shared';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { fetchWeatherForecast } from './weather.js';

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
}

const stmtPlantsWithSensors = db.prepare(`
  SELECT p.* FROM plants p WHERE p.sensor_id IS NOT NULL
`);

const stmtTemplate = db.prepare(`
  SELECT * FROM plant_templates WHERE id = ?
`);

const stmtLatestReading = db.prepare(`
  SELECT * FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1
`);

const stmtOpenRecommendation = db.prepare(`
  SELECT * FROM watering_recommendations
  WHERE plant_id = ? AND acknowledged = 0 AND expired_at IS NULL
  ORDER BY created_at DESC LIMIT 1
`);

const stmtRecentPush = db.prepare(`
  SELECT created_at FROM watering_recommendations
  WHERE plant_id = ? AND created_at > ?
  ORDER BY created_at DESC LIMIT 1
`);

const stmtInsertRecommendation = db.prepare(`
  INSERT INTO watering_recommendations (id, plant_id, created_at, recommended_amount_ml, urgency, reason, weather_snapshot, acknowledged)
  VALUES (?, ?, ?, ?, ?, ?, ?, 0)
`);

const stmtExpireOld = db.prepare(`
  UPDATE watering_recommendations
  SET expired_at = ?
  WHERE acknowledged = 0 AND expired_at IS NULL AND created_at < ?
`);

const URGENCY_RANK: Record<Urgency, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

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
    currentStage: r.current_stage as Plant['currentStage'],
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
    cropCoefficient: {
      initial: r.kc_initial,
      mid: r.kc_mid,
      late: r.kc_late,
    },
    optimalSoilMoisture: {
      min: r.moisture_min,
      max: r.moisture_max,
      critical: r.moisture_critical,
    },
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

export function calculateWateringRecommendation(
  plant: Plant,
  template: PlantTemplate,
  latestReading: SensorReading,
  weather: WeatherForecast,
): WateringRecommendation | null {
  const now = new Date().toISOString();
  const { optimalSoilMoisture: optimal } = template;
  const moisture = latestReading.soilMoisture;

  if (moisture <= optimal.critical) {
    const amount = estimateRefillAmount(plant, template);
    return {
      id: uuidv4(),
      plantId: plant.id,
      createdAt: now,
      recommendedAmountMl: amount,
      urgency: 'critical',
      reason: `Kritisch: Bodenfeuchtigkeit bei ${moisture}% (Schwelle: ${optimal.critical}%). Sofort giessen!`,
      weatherSnapshot: buildSnapshot(weather),
      acknowledged: false,
    };
  }

  const kc = template.cropCoefficient[plant.currentStage];
  const et0 = weather.et0Next24h;
  const etc = et0 * kc;

  const radiusCm = plant.potDiameterCm / 2;
  const surfaceAreaM2 = Math.PI * (radiusCm / 100) ** 2;

  const waterLossLiters = etc * surfaceAreaM2;

  let rainGainLiters = 0;
  if (template.isOutdoor) {
    const rainMm = weather.rainNext24h;
    rainGainLiters = rainMm * surfaceAreaM2;
  }

  const netNeedMl = Math.max(0, (waterLossLiters - rainGainLiters) * 1000);

  if (netNeedMl < 50 && moisture >= optimal.min && moisture <= optimal.max) {
    return null;
  }

  let urgency: Urgency;
  if (moisture < optimal.min) {
    urgency = moisture < optimal.min + (optimal.critical - optimal.min) * 0.5 ? 'high' : 'medium';
  } else {
    urgency = 'low';
  }

  const reasonParts: string[] = [];

  if (moisture < optimal.min) {
    reasonParts.push(`Feuchtigkeit ${moisture}% unter Optimum (${optimal.min}-${optimal.max}%)`);
  } else {
    reasonParts.push(`Feuchtigkeit ${moisture}% im Bereich`);
  }

  reasonParts.push(`ET-Verlust: ${etc.toFixed(1)}mm (Kc=${kc})`);

  if (template.isOutdoor && weather.rainNext24h > 0) {
    reasonParts.push(`Regen erwartet: ${weather.rainNext24h.toFixed(1)}mm`);
  }

  const recommendedMl = Math.max(50, Math.round(netNeedMl));

  return {
    id: uuidv4(),
    plantId: plant.id,
    createdAt: now,
    recommendedAmountMl: recommendedMl,
    urgency,
    reason: reasonParts.join('. ') + '.',
    weatherSnapshot: buildSnapshot(weather),
    acknowledged: false,
  };
}

export function estimateRefillAmount(plant: Plant, template: PlantTemplate): number {
  const { optimalSoilMoisture: optimal } = template;
  const targetPct = optimal.max / 100;
  const volumeMl = plant.potVolumeLiters * 1000;
  return Math.round(volumeMl * targetPct * 0.3);
}

function buildSnapshot(weather: WeatherForecast): WeatherSnapshot {
  return {
    et0NextDay: weather.et0Next24h,
    rainNext24h: weather.rainNext24h,
    tempMax: weather.tempMax,
    tempMin: weather.tempMin,
  };
}

export interface ProcessResult {
  plantId: string;
  plantName: string;
  recommendation: WateringRecommendation | null;
  skipped: boolean;
  skipReason?: string;
}

export async function processAllPlants(): Promise<ProcessResult[]> {
  const results: ProcessResult[] = [];

  let weather: WeatherForecast;
  try {
    weather = await fetchWeatherForecast();
  } catch (err) {
    logger.error('Failed to fetch weather for irrigation processing', err);
    return results;
  }

  const plantRows = stmtPlantsWithSensors.all() as PlantRow[];

  for (const plantRow of plantRows) {
    const plant = rowToPlant(plantRow);
    const templateRow = stmtTemplate.get(plant.templateId) as TemplateRow | undefined;
    if (!templateRow) {
      logger.warn(`No template found for plant ${plant.name} (template=${plant.templateId})`);
      continue;
    }
    const template = rowToTemplate(templateRow);

    const readingRow = stmtLatestReading.get(plant.sensorId!) as ReadingRow | undefined;
    if (!readingRow) {
      logger.debug(`No readings for plant ${plant.name} (sensor=${plant.sensorId})`);
      continue;
    }
    const latestReading = rowToReading(readingRow);

    const recommendation = calculateWateringRecommendation(plant, template, latestReading, weather);

    if (!recommendation) {
      results.push({ plantId: plant.id, plantName: plant.name, recommendation: null, skipped: false });
      continue;
    }

    const existingRow = stmtOpenRecommendation.get(plant.id) as RecommendationRow | undefined;
    if (existingRow && recommendation.urgency !== 'critical') {
      const existingUrgency = existingRow.urgency as Urgency;
      if (URGENCY_RANK[existingUrgency] >= URGENCY_RANK[recommendation.urgency]) {
        results.push({
          plantId: plant.id,
          plantName: plant.name,
          recommendation,
          skipped: true,
          skipReason: 'Open recommendation with same or higher urgency exists',
        });
        continue;
      }
    }

    if (recommendation.urgency !== 'critical') {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
      const recentRow = stmtRecentPush.get(plant.id, sixHoursAgo) as { created_at: string } | undefined;
      if (recentRow) {
        results.push({
          plantId: plant.id,
          plantName: plant.name,
          recommendation,
          skipped: true,
          skipReason: 'Max 1 push per plant per 6 hours',
        });
        continue;
      }
    }

    stmtInsertRecommendation.run(
      recommendation.id,
      recommendation.plantId,
      recommendation.createdAt,
      recommendation.recommendedAmountMl,
      recommendation.urgency,
      recommendation.reason,
      JSON.stringify(recommendation.weatherSnapshot),
      );

    results.push({ plantId: plant.id, plantName: plant.name, recommendation, skipped: false });
    logger.info(
      `Recommendation for ${plant.name}: ${recommendation.recommendedAmountMl}ml (${recommendation.urgency})`,
    );
  }

  return results;
}

export function expireOldRecommendations(): number {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const result = stmtExpireOld.run(now, cutoff);
  if (result.changes > 0) {
    logger.info(`Expired ${result.changes} old recommendations`);
  }
  return result.changes;
}
