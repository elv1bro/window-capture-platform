import redis from './redis.js';
import { HOST, PORT } from './config.js';
import { buildApp } from './app.js';

try {
  await redis.connect();
} catch (err) {
  console.warn('[redis] not available at startup — will retry on first request:', err.message);
}

const fastify = await buildApp({ logger: true });

try {
  await fastify.listen({ host: HOST, port: PORT });
  fastify.log.info(`Listening on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
