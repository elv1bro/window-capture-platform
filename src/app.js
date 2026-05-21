import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import staticPlugin from '@fastify/static';
import view from '@fastify/view';
import { Eta } from 'eta';
import {
  BASE_DOMAIN,
  GUARD_SECRET,
  SECRET,
  SESSION_TTL_SEC,
  SLOT_INTERVAL_MIN,
  SLOT_INTERVAL_MAX,
  TURNSTILE_SITEKEY,
} from './config.js';
import { levelMiddleware } from './middleware/level.js';
import { sessionMiddleware } from './middleware/session.js';
import { honeypotDetectMiddleware } from './middleware/honeypotDetect.js';
import pagesRoutes from './routes/pages.js';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import apiLvl3Routes from './routes/apiLvl3.js';
import honeypotRoutes from './routes/honeypot.js';
import guardAssetRoutes from './routes/guardAsset.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp(options = {}) {
  const eta = new Eta({ views: path.join(__dirname, 'views') });

  const fastify = Fastify({
    logger: options.logger ?? false,
    trustProxy: true,
  });

  fastify.decorate('config', {
    BASE_DOMAIN,
    GUARD_SECRET,
    SECRET,
    SESSION_TTL_SEC,
    SLOT_INTERVAL_MIN,
    SLOT_INTERVAL_MAX,
    TURNSTILE_SITEKEY,
  });

  await fastify.register(cookie);
  await fastify.register(formbody);

  await fastify.register(staticPlugin, {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
  });

  await fastify.register(view, {
    engine: { eta },
    root: path.join(__dirname, 'views'),
  });

  fastify.addHook('onRequest', levelMiddleware);
  fastify.addHook('onRequest', sessionMiddleware);
  fastify.addHook('onRequest', honeypotDetectMiddleware);

  await fastify.register(pagesRoutes);
  await fastify.register(authRoutes);
  await fastify.register(apiRoutes);
  await fastify.register(apiLvl3Routes);
  await fastify.register(honeypotRoutes);
  await fastify.register(guardAssetRoutes);

  fastify.get('/health', async () => ({ ok: true }));

  return fastify;
}
