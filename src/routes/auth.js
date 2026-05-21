import { ASSIGNMENT_URL, BASE_DOMAIN, COOKIE_DOMAIN, SESSION_TTL_SEC } from '../config.js';
import { createSession, destroySession, verifyPassword } from '../auth.js';

export default async function authRoutes(fastify) {
  fastify.post('/login', async (req, reply) => {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');

    if (!verifyPassword(login, password)) {
      return reply.view('login.eta', {
        title: 'Login',
        baseDomain: BASE_DOMAIN,
        assignmentUrl: ASSIGNMENT_URL,
        error: 'Invalid login or password.',
      });
    }

    const sid = await createSession(login);
    reply.setCookie('sid', sid, {
      path: '/',
      domain: COOKIE_DOMAIN,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.COOKIE_SECURE === 'true',
      maxAge: SESSION_TTL_SEC,
    });

    return reply.redirect('/');
  });

  fastify.post('/logout', async (req, reply) => {
    const sid = req.cookies?.sid;
    await destroySession(sid);
    reply.clearCookie('sid', { path: '/', domain: COOKIE_DOMAIN });
    return reply.redirect('/login');
  });
}
