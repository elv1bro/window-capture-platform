import crypto from 'node:crypto';
import { expectedPassword } from './auth.js';

export function randomLoginExample() {
  const login = `u${crypto.randomBytes(4).toString('hex')}`;
  return { login, password: expectedPassword(login) };
}
