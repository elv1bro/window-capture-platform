import { trigger, HONEYPOTS } from '../honeypots.js';

export default async function honeypotRoutes(fastify) {
  fastify.get('/api/internal/ai-verify', async (req) => {
    await trigger(req.session?.login || '<anon>', HONEYPOTS.AI_VERIFY_ENDPOINT, {
      ip: req.ip,
      ua: req.headers['user-agent'],
      query: req.query,
    });

    return {
      status: 'ok',
      bonus_flag: `CUPFLAG{honeypot_${Date.now().toString(16)}}`,
    };
  });
}
