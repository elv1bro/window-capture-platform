export async function levelMiddleware(req) {
  const host = (req.headers.host || req.hostname || '').toLowerCase().split(':')[0];
  if (host.startsWith('lvl1.')) req.level = 'lvl1';
  else if (host.startsWith('lvl2.')) req.level = 'lvl2';
  else if (host.startsWith('lvl3.')) req.level = 'lvl3';
  else req.level = 'main';
}
