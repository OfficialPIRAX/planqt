import type { WeatherForecast } from '@flora-pi/shared';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

interface OpenMeteoResponse {
  daily: {
    et0_fao_evapotranspiration: number[];
    precipitation_sum: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
  };
  hourly: {
    precipitation_probability: number[];
    temperature_2m: number[];
  };
}

interface CachedForecast {
  data: WeatherForecast;
  fetchedAt: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000;
let cache: CachedForecast | null = null;

function buildUrl(): string {
  const { latitude, longitude, timezone } = config.weather;
  return (
    `https://api.open-meteo.com/v1/forecast` +
    `?latitude=${latitude}` +
    `&longitude=${longitude}` +
    `&daily=et0_fao_evapotranspiration,precipitation_sum,temperature_2m_max,temperature_2m_min` +
    `&hourly=precipitation_probability,temperature_2m` +
    `&timezone=${encodeURIComponent(timezone)}` +
    `&forecast_days=2`
  );
}

function parseResponse(json: OpenMeteoResponse): WeatherForecast {
  const daily = json.daily;
  const hourly = json.hourly;

  return {
    et0Next24h: daily.et0_fao_evapotranspiration[0] ?? 0,
    rainNext24h: daily.precipitation_sum[0] ?? 0,
    tempMax: daily.temperature_2m_max[0] ?? 0,
    tempMin: daily.temperature_2m_min[0] ?? 0,
    precipitationProbability: hourly.precipitation_probability.slice(0, 24),
  };
}

export async function fetchWeatherForecast(): Promise<WeatherForecast> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    logger.debug('Using cached weather forecast');
    return cache.data;
  }

  try {
    const url = buildUrl();
    logger.debug(`Fetching weather from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded with ${response.status}: ${response.statusText}`);
    }

    const json = (await response.json()) as OpenMeteoResponse;
    const forecast = parseResponse(json);

    cache = { data: forecast, fetchedAt: now };
    logger.info(
      `Weather updated: ET0=${forecast.et0Next24h}mm, rain=${forecast.rainNext24h}mm, ` +
        `temp=${forecast.tempMin}-${forecast.tempMax}C`,
    );

    return forecast;
  } catch (err) {
    logger.error('Failed to fetch weather forecast', err);

    if (cache) {
      logger.warn('Returning stale weather cache');
      return cache.data;
    }

    return {
      et0Next24h: 0,
      rainNext24h: 0,
      tempMax: 0,
      tempMin: 0,
      precipitationProbability: [],
    };
  }
}

export async function getCurrentWeather(): Promise<{ tempCurrent: number; description: string }> {
  try {
    const { latitude, longitude, timezone } = config.weather;
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${latitude}` +
      `&longitude=${longitude}` +
      `&current=temperature_2m,weather_code` +
      `&timezone=${encodeURIComponent(timezone)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open-Meteo responded with ${response.status}`);
    }

    const json = (await response.json()) as {
      current: { temperature_2m: number; weather_code: number };
    };

    return {
      tempCurrent: json.current.temperature_2m,
      description: weatherCodeToDescription(json.current.weather_code),
    };
  } catch (err) {
    logger.error('Failed to fetch current weather', err);
    return { tempCurrent: 0, description: 'Nicht verfuegbar' };
  }
}

function weatherCodeToDescription(code: number): string {
  if (code === 0) return 'Klar';
  if (code <= 3) return 'Teilweise bewoelkt';
  if (code <= 48) return 'Nebel';
  if (code <= 57) return 'Nieselregen';
  if (code <= 67) return 'Regen';
  if (code <= 77) return 'Schnee';
  if (code <= 82) return 'Regenschauer';
  if (code <= 86) return 'Schneeschauer';
  if (code <= 99) return 'Gewitter';
  return 'Unbekannt';
}
