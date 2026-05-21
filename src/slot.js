import crypto from 'node:crypto';
import {
  SECRET,
  SLOT_INTERVAL_MIN,
  SLOT_INTERVAL_MAX,
  SLOT_MIN_MS,
  SLOT_MAX_MS,
} from './config.js';

const DAY_SEC = 86400;
const scheduleCache = new Map();

export function slotMeta(level, dayStart, slotInDay) {
  const seed = crypto.createHmac('sha256', SECRET).update(`${level}:${dayStart}:${slotInDay}`).digest('hex');
  const span = SLOT_INTERVAL_MAX - SLOT_INTERVAL_MIN + 1;
  const intervalSec = SLOT_INTERVAL_MIN + (parseInt(seed.slice(0, 8), 16) % span);
  const ratio = (intervalSec - SLOT_INTERVAL_MIN) / (SLOT_INTERVAL_MAX - SLOT_INTERVAL_MIN);
  const durationMs = SLOT_MIN_MS + Math.round(ratio * (SLOT_MAX_MS - SLOT_MIN_MS));
  const flagHash = seed.slice(0, 16);
  return { intervalSec, durationMs, flagHash };
}

function daySchedule(level, dayStart) {
  const key = `${level}:${dayStart}`;
  const cached = scheduleCache.get(key);
  if (cached) return cached;

  if (scheduleCache.size > 12) scheduleCache.clear();

  const slots = [];
  let offsetSec = 0;
  let slotInDay = 0;

  while (offsetSec < DAY_SEC) {
    const meta = slotMeta(level, dayStart, slotInDay);
    slots.push({ startOffsetSec: offsetSec, ...meta });
    offsetSec += meta.intervalSec;
    slotInDay += 1;
  }

  scheduleCache.set(key, slots);
  return slots;
}

function findActiveSlot(slots, offsetSec) {
  let idx = 0;
  for (let i = 0; i < slots.length; i += 1) {
    if (slots[i].startOffsetSec <= offsetSec) idx = i;
    else break;
  }
  return { slot: slots[idx], index: idx };
}

export function slotState(level, now = Date.now() / 1000) {
  const dayStart = Math.floor(now / DAY_SEC) * DAY_SEC;
  const offsetSec = now - dayStart;
  const slots = daySchedule(level, dayStart);
  const { slot, index } = findActiveSlot(slots, offsetSec);

  const startSec = dayStart + slot.startOffsetSec;
  const nowMs = now * 1000;
  const startMs = startSec * 1000;
  const isOpen = nowMs >= startMs && nowMs < startMs + slot.durationMs;

  return {
    isOpen,
    bucket: `${dayStart}:${index}`,
    intervalSec: slot.intervalSec,
    durationMs: slot.durationMs,
    flag: isOpen ? `CUPFLAG{${slot.flagHash}_${slot.durationMs}}` : null,
  };
}

/** Shorter slot spacing → shorter capture window. */
export function captureWindowMs(intervalSec) {
  const ratio = (intervalSec - SLOT_INTERVAL_MIN) / (SLOT_INTERVAL_MAX - SLOT_INTERVAL_MIN);
  return SLOT_MIN_MS + Math.round(ratio * (SLOT_MAX_MS - SLOT_MIN_MS));
}
