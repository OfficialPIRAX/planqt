import cron from 'node-cron';
import type { Urgency } from '@flora-pi/shared';
import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';
import { processAllPlants, expireOldRecommendations } from './irrigation.js';
import { notifyWatering, sendDailyStatus } from './push.js';

interface PlantWithReading {
  id: string;
  name: string;
  sensor_id: string | null;
  image_url: string | null;
  template_id: string;
}

interface ReadingRow {
  soil_moisture: number | null;
}

interface RecommendationRow {
  urgency: string;
}

const stmtAllPlants = db.prepare(`SELECT * FROM plants`);
const stmtPlantById = db.prepare(`SELECT * FROM plants WHERE id = ?`);
const stmtLatestReading = db.prepare(
  `SELECT soil_moisture FROM sensor_readings WHERE sensor_id = ? ORDER BY timestamp DESC LIMIT 1`,
);
const stmtOpenRecommendation = db.prepare(
  `SELECT urgency FROM watering_recommendations WHERE plant_id = ? AND acknowledged = 0 AND expired_at IS NULL ORDER BY created_at DESC LIMIT 1`,
);

async function hourlyIrrigationCheck(): Promise<void> {
  logger.info('Running hourly irrigation check');

  try {
    const results = await processAllPlants();

    for (const result of results) {
      if (result.skipped || !result.recommendation) continue;

      const plant = stmtPlantById.get(result.plantId) as PlantWithReading | undefined;
      if (!plant) continue;

      await notifyWatering(result.recommendation, {
        id: plant.id,
        name: plant.name,
        templateId: plant.template_id,
        potVolumeLiters: 0,
        potDiameterCm: 0,
        imageUrl: plant.image_url ?? undefined,
        sensorId: plant.sensor_id ?? undefined,
        location: '',
        plantedAt: '',
        currentStage: 'mid',
        createdAt: '',
        updatedAt: '',
      });
    }

    const created = results.filter((r) => r.recommendation && !r.skipped).length;
    const skipped = results.filter((r) => r.skipped).length;
    logger.info(`Irrigation check complete: ${created} new, ${skipped} skipped, ${results.length} total`);
  } catch (err) {
    logger.error('Hourly irrigation check failed', err);
  }
}

async function dailyStatusPush(): Promise<void> {
  logger.info('Sending daily status push');

  try {
    const plantRows = stmtAllPlants.all() as PlantWithReading[];
    const statusPlants: { name: string; moisture?: number; urgency?: string }[] = [];

    for (const plant of plantRows) {
      let moisture: number | undefined;
      if (plant.sensor_id) {
        const reading = stmtLatestReading.get(plant.sensor_id) as ReadingRow | undefined;
        moisture = reading?.soil_moisture ?? undefined;
      }

      let urgency: Urgency | undefined;
      const rec = stmtOpenRecommendation.get(plant.id) as RecommendationRow | undefined;
      if (rec) {
        urgency = rec.urgency as Urgency;
      }

      statusPlants.push({ name: plant.name, moisture, urgency });
    }

    await sendDailyStatus(statusPlants);
  } catch (err) {
    logger.error('Daily status push failed', err);
  }
}

function midnightCleanup(): void {
  logger.info('Running midnight cleanup');
  try {
    const expired = expireOldRecommendations();
    logger.info(`Midnight cleanup: expired ${expired} old recommendations`);
  } catch (err) {
    logger.error('Midnight cleanup failed', err);
  }
}

export function startScheduler(): void {
  cron.schedule('0 * * * *', () => {
    void hourlyIrrigationCheck();
  });

  cron.schedule('0 7 * * *', () => {
    void dailyStatusPush();
  });

  cron.schedule('0 0 * * *', () => {
    midnightCleanup();
  });

  logger.info('Scheduler started: hourly irrigation, 07:00 daily status, 00:00 cleanup');
}
