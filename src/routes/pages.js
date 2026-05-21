import { BASE_DOMAIN, TURNSTILE_SITEKEY } from '../config.js';

export default async function pagesRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    if (req.level === 'main') {
      return reply.view('landing.eta', {
        title: 'Capture Challenge',
        baseDomain: BASE_DOMAIN,
        login: req.session?.login || null,
      });
    }

    if (!req.session?.login) {
      return reply.redirect('/login');
    }

    const rateHint = req.level === 'lvl1' ? '10 requests/sec' : '1 request / 10 sec';
    return reply.view('level.eta', {
      title: `${req.level.toUpperCase()} — Capture Flag`,
      level: req.level,
      login: req.session.login,
      baseDomain: BASE_DOMAIN,
      turnstileSitekey: TURNSTILE_SITEKEY,
      showCaptcha: req.level === 'lvl2' || req.level === 'lvl3',
      rateHint,
      isLvl3: req.level === 'lvl3',
    });
  });

  fastify.get('/login', async (req, reply) => {
    if (req.session?.login) {
      if (req.level === 'main') return reply.redirect('/');
      return reply.redirect('/');
    }

    return reply.view('login.eta', {
      title: 'Login',
      level: req.level,
      baseDomain: BASE_DOMAIN,
      error: null,
    });
  });

  fastify.get('/docs', async (req, reply) => {
    return reply.view('docs.eta', {
      title: 'Assignment',
      baseDomain: BASE_DOMAIN,
    });
  });
}
