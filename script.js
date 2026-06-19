// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — MIDI PLAYER
//  Uses spessasynth_lib with minecraft3.sf2
//  Reads track list from midilist.json
// ─────────────────────────────────────────────────────────────────

import { Sequencer, WorkletSynthesizer }
from "./lib/spessasynth_lib.js";

const SF2_PATH     = './minecraft3.sf2';
const WORKLET_PATH = './lib/spessasynth_processor.min.js';
const LIST_PATH    = './midilist.json';
const UI_SOUND_PATH = './sounds/click.ogg';

// ── State ──────────────────────────────────────────────────────────
let context       = null;
let synth         = null;
let seq           = null;
let tracks        = [];
let trackMeta     = [];   // [{ index, path, title, artist, year }] — for search/sort
let current       = 0;
let ready         = false;
let playing       = false;
let songLoaded    = false;
let browseSort    = 'title';
let browseOpen    = false;

// P5: Volume is stored as a slider position (0–1), converted to gain via
// a 4th-power curve on the way to the synth. This makes the slider feel
// perceptually linear — equal steps sound equally loud throughout the range.
// sliderToGain(0.5) ≈ 0.06  →  about 24 dB below full  →  perceptually "half loud"
// sliderToGain(0.8) ≈ 0.41  →  a comfortable default listening level
let pendingSlider = 0.8;   // slider position; actual gain = pendingSlider ** 4

function sliderToGain(v) { return v ** 4; }
function gainToSlider(g) { return g ** (1 / 4); }

// ── UI Sound ───────────────────────────────────────────────────────
// P7: A short click sound plays on every button press.
// The buffer is loaded lazily after the AudioContext is created.
// We never create an AudioContext just to play a UI sound.
let uiSoundBuffer = null;

async function loadUiSound() {
  try {
    const res = await fetch(UI_SOUND_PATH);
    if (!res.ok) return;  // missing file is non-fatal — UI just plays silently
    const buf = await res.arrayBuffer();
    uiSoundBuffer = await context.decodeAudioData(buf);
  } catch (e) {
    console.warn('[MusicPlayer] UI sound not loaded:', e);
  }
}

function playUiSound() {
  // Only play if the AudioContext already exists (i.e. user has interacted).
  // Never trigger context creation for a UI sound.
  if (!context || !uiSoundBuffer) return;
  try {
    const src = context.createBufferSource();
    src.buffer = uiSoundBuffer;
    src.connect(context.destination);
    src.start();
  } catch (e) { /* non-fatal */ }
}

// ── UI refs ───────────────────────────────────────────────────────
let ui = {};

// ─────────────────────────────────────────────────────────────────
//  BUILD UI
// ─────────────────────────────────────────────────────────────────
function buildUI() {
  const panel = document.createElement('div');
  panel.id = 'music-player';
  panel.innerHTML = `
    <div id="mp-track-name">♪ Select a track</div>
    <div id="mp-controls">
      <button id="mp-prev"    title="Previous">&#9664;&#9664;</button>
      <button id="mp-play"    title="Play / Pause">&#9654;</button>
      <button id="mp-next"    title="Next">&#9654;&#9654;</button>
      <button id="mp-shuffle" title="Shuffle">?</button>
    </div>
    <div id="mp-seek-row">
      <span id="mp-time-cur">0:00</span>
      <input id="mp-seek" type="range" min="0" max="1000" value="0" step="1"/>
      <span id="mp-time-total">0:00</span>
    </div>
    <div id="mp-vol-row">
      <span id="mp-vol-icon">♪</span>
      <input id="mp-vol" type="range" min="0" max="1" value="${pendingSlider}" step="0.01"/>
    </div>
    <div id="mp-list-row">
      <button id="mp-browse-btn" title="Browse songs">🎵 Browse</button>
      <button id="mp-share-btn" title="Copy link to this song">🔗</button>
      <label id="mp-upload-btn" title="Play your own MIDI file" tabindex="0">↑
        <input id="mp-file" type="file" accept=".mid,.midi" style="display:none"/>
      </label>
    </div>
    <div id="mp-status">Loading soundfont…</div>
  `;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = `
    #music-player {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(20, 12, 8, 0.92);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      padding: 14px 18px 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 320px;
      max-width: 420px;
      width: 90vw;
      font-family: monospace;
      color: #e8d5a3;
      backdrop-filter: blur(8px);
      z-index: 100;
      user-select: none;
    }
    #mp-track-name {
      font-size: 12px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0.85;
      letter-spacing: 0.04em;
    }
    #mp-controls {
      display: flex;
      justify-content: center;
      gap: 10px;
    }
    #mp-controls button {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-size: 13px;
      padding: 5px 14px;
      cursor: pointer;
      transition: background 0.15s;
    }
    #mp-controls button:hover { background: rgba(255,255,255,0.14); }
    #mp-controls button:disabled { opacity: 0.35; cursor: default; }
    #mp-play    { width: 48px; min-width: 48px; text-align: center; font-size: 15px !important; }
    #mp-shuffle { font-size: 15px !important; padding: 5px 10px; font-weight: bold; }
    #mp-shuffle.active {
      background: rgba(200, 168, 90, 0.22);
      border-color: rgba(200, 168, 90, 0.5);
      color: #c8a85a;
    }
    #mp-seek-row, #mp-vol-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      opacity: 0.75;
    }
    #mp-seek, #mp-vol {
      flex: 1;
      accent-color: #c8a85a;
      cursor: pointer;
      height: 3px;
    }
    /* P7: track list row with upload button */
    #mp-list-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    #mp-browse-btn {
      flex: 1;
      min-width: 0;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 11px;
      padding: 6px 8px;
      cursor: pointer;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.15s;
    }
    #mp-browse-btn:hover { background: rgba(255,255,255,0.14); }
    #mp-share-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-size: 13px;
      padding: 5px 10px;
      cursor: pointer;
      transition: background 0.15s;
    }
    #mp-share-btn:hover { background: rgba(255,255,255,0.14); }
    /* P10: Upload MIDI button */
    #mp-upload-btn {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-size: 13px;
      padding: 4px 10px;
      cursor: pointer;
      transition: background 0.15s;
      white-space: nowrap;
      display: flex;
      align-items: center;
    }
    #mp-upload-btn:hover { background: rgba(255,255,255,0.14); }
    #mp-status {
      font-size: 10px;
      opacity: 0.45;
      text-align: center;
      letter-spacing: 0.06em;
      min-height: 14px;
    }

    /* ── Song browser overlay ── */
    #mp-browse-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s ease;
      z-index: 200;
      padding: 20px;
    }
    #mp-browse-overlay.visible { opacity: 1; pointer-events: auto; }
    #mp-browse-panel {
      background: rgba(20,12,8,0.97);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      width: 100%;
      max-width: 460px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      font-family: monospace;
      color: #e8d5a3;
      overflow: hidden;
      backdrop-filter: blur(8px);
    }
    #mp-browse-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 14px 10px;
    }
    #mp-search {
      flex: 1;
      min-width: 0;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 13px;
      padding: 8px 10px;
    }
    #mp-search:focus { outline: 1px solid rgba(200,168,90,0.5); }
    #mp-browse-close {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 6px;
      color: #e8d5a3;
      font-size: 14px;
      padding: 6px 10px;
      cursor: pointer;
    }
    #mp-browse-close:hover { background: rgba(255,255,255,0.14); }
    #mp-sort-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 0 14px 10px;
      font-size: 11px;
      opacity: 0.85;
    }
    .mp-sort-btn {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 5px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 10px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .mp-sort-btn:hover { background: rgba(255,255,255,0.12); }
    .mp-sort-btn.active {
      background: rgba(200,168,90,0.22);
      border-color: rgba(200,168,90,0.5);
      color: #c8a85a;
    }
    #mp-results-count {
      font-size: 10px;
      opacity: 0.5;
      padding: 0 14px 6px;
    }
    #mp-results {
      flex: 1;
      overflow-y: auto;
      border-top: 1px solid rgba(255,255,255,0.06);
    }
    .mp-result-item {
      padding: 9px 14px;
      cursor: pointer;
      border-bottom: 1px solid rgba(255,255,255,0.04);
      transition: background 0.12s;
    }
    .mp-result-item:hover { background: rgba(255,255,255,0.07); }
    .mp-result-item.playing { background: rgba(200,168,90,0.14); }
    .mp-result-title {
      font-size: 12px;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .mp-result-meta {
      font-size: 10px;
      opacity: 0.55;
      margin-top: 2px;
    }
    #mp-no-results {
      padding: 24px 14px;
      text-align: center;
      font-size: 12px;
      opacity: 0.5;
    }
  `;
  document.head.appendChild(style);

  ui = {
    panel,
    trackName : panel.querySelector('#mp-track-name'),
    play      : panel.querySelector('#mp-play'),
    prev      : panel.querySelector('#mp-prev'),
    next      : panel.querySelector('#mp-next'),
    shuffle   : panel.querySelector('#mp-shuffle'),
    seek      : panel.querySelector('#mp-seek'),
    timeCur   : panel.querySelector('#mp-time-cur'),
    timeTotal : panel.querySelector('#mp-time-total'),
    vol       : panel.querySelector('#mp-vol'),
    browseBtn : panel.querySelector('#mp-browse-btn'),
    shareBtn  : panel.querySelector('#mp-share-btn'),
    uploadBtn : panel.querySelector('#mp-upload-btn'),
    fileInput : panel.querySelector('#mp-file'),
    status    : panel.querySelector('#mp-status'),
  };

  setControlsEnabled(false);
  buildBrowsePanel();
}

// ─────────────────────────────────────────────────────────────────
//  BUILD SONG BROWSER (search + sort overlay)
// ─────────────────────────────────────────────────────────────────
function buildBrowsePanel() {
  const overlay = document.createElement('div');
  overlay.id = 'mp-browse-overlay';
  overlay.innerHTML = `
    <div id="mp-browse-panel" role="dialog" aria-label="Song browser">
      <div id="mp-browse-header">
        <input id="mp-search" type="text" placeholder="Search title or composer…" autocomplete="off"/>
        <button id="mp-browse-close" title="Close">✕</button>
      </div>
      <div id="mp-sort-row">
        <span>Sort</span>
        <button class="mp-sort-btn" data-sort="title">Title</button>
        <button class="mp-sort-btn" data-sort="artist">Artist</button>
        <button class="mp-sort-btn" data-sort="year">Year</button>
      </div>
      <div id="mp-results-count"></div>
      <div id="mp-results"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  ui.browseOverlay = overlay;
  ui.search       = overlay.querySelector('#mp-search');
  ui.browseClose  = overlay.querySelector('#mp-browse-close');
  ui.sortBtns     = [...overlay.querySelectorAll('.mp-sort-btn')];
  ui.results      = overlay.querySelector('#mp-results');
  ui.resultsCount = overlay.querySelector('#mp-results-count');

  ui.browseBtn.addEventListener('click', () => { playUiSound(); openBrowse(); });
  ui.shareBtn.addEventListener('click', copyShareLink);
  ui.browseClose.addEventListener('click', closeBrowse);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeBrowse(); });
  ui.search.addEventListener('input', renderResults);
  ui.sortBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.sort === browseSort);
    btn.addEventListener('click', () => {
      browseSort = btn.dataset.sort;
      ui.sortBtns.forEach(b => b.classList.toggle('active', b === btn));
      renderResults();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && browseOpen) closeBrowse();
  });
}

function openBrowse() {
  browseOpen = true;
  ui.browseOverlay.classList.add('visible');
  ui.search.value = '';
  renderResults();
  setTimeout(() => ui.search.focus(), 50);
}

function closeBrowse() {
  browseOpen = false;
  ui.browseOverlay.classList.remove('visible');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function renderResults() {
  const q = ui.search.value.trim().toLowerCase();

  let list = trackMeta.filter(t => {
    if (!q) return true;
    return t.title.toLowerCase().includes(q)
        || t.artist.toLowerCase().includes(q)
        || String(t.year || '').includes(q);
  });

  list = list.slice().sort((a, b) => {
    if (browseSort === 'artist') {
      const ar = (a.artist || '\uffff').localeCompare(b.artist || '\uffff');
      return ar !== 0 ? ar : a.title.localeCompare(b.title);
    }
    if (browseSort === 'year') {
      const ay = a.year ?? 9999, by = b.year ?? 9999;
      return ay !== by ? ay - by : a.title.localeCompare(b.title);
    }
    return a.title.localeCompare(b.title); // 'title' (default)
  });

  ui.resultsCount.textContent = `${list.length} song${list.length === 1 ? '' : 's'}`;

  if (list.length === 0) {
    ui.results.innerHTML = `<div id="mp-no-results">No songs match “${escapeHtml(ui.search.value)}”</div>`;
    return;
  }

  const frag = document.createDocumentFragment();
  list.forEach(t => {
    const item = document.createElement('div');
    item.className = 'mp-result-item' + (t.index === current ? ' playing' : '');
    const titleText = t.title || friendlyName(t.path);
    item.innerHTML = `
      <div class="mp-result-title">${t.index === current ? '♪ ' : ''}${escapeHtml(titleText)}</div>
      <div class="mp-result-meta">${escapeHtml(t.artist || '—')}${t.year ? ' · ' + t.year : ''}</div>
    `;
    item.addEventListener('click', () => {
      playUiSound();
      loadTrack(t.index, true);
      closeBrowse();
    });
    frag.appendChild(item);
  });
  ui.results.innerHTML = '';
  ui.results.appendChild(frag);
}

// ─────────────────────────────────────────────────────────────────
//  SHARE LINKS — deep-link to a specific song via ?song=<slug>
// ─────────────────────────────────────────────────────────────────
function slugFor(index) {
  return (tracks[index] || '').split('/').pop().replace(/\.midi?$/i, '');
}

function findIndexBySlug(slug) {
  return tracks.findIndex(p => p.split('/').pop().replace(/\.midi?$/i, '') === slug);
}

function shareUrlFor(index) {
  const url = new URL(location.href);
  url.search = '';
  url.searchParams.set('song', slugFor(index));
  return url.toString();
}

// Keep the address bar in sync with the playing track so users can also
// just copy the URL bar directly — the share button is a convenience on top.
function syncUrlToTrack(index) {
  try {
    history.replaceState(null, '', shareUrlFor(index));
  } catch (e) { /* non-fatal, e.g. file:// or sandboxed contexts */ }
}

async function copyShareLink() {
  playUiSound();
  const url = shareUrlFor(current);
  const prevStatus = ui.status.textContent;
  try {
    await navigator.clipboard.writeText(url);
    setStatus('Link copied ✓');
  } catch (e) {
    window.prompt('Copy this link:', url); // clipboard API unavailable — manual fallback
    setStatus(prevStatus);
    return;
  }
  setTimeout(() => setStatus(prevStatus), 1800);
}

// ─────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────
function setControlsEnabled(on) {
  [ui.play, ui.prev, ui.next, ui.shuffle, ui.seek, ui.browseBtn, ui.shareBtn].forEach(el => {
    if (el) el.disabled = !on;
  });
}

function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function friendlyName(path) {
  return path
    .replace(/^.*[\\/]/, '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_\-]+/g, ' ')
    .trim();
}

// ── Metadata parsing for search/sort ─────────────────────────────
// Filenames generally follow: title_YEAR_-_artist.mid (with some
// variation in separators and trailing catalog/roll numbers). This is
// a best-effort heuristic extracted from the filename only — there's
// no real metadata source — so it won't be 100% accurate for every
// track, but it's good enough to power search, and sort-by-artist /
// sort-by-year groupings.
const YEAR_RE = /(1[5-9]\d{2}|20\d{2})/;
const CATALOG_SUFFIX_RE = /_(qrs|vocalstyle|royal|duoart|ampico|mastertouch|electra|broadwaymusicroll|melographic|reliance|weltedeluxe|imperial)_?\w*$/i;

function parseMeta(path) {
  const base = path.split('/').pop().replace(/\.midi?$/i, '');
  const m = YEAR_RE.exec(base);

  if (!m) {
    return { title: base.replace(/[_\-]+/g, ' ').trim(), artist: '', year: null };
  }

  const year = parseInt(m[0], 10);
  const before = base.slice(0, m.index);
  let after = base.slice(m.index + m[0].length);

  const title = before.replace(/[_\-]+$/, '').replace(/[_\-]+/g, ' ').trim();

  after = after.replace(/^[_\-]+/, '');
  after = after.replace(/_\d+$/, '');          // trailing "_2"/"_3" duplicate-version marker
  after = after.replace(CATALOG_SUFFIX_RE, ''); // trailing piano-roll/catalog brand+number
  const artist = after.replace(/[_\-]+/g, ' ').trim();

  return { title, artist, year };
}

function setStatus(msg) {
  if (ui.status) ui.status.textContent = msg;
}

async function getMidiBuffer(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const buf = await res.arrayBuffer();
  return { binary: buf, midiName: path.split('/').pop() };
}

// ─────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────
async function init() {
  buildUI();

  // 1. Load track list
  try {
    const res = await fetch(LIST_PATH);
    tracks = await res.json();
  } catch (e) {
    setStatus('⚠ Could not load midilist.json');
    console.error(e);
    return;
  }

  tracks.forEach((path, i) => {
    trackMeta.push({ index: i, path, ...parseMeta(path) });
  });
  if (ui.browseBtn) ui.browseBtn.textContent = `🎵 Browse (${tracks.length})`;

  // Deep-link support: ?song=<slug> selects a specific track on load.
  // <slug> is the MIDI filename without its extension, e.g.
  //   ?song=tico-tico_no_fuba_1917_-_abreu
  // Falls back to a random track if the param is absent or unrecognized.
  const params = new URLSearchParams(location.search);
  const requestedSlug = params.get('song');
  const requestedIndex = requestedSlug ? findIndexBySlug(requestedSlug) : -1;

  if (requestedIndex !== -1) {
    current = requestedIndex;
  } else if (tracks.length > 1) {
    current = Math.floor(Math.random() * tracks.length);
  }
  updateTrackName(current);
  syncUrlToTrack(current);

  // 2. Load soundfont
  setStatus('Loading soundfont…');
  let sfBuffer;
  try {
    const res = await fetch(SF2_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sfBuffer = await res.arrayBuffer();
  } catch (e) {
    setStatus('⚠ Could not load minecraft3.sf2');
    console.error(e);
    return;
  }

  // 3. Wire UI events
  ui.play.addEventListener('click', () => { playUiSound(); togglePlay(); });
  ui.prev.addEventListener('click', () => { playUiSound(); prevTrack(); });
  ui.next.addEventListener('click', () => { playUiSound(); nextTrack(); });
  ui.shuffle.addEventListener('click', () => { playUiSound(); shuffleTrack(); });

  // P5: slider value → 4th-power gain curve
  ui.vol.addEventListener('input', () => setVolume(Number(ui.vol.value)));

  ui.seek.addEventListener('pointerdown', () => { isSeeking = true; });
  ui.seek.addEventListener('pointerup',   () => {
    isSeeking = false;
    if (seq && seq.duration > 0) {
      seq.currentTime = (Number(ui.seek.value) / 1000) * seq.duration;
    }
  });

  // P10: MIDI file upload
  ui.fileInput.addEventListener('change', () => handleUpload());

  window._sf2Buffer = sfBuffer;

  setStatus('Crank the box to play  ↻');
  setControlsEnabled(true);
  ready = true;
}

// ─────────────────────────────────────────────────────────────────
//  AUDIO CONTEXT — lazy, on first user gesture
// ─────────────────────────────────────────────────────────────────
async function ensureAudioContext() {
  if (context) {
    await context.resume();
    return;
  }

  setStatus('Starting audio…');

  // P6: Tell iOS to treat this page's audio as media playback,
  // which routes it through the media volume channel and ignores
  // the hardware ringer/silent switch. Requires Safari 16.4+.
  // The feature-detect guard makes it safe on all other browsers.
  if ('audioSession' in navigator) {
    navigator.audioSession.type = 'playback';
  }

  context = new AudioContext();
  await context.audioWorklet.addModule(WORKLET_PATH);

  synth = new WorkletSynthesizer(context);

  // P8: Insert a dynamics compressor between the synth and destination.
  // This softens harsh peaks without squashing the overall dynamic range.
  // Tune threshold and ratio to taste — more negative threshold = more compression.
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -18;  // dB — start compressing at -18 dBFS
  compressor.knee.value      =   6;  // dB of soft knee (gentle onset)
  compressor.ratio.value     =   4;  // 4:1 ratio — moderate, not "radio" compression
  compressor.attack.value    =   0.003;  // seconds — fast enough to catch transients
  compressor.release.value   =   0.25;   // seconds — slow enough to avoid pumping

  synth.connect(compressor);
  compressor.connect(context.destination);

  await synth.soundBankManager.addSoundBank(window._sf2Buffer, 'minecraft');

  // P5: Apply the perceptual gain curve to the pending slider value.
  synth.setMasterParameter("masterGain", sliderToGain(pendingSlider));

  seq = new Sequencer(synth);
  seq.loop = false;

  // P7: Load the UI click sound now that the context exists
  loadUiSound();

  setStatus('Ready');
}

// ─────────────────────────────────────────────────────────────────
//  PLAYBACK CONTROLS
// ─────────────────────────────────────────────────────────────────
async function togglePlay() {
  if (!ready) return;

  await ensureAudioContext();

  if (playing) {
    seq.pause();
    playing = false;
    ui.play.innerHTML = '&#9654;';
    setStatus('Paused');
    console.log('[MusicPlayer] ⏸ PAUSE — track:', window._currentSong);
    window._currentSong = '';
    if (window.onMusicPause) window.onMusicPause();
  } else {
    if (!songLoaded) {
      await loadTrack(current, false);
    }
    seq.play();
    playing = true;
    ui.play.innerHTML = '&#9646;&#9646;';
    setStatus('Playing');
    if (!window._currentSong) {
      window._currentSong = (tracks[current] || '').split('/').pop();
    }
    console.log('[MusicPlayer] ▶ PLAY (togglePlay) — _currentSong:', window._currentSong, '| index:', current);
    if (window.onMusicPlay) window.onMusicPlay();
  }

  startSeekLoop();
}

async function loadTrack(index, autoPlay = true) {
  if (!tracks[index]) return;
  current = index;
  syncUrlToTrack(index);
  if (browseOpen) renderResults();
  updateTrackName(index);

  if (!context) {
    if (autoPlay) await togglePlay();
    return;
  }

  setStatus('Loading…');
  try {
    const song = await getMidiBuffer(tracks[index]);
    seq.loadNewSongList([song]);
    songLoaded = true;

    window._currentSong = (tracks[index] || '').split('/').pop();
    console.log('[MusicPlayer] 📀 track loaded — _currentSong set to:', window._currentSong);

    if (autoPlay) {
      seq.play();
      playing = true;
      ui.play.innerHTML = '&#9646;&#9646;';
      setStatus('Playing');
      const currentTrackPath = tracks[index];
      console.log('[MusicPlayer] ▶ PLAY (loadTrack) — index:', index, '| path:', currentTrackPath);
      window._currentSong = currentTrackPath?.split('/').pop() || '';
      if (window.onMusicPlay) window.onMusicPlay();
      startSeekLoop();
    } else {
      setStatus('Ready');
    }
  } catch (e) {
    setStatus('⚠ Could not load track');
    console.error(e);
  }
}

function prevTrack() {
  const idx = (current - 1 + tracks.length) % tracks.length;
  loadTrack(idx, playing);
}

function nextTrack() {
  const idx = (current + 1) % tracks.length;
  loadTrack(idx, playing);
}

function shuffleTrack() {
  if (tracks.length <= 1) return;
  let idx;
  do { idx = Math.floor(Math.random() * tracks.length); } while (idx === current);

  ui.shuffle.classList.add('active');
  setTimeout(() => ui.shuffle.classList.remove('active'), 500);

  loadTrack(idx, playing);
}

// P5: Map slider position → perceptual gain via 4th-power curve.
// The slider HTML attribute stays 0–1; only the value sent to the synth changes.
function setVolume(sliderVal) {
  pendingSlider = sliderVal;
  if (synth) synth.setMasterParameter("masterGain", sliderToGain(sliderVal));
}

function updateTrackName(index) {
  ui.trackName.textContent = '♪  ' + friendlyName(tracks[index]);
}

// ─────────────────────────────────────────────────────────────────
//  P10 — USER MIDI UPLOAD
// ─────────────────────────────────────────────────────────────────
// The file is read entirely in memory and passed directly to the
// sequencer. Nothing is uploaded to any server. The file is gone
// on page reload and does not affect the permanent track list.
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB guard

async function handleUpload() {
  const file = ui.fileInput.files[0];
  if (!file) return;

  // Reset input so the same file can be re-uploaded if needed
  ui.fileInput.value = '';

  if (file.size > MAX_UPLOAD_BYTES) {
    setStatus('⚠ File too large (max 5 MB)');
    return;
  }

  playUiSound();
  setStatus('Loading uploaded file…');

  await ensureAudioContext();

  let arrayBuf;
  try {
    arrayBuf = await file.arrayBuffer();
  } catch (e) {
    setStatus('⚠ Could not read file');
    console.error(e);
    return;
  }

  try {
    const song = { binary: arrayBuf, midiName: file.name };
    seq.loadNewSongList([song]);
    songLoaded = true;

    // Stamp _currentSong with the filename (without extension) so easter
    // egg triggers still work — e.g. uploading i_feel_pretty_1957_-_bernstein.mid
    // will show the Minecraft overlay. This is intentional.
    window._currentSong = file.name.replace(/\.midi?$/i, '');

    const displayName = file.name.replace(/\.midi?$/i, '').replace(/[_\-]+/g, ' ');
    ui.trackName.textContent = '♪  ' + displayName;
    // Don't touch the deep-link URL or browse highlight — the upload is a
    // transient track outside the permanent list. Prev/next still return
    // to the permanent list correctly.

    seq.play();
    playing = true;
    ui.play.innerHTML = '&#9646;&#9646;';
    setStatus('Playing uploaded file');
    if (window.onMusicPlay) window.onMusicPlay();
    startSeekLoop();
  } catch (e) {
    setStatus('⚠ Invalid MIDI file');
    console.error('[MusicPlayer] Upload failed:', e);
  }
}

// ─────────────────────────────────────────────────────────────────
//  SEEK BAR LOOP
// ─────────────────────────────────────────────────────────────────
let seekLoopRunning = false;
let isSeeking       = false;

function startSeekLoop() {
  if (seekLoopRunning) return;
  seekLoopRunning = true;

  function tick() {
    if (!seq || !playing) { seekLoopRunning = false; return; }

    if (seq.isFinished) {
      playing = false;
      ui.play.innerHTML = '&#9654;';
      seekLoopRunning = false;
      console.log('[MusicPlayer] ⏹ SONG END — finished:', tracks[current]);
      if (window.onMusicEnd) window.onMusicEnd();
      const idx = (current + 1) % tracks.length;
      console.log('[MusicPlayer]   → auto-advancing to index:', idx, '|', tracks[idx]);
      loadTrack(idx, true);
      return;
    }

    if (!isSeeking) {
      const cur   = seq.currentTime || 0;
      const total = seq.duration    || 0;
      if (total > 0) {
        const progress = Math.min(cur / total, 1);
        ui.seek.value            = Math.round(progress * 1000);
        ui.timeCur.textContent   = formatTime(cur);
        ui.timeTotal.textContent = formatTime(total);
      }
    }

    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

// ─────────────────────────────────────────────────────────────────
//  PUBLIC API
// ─────────────────────────────────────────────────────────────────
window.musicPlayer = {
  play()  { if (!playing) togglePlay(); },
  pause() { if (playing)  togglePlay(); },
  next:      nextTrack,
  prev:      prevTrack,
  shuffle:   shuffleTrack,
  isPlaying: () => playing,
};

// ─────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────
init();