export function validate(level, token) {
  if (level === 'lvl1') return true;
  return typeof token === 'string' && token.trim().length > 0;
}
