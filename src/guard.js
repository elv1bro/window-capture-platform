import crypto from 'node:crypto';
import { GUARD_SECRET } from './config.js';

const MAX_SKEW_SEC = 30;

export function signClaim(queueToken, timestampSec) {
  const payload = `${queueToken}:${timestampSec}`;
  return crypto.createHmac('sha256', GUARD_SECRET).update(payload).digest('hex');
}

export function verifyClaimSignature(queueToken, timestampSec, signature) {
  if (!queueToken || !timestampSec || !signature) return false;
  const ts = Number(timestampSec);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_SKEW_SEC) return false;
  const expected = signClaim(queueToken, ts);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}
