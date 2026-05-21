import crypto from 'node:crypto';
import { SECRET, SLOT_INTERVAL, SLOT_MIN_MS, SLOT_MAX_MS } from './config.js';

export function slotState(level, now = Date.now() / 1000) {
  const bucket = Math.floor(now / SLOT_INTERVAL);
  const start = bucket * SLOT_INTERVAL;
  const seed = crypto.createHmac('sha256', SECRET).update(`${level}-${bucket}`).digest('hex');
  const flagHash = seed.slice(0, 16);
  const durationMs = SLOT_MIN_MS + (parseInt(seed.slice(16, 24), 16) % (SLOT_MAX_MS - SLOT_MIN_MS + 1));
  const nowMs = now * 1000;
  const startMs = start * 1000;
  const isOpen = nowMs >= startMs && nowMs < startMs + durationMs;

  return {
    isOpen,
    bucket,
    durationMs,
    flag: isOpen ? `CUPFLAG{${flagHash}_${durationMs}}` : null,
  };
}
