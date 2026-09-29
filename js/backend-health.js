/* FastAPI status is a real request, not a guessed connection indicator. */
(function () {
  'use strict';
  function init() {
    if (!window.AssureXAPI || document.querySelector('.ax-api-widget')) return;
    const target = document.querySelector('.topbar .topbar-actions') || document.querySelector('.topbar');
    if (!target) return;
    const widget = document.createElement('div');
    widget.className = 'ax-api-widget';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ax-api-indicator';
    button.dataset.status = 'checking';
    button.textContent = '● API: Checking';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', 'axApiDetails');
    button.setAttribute('aria-label', 'Show FastAPI connection status');
    const details = document.createElement('div');
    details.id = 'axApiDetails';
    details.className = 'ax-api-detail';
    details.hidden = true;
    details.innerHTML = '<strong id="axApiTitle">FastAPI connection</strong><p id="axApiMessage" role="status">Checking backend health...</p><button type="button" class="ax-api-retry">Retry connection</button>';
    widget.append(button, details);
    target.appendChild(widget);
    const title = details.querySelector('#axApiTitle');
    const message = details.querySelector('#axApiMessage');
    const retry = details.querySelector('.ax-api-retry');
    let checking = false;
    function describe(error) {
      const raw = String(error && error.message || error || 'Unknown connection problem');
      if (/Vercel deployment protection|login\/HTML|login\/html|login page|sso/i.test(raw)) {
        return { label: '● API: Protected', title: 'Backend access is protected', info: 'This deployment redirects public requests to a Vercel login page. Make the intended deployment accessible in Vercel Deployment Protection, or use an authorized server-side proxy. No bypass token should be added to the frontend.' };
      }
      if (/non-JSON.*404|HTTP 404/i.test(raw)) {
        return { label: '● API: Route missing', title: 'Health endpoint not found', info: 'The backend did not return the expected JSON response for /health. Verify your FastAPI routes and deployment.' };
      }
      if (/Cannot reach|CORS|network|Failed to fetch/i.test(raw)) {
        return { label: '● API: Access blocked', title: 'Backend could not be reached', info: 'The browser could not read the backend response. This deployment currently redirects unauthenticated requests to Vercel SSO; check Deployment Protection and CORS for this frontend origin.' };
      }
      return { label: '● API: Unavailable', title: 'Backend health request failed', info: raw };
    }
    async function check() {
      if (checking) return;
      checking = true;
      button.dataset.status = 'checking';
      button.textContent = '● API: Checking';
      message.textContent = 'Checking the configured FastAPI health endpoint...';
      retry.disabled = true;
      try {
        await window.AssureXAPI.health();
        button.dataset.status = 'ready';
        button.textContent = '● API: Reachable';
        title.textContent = 'FastAPI is reachable';
        message.textContent = 'The /health endpoint returned JSON successfully. This alone does not verify authentication, ML routes, or model availability.';
      } catch (error) {
        const info = describe(error);
        button.dataset.status = 'error';
        button.textContent = info.label;
        title.textContent = info.title;
        message.textContent = info.info;
      } finally {
        button.title = message.textContent;
        retry.disabled = false;
        checking = false;
      }
    }
    function toggle() {
      details.hidden = !details.hidden;
      button.setAttribute('aria-expanded', String(!details.hidden));
    }
    button.addEventListener('click', toggle);
    retry.addEventListener('click', check);
    document.addEventListener('click', function (event) {
      if (!widget.contains(event.target) && !details.hidden) {
        details.hidden = true;
        button.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !details.hidden) {
        details.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        button.focus();
      }
    });
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
