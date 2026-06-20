#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  ANALYZE LOUDNESS  (draft — see VOLUME_NORMALIZATION_PLAN.md)
//
//  Renders every MIDI in midilist.json offline through spessasynth_core
//  (the same engine that powers playback, just driven headlessly — no
//  AudioContext/Worklet needed) and measures its RMS loudness. From
//  that it derives a per-track gain multiplier that normalizes every
//  song toward a common target loudness, à la ReplayGain.
//
//  Output: volumeAdjustments.json  ({ "<slug>": gainMultiplier, ... })
//
//  Run from the repo root:
//    node tools/analyze-loudness.js
//
//  ⚠ DRAFT STATUS: I wrote this against spessasynth_core's documented
//  API (SpessaSynthProcessor / SpessaSynthSequencer / SoundBankLoader /
//  BasicMIDI, all confirmed pure-JS exports — no browser dependency)
//  and modeled the render loop directly on spessasynth_lib's own
//  renderAudioWorker implementation. But I don't have your actual .mid
//  files or minecraft3.sf2 in my sandbox (and no network access) to
//  run it end-to-end. Please test on 3–5 tracks first (see TEST_LIMIT
//  below) and sanity-check the output before running the full batch
//  or wiring it into script.js.
// ─────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const { SpessaSynthProcessor, SpessaSynthSequencer, SoundBankLoader, BasicMIDI } =
  require('../lib/spessasynth_core.js');

// ── Config ─────────────────────────────────────────────────────────
const REPO_ROOT     = path.join(__dirname, '..');
const LIST_PATH      = path.join(REPO_ROOT, 'midilist.json');
const SF2_PATH        = path.join(REPO_ROOT, 'minecraft3.sf2');
const OUT_PATH       = path.join(REPO_ROOT, 'volumeAdjustments.json');

const SAMPLE_RATE    = 22050;  // lower than playback rate — plenty for RMS, much faster to render
const BLOCK_SIZE     = 128;    // matches spessasynth's internal render quantum
const ANALYZE_SECONDS = 45;    // only render/measure the first N seconds of each song
const TARGET_PEAK_HEADROOM = 0.95; // don't let a boosted track's peak exceed this (0-1)
const MIN_GAIN       = 0.4;    // clamp so quiet tracks don't get boosted into noise/distortion
const MAX_GAIN       = 2.5;    // clamp so already-loud tracks don't get pushed further
const TEST_LIMIT     = 0;      // set e.g. 5 to dry-run on just the first 5 tracks while validating

// ── Helpers ───────────────────────────────────────────────────────
function toArrayBuffer(buf) {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

function slugFor(trackPath) {
  return trackPath.split('/').pop().replace(/\.midi?$/i, '');
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

function main() {
  let tracks;
  try {
    tracks = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${LIST_PATH}:`, e.message);
    process.exit(1);
  }
  if (TEST_LIMIT > 0) tracks = tracks.slice(0, TEST_LIMIT);

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

  tracks.forEach((trackPath, i) => {
    const slug = slugFor(trackPath);
    process.stdout.write(`[${i + 1}/${tracks.length}] ${slug} … `);
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
    console.error('No tracks were successfully analyzed — aborting.');
    process.exit(1);
  }

  // Target loudness = median RMS across the corpus. Using the median
  // (rather than the mean) keeps a handful of unusually loud/quiet
  // outliers from dragging the target around — most songs end up
  // needing only a modest correction, a few outliers get a bigger one.
  const sortedRms = results.map(r => r.rms).sort((a, b) => a - b);
  const targetRms = sortedRms[Math.floor(sortedRms.length / 2)];

  const table = {};
  let clipWarnings = 0;

  for (const r of results) {
    let gain = r.rms > 0 ? targetRms / r.rms : 1.0;
    gain = Math.min(Math.max(gain, MIN_GAIN), MAX_GAIN);

    // Don't let the correction push this track's peak into clipping.
    if (r.peak > 0) {
      const maxSafeGain = TARGET_PEAK_HEADROOM / r.peak;
      if (gain > maxSafeGain) {
        gain = maxSafeGain;
        clipWarnings++;
      }
    }

    table[r.slug] = Math.round(gain * 1000) / 1000; // 3 decimal places
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(table, null, 2) + '\n', 'utf8');

  const gains = Object.values(table);
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(`\n✓ Analyzed ${results.length}/${tracks.length} tracks in ${elapsed}s`);
  console.log(`  Target RMS: ${targetRms.toFixed(4)}`);
  console.log(`  Gain range: ${Math.min(...gains).toFixed(2)}× – ${Math.max(...gains).toFixed(2)}×`);
  console.log(`  Peak-limited (would've clipped): ${clipWarnings} track(s)`);
  console.log(`  Wrote ${path.relative(REPO_ROOT, OUT_PATH)}`);
  if (TEST_LIMIT > 0) {
    console.log(`\n(TEST_LIMIT=${TEST_LIMIT} — only a sample was analyzed. Set TEST_LIMIT = 0 and re-run for the full library once this looks right.)`);
  }
}

main();
