import { config } from '../config.js';

const levels = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof levels;

const threshold = levels[config.logLevel] ?? levels.info;

function shouldLog(level: LogLevel): boolean {
  return levels[level] >= threshold;
}

function timestamp(): string {
  return new Date().toISOString();
}

export const logger = {
  debug(msg: string, ...args: unknown[]) {
    if (shouldLog('debug')) console.debug(`[${timestamp()}] DEBUG ${msg}`, ...args);
  },
  info(msg: string, ...args: unknown[]) {
    if (shouldLog('info')) console.info(`[${timestamp()}] INFO  ${msg}`, ...args);
  },
  warn(msg: string, ...args: unknown[]) {
    if (shouldLog('warn')) console.warn(`[${timestamp()}] WARN  ${msg}`, ...args);
  },
  error(msg: string, ...args: unknown[]) {
    if (shouldLog('error')) console.error(`[${timestamp()}] ERROR ${msg}`, ...args);
  },
};
