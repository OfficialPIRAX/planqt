import type { FastifyReply } from 'fastify';
import type { SSEEvent } from '@flora-pi/shared';
import { mqttEvents } from './mqtt.js';
import { logger } from '../utils/logger.js';

const clients = new Set<FastifyReply>();

export function addClient(reply: FastifyReply): void {
  clients.add(reply);
  logger.debug(`SSE client connected (total: ${clients.size})`);

  reply.raw.on('close', () => {
    removeClient(reply);
  });
}

export function removeClient(reply: FastifyReply): void {
  clients.delete(reply);
  logger.debug(`SSE client disconnected (total: ${clients.size})`);
}

export function broadcast(event: SSEEvent): void {
  if (clients.size === 0) return;

  const payload = `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;

  for (const client of clients) {
    try {
      client.raw.write(payload);
    } catch {
      clients.delete(client);
    }
  }
}

function wireUpMqttEvents(): void {
  mqttEvents.on('sensor.reading', (reading) => {
    broadcast({ type: 'sensor.reading', data: reading });
  });
}

wireUpMqttEvents();

export const sseManager = {
  addClient,
  removeClient,
  broadcast,
  get clientCount() {
    return clients.size;
  },
};
