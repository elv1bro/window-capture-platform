import { GUARD_SECRET } from '../config.js';

export default async function guardAssetRoutes(fastify) {
  fastify.get('/guard.js', async (req, reply) => {
    if (req.level !== 'lvl3') {
      return reply.code(404).type('text/plain').send('Not found');
    }

    reply.type('application/javascript');

    const secretParts = Buffer.from(GUARD_SECRET).toString('base64');

    return `
(function(){
  var _k=atob(${JSON.stringify(secretParts)});
  async function hmac(key,msg){
    var enc=new TextEncoder();
    var ck=await crypto.subtle.importKey('raw',enc.encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    var sig=await crypto.subtle.sign('HMAC',ck,enc.encode(msg));
    return Array.from(new Uint8Array(sig)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
  }
  window.WindowGuard={
    sign:function(queueToken,timestampSec){
      return hmac(_k,queueToken+':'+timestampSec);
    }
  };
})();
`.trim();
  });
}
