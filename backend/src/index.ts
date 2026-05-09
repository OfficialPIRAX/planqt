import 'dotenv/config';
import { resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { db, runMigrations } from './db/connection.js';

async function main(): Promise<void> {
  // Run migrations BEFORE importing anything that touches the DB
  runMigrations();

  // Now safe to import modules that prepare statements at load time
  const { seedPlantTemplates } = await import('./services/seed.js');
  const { startMqtt } = await import('./services/mqtt.js');
  const { startScheduler } = await import('./services/scheduler.js');

  const { default: plantsRoutes } = await import('./routes/plants.js');
  const { default: templatesRoutes } = await import('./routes/templates.js');
  const { default: sensorsRoutes } = await import('./routes/sensors.js');
  const { default: recommendationsRoutes } = await import('./routes/recommendations.js');
  const { default: pushRoutes } = await import('./routes/push.js');
  const { default: weatherRoutes } = await import('./routes/weather.js');
  const { default: dashboardRoutes } = await import('./routes/dashboard.js');
  const { default: uploadRoutes } = await import('./routes/upload.js');
  const { default: eventsRoutes } = await import('./routes/events.js');

  seedPlantTemplates();

  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
  });

  await app.register(cors, {
    origin: config.nodeEnv === 'production' ? false : true,
  });

  await app.register(multipart, {
    limits: {
      fileSize: config.maxUploadMb * 1024 * 1024,
    },
  });

  await app.register(fastifyStatic, {
    root: resolve(config.uploadDir),
    prefix: '/uploads/',
  });

  if (config.nodeEnv === 'production') {
    await app.register(fastifyStatic, {
      root: resolve('../frontend/dist'),
      prefix: '/',
      decorateReply: false,
      wildcard: false,
    });

    app.setNotFoundHandler(async (req, reply) => {
      if (req.url.startsWith('/api/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html', resolve('../frontend/dist'));
    });
  }

  await app.register(plantsRoutes);
  await app.register(templatesRoutes);
  await app.register(sensorsRoutes);
  await app.register(recommendationsRoutes);
  await app.register(pushRoutes);
  await app.register(weatherRoutes);
  await app.register(dashboardRoutes);
  await app.register(uploadRoutes);
  await app.register(eventsRoutes);

  startMqtt();
  startScheduler();

  await app.listen({ port: config.port, host: '0.0.0.0' });
  logger.info(`PlanQT backend running on port ${config.port} (${config.nodeEnv})`);

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    await app.close();
    db.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
