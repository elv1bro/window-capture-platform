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
  const windowEndMs = startMs + slot.durationMs;
  const isOpen = nowMs >= startMs && nowMs < windowEndMs;
  const windowRemainingMs = isOpen ? windowEndMs - nowMs : 0;

  return {
    isOpen,
    bucket: `${dayStart}:${index}`,
    intervalSec: slot.intervalSec,
    durationMs: slot.durationMs,
    windowRemainingMs,
    flag: isOpen ? `CUPFLAG{${slot.flagHash}_${slot.durationMs}}` : null,
  };
}

/** Milliseconds until the next capture window opens (0 if already open). */
export function nextOpenInMs(level, now = Date.now() / 1000) {
  if (slotState(level, now).isOpen) return 0;

  const dayStart = Math.floor(now / DAY_SEC) * DAY_SEC;
  const offsetSec = now - dayStart;
  const slots = daySchedule(level, dayStart);
  const { slot, index } = findActiveSlot(slots, offsetSec);

  const slotStartSec = dayStart + slot.startOffsetSec;
  const windowEndSec = slotStartSec + slot.durationMs / 1000;

  if (now < slotStartSec) {
    return Math.ceil((slotStartSec - now) * 1000);
  }

  const nextSlot = slots[index + 1];
  if (nextSlot) {
    const nextStartSec = dayStart + nextSlot.startOffsetSec;
    return Math.ceil((nextStartSec - now) * 1000);
  }

  const nextDayStart = dayStart + DAY_SEC;
  const nextDaySlots = daySchedule(level, nextDayStart);
  if (nextDaySlots.length > 0) {
    return Math.ceil((nextDayStart + nextDaySlots[0].startOffsetSec - now) * 1000);
  }

  return SLOT_INTERVAL_MAX * 1000;
}

/** Deterministic pre-claim delay for lvl3 (ms). */
export function claimDelayMs(level, bucket) {
  const seed = crypto.createHmac('sha256', SECRET).update(`claim:${level}:${bucket}`).digest('hex');
  const span = Math.max(1, SLOT_MAX_MS - 50);
  return 30 + (parseInt(seed.slice(0, 8), 16) % Math.min(span, 120));
}

/** Shorter slot spacing → shorter capture window. */
export function captureWindowMs(intervalSec) {
  const ratio = (intervalSec - SLOT_INTERVAL_MIN) / (SLOT_INTERVAL_MAX - SLOT_INTERVAL_MIN);
  return SLOT_MIN_MS + Math.round(ratio * (SLOT_MAX_MS - SLOT_MIN_MS));
}
