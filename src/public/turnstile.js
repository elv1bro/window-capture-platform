(function () {
  const container = document.getElementById('turnstile-container');
  if (!container) return;

  const sitekey = container.dataset.sitekey;

  function render() {
    if (!window.turnstile) {
      setTimeout(render, 100);
      return;
    }
    window.turnstile.render(container, {
      sitekey,
      callback(token) {
        window.__turnstileToken = token;
      },
    });
  }

  render();
})();
