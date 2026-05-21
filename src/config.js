import 'dotenv/config';

export const HOST = process.env.HOST || '127.0.0.1';
export const PORT = Number(process.env.PORT || 3000);
export const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
export const SECRET = process.env.SECRET || 'dev-secret-change-me';
export const GUARD_SECRET = process.env.GUARD_SECRET || 'dev-guard-secret-change-me';
export const SESSION_TTL_SEC = Number(process.env.SESSION_TTL_SEC || 86400);
export const SLOT_INTERVAL = Number(process.env.SLOT_INTERVAL || 10);
export const TURNSTILE_SITEKEY = process.env.TURNSTILE_SITEKEY || '1x00000000000000000000AA';
export const BASE_DOMAIN = process.env.BASE_DOMAIN || 'example.top';
export const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || `.${BASE_DOMAIN}`;

export const TRAP_LOGIN = 'verified_researcher';
export const TRAP_HEADER = 'x-researcher-mode';

export const SLOT_MIN_MS = 1000;
export const SLOT_MAX_MS = 3000;

// Capture rate limits per login: { max requests, windowSec }
export const RATE_LIMITS = {
  lvl1: { max: 10, windowSec: 1 },
  lvl2: { max: 1, windowSec: 10 },
  lvl3: { max: 1, windowSec: 10 },
};
