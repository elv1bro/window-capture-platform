import { randomUUID } from 'node:crypto';
import redis from '../redis.js';
import { validate } from '../captcha.js';
import { verifyClaimSignature } from '../guard.js';
import { requireSession } from '../middleware/session.js';
import { checkAndConsume } from '../rateLimit.js';
import { slotState } from '../slot.js';

const QUEUE_TTL_SEC = 30;

function queueKey(token) {
  return `queue:${token}`;
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
    await redis.set(
      queueKey(queueToken),
      JSON.stringify({ login: req.session.login, createdAt: Date.now() }),
      'EX',
      QUEUE_TTL_SEC,
    );

    return { status: 'ok', queue_token: queueToken, ttl_sec: QUEUE_TTL_SEC };
  });

  fastify.get('/v1/queue/wait', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const queueToken = String(req.query?.queue_token || '');
    const raw = queueToken ? await redis.get(queueKey(queueToken)) : null;
    if (!raw) {
      return reply.code(400).send({ status: 'bad_request', reason: 'invalid or expired queue_token' });
    }

    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      return reply.code(400).send({ status: 'bad_request', reason: 'invalid queue entry' });
    }

    if (entry.login !== req.session.login) {
      return reply.code(403).send({ status: 'forbidden', reason: 'queue_token belongs to another user' });
    }

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const send = (event, data) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    send('joined', { queue_token: queueToken });

    const interval = setInterval(() => {
      const slot = slotState('lvl3');
      send('tick', { server_time: Date.now() / 1000, slot_open: slot.isOpen });
      if (slot.isOpen) {
        send('admitted', { server_time: Date.now() / 1000 });
        clearInterval(interval);
        reply.raw.end();
      }
    }, 200);

    req.raw.on('close', () => {
      clearInterval(interval);
    });
  });

  fastify.post('/v1/queue/claim', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const login = req.session.login;
    const rl = await checkAndConsume(login, 'lvl3');
    if (!rl.ok) {
      return reply.code(429).send({ status: 'rate_limited', retry_after_ms: rl.retryAfterMs });
    }

    const queueToken = String(req.body?.queue_token || '');
    const captchaToken = req.body?.captcha_token ?? req.headers['x-captcha-token'];
    const timestamp = req.body?.timestamp ?? req.headers['x-timestamp'];
    const signature = req.body?.signature ?? req.headers['x-signature'];

    if (!validate('lvl3', captchaToken)) {
      return reply.code(400).send({ status: 'captcha_required' });
    }

    const raw = queueToken ? await redis.get(queueKey(queueToken)) : null;
    if (!raw) {
      return reply.code(400).send({ status: 'bad_request', reason: 'invalid or expired queue_token' });
    }

    let entry;
    try {
      entry = JSON.parse(raw);
    } catch {
      return reply.code(400).send({ status: 'bad_request', reason: 'invalid queue entry' });
    }

    if (entry.login !== login) {
      return reply.code(403).send({ status: 'forbidden', reason: 'queue_token belongs to another user' });
    }

    if (!verifyClaimSignature(queueToken, timestamp, signature)) {
      return reply.code(400).send({ status: 'bad_request', reason: 'invalid signature' });
    }

    const slot = slotState('lvl3');
    if (!slot.isOpen) {
      return { status: 'closed' };
    }

    await redis.del(queueKey(queueToken));
    return { status: 'ok', flag: slot.flag };
  });
}
