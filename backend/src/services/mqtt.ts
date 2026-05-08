import mqtt from 'mqtt';
import { EventEmitter } from 'node:events';
import type { Sensor, SensorReading } from '@flora-pi/shared';
import { config } from '../config.js';
import { db } from '../db/connection.js';
import { logger } from '../utils/logger.js';

export const mqttEvents = new EventEmitter();

interface Zigbee2MqttSensorPayload {
  soil_moisture?: number;
  temperature?: number;
  humidity?: number;
  illuminance_lux?: number;
  battery?: number;
}

interface BridgeDevice {
  ieee_address: string;
  friendly_name: string;
  type: string;
  definition?: {
    model?: string;
    vendor?: string;
  };
}

function getStatements() {
  return {
    insertReading: db.prepare(`
      INSERT INTO sensor_readings (sensor_id, timestamp, soil_moisture, soil_moisture_raw, temperature, humidity, light, battery)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `),
    updateSensor: db.prepare(`
      UPDATE sensors SET last_seen_at = ?, battery_level = ? WHERE id = ?
    `),
    getSensor: db.prepare(`
      SELECT id, friendly_name, type, plant_id, cal_dry_value, cal_wet_value, last_seen_at, battery_level, created_at
      FROM sensors WHERE id = ?
    `),
    upsertSensor: db.prepare(`
      INSERT INTO sensors (id, friendly_name, type, created_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET friendly_name = excluded.friendly_name
    `),
  };
}

let _stmts: ReturnType<typeof getStatements> | null = null;
function stmts() {
  if (!_stmts) _stmts = getStatements();
  return _stmts;
}

function calibrateMoisture(raw: number, dryValue: number, wetValue: number): number {
  const clamped = Math.max(dryValue, Math.min(wetValue, raw));
  const pct = ((clamped - dryValue) / (wetValue - dryValue)) * 100;
  return Math.round(pct * 10) / 10;
}

function parseSensorRow(row: unknown): Sensor | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const r = row as Record<string, unknown>;
  return {
    id: r.id as string,
    friendlyName: r.friendly_name as string,
    type: r.type as Sensor['type'],
    plantId: r.plant_id as string | undefined,
    calibration:
      r.cal_dry_value != null && r.cal_wet_value != null
        ? { dryValue: r.cal_dry_value as number, wetValue: r.cal_wet_value as number }
        : undefined,
    lastSeenAt: r.last_seen_at as string | undefined,
    batteryLevel: r.battery_level as number | undefined,
    createdAt: r.created_at as string,
  };
}

function handleSensorData(sensorId: string, payload: Zigbee2MqttSensorPayload): void {
  const sensor = parseSensorRow(stmts().getSensor.get(sensorId));
  if (!sensor) {
    logger.warn(`Received data for unknown sensor: ${sensorId}`);
    return;
  }

  if (payload.soil_moisture == null) return;

  const now = new Date().toISOString();
  const rawMoisture = payload.soil_moisture;

  let moisture = rawMoisture;
  if (sensor.calibration) {
    moisture = calibrateMoisture(rawMoisture, sensor.calibration.dryValue, sensor.calibration.wetValue);
  }

  stmts().insertReading.run(
    sensorId,
    now,
    moisture,
    rawMoisture,
    payload.temperature ?? null,
    payload.humidity ?? null,
    payload.illuminance_lux ?? null,
    payload.battery ?? null,
  );

  stmts().updateSensor.run(now, payload.battery ?? sensor.batteryLevel ?? null, sensorId);

  const reading: SensorReading = {
    id: 0,
    sensorId,
    timestamp: now,
    soilMoisture: moisture,
    soilMoistureRaw: rawMoisture,
    temperature: payload.temperature,
    humidity: payload.humidity,
    light: payload.illuminance_lux,
    battery: payload.battery,
  };

  mqttEvents.emit('sensor.reading', reading);
  logger.debug(`Sensor ${sensorId}: moisture=${moisture}%, temp=${payload.temperature}C`);
}

function handleBridgeDevices(devices: BridgeDevice[]): void {
  const now = new Date().toISOString();

  for (const device of devices) {
    if (device.type !== 'EndDevice') continue;

    const isTuya = device.definition?.vendor?.toLowerCase().includes('tuya');
    const sensorType = isTuya ? 'tuya_4in1' : 'other';

    stmts().upsertSensor.run(device.ieee_address, device.friendly_name, sensorType, now);
    logger.info(`Auto-discovered sensor: ${device.friendly_name} (${device.ieee_address})`);
  }
}

export function startMqtt(): void {
  const { brokerUrl, topicPrefix } = config.mqtt;

  const client = mqtt.connect(brokerUrl);

  client.on('connect', () => {
    logger.info(`MQTT connected to ${brokerUrl}`);
    client.subscribe(`${topicPrefix}/#`, (err) => {
      if (err) {
        logger.error('MQTT subscribe failed', err);
      } else {
        logger.info(`Subscribed to ${topicPrefix}/#`);
      }
    });
  });

  client.on('message', (topic: string, message: Buffer) => {
    try {
      const payload = JSON.parse(message.toString());
      const relative = topic.slice(topicPrefix.length + 1);

      if (relative === 'bridge/devices') {
        handleBridgeDevices(payload as BridgeDevice[]);
        return;
      }

      if (relative.startsWith('bridge/')) return;

      const sensorId = relative.split('/')[0];
      if (sensorId) {
        handleSensorData(sensorId, payload as Zigbee2MqttSensorPayload);
      }
    } catch {
      logger.debug(`Failed to parse MQTT message on ${topic}`);
    }
  });

  client.on('error', (err) => {
    logger.error('MQTT client error', err);
  });

  client.on('offline', () => {
    logger.warn('MQTT client offline');
  });

  client.on('reconnect', () => {
    logger.debug('MQTT client reconnecting...');
  });
}
