import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

const MAX_WIDTH = 1200;

const SUPPORTED_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

async function ensureUploadDir(): Promise<void> {
  if (!existsSync(config.uploadDir)) {
    await mkdir(config.uploadDir, { recursive: true });
    logger.info(`Created upload directory: ${config.uploadDir}`);
  }
}

export async function saveImage(buffer: Buffer, mimeType: string): Promise<string> {
  await ensureUploadDir();

  if (!SUPPORTED_TYPES.has(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}`);
  }

  const filename = `${uuidv4()}.jpg`;
  const filePath = join(config.uploadDir, filename);

  const processed = await sharp(buffer)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer();

  await writeFile(filePath, processed);

  const urlPath = `/uploads/${filename}`;
  logger.info(`Image saved: ${urlPath} (${(processed.length / 1024).toFixed(1)}KB)`);

  return urlPath;
}
