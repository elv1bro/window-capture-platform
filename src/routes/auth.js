import { createSession, destroySession, verifyPassword } from '../auth.js';
import { sessionCookieOptions } from '../cookies.js';
import { viewData } from '../viewData.js';

export default async function authRoutes(fastify) {
  fastify.post('/login', async (req, reply) => {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');

    if (!verifyPassword(login, password)) {
      return reply.view('login.eta', viewData(req, {
        title: 'Login',
        error: 'Invalid login or password.',
      }));
    }

    const sid = await createSession(login);
    reply.setCookie('sid', sid, sessionCookieOptions());

    return reply.redirect('/');
  });

  fastify.post('/logout', async (req, reply) => {
    const sid = req.cookies?.sid;
    await destroySession(sid);
    reply.clearCookie('sid', sessionCookieOptions());
    return reply.redirect('/login');
  });
}
