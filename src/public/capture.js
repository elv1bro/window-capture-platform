(function () {
  const page = document.querySelector('.capture-page');
  if (!page) return;

  const level = page.dataset.level;
  const isLvl3 = page.dataset.isLvl3 === '1';
  const btn = document.getElementById('capture-btn');
  const log = document.getElementById('response-log');
  const banner = document.getElementById('captured-banner');
  const MAX_LOG = 20;

  function appendLog(entry) {
    const li = document.createElement('li');
    const cls = entry.status === 'ok' ? 'status-ok' : entry.status === 'closed' ? 'status-closed' : 'status-error';
    li.className = cls;
    li.textContent = `[${entry.time}] ${entry.status}${entry.detail ? ' — ' + entry.detail : ''}`;
    log.prepend(li);
    while (log.children.length > MAX_LOG) log.removeChild(log.lastChild);
  }

  function getCaptchaToken() {
    if (level === 'lvl1') return undefined;
    const input = document.querySelector('[name="cf-turnstile-response"]');
    return input?.value || window.__turnstileToken || 'manual-token';
  }

  async function captureLvl1or2() {
    const headers = { 'Content-Type': 'application/json' };
    if (level === 'lvl2') {
      headers['X-Request-Id'] = crypto.randomUUID?.() || String(Date.now());
    }
    const body = {};
    const token = getCaptchaToken();
    if (token) body.captcha_token = token;

    const res = await fetch('/v1/capture', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      credentials: 'same-origin',
    });
    return res.json();
  }

  async function captureLvl3() {
    const joinRes = await fetch('/v1/queue/join', {
      method: 'POST',
      credentials: 'same-origin',
    });
    const joinData = await joinRes.json();
    if (!joinData.queue_token) return joinData;

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProto}//${location.host}/v1/queue/wait?queue_token=${encodeURIComponent(joinData.queue_token)}`;

    return new Promise((resolve) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;

      const finish = (data) => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        resolve(data);
      };

      ws.addEventListener('message', async (ev) => {
        let msg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          finish({ status: 'error', reason: 'invalid server message' });
          return;
        }

        if (msg.type === 'open') {
          const timestamp = Math.floor(Date.now() / 1000);
          let signature = '';
          if (window.WindowGuard?.sign) {
            signature = await window.WindowGuard.sign(joinData.queue_token, timestamp);
          }
          ws.send(JSON.stringify({
            type: 'claim',
            captcha_token: getCaptchaToken(),
            timestamp,
            signature,
          }));
          return;
        }

        if (msg.type === 'result') {
          finish(msg);
          return;
        }

        if (msg.type === 'closed') {
          finish({ status: 'closed', reason: msg.reason });
          return;
        }

        if (msg.type === 'error') {
          finish({ status: 'error', reason: msg.reason || msg.status });
        }
      });

      ws.addEventListener('error', () => {
        finish({ status: 'error', reason: 'WebSocket connection failed' });
      });

      ws.addEventListener('close', () => {
        finish({ status: 'error', reason: 'WebSocket closed' });
      });

      setTimeout(() => {
        finish({ status: 'timeout', reason: 'queue wait timeout' });
      }, 120_000);
    });
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const data = isLvl3 ? await captureLvl3() : await captureLvl1or2();
      const detail = data.flag || data.reason || data.retry_after_ms || '';
      appendLog({ time: new Date().toISOString().slice(11, 23), status: data.status, detail: String(detail) });
      if (data.status === 'ok' && data.flag && !String(data.flag).includes('decoy')) {
        banner.textContent = `Captured: ${data.flag}`;
        banner.classList.remove('hidden');
      }
    } catch (err) {
      appendLog({ time: new Date().toISOString().slice(11, 23), status: 'error', detail: err.message });
    } finally {
      btn.disabled = false;
    }
  });
})();
