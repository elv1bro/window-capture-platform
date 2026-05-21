import { BASE_DOMAIN, ASSIGNMENT_URL, TURNSTILE_SITEKEY } from '../config.js';
import { randomLoginExample } from '../examples.js';

function viewData(extra = {}) {
  return {
    baseDomain: BASE_DOMAIN,
    assignmentUrl: ASSIGNMENT_URL,
    ...extra,
  };
}

export default async function pagesRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    if (req.level === 'main') {
      const example = randomLoginExample();
      return reply.view('landing.eta', viewData({
        title: 'Capture Challenge',
        login: req.session?.login || null,
        exampleLogin: example.login,
        examplePassword: example.password,
      }));
    }

    if (!req.session?.login) {
      return reply.redirect('/login');
    }

    return reply.view('level.eta', viewData({
      title: `${req.level.toUpperCase()}`,
      level: req.level,
      login: req.session.login,
      turnstileSitekey: TURNSTILE_SITEKEY,
      showCaptcha: req.level === 'lvl2' || req.level === 'lvl3',
      isLvl3: req.level === 'lvl3',
    }));
  });

  fastify.get('/login', async (req, reply) => {
    if (req.session?.login) {
      return reply.redirect('/');
    }

    return reply.view('login.eta', viewData({
      title: 'Login',
      error: null,
    }));
  });

  fastify.get('/docs', async (_req, reply) => {
    if (!ASSIGNMENT_URL) {
      return reply.code(404).send('Assignment URL is not configured');
    }
    return reply.redirect(ASSIGNMENT_URL);
  });
}
