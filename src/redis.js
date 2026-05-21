import Redis from 'ioredis';
import { REDIS_URL } from './config.js';

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: true,
});

redis.on('error', (err) => {
  console.error('[redis] error:', err.message);
});

export default redis;
