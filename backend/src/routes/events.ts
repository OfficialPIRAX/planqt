import type { FastifyPluginAsync } from 'fastify';
import { addClient } from '../services/sse.js';

const eventsPlugin: FastifyPluginAsync = async (app) => {
  // GET /api/events  (Server-Sent Events)
  app.get('/api/events', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Send initial keepalive so the client knows the connection is established
    reply.raw.write(':ok\n\n');

    addClient(reply);

    // Keep the connection open -- Fastify will not end the response because
    // we never call reply.send(). The SSE manager writes directly to reply.raw.
    // Cleanup happens automatically via the 'close' listener in addClient.

    // Prevent Fastify from sending its own response
    req.raw.on('close', () => {
      // Client disconnected; cleanup is handled in sseManager.addClient
    });
  });
};

export default eventsPlugin;
