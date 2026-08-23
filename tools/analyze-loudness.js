#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  ANALYZE LOUDNESS
//
//  Renders MIDIs in midilist.json offline through spessasynth_core
//  (the same engine that powers playback, just driven headlessly — no
//  AudioContext/Worklet needed) and measures RMS loudness. From that
//  it derives a per-track gain multiplier that normalizes every song
//  toward a common target loudness, à la ReplayGain.
//
//  Output: volumeAdjustments.json  ({ "<slug>": gainMultiplier, ...,
//                                      "__meta__": { targetRms, ... } })
//
//  Two modes:
//    node tools/analyze-loudness.js            INCREMENTAL (default)
//      Only analyzes tracks that aren't already a key in the existing
//      volumeAdjustments.json, reusing the stored target loudness.
//      Fast — use this every time you add a song.
//
//    node tools/analyze-loudness.js --full     FULL RE-ANALYSIS
//      Re-renders every track and recomputes the target loudness from
//      scratch (the corpus median shifts slightly as songs are added,
//      so every track's gain gets nudged). Slow (~35s/track × N).
//      Run this once up front, and occasionally afterward (e.g. after
//      adding a batch of songs) to keep the whole table well-calibrated.
//
//  Run from the repo root.
// ─────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { SpessaSynthProcessor, SpessaSynthSequencer, SoundBankLoader, BasicMIDI } from '../lib/spessasynth_core.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Config ─────────────────────────────────────────────────────────
const REPO_ROOT      = path.join(__dirname, '..');
const LIST_PATH       = path.join(REPO_ROOT, 'midilist.json');
const SF2_PATH         = path.join(REPO_ROOT, 'soundfonts', 'minecraft3.sf2');
const OUT_PATH        = path.join(REPO_ROOT, 'volumeAdjustments.json');

const SAMPLE_RATE     = 22050;  // lower than playback rate — plenty for RMS, much faster to render
const BLOCK_SIZE      = 128;    // matches spessasynth's internal render quantum
const ANALYZE_SECONDS  = 45;    // only render/measure the first N seconds of each song
const TARGET_PEAK_HEADROOM = 0.95; // don't let a boosted track's peak exceed this (0-1)
const MIN_GAIN        = 0.4;    // clamp so quiet tracks don't get boosted into noise/distortion
const MAX_GAIN        = 2.5;    // clamp so already-loud tracks don't get pushed further

const META_KEY = '__meta__';

// ── CLI args ──────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const FULL_MODE = argv.includes('--full');
const limitArg = argv.find(a => a.startsWith('--limit='));
const TEST_LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) || 0 : 0;

// ── Helpers ───────────────────────────────────────────────────────
function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function slugFor(trackPath) {
  return trackPath.split('/').pop().replace(/\.midi?$/i, '');
}

function loadExistingTable() {
  try {
    const raw = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
    const meta = raw[META_KEY] || null;
    const gains = { ...raw };
    delete gains[META_KEY];
    return { gains, meta };
  } catch (e) {
    return { gains: {}, meta: null };
  }
}

// Renders `seconds` of audio for one parsed MIDI and returns { rms, peak }.
// Mirrors the block-stepping loop spessasynth_lib uses internally for its
// own offline renderAudio() worker (processTick() then process() per block).
function analyzeTrack(parsedFont, midiData, seconds) {
  const synth = new SpessaSynthProcessor(SAMPLE_RATE, { enableEventSystem: false });
  synth.soundBankManager.addSoundBank(parsedFont, 'main');
  synth.setMasterParameter('autoAllocateVoices', true);
  // Keep this at a neutral default — we want to measure the song's
  // *intrinsic* loudness (velocities × soundfont sample levels), not
  // whatever masterGain the player happened to be set to.
  synth.setMasterParameter('masterGain', 1.0);

  const seq = new SpessaSynthSequencer(synth);
  seq.loadNewSongList([midiData]);
  seq.play();

  const durationSeconds = Math.min(midiData.duration, seconds);
  const sampleCount = Math.max(1, Math.floor(durationSeconds * SAMPLE_RATE));

  const left  = new Float32Array(sampleCount);
  const right = new Float32Array(sampleCount);

  let index = 0;
  while (index < sampleCount) {
    seq.processTick();
    const n = Math.min(BLOCK_SIZE, sampleCount - index);
    synth.process(left, right, index, n);
    index += n;
  }

  let sumSquares = 0;
  let peak = 0;
  for (let i = 0; i < sampleCount; i++) {
    const l = left[i], r = right[i];
    const mono = (l + r) * 0.5;
    sumSquares += mono * mono;
    const absMax = Math.max(Math.abs(l), Math.abs(r));
    if (absMax > peak) peak = absMax;
  }
  const rms = Math.sqrt(sumSquares / sampleCount);

  return { rms, peak };
}

function gainFor(rms, peak, targetRms) {
  let gain = rms > 0 ? targetRms / rms : 1.0;
  gain = Math.min(Math.max(gain, MIN_GAIN), MAX_GAIN);
  let clipped = false;
  if (peak > 0) {
    const maxSafeGain = TARGET_PEAK_HEADROOM / peak;
    if (gain > maxSafeGain) { gain = maxSafeGain; clipped = true; }
  }
  return { gain: Math.round(gain * 1000) / 1000, clipped };
}

function main() {
  let allTracks;
  try {
    allTracks = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${LIST_PATH}:`, e.message);
    process.exit(1);
  }

  const { gains: existingGains, meta: existingMeta } = loadExistingTable();
  const haveExisting = Object.keys(existingGains).length > 0;

  // Decide which tracks actually need rendering this run.
  let candidates;
  if (FULL_MODE || !haveExisting) {
    candidates = allTracks;
  } else {
    candidates = allTracks.filter(t => !(slugFor(t) in existingGains));
  }
  if (TEST_LIMIT > 0) candidates = candidates.slice(0, TEST_LIMIT);

  if (candidates.length === 0) {
    console.log(`Nothing new to analyze — all ${allTracks.length} tracks already in volumeAdjustments.json.`);
    console.log('Pass --full to force a complete re-analysis.');
    return;
  }

  // Incremental mode needs a stored target to normalize new tracks against.
  // If the existing file predates __meta__ (i.e. came from before this was
  // added), we can't safely reuse it — ask for one full run to upgrade it.
  if (!FULL_MODE && haveExisting && (!existingMeta || typeof existingMeta.targetRms !== 'number')) {
    console.error('Existing volumeAdjustments.json has no stored target loudness (__meta__.targetRms) —');
    console.error('it looks like it was generated by an older version of this script.');
    console.error('Run once with --full to upgrade it, then incremental runs will work normally.');
    process.exit(1);
  }

  console.log(FULL_MODE || !haveExisting
    ? `Full analysis: ${candidates.length} track(s).`
    : `Incremental analysis: ${candidates.length} new track(s) (${allTracks.length - candidates.length} already in the table).`);

  console.log(`Loading soundfont: ${SF2_PATH}`);
  let parsedFont;
  try {
    const sfBuf = fs.readFileSync(SF2_PATH);
    parsedFont = SoundBankLoader.fromArrayBuffer(toArrayBuffer(sfBuf));
  } catch (e) {
    console.error('Could not load/parse soundfont:', e.message);
    process.exit(1);
  }

  const results = []; // [{ slug, path, rms, peak }]
  const startedAt = Date.now();

  candidates.forEach((trackPath, i) => {
    const slug = slugFor(trackPath);
    process.stdout.write(`[${i + 1}/${candidates.length}] ${slug} … `);
    try {
      const midiBuf = fs.readFileSync(path.join(REPO_ROOT, trackPath));
      const midiData = BasicMIDI.fromArrayBuffer(toArrayBuffer(midiBuf), trackPath);
      const { rms, peak } = analyzeTrack(parsedFont, midiData, ANALYZE_SECONDS);
      results.push({ slug, path: trackPath, rms, peak });
      console.log(`rms=${rms.toFixed(4)} peak=${peak.toFixed(3)}`);
    } catch (e) {
      console.log(`⚠ FAILED: ${e.message}`);
    }
  });

  if (results.length === 0) {
    console.error('No tracks were successfully analyzed — aborting (existing table left untouched).');
    process.exit(1);
  }

  // Target loudness = median RMS. In full mode it's recomputed fresh from
  // this run's results; in incremental mode we reuse the value already
  // stored so existing tracks' gains don't shift just because one song
  // was added.
  let targetRms;
  if (FULL_MODE || !haveExisting) {
    const sortedRms = results.map(r => r.rms).sort((a, b) => a - b);
    targetRms = sortedRms[Math.floor(sortedRms.length / 2)];
  } else {
    targetRms = existingMeta.targetRms;
  }

  const table = FULL_MODE ? {} : { ...existingGains };
  let clipWarnings = 0;

  for (const r of results) {
    const { gain, clipped } = gainFor(r.rms, r.peak, targetRms);
    if (clipped) clipWarnings++;
    table[r.slug] = gain;
  }

  // Drop entries for songs no longer in midilist.json (renamed/removed).
  const currentSlugs = new Set(allTracks.map(slugFor));
  for (const slug of Object.keys(table)) {
    if (!currentSlugs.has(slug)) delete table[slug];
  }

  table[META_KEY] = {
    targetRms,
    trackCount: Object.keys(table).length - 0, // computed below after meta excluded
    lastFullRun: (FULL_MODE || !haveExisting) ? new Date().toISOString() : (existingMeta && existingMeta.lastFullRun) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  table[META_KEY].trackCount = Object.keys(table).length - 1; // exclude __meta__ itself

  fs.writeFileSync(OUT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');

  const gains = Object.entries(table).filter(([k]) => k !== META_KEY).map(([, v]) => v);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\n✓ Analyzed ${results.length} track(s) in ${elapsed}s`);
  console.log(`  Target RMS: ${targetRms.toFixed(4)}`);
  console.log(`  Gain range across all ${gains.length} tracks: ${Math.min(...gains).toFixed(2)}× – ${Math.max(...gains).toFixed(2)}×`);
  console.log(`  Peak-limited this run: ${clipWarnings} track(s)`);
  console.log(`  Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
}

main();
