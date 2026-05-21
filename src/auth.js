import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import redis from './redis.js';
import { SESSION_TTL_SEC } from './config.js';

const LOGIN_RE = /^[a-zA-Z0-9_-]{3,32}$/;

export function expectedPassword(login) {
  return crypto.createHash('md5').update(login).digest('hex');
}

export function verifyPassword(login, password) {
  if (!LOGIN_RE.test(login)) return false;
  return typeof password === 'string' && password.toLowerCase() === expectedPassword(login);
}

export async function createSession(login) {
  const sid = randomUUID();
  const payload = JSON.stringify({ login, createdAt: Date.now() });
  await redis.set(`sess:${sid}`, payload, 'EX', SESSION_TTL_SEC);
  return sid;
}

export async function getSession(sid) {
  if (!sid) return null;
  const raw = await redis.get(`sess:${sid}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function destroySession(sid) {
  if (!sid) return;
  await redis.del(`sess:${sid}`);
}
