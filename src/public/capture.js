(function () {
  const page = document.querySelector('.capture-page');
  if (!page) return;

  const level = page.dataset.level;
  const isLvl3 = page.dataset.isLvl3 === '1';
  const needsCaptcha = page.dataset.needsCaptcha === '1';
  const btn = document.getElementById('capture-btn');
  const log = document.getElementById('response-log');
  const banner = document.getElementById('captured-banner');
  const claimForm = document.getElementById('claim-form');
  const claimSubmitForm = document.getElementById('claim-submit-form');
  const bookKeyInput = document.getElementById('book-key-input');
  const queueTokenInput = document.getElementById('queue-token-input');
  const claimWindowHint = document.getElementById('claim-window-hint');
  const claimSubmitBtn = document.getElementById('claim-submit-btn');
  const MAX_LOG = 20;

  /** @type {{ queueToken: string, es: EventSource } | null} */
  let lvl3Session = null;

  function appendLog(entry) {
    const li = document.createElement('li');
    const cls = entry.status === 'ok' ? 'status-ok' : entry.status === 'closed' ? 'status-closed' : 'status-error';
    li.className = cls;
    li.textContent = `[${entry.time}] ${entry.status}${entry.detail ? ' — ' + entry.detail : ''}`;
    log.prepend(li);
    while (log.children.length > MAX_LOG) log.removeChild(log.lastChild);
  }

  function logNow(status, detail) {
    appendLog({
      time: new Date().toISOString().slice(11, 23),
      status,
      detail: String(detail || ''),
    });
  }

  function getCaptchaToken() {
    if (level === 'lvl1') return undefined;
    const input = document.querySelector('[name="cf-turnstile-response"]');
    return input?.value || window.__turnstileToken || '';
  }

  function resetCaptchaWidget() {
    if (!needsCaptcha) return;
    window.__turnstileToken = '';
    if (window.turnstile?.reset && window.__turnstileWidgetId != null) {
      window.turnstile.reset(window.__turnstileWidgetId);
    }
    btn.disabled = true;
  }

  function restoreCaptureButton() {
    if (!needsCaptcha) {
      btn.disabled = false;
      return;
    }
    btn.disabled = !window.__turnstileToken;
  }

  function hideClaimForm() {
    if (claimForm) claimForm.classList.add('hidden');
  }

  function showClaimForm(msg) {
    if (!claimForm || !bookKeyInput || !queueTokenInput) return;
    bookKeyInput.value = msg.book_key || '';
    queueTokenInput.value = lvl3Session?.queueToken || '';
    if (claimWindowHint) {
      claimWindowHint.textContent = `Window ${msg.window_ms || '?'} ms — wait ${msg.next_ms || 0} ms after open before claim`;
    }
    claimForm.classList.remove('hidden');
    if (claimSubmitBtn) claimSubmitBtn.focus();
  }

  function endLvl3Session() {
    if (lvl3Session?.es) {
      try { lvl3Session.es.close(); } catch { /* ignore */ }
    }
    lvl3Session = null;
    hideClaimForm();
    restoreCaptureButton();
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

  async function signClaim(queueToken) {
    const timestamp = Math.floor(Date.now() / 1000);
    let signature = '';
    if (window.WindowGuard?.sign) {
      signature = await window.WindowGuard.sign(queueToken, timestamp);
    }
    return { timestamp, signature };
  }

  async function postClaim(queueToken, bookKey) {
    const { timestamp, signature } = await signClaim(queueToken);
    const res = await fetch('/v1/queue/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        queue_token: queueToken,
        book_key: bookKey,
        captcha_token: getCaptchaToken(),
        timestamp,
        signature,
      }),
    });
    return res.json();
  }

  function bindQueueEvent(es, eventName, handler) {
    es.addEventListener(eventName, (ev) => {
      try {
        handler(JSON.parse(ev.data));
      } catch {
        logNow('error', `bad ${eventName} event`);
      }
    });
  }

  async function startLvl3Queue() {
    endLvl3Session();

    const joinRes = await fetch('/v1/queue/join', {
      method: 'POST',
      credentials: 'same-origin',
    });
    const joinData = await joinRes.json();
    if (!joinData.queue_token) {
      logNow(joinData.status || 'error', joinData.reason || 'join failed');
      restoreCaptureButton();
      return;
    }

    const queueToken = joinData.queue_token;
    const es = new EventSource(`/v1/queue/wait?queue_token=${encodeURIComponent(queueToken)}`);
    lvl3Session = { queueToken, es };

    bindQueueEvent(es, 'joined', (msg) => {
      logNow('joined', `next_ms=${msg.next_ms}`);
    });

    bindQueueEvent(es, 'tick', (msg) => {
      logNow('tick', `slot_open=${msg.slot_open} next_ms=${msg.next_ms}`);
    });

    bindQueueEvent(es, 'open', (msg) => {
      logNow('open', `book_key=${msg.book_key} window_ms=${msg.window_ms}`);
      showClaimForm(msg);
    });

    bindQueueEvent(es, 'closed', (msg) => {
      logNow('closed', msg.reason || 'window closed');
      endLvl3Session();
    });

    bindQueueEvent(es, 'error', (msg) => {
      logNow('error', msg.reason || 'queue error');
      endLvl3Session();
    });

    es.onerror = () => {
      if (lvl3Session?.es !== es) return;
      logNow('error', 'SSE connection lost');
      endLvl3Session();
    };

    logNow('queue', 'listening…');
  }

  if (claimSubmitForm) {
    claimSubmitForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (needsCaptcha && !getCaptchaToken()) return;

      const queueToken = queueTokenInput?.value || lvl3Session?.queueToken;
      const bookKey = bookKeyInput?.value;
      if (!queueToken || !bookKey) {
        logNow('error', 'missing queue_token or book_key');
        return;
      }

      if (claimSubmitBtn) claimSubmitBtn.disabled = true;
      try {
        const data = await postClaim(queueToken, bookKey);
        const detail = data.flag || data.reason || data.retry_after_ms || '';
        logNow(data.status, detail);
        if (data.status === 'ok' && data.flag && !String(data.flag).includes('decoy')) {
          banner.textContent = `Captured: ${data.flag}`;
          banner.classList.remove('hidden');
          endLvl3Session();
        } else if (data.status === 'closed') {
          logNow('closed', data.reason || 'closed');
          endLvl3Session();
        }
      } catch (err) {
        logNow('error', err.message);
      } finally {
        if (claimSubmitBtn) claimSubmitBtn.disabled = false;
      }
    });
  }

  btn.addEventListener('click', async () => {
    if (needsCaptcha && !getCaptchaToken()) return;

    btn.disabled = true;
    try {
      if (isLvl3) {
        await startLvl3Queue();
        return;
      }

      const data = await captureLvl1or2();
      const detail = data.flag || data.reason || data.retry_after_ms || '';
      logNow(data.status, detail);
      if (data.status === 'ok' && data.flag && !String(data.flag).includes('decoy')) {
        banner.textContent = `Captured: ${data.flag}`;
        banner.classList.remove('hidden');
      }
    } catch (err) {
      logNow('error', err.message);
    } finally {
      if (!isLvl3) {
        if (needsCaptcha) resetCaptchaWidget();
        else restoreCaptureButton();
      }
    }
  });
})();
