import { TRAP_LOGIN, TRAP_HEADER } from '../config.js';
import { trigger, HONEYPOTS } from '../honeypots.js';

export async function honeypotDetectMiddleware(req) {
  const login = req.session?.login;

  if (login === TRAP_LOGIN) {
    await trigger(login, HONEYPOTS.AI_INJECTION_LOGIN, { path: req.url, method: req.method });
  }

  const headerValue = req.headers[TRAP_HEADER];
  if (headerValue !== undefined) {
    await trigger(login || '<anon>', HONEYPOTS.AI_INJECTION_HEADER, {
      value: headerValue,
      path: req.url,
      method: req.method,
    });
  }
}
