import { randomInt, randomUUID } from 'node:crypto';
import redis from '../redis.js';
import { validate } from '../captcha.js';
import { verifyClaimSignature } from '../guard.js';
import { requireSession } from '../middleware/session.js';
import { checkAndConsume } from '../rateLimit.js';
import { claimDelayMs, nextOpenAtSec, slotState } from '../slot.js';

export const QUEUE_TTL_SEC = 30;
const TICK_MS = 200;
const OPEN_POLL_MS = 25;
const MIN_CLAIM_WINDOW_MS = 80;
export const PACE_MS_MIN = 1000;
export const PACE_MS_MAX = 5000;

/** Random client pacing delay; new WebSocket/SSE session resets the timer. */
export function clientPaceMs() {
  return randomInt(PACE_MS_MIN, PACE_MS_MAX + 1);
}

function queueKey(token) {
  return `queue:${token}`;
}

export async function loadQueueEntry(queueToken, login) {
  const raw = queueToken ? await redis.get(queueKey(queueToken)) : null;
  if (!raw) {
    return { error: { status: 'bad_request', reason: 'invalid or expired queue_token' } };
  }

  let entry;
  try {
    entry = JSON.parse(raw);
  } catch {
    return { error: { status: 'bad_request', reason: 'invalid queue entry' } };
  }

  if (entry.login !== login) {
    return { error: { status: 'forbidden', reason: 'queue_token belongs to another user' } };
  }

  return { entry };
}

export async function saveQueueEntry(queueToken, entry) {
  await redis.set(queueKey(queueToken), JSON.stringify(entry), 'EX', QUEUE_TTL_SEC);
}

export async function processQueueClaim(login, queueToken, claim) {
  const loaded = await loadQueueEntry(queueToken, login);
  if (loaded.error) return loaded.error;
  const { entry } = loaded;

  if (!entry.bookKey) {
    return { status: 'bad_request', reason: 'window not open' };
  }

  if (!claim.book_key || claim.book_key !== entry.bookKey) {
    return { status: 'bad_request', reason: 'invalid book_key' };
  }

  const elapsed = Date.now() - entry.openAt;
  if (elapsed < entry.claimAfterMs) {
    return {
      status: 'bad_request',
      reason: 'claim too early',
      retry_after_ms: entry.claimAfterMs - elapsed,
    };
  }

  if (Date.now() > entry.windowEndsAt) {
    return { status: 'closed' };
  }

  const rl = await checkAndConsume(login, 'lvl3');
  if (!rl.ok) {
    return { status: 'rate_limited', retry_after_ms: rl.retryAfterMs };
  }

  const captchaToken = claim.captcha_token;
  const timestamp = claim.timestamp;
  const signature = claim.signature;

  if (!validate('lvl3', captchaToken)) {
    return { status: 'captcha_required' };
  }

  if (!verifyClaimSignature(queueToken, timestamp, signature)) {
    return { status: 'bad_request', reason: 'invalid signature' };
  }

  const slot = slotState('lvl3');
  if (!slot.isOpen) {
    return { status: 'closed' };
  }

  await redis.del(queueKey(queueToken));
  return { status: 'ok', flag: slot.flag };
}

function wsSend(socket, payload) {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(payload));
  }
}

function sseSend(reply, event, data) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

function waitTickDelayMs(untilOpenMs) {
  if (untilOpenMs <= OPEN_POLL_MS) return Math.max(1, untilOpenMs);
  if (untilOpenMs <= 500) return OPEN_POLL_MS;
  return Math.min(TICK_MS, untilOpenMs);
}

export function runQueueSession({ login, queueToken, entry, send, onEnd, onClientViolation }) {
  let awaitingClaim = false;
  let claimHandled = false;
  let clientAllowedAtMs = 0;
  let lastClientTickAtMs = 0;
  let windowEndsAtMs = 0;
  let tickTimer;
  let claimTimer;
  let connectionTimer;

  const cleanup = () => {
    clearTimeout(tickTimer);
    clearTimeout(claimTimer);
    clearTimeout(connectionTimer);
  };

  const emit = (event, payload) => {
    const nextMs = payload.next_ms ?? 0;
    clientAllowedAtMs = Date.now() + nextMs;
    send(event, payload);
  };

  const rejectClient = (reason, nextMs = clientPaceMs()) => {
    emit('error', { reason, next_ms: nextMs });
    claimHandled = true;
    cleanup();
    if (onClientViolation) onClientViolation(reason);
    else onEnd();
  };

  const expireClaimWindow = () => {
    if (claimHandled) return;
    claimHandled = true;
    emit('closed', { reason: 'claim window expired', next_ms: 0 });
    onEnd();
    cleanup();
  };

  const scheduleClaimExpiry = (delayMs) => {
    clearTimeout(claimTimer);
    claimTimer = setTimeout(expireClaimWindow, Math.max(1, delayMs));
  };

  const emitWaitTick = (nowSec) => {
    const openAtSec = nextOpenAtSec('lvl3', nowSec);
    emit('tick', {
      server_time: nowSec,
      slot_open: false,
      next_ms: clientPaceMs(),
      opens_at: openAtSec,
    });
  };

  const beginOpenWindow = async () => {
    if (awaitingClaim || claimHandled) return;

    const slot = slotState('lvl3');
    if (!slot.isOpen) {
      tickTimer = setTimeout(pollForOpen, OPEN_POLL_MS);
      return;
    }

    awaitingClaim = true;

    const openAtMs = Date.now();
    const remainingMs = Math.max(1, slot.windowRemainingMs);
    const bookKey = randomUUID();
    let claimAfterMs = claimDelayMs('lvl3', slot.bucket);
    claimAfterMs = Math.min(claimAfterMs, Math.max(0, remainingMs - MIN_CLAIM_WINDOW_MS));
    const claimAtMs = openAtMs + claimAfterMs;
    windowEndsAtMs = openAtMs + remainingMs;

    await saveQueueEntry(queueToken, {
      ...entry,
      bookKey,
      openAt: openAtMs,
      claimAfterMs,
      windowEndsAt: windowEndsAtMs,
    });

    emit('open', {
      server_time: openAtMs / 1000,
      window_ms: remainingMs,
      book_key: bookKey,
      next_ms: claimAfterMs,
      claim_at: claimAtMs / 1000,
    });

    scheduleClaimExpiry(remainingMs);
  };

  const pollForOpen = () => {
    if (awaitingClaim || claimHandled) return;

    const nowMs = Date.now();
    const nowSec = nowMs / 1000;
    const slot = slotState('lvl3');

    if (slot.isOpen) {
      void beginOpenWindow();
      return;
    }

    if (nowMs - lastClientTickAtMs >= TICK_MS) {
      lastClientTickAtMs = nowMs;
      emitWaitTick(nowSec);
    }

    const openAtSec = nextOpenAtSec('lvl3', nowSec);
    const untilOpen = openAtSec == null
      ? TICK_MS
      : Math.max(0, Math.ceil((openAtSec - nowSec) * 1000));

    tickTimer = setTimeout(pollForOpen, waitTickDelayMs(untilOpen));
  };

  emit('joined', {
    queue_token: queueToken,
    next_ms: clientPaceMs(),
    opens_at: nextOpenAtSec('lvl3'),
  });

  connectionTimer = setTimeout(() => {
    if (!claimHandled) {
      emit('error', { reason: 'queue wait timeout', next_ms: 0 });
      onEnd();
    }
    cleanup();
  }, 120_000);

  lastClientTickAtMs = Date.now();
  pollForOpen();

  const handleClaim = async (claim) => {
    if (claimHandled) return;

    const waitMs = clientAllowedAtMs - Date.now();
    if (waitMs > 0) {
      rejectClient('client message too soon', waitMs);
      return;
    }

    if (!awaitingClaim) {
      rejectClient('wait for open event before claim');
      return;
    }

    const result = await processQueueClaim(login, queueToken, claim);

    if (result.reason === 'claim too early') {
      const retryMs = result.retry_after_ms ?? 0;
      scheduleClaimExpiry(windowEndsAtMs - Date.now());
      emit('wait', {
        reason: result.reason,
        next_ms: retryMs,
        claim_at: (Date.now() + retryMs) / 1000,
      });
      return;
    }

    clearTimeout(claimTimer);
    claimHandled = true;
    emit('result', { ...result, next_ms: 0 });
    onEnd();
    cleanup();
  };

  return { cleanup, handleClaim };
}

export default async function apiLvl3Routes(fastify) {
  fastify.addHook('preHandler', async (req, reply) => {
    if (req.routeOptions?.websocket) return;
    if (req.level !== 'lvl3') {
      return reply.code(404).send({ status: 'not_found' });
    }
  });

  fastify.post('/v1/queue/join', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const queueToken = randomUUID();
    await saveQueueEntry(queueToken, {
      login: req.session.login,
      createdAt: Date.now(),
    });

    return { status: 'ok', queue_token: queueToken, ttl_sec: QUEUE_TTL_SEC };
  });

  fastify.get('/v1/queue/wait', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const login = req.session.login;
    const queueToken = String(req.query?.queue_token || '');
    const loaded = await loadQueueEntry(queueToken, login);
    if (loaded.error) {
      return reply.code(400).send(loaded.error);
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const session = runQueueSession({
      login,
      queueToken,
      entry: loaded.entry,
      send: (event, data) => sseSend(reply, event, { type: event, ...data }),
      onEnd: () => reply.raw.end(),
    });

    req.raw.on('close', () => {
      session.cleanup();
    });
  });

  fastify.post('/v1/queue/claim', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const login = req.session.login;
    const queueToken = String(req.body?.queue_token || '');

    const result = await processQueueClaim(login, queueToken, {
      book_key: req.body?.book_key,
      captcha_token: req.body?.captcha_token ?? req.headers['x-captcha-token'],
      timestamp: req.body?.timestamp ?? req.headers['x-timestamp'],
      signature: req.body?.signature ?? req.headers['x-signature'],
    });

    if (result.reason === 'claim too early') {
      return reply.code(400).send(result);
    }

    if (result.status === 'rate_limited') {
      return reply.code(429).send(result);
    }

    return result;
  });

  fastify.get('/v1/queue/ws', { websocket: true }, (socket, req) => {
    if (!req.session?.login) {
      wsSend(socket, { type: 'error', reason: 'login required', next_ms: 0 });
      socket.close();
      return;
    }

    const login = req.session.login;
    const queueToken = String(req.query?.queue_token || '');

    void (async () => {
      const loaded = await loadQueueEntry(queueToken, login);
      if (loaded.error) {
        wsSend(socket, { type: 'error', ...loaded.error, next_ms: 0 });
        socket.close();
        return;
      }

      const session = runQueueSession({
        login,
        queueToken,
        entry: loaded.entry,
        send: (_event, data) => wsSend(socket, { type: _event, ...data }),
        onEnd: () => socket.close(),
        onClientViolation: () => socket.close(),
      });

      socket.on('message', (raw) => {
        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          wsSend(socket, { type: 'error', reason: 'invalid JSON', next_ms: clientPaceMs() });
          socket.close();
          return;
        }

        if (msg.type !== 'claim') {
          wsSend(socket, { type: 'error', reason: 'expected { type: "claim", ... }', next_ms: clientPaceMs() });
          socket.close();
          return;
        }

        void session.handleClaim({
          book_key: msg.book_key,
          captcha_token: msg.captcha_token,
          timestamp: msg.timestamp,
          signature: msg.signature,
        });
      });

      socket.on('close', session.cleanup);
      socket.on('error', session.cleanup);
    })();
  });
}
