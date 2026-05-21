(function () {
  const container = document.getElementById('turnstile-container');
  if (!container) return;

  const btn = document.getElementById('capture-btn');
  const sitekey = container.dataset.sitekey;

  function setCaptureEnabled(enabled) {
    if (btn) btn.disabled = !enabled;
  }

  function clearCaptcha() {
    window.__turnstileToken = '';
    setCaptureEnabled(false);
  }

  setCaptureEnabled(false);

  function render() {
    if (!window.turnstile) {
      setTimeout(render, 100);
      return;
    }

    window.__turnstileWidgetId = window.turnstile.render(container, {
      sitekey,
      callback(token) {
        window.__turnstileToken = token;
        setCaptureEnabled(true);
      },
      'expired-callback': clearCaptcha,
      'error-callback': clearCaptcha,
    });
  }

  render();
})();
