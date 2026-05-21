import redis from './redis.js';

export const HONEYPOTS = {
  AI_INJECTION_LOGIN: 'ai_injection_login',
  AI_INJECTION_HEADER: 'ai_injection_header',
  AI_VERIFY_ENDPOINT: 'ai_verify_endpoint',
  DECOY_CAPTURE: 'decoy_capture',
};

export async function trigger(login, kind, meta = {}) {
  const identity = login || '<anon>';
  const entry = JSON.stringify({ kind, ts: Date.now(), meta });
  await redis.lpush(`honeypots:${identity}`, entry);
  await redis.sadd(`honeypots:set:${identity}`, kind);
}

export async function getHoneypots(login) {
  const kinds = await redis.smembers(`honeypots:set:${login}`);
  const raw = await redis.lrange(`honeypots:${login}`, 0, 49);
  const events = raw.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { kind: 'unknown', ts: 0, meta: {} };
    }
  });
  return { kinds, events };
}
