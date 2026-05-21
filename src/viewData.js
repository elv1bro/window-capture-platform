import { BASE_DOMAIN } from './config.js';
import { randomLoginExample } from './examples.js';

export function viewData(extra = {}) {
  const example = randomLoginExample();
  return {
    baseDomain: BASE_DOMAIN,
    assignmentHref: `https://${BASE_DOMAIN}/assignment`,
    exampleLogin: example.login,
    examplePassword: example.password,
    ...extra,
  };
}
