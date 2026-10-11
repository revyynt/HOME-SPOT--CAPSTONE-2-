/**
 * Boot watchdog for the authenticated dashboards.
 *
 * Loaded as a *classic* script on purpose, ahead of the module bundle. A module
 * script that fails to fetch or evaluate takes every module behind it down too,
 * leaving a page that renders perfectly and responds to nothing.
 *
 * That failure is maddening to diagnose from the outside, because an <a href>
 * still works with zero JavaScript -- so the page looks half-alive: the links
 * navigate, the buttons do nothing, and there is no error anywhere on screen.
 *
 * So this captures anything that goes wrong while the page boots (module load
 * failures included -- they surface as a plain `error` event whose target is
 * the <script> element) and, if the dashboard never announces itself within
 * BOOT_TIMEOUT_MS, says so on screen with the captured reason.
 */
(function () {
  const MARKER = 'homespotBooted';
  const BOOT_TIMEOUT_MS = 8000;
  const captured = [];

  function describe(value) {
    if (!value) return '';
    return value.message || String(value);
  }

  // Capture phase, so errors from module scripts are seen even though nothing
  // else on the page is listening yet.
  window.addEventListener(
    'error',
    (event) => {
      captured.push(describe(event.error) || event.message || 'Unknown error');
    },
    true
  );

  window.addEventListener('unhandledrejection', (event) => {
    captured.push(describe(event.reason));
  });

  function render() {
    if (document.getElementById('bootError')) return;

    const reasons = captured.length
      ? captured
          .filter((text, index) => text && captured.indexOf(text) === index)
          .slice(0, 4)
          .map(
            (text) =>
              '<li style="margin:4px 0;word-break:break-word">' +
              String(text).replace(/[<>&]/g, '') +
              '</li>'
          )
          .join('')
      : '';

    const banner = document.createElement('div');
    banner.id = 'bootError';
    banner.setAttribute(
      'style',
      [
        'position:relative',
        'z-index:9999',
        'margin:0',
        'padding:16px 20px',
        'background:#7f1d1d',
        'color:#fff',
        'font:14px/1.5 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,sans-serif'
      ].join(';')
    );

    banner.innerHTML =
      '<strong>This dashboard failed to load, so its buttons cannot work.</strong>' +
      '<ul style="margin:8px 0 0 18px;padding:0">' +
      '<li>Press <code style="background:rgba(255,255,255,.15);padding:1px 5px;border-radius:3px">Ctrl+Shift+R</code> to bypass a cached copy.</li>' +
      '<li>Reload once more -- module errors are sometimes transient.</li>' +
      '<li>Still failing? Open the browser console (F12) and send the red message.</li>' +
      '</ul>' +
      (reasons
        ? '<p style="margin:10px 0 0;opacity:.9">Reported errors:</p><ul style="margin:4px 0 0 18px;padding:0">' +
          reasons +
          '</ul>'
        : '');

    document.body.insertBefore(banner, document.body.firstChild);
  }

  window.addEventListener('load', () => {
    window.setTimeout(() => {
      if (window[MARKER]) return;
      render();
    }, BOOT_TIMEOUT_MS);
  });
})();