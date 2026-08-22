#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  SYNC — runs the whole "I added/changed a song" pipeline in one go:
//
//    1. rebuild-midilist.js      rescans ./midi, rewrites midilist.json
//    2. generate-share-pages.js  regenerates each song's OG-preview page
//    3. analyze-loudness.js      analyzes any new tracks' loudness
//                                 (incremental by default — fast)
//
//  Usage:
//    node tools/sync.js            normal — only analyzes new tracks
//    node tools/sync.js --full     also forces a full loudness re-analysis
//                                   of every track (slower; run this every
//                                   so often, not on every single add)
// ─────────────────────────────────────────────────────────────────

import { execFileSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const full = process.argv.includes('--full');

const steps = [
  ['rebuild-midilist.js', []],
  ['generate-share-pages.js', []],
  ['analyze-loudness.js', full ? ['--full'] : []],
];

for (const [script, args] of steps) {
  console.log(`\n── ${script}${args.length ? ' ' + args.join(' ') : ''} ${'─'.repeat(Math.max(0, 50 - script.length))}`);
  try {
    execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
  } catch (e) {
    console.error(`\n✗ ${script} failed — stopping here. Fix the issue above and re-run.`);
    process.exit(1);
  }
}

console.log(`
✓ Sync complete. Review what changed, then commit + push:

  git status
  git add midi/ midilist.json song/ volumeAdjustments.json
  git commit -m "Add new song(s)"
  git push
`);
