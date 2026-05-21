import { BASE_DOMAIN } from './config.js';
import { randomLoginExample } from './examples.js';

export function viewData(req, extra = {}) {
  const example = randomLoginExample();
  return {
    baseDomain: BASE_DOMAIN,
    level: req?.level ?? 'main',
    homeHref: '/',
    loginHref: '/login',
    assignmentHref: '/assignment',
    lvl1Url: `https://lvl1.${BASE_DOMAIN}/`,
    lvl2Url: `https://lvl2.${BASE_DOMAIN}/`,
    lvl3Url: `https://lvl3.${BASE_DOMAIN}/`,
    exampleLogin: example.login,
    examplePassword: example.password,
    ...extra,
  };
}
