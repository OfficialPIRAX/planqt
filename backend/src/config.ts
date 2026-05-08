import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databasePath: process.env.DATABASE_PATH ?? './data/flora.db',
  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL ?? 'mqtt://localhost:1883',
    topicPrefix: process.env.MQTT_TOPIC_PREFIX ?? 'zigbee2mqtt',
  },
  weather: {
    latitude: parseFloat(process.env.WEATHER_LATITUDE ?? '52.18'),
    longitude: parseFloat(process.env.WEATHER_LONGITUDE ?? '7.07'),
    timezone: process.env.WEATHER_TIMEZONE ?? 'Europe/Berlin',
  },
  vapid: {
    publicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    privateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    contact: process.env.VAPID_CONTACT ?? '',
  },
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '5', 10),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as 'debug' | 'info' | 'warn' | 'error',
} as const;
