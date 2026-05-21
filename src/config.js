import 'dotenv/config';
import crypto from 'node:crypto';

export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 3000);
export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const SECRET = process.env.SECRET || 'dev-secret-change-me';
export const GUARD_SECRET = process.env.GUARD_SECRET || 'dev-guard-secret-change-me';
export const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC || 86400);
export const SLOT_INTERVAL_MIN = Number(process.env.SLOT_INTERVAL_MIN || 5);
export const SLOT_INTERVAL_MAX = Number(process.env.SLOT_INTERVAL_MAX || 15);
export const TURNSTILE_SITEKEY = process.env.TURNSTILE_SITEKEY || '1x00000000000000000000AA';
export const BASE_DOMAIN = process.env.BASE_DOMAIN || 'example.top';

export const TRAP_HEADER = 'x-api-key';
export const TRAP_LOGIN_RE = /^researcher0[a-zA-Z0-9]{4}$/;
export const TRAP_API_KEY = process.env.TRAP_API_KEY
  || crypto.createHmac('sha256', SECRET).update('trap:x-api-key').digest('hex').slice(0, 24);

export function isTrapLogin(login) {
  return typeof login === 'string' && TRAP_LOGIN_RE.test(login);
}

export const SLOT_MIN_MS = Number(process.env.SLOT_MIN_MS || 100);
export const SLOT_MAX_MS = Number(process.env.SLOT_MAX_MS || 500);

// Capture rate limits per login: { max requests, windowSec }
export const RATE_LIMITS = {
  lvl1: { max: 10, windowSec: 1 },
  lvl2: { max: 1, windowSec: 15 },
  lvl3: { max: 1, windowSec: 15 },
};
