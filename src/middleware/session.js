import { getSession } from '../auth.js';

export async function sessionMiddleware(req) {
  const sid = req.cookies?.sid;
  req.session = sid ? await getSession(sid) : null;
}

export function requireSession(req, reply) {
  if (!req.session?.login) {
    reply.code(401).send({ status: 'unauthorized', reason: 'login required' });
    return false;
  }
  return true;
}
