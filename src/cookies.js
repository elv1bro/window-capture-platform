import { SESSION_TTL_SEC } from './config.js';

/** Session cookie scoped to the current Host (lvl1.*, lvl2.*, etc.). */
export function sessionCookieOptions() {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: SESSION_TTL_SEC,
  };
}
