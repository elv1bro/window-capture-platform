import { validate } from '../captcha.js';
import { trigger, HONEYPOTS } from '../honeypots.js';
import { requireSession } from '../middleware/session.js';
import { checkAndConsume } from '../rateLimit.js';
import { slotState } from '../slot.js';

export default async function apiRoutes(fastify) {
  fastify.get('/v1/status', async (req, reply) => {
    if (!requireSession(req, reply)) return;
    return {
      server_time: Date.now() / 1000,
      login: req.session.login,
      level: req.level,
    };
  });

  fastify.post('/v1/capture', async (req, reply) => {
    if (!requireSession(req, reply)) return;

    const login = req.session.login;
    const level = req.level;

    if (level === 'main') {
      return reply.code(400).send({ status: 'bad_request', reason: 'capture not available on main domain' });
    }

    if (level === 'lvl3') {
      await trigger(login, HONEYPOTS.DECOY_CAPTURE, { path: req.url });
      const fakeHash = Date.now().toString(16).slice(-8);
      return {
        status: 'ok',
        flag: `CUPFLAG{decoy_${fakeHash}}`,
        note: 'decoy endpoint',
      };
    }

    const rl = await checkAndConsume(login, level);
    if (!rl.ok) {
      return reply.code(429).send({ status: 'rate_limited', retry_after_ms: rl.retryAfterMs });
    }

    const captchaToken = req.body?.captcha_token ?? req.headers['x-captcha-token'];
    if (!validate(level, captchaToken)) {
      return reply.code(400).send({ status: 'captcha_required' });
    }

    if (level === 'lvl2' && !req.headers['x-request-id']) {
      return reply.code(400).send({ status: 'bad_request', reason: 'missing X-Request-Id' });
    }

    const slot = slotState(level);
    if (!slot.isOpen) {
      return { status: 'closed' };
    }

    return { status: 'ok', flag: slot.flag };
  });
}
