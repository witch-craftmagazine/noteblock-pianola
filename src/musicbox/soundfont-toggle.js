// ─────────────────────────────────────────────────────────────────
//  SOUNDFONT SWITCHER — UI
//
//  Small dropdown, opened from the #sf-toggle button (top-left,
//  mirrors #github-flap in the top-right corner), listing the
//  entries in
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
      /* #music-player (script.js) is z-index 100 and fixed to the bottom
         of the viewport. On short mobile screens this panel's list can
         grow tall enough to reach that area — it needs to render above
         the control panel, not behind it, when that happens. */
      z-index: 110;
      min-width: 190px;
      max-width: 260px;
      max-height: min(360px, 60vh);
      display: flex;
      flex-direction: column;
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
    #sf-search-row {
      padding: 2px 4px 6px;
      flex: 0 0 auto;
    }
    #sf-search {
      width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 6px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 12px;
      padding: 6px 8px;
      outline: none;
    }
    #sf-search:focus { border-color: rgba(200,168,90,0.5); }
    #sf-search::placeholder { color: rgba(232,213,163,0.45); }
    #sf-list {
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      flex: 1 1 auto;
      min-height: 0;
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
    <div id="sf-search-row" style="display:none;">
      <input id="sf-search" type="text" placeholder="Search soundfonts…" autocomplete="off" />
    </div>
    <div id="sf-list"><div class="sf-empty">Loading…</div></div>
  `;
  document.body.appendChild(panel);
  listEl = panel.querySelector('#sf-list');
  const searchRow = panel.querySelector('#sf-search-row');
  const searchInput = panel.querySelector('#sf-search');

  // Only worth showing a search box once the list is long enough that
  // scanning it beats typing — keeps the panel minimal for the common
  // case of a handful of soundfonts, but scales cleanly as more are added.
  const SEARCH_THRESHOLD = 8;
  let filterText = '';
  searchInput.addEventListener('input', () => {
    filterText = searchInput.value.trim().toLowerCase();
    renderList();
  });

  function activeId() {
    return (window.musicPlayer && typeof window.musicPlayer.getSoundfont === 'function')
      ? window.musicPlayer.getSoundfont()
      : null;
  }

  function renderList() {
    searchRow.style.display = manifest.length > SEARCH_THRESHOLD ? 'block' : 'none';

    if (!manifest.length) {
      listEl.innerHTML = '<div class="sf-empty">No soundfonts found</div>';
      return;
    }

    const filtered = filterText
      ? manifest.filter(s => s.label.toLowerCase().includes(filterText))
      : manifest;

    if (!filtered.length) {
      listEl.innerHTML = '<div class="sf-empty">No matches</div>';
      return;
    }

    const current = activeId();
    listEl.innerHTML = filtered.map(entry => `
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

  // Keeps the panel from extending down behind #music-player (the fixed
  // bottom control bar from script.js). Rather than rely on z-index
  // alone — which fixes *stacking* but the panel would still visually
  // run underneath/behind the bar — cap the panel's height to the space
  // actually available above it, so the list scrolls internally instead.
  function constrainToViewport() {
    const btnRect = btn.getBoundingClientRect();
    const mp = document.getElementById('music-player');
    const mpTop = mp ? mp.getBoundingClientRect().top : window.innerHeight;
    const margin = 12;
    const available = Math.max(120, Math.min(mpTop, window.innerHeight) - btnRect.bottom - margin);
    panel.style.maxHeight = Math.min(360, available) + 'px';
  }

  function openPanel() {
    open = true;
    filterText = '';
    searchInput.value = '';
    constrainToViewport();
    panel.classList.add('visible');
    btn.classList.add('active');
    highlightActive();
    renderList();
    // Deferred so the click that opened the panel (still bubbling at the
    // point openPanel() runs) doesn't immediately trip onOutsideClick.
    setTimeout(() => {
      if (!open) return;
      document.addEventListener('click', onOutsideClick, true);
    }, 0);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', constrainToViewport);
  }

  function closePanel() {
    open = false;
    panel.classList.remove('visible');
    btn.classList.remove('active');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', constrainToViewport);
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
