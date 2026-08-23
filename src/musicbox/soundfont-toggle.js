// ─────────────────────────────────────────────────────────────────
//  SOUNDFONT SWITCHER — UI
//
//  Small dropdown, opened from the #sf-toggle button (top-left,
//  mirrors #bg-toggle), listing the entries in
//  soundfonts/manifest.json. Selecting one calls
//  window.musicPlayer.setSoundfont(id).
//
//  This module is bundled into dist/main.js (via main.js →
//  `bun run build`), which is loaded *before* script.js in
//  index.html. That means window.musicPlayer does not exist yet
//  at module-load time — so:
//    - the manifest is fetched independently here, not read off
//      window.musicPlayer, so the list can render immediately.
//    - window.musicPlayer.setSoundfont is only touched at *click*
//      time, behind a small ready-check/poll (in practice the user
//      interacts long after load, so this resolves instantly, but
//      it's not guaranteed).
// ─────────────────────────────────────────────────────────────────
(function () {
  const MANIFEST_PATH = './soundfonts/manifest.json';
  const READY_POLL_MS = 50;
  const READY_TIMEOUT_MS = 8000;

  const btn = document.getElementById('sf-toggle');
  if (!btn) return;

  let manifest = [];   // [{ id, label, file }]
  let open = false;
  let panel = null;
  let listEl = null;

  // ── Styles (own <style> block, matches the browse-panel overlay
  //    look from script.js: dark rgba bg, #e8d5a3 amber text,
  //    monospace, backdrop-filter blur, small rounded corners) ──
  const style = document.createElement('style');
  style.textContent = `
    #sf-panel {
      position: absolute;
      top: 52px;
      left: 14px;
      z-index: 31;
      min-width: 190px;
      max-width: 260px;
      background: rgba(20,12,8,0.95);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      font-family: monospace;
      color: #e8d5a3;
      backdrop-filter: blur(8px);
      padding: 6px;
      opacity: 0;
      transform: translateY(-4px);
      pointer-events: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
    }
    #sf-panel.visible {
      opacity: 1;
      transform: translateY(0);
      pointer-events: auto;
    }
    #sf-panel-title {
      font-size: 10px;
      letter-spacing: 0.08em;
      opacity: 0.6;
      padding: 6px 8px 4px;
      text-transform: uppercase;
    }
    .sf-entry {
      display: block;
      width: 100%;
      text-align: left;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 12px;
      letter-spacing: 0.03em;
      padding: 7px 8px;
      cursor: pointer;
    }
    .sf-entry:hover { background: rgba(255,255,255,0.08); }
    .sf-entry.active { background: rgba(200,168,90,0.18); }
    .sf-entry .sf-check {
      display: inline-block;
      width: 14px;
      opacity: 0;
    }
    .sf-entry.active .sf-check { opacity: 1; }
    .sf-empty, .sf-error {
      font-size: 12px;
      opacity: 0.7;
      padding: 8px;
    }
  `;
  document.head.appendChild(style);

  // ── Build the (initially empty) panel ──
  panel = document.createElement('div');
  panel.id = 'sf-panel';
  panel.setAttribute('role', 'menu');
  panel.setAttribute('aria-label', 'Soundfont selector');
  panel.innerHTML = `
    <div id="sf-panel-title">Soundfont</div>
    <div id="sf-list"><div class="sf-empty">Loading…</div></div>
  `;
  document.body.appendChild(panel);
  listEl = panel.querySelector('#sf-list');

  function activeId() {
    return (window.musicPlayer && typeof window.musicPlayer.getSoundfont === 'function')
      ? window.musicPlayer.getSoundfont()
      : null;
  }

  function renderList() {
    if (!manifest.length) {
      listEl.innerHTML = '<div class="sf-empty">No soundfonts found</div>';
      return;
    }
    const current = activeId();
    listEl.innerHTML = manifest.map(entry => `
      <button class="sf-entry${entry.id === current ? ' active' : ''}" data-id="${entry.id}" role="menuitemradio" aria-checked="${entry.id === current}">
        <span class="sf-check">✓</span>${entry.label}
      </button>
    `).join('');
    [...listEl.querySelectorAll('.sf-entry')].forEach(el => {
      el.addEventListener('click', () => selectSoundfont(el.dataset.id));
    });
  }

  function highlightActive() {
    const current = activeId();
    [...listEl.querySelectorAll('.sf-entry')].forEach(el => {
      const isActive = el.dataset.id === current;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-checked', String(isActive));
    });
  }

  // Waits (polling) for window.musicPlayer.setSoundfont to exist, since
  // this bundle runs before script.js defines it.
  function waitForPlayerReady() {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        if (window.musicPlayer && typeof window.musicPlayer.setSoundfont === 'function') {
          resolve();
          return;
        }
        if (Date.now() - start > READY_TIMEOUT_MS) {
          reject(new Error('musicPlayer not ready'));
          return;
        }
        setTimeout(poll, READY_POLL_MS);
      })();
    });
  }

  async function selectSoundfont(id) {
    if (!id) return;
    try {
      await waitForPlayerReady();
    } catch (e) {
      console.warn('[SoundfontToggle] Player not ready, could not switch:', e);
      closePanel();
      return;
    }
    await window.musicPlayer.setSoundfont(id);
    closePanel();
  }

  async function loadManifest() {
    try {
      const res = await fetch(MANIFEST_PATH);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      manifest = await res.json();
      renderList();
    } catch (e) {
      console.warn('[SoundfontToggle] Could not load soundfonts/manifest.json', e);
      listEl.innerHTML = '<div class="sf-error">⚠ Could not load soundfonts</div>';
    }
  }

  function openPanel() {
    open = true;
    panel.classList.add('visible');
    btn.classList.add('active');
    highlightActive();
    // Deferred so the click that opened the panel (still bubbling at the
    // point openPanel() runs) doesn't immediately trip onOutsideClick.
    setTimeout(() => {
      if (!open) return;
      document.addEventListener('click', onOutsideClick, true);
    }, 0);
    document.addEventListener('keydown', onKeydown);
  }

  function closePanel() {
    open = false;
    panel.classList.remove('visible');
    btn.classList.remove('active');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown);
  }

  function onOutsideClick(e) {
    if (panel.contains(e.target) || e.target === btn) return;
    closePanel();
  }

  function onKeydown(e) {
    if (e.key === 'Escape' && open) closePanel();
  }

  btn.addEventListener('click', () => {
    if (open) {
      closePanel();
    } else {
      highlightActive();
      openPanel();
    }
  });

  // Keep the highlighted entry in sync with switches made elsewhere
  // (or triggered by this panel) once script.js has loaded and a
  // switch actually completes.
  window.addEventListener('soundfont:changed', () => {
    if (open) highlightActive();
  });

  loadManifest();
})();
