import { randomUUID } from 'node:crypto';
import redis from '../redis.js';
import { validate } from '../captcha.js';
import { verifyClaimSignature } from '../guard.js';
import { requireSession } from '../middleware/session.js';
import { checkAndConsume } from '../rateLimit.js';
import { claimDelayMs, nextOpenInMs, slotState } from '../slot.js';

const QUEUE_TTL_SEC = 30;
const TICK_MS = 200;

function queueKey(token) {
  return `queue:${token}`;
}

async function loadQueueEntry(queueToken, login) {
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

async function saveQueueEntry(queueToken, entry) {
  await redis.set(queueKey(queueToken), JSON.stringify(entry), 'EX', QUEUE_TTL_SEC);
}

async function processQueueClaim(login, queueToken, claim) {
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

export default async function apiLvl3Routes(fastify) {
  fastify.addHook('preHandler', async (req, reply) => {
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

  fastify.get('/v1/queue/wait', { websocket: true }, (socket, req) => {
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

      wsSend(socket, {
        type: 'joined',
        queue_token: queueToken,
        next_ms: nextOpenInMs('lvl3') || TICK_MS,
      });

      let awaitingClaim = false;
      let claimHandled = false;
      let tickInterval;
      let claimTimer;
      let connectionTimer;

      const cleanup = () => {
        clearInterval(tickInterval);
        clearTimeout(claimTimer);
        clearTimeout(connectionTimer);
      };

      connectionTimer = setTimeout(() => {
        if (!claimHandled) {
          wsSend(socket, { type: 'error', reason: 'queue wait timeout', next_ms: 0 });
          socket.close();
        }
        cleanup();
      }, 120_000);

      tickInterval = setInterval(() => {
        if (awaitingClaim || claimHandled) return;

        const slot = slotState('lvl3');
        const untilOpen = nextOpenInMs('lvl3');

        wsSend(socket, {
          type: 'tick',
          server_time: Date.now() / 1000,
          slot_open: slot.isOpen,
          next_ms: slot.isOpen ? 0 : (untilOpen || TICK_MS),
        });

        if (!slot.isOpen) return;

        void (async () => {
          awaitingClaim = true;
          clearInterval(tickInterval);

          const remainingMs = Math.max(1, slot.windowRemainingMs);
          const bookKey = randomUUID();
          let claimAfterMs = claimDelayMs('lvl3', slot.bucket);
          claimAfterMs = Math.min(claimAfterMs, Math.max(1, remainingMs - 20));

          await saveQueueEntry(queueToken, {
            ...loaded.entry,
            bookKey,
            openAt: Date.now(),
            claimAfterMs,
            windowEndsAt: Date.now() + remainingMs,
          });

          wsSend(socket, {
            type: 'open',
            server_time: Date.now() / 1000,
            window_ms: remainingMs,
            book_key: bookKey,
            next_ms: claimAfterMs,
          });

          claimTimer = setTimeout(() => {
            if (claimHandled) return;
            claimHandled = true;
            wsSend(socket, {
              type: 'closed',
              reason: 'claim window expired',
              next_ms: 0,
            });
            socket.close();
            cleanup();
          }, remainingMs);
        })();
      }, TICK_MS);

      socket.on('message', (raw) => {
        if (claimHandled) return;

        if (!awaitingClaim) {
          wsSend(socket, {
            type: 'error',
            reason: 'wait for open event before claim',
            next_ms: nextOpenInMs('lvl3') || TICK_MS,
          });
          return;
        }

        let msg;
        try {
          msg = JSON.parse(String(raw));
        } catch {
          wsSend(socket, { type: 'error', reason: 'invalid JSON', next_ms: TICK_MS });
          return;
        }

        if (msg.type !== 'claim') {
          wsSend(socket, { type: 'error', reason: 'expected { type: "claim", ... }', next_ms: TICK_MS });
          return;
        }

        void (async () => {
          const result = await processQueueClaim(login, queueToken, {
            book_key: msg.book_key,
            captcha_token: msg.captcha_token,
            timestamp: msg.timestamp,
            signature: msg.signature,
          });

          if (result.reason === 'claim too early') {
            wsSend(socket, {
              type: 'wait',
              reason: result.reason,
              next_ms: result.retry_after_ms,
            });
            return;
          }

          clearTimeout(claimTimer);
          claimHandled = true;

          wsSend(socket, { type: 'result', ...result, next_ms: 0 });
          socket.close();
          cleanup();
        })();
      });

      socket.on('close', cleanup);
      socket.on('error', cleanup);
    })();
  });
}
