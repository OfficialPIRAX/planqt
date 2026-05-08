import type { FastifyPluginAsync } from 'fastify';
import { fetchWeatherForecast, getCurrentWeather } from '../services/weather.js';

const weatherPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/weather/current
  app.get('/api/weather/current', async (_req, reply) => {
    const current = await getCurrentWeather();
    return reply.send(current);
  });

  // GET /api/weather/forecast
  app.get('/api/weather/forecast', async (_req, reply) => {
    const forecast = await fetchWeatherForecast();
    return reply.send(forecast);
  });
};

export default weatherPlugin;
