import { TURNSTILE_SITEKEY } from '../config.js';
import { viewData } from '../viewData.js';

function renderAssignment(reply) {
  return reply.view('assignment.eta', viewData({ title: 'Assignment' }));
}

export default async function pagesRoutes(fastify) {
  fastify.get('/', async (req, reply) => {
    if (req.level === 'main') {
      return reply.view('landing.eta', viewData({
        title: 'Capture Challenge',
        login: req.session?.login || null,
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

  fastify.get('/assignment', renderAssignment);
  fastify.get('/docs', renderAssignment);
}
