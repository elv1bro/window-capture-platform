import redis from './redis.js';
import { RATE_LIMITS } from './config.js';

export async function checkAndConsume(login, level) {
  const { max, windowSec } = RATE_LIMITS[level] ?? { max: 1, windowSec: 10 };
  const bucket = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:capture:${level}:${login}:${bucket}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec + 1);
  if (count > max) {
    const bucketEndMs = (bucket + 1) * windowSec * 1000;
    return { ok: false, retryAfterMs: Math.max(0, bucketEndMs - Date.now()) };
  }
  return { ok: true };
}
