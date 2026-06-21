#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  REBUILD MIDILIST
//
//  Rescans ./midi/*.mid (and .midi) and rewrites midilist.json from
//  scratch, sorted the same way the current file already is. This
//  means you never hand-edit that JSON array (and risk a stray or
//  missing comma breaking the whole site) — just drop a file in
//  ./midi/ and run this.
//
//  Run from the repo root:
//    node tools/rebuild-midilist.js
// ─────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const MIDI_DIR  = path.join(REPO_ROOT, 'midi');
const LIST_PATH = path.join(REPO_ROOT, 'midilist.json');

function main() {
  let files;
  try {
    files = fs.readdirSync(MIDI_DIR);
  } catch (e) {
    console.error(`Could not read ${MIDI_DIR}:`, e.message);
    process.exit(1);
  }

  const tracks = files
    .filter(f => /\.midi?$/i.test(f))
    .sort((a, b) => a.localeCompare(b))
    .map(f => `./midi/${f}`);

  if (tracks.length === 0) {
    console.error('No .mid/.midi files found in ./midi — refusing to overwrite midilist.json with an empty list.');
    process.exit(1);
  }

  let previous = [];
  try {
    previous = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  } catch (e) { /* fine — first run, or the file didn't exist yet */ }

  const previousSet = new Set(previous);
  const currentSet  = new Set(tracks);
  const added   = tracks.filter(t => !previousSet.has(t));
  const removed = previous.filter(t => !currentSet.has(t));

  fs.writeFileSync(LIST_PATH, JSON.stringify(tracks, null, 2) + '\n', 'utf8');

  console.log(`✓ Wrote ${tracks.length} tracks to midilist.json`);
  if (added.length)   console.log(`  + added:   ${added.map(t => t.split('/').pop()).join(', ')}`);
  if (removed.length) console.log(`  − removed: ${removed.map(t => t.split('/').pop()).join(', ')}`);
  if (!added.length && !removed.length) console.log('  (no changes)');
}

main();
