import type { FastifyPluginAsync } from 'fastify';
import { saveImage } from '../services/upload.js';
import { config } from '../config.js';

const MAX_BYTES = config.maxUploadMb * 1024 * 1024;

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const uploadPlugin: FastifyPluginAsync = async (app) => {
  // POST /api/upload/image
  app.post('/api/upload/image', async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return reply.status(400).send({
        error: `Unsupported file type: ${file.mimetype}. Allowed: JPEG, PNG, WebP`,
      });
    }

    const buffer = await file.toBuffer();

    if (buffer.length > MAX_BYTES) {
      return reply.status(413).send({ error: `File too large. Max ${config.maxUploadMb}MB` });
    }

    const url = await saveImage(buffer, file.mimetype);
    return reply.send({ url });
  });
};

export default uploadPlugin;
