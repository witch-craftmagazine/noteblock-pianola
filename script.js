// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — MIDI PLAYER
//  Uses spessasynth_lib with minecraft2.sf2
//  Reads track list from midilist.json
// ─────────────────────────────────────────────────────────────────

import { Sequencer, WorkletSynthesizer } 
from "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.2.11/dist/spessasynth_lib.es.js";

const SF2_PATH     = './minecraft2.sf2';
const WORKLET_PATH = "https://cdn.jsdelivr.net/npm/spessasynth_lib@4.2.11/dist/spessasynth_processor.min.js";
const LIST_PATH    = './midilist.json';

// ── State ──────────────────────────────────────────────────────────
let context       = null;
let synth         = null;
let seq           = null;
let tracks        = [];
let current       = 0;
let ready         = false;
let playing       = false;
let songLoaded    = false;
let pendingVolume = 0.8;   // applied to synth once audio context is created

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
      <input id="mp-vol" type="range" min="0" max="1" value="0.8" step="0.01"/>
    </div>
    <select id="mp-list"></select>
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
    #mp-play    { min-width: 48px; font-size: 15px !important; }
    /* Shuffle button */
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
    #mp-list {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 6px;
      color: #e8d5a3;
      font-family: monospace;
      font-size: 11px;
      padding: 4px 6px;
      cursor: pointer;
      max-height: 28px;
    }
    #mp-list option { background: #1a0e08; }
    #mp-status {
      font-size: 10px;
      opacity: 0.45;
      text-align: center;
      letter-spacing: 0.06em;
      min-height: 14px;
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
    list      : panel.querySelector('#mp-list'),
    status    : panel.querySelector('#mp-status'),
  };

  setControlsEnabled(false);
}

// ─────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────
function setControlsEnabled(on) {
  [ui.play, ui.prev, ui.next, ui.shuffle, ui.seek, ui.list].forEach(el => {
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
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = friendlyName(path);
    ui.list.appendChild(opt);
  });

  // Goal 2: Start on a random track instead of always track 0
  if (tracks.length > 1) {
    current = Math.floor(Math.random() * tracks.length);
  }
  ui.list.value = current;
  updateTrackName(current);

  // 2. Load soundfont
  setStatus('Loading soundfont…');
  let sfBuffer;
  try {
    const res = await fetch(SF2_PATH);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sfBuffer = await res.arrayBuffer();
  } catch (e) {
    setStatus('⚠ Could not load minecraft2.sf2');
    console.error(e);
    return;
  }

  // 3. Wire UI events
  ui.play.addEventListener('click', () => togglePlay());
  ui.prev.addEventListener('click', () => prevTrack());
  ui.next.addEventListener('click', () => nextTrack());
  ui.list.addEventListener('change', () => loadTrack(Number(ui.list.value), true));
  ui.vol.addEventListener('input',   () => setVolume(Number(ui.vol.value)));

  // Goal 2: Shuffle button
  ui.shuffle.addEventListener('click', () => shuffleTrack());

  ui.seek.addEventListener('pointerdown', () => { isSeeking = true; });
  ui.seek.addEventListener('pointerup',   () => {
    isSeeking = false;
    if (seq && seq.duration > 0) {
      seq.currentTime = (Number(ui.seek.value) / 1000) * seq.duration;
    }
  });

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

  context = new AudioContext();
  await context.audioWorklet.addModule(WORKLET_PATH);

  synth = new WorkletSynthesizer(context);
  synth.connect(context.destination);

  await synth.soundBankManager.addSoundBank(window._sf2Buffer, 'minecraft');

  // Apply any volume the user set before audio context existed
  synth.masterVolume = pendingVolume;

  seq = new Sequencer(synth);
  seq.loop = false;   // let songs finish naturally; seek loop polls isFinished

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
    if (window.onMusicPause) window.onMusicPause();
  } else {
    if (!songLoaded) {
      await loadTrack(current, false);
    }
    seq.play();
    playing = true;
    ui.play.innerHTML = '&#9646;&#9646;';
    setStatus('Playing');
    if (window.onMusicPlay) window.onMusicPlay();
  }

  startSeekLoop();
}

async function loadTrack(index, autoPlay = true) {
  if (!tracks[index]) return;
  current = index;
  ui.list.value = index;
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

    if (autoPlay) {
      seq.play();
      playing = true;
      ui.play.innerHTML = '&#9646;&#9646;';
      setStatus('Playing');
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

// Goal 2: Pick a random track that isn't the current one
function shuffleTrack() {
  if (tracks.length <= 1) return;
  let idx;
  do {
    idx = Math.floor(Math.random() * tracks.length);
  } while (idx === current);

  // Brief visual feedback on the button
  ui.shuffle.classList.add('active');
  setTimeout(() => ui.shuffle.classList.remove('active'), 500);

  loadTrack(idx, playing);
}

function setVolume(v) {
  pendingVolume = v;
  if (synth) synth.masterVolume = v;
}

function updateTrackName(index) {
  ui.trackName.textContent = '♪  ' + friendlyName(tracks[index]);
}

// ─────────────────────────────────────────────────────────────────
//  SEEK BAR LOOP
// ─────────────────────────────────────────────────────────────────
let seekLoopRunning = false;
let isSeeking       = false;   // true while user drags the seek thumb

function startSeekLoop() {
  if (seekLoopRunning) return;
  seekLoopRunning = true;

  function tick() {
    if (!seq || !playing) { seekLoopRunning = false; return; }

    // Auto-advance when song finishes naturally
    if (seq.isFinished) {
      playing = false;
      ui.play.innerHTML = '&#9654;';
      seekLoopRunning = false;
      nextTrack();
      return;
    }

    // Don't move the thumb while the user is dragging it
    if (!isSeeking) {
      const cur      = seq.currentTime  || 0;
      const total    = seq.duration     || 0;
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
  play() {
    if (!playing) togglePlay();
  },
  pause() {
    if (playing) togglePlay();
  },
  next: nextTrack,
  prev: prevTrack,
  shuffle: shuffleTrack,
  isPlaying: () => playing,

  onCrankTurn(dx) {
    // Hook reserved for future haptic/visual feedback
  },
};

window.onCrankTurn = (dx) => {
  window.musicPlayer.onCrankTurn(dx);
};

// ─────────────────────────────────────────────────────────────────
//  START
// ─────────────────────────────────────────────────────────────────
init();
