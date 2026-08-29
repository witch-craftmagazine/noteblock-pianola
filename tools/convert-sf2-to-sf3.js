#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  CONVERT SF2 → SF3
//
//  Batch-converts soundfonts/*.sf2 to .sf3 (same SF2 RIFF container,
//  but sample data is Ogg Vorbis-compressed instead of raw PCM —
//  typically 4-10x smaller). This is a scope addition on top of the
//  original iOS-shell handoff: soundfonts ship *inside* the app
//  bundle (staged into web/ at build time — see
//  noteblock-pianola-ios-shell/README.md), so this is app bundle
//  size, not just a network-fetch optimization.
//
//  Deliberately reuses rather than reimplements:
//    - lib/spessasynth_core.js's own SF2 reader/writer
//      (SoundBankLoader.fromArrayBuffer + BasicSoundBank#writeSF2)
//      handles the SF2↔SF3 container format — same code the app
//      itself uses to read soundfonts at runtime, so a round-tripped
//      file is guaranteed to be something the app can already load.
//    - `compressionFunction` is exactly the hook
//      noteblock-pianola-ios-shell already wires spessasynth's own
//      *browser* worker through (see lib/spessasynth_lib.js's
//      `workerSynthWriteFile` handler) — same shape:
//      `(audioData: Float32Array, sampleRate, quality) => Uint8Array`.
//      spessasynth only bundles a Vorbis *decoder* (stb_vorbis, for
//      playback) — no encoder — so this script supplies one itself
//      by shelling out to `ffmpeg -c:a libvorbis`, one call per
//      sample, rather than pulling in a WASM Vorbis encoder
//      dependency for a tool that only needs to run occasionally,
//      by hand, on a dev machine.
//
//  Requires `ffmpeg` built with libvorbis on $PATH (already the case
//  in this project's CI/dev containers — see
//  .github/workflows/ios-build.yml for what else assumes a similar
//  toolchain; if `ffmpeg -version` doesn't mention `--enable-libvorbis`,
//  this script exits early with a clear message rather than failing
//  confusingly partway through a large bank).
//
//  Usage:
//    node tools/convert-sf2-to-sf3.js                    convert every
//                                                         soundfonts/*.sf2
//    node tools/convert-sf2-to-sf3.js minecraft3.sf2      convert just this
//                                                         one (name or path)
//    node tools/convert-sf2-to-sf3.js --quality=6         Vorbis quality,
//                                                         0 (smallest/worst)
//                                                         to 10 (largest/best)
//                                                         — default 4, a
//                                                         reasonable
//                                                         size/quality
//                                                         trade-off for
//                                                         background MIDI
//                                                         playback
//    node tools/convert-sf2-to-sf3.js --keep-original     leave the .sf2
//                                                         next to the new
//                                                         .sf3 instead of
//                                                         deleting it
//    node tools/convert-sf2-to-sf3.js --dry-run           report sizes
//                                                         without writing
//                                                         anything
//
//  After conversion (unless --keep-original), any soundfonts/manifest.json
//  entry whose `file` pointed at the now-deleted .sf2 is rewritten to
//  point at the new .sf3 — `id`/`label` are left untouched, since those
//  are the stable identifiers (localStorage + ?sf= deep links) and must
//  survive a format change to the same underlying bank. This is
//  deliberately NOT something tools/generate-soundfont-manifest.js does:
//  that script only ever appends new entries or (with --prune) removes
//  ones whose file vanished — renaming an existing entry's `file` in
//  place is this script's job specifically, since this script is the
//  one doing the rename.
//
//  Spot-check a few converted banks by ear before committing — lossy
//  Vorbis compression is usually inaudible on smooth pads but can be
//  more noticeable on percussive/short one-shot samples (this project's
//  "8bit" soundfont is a plausible one to check first).
// ─────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.join(__dirname, '..');

const SOUNDFONTS_DIR = path.join(REPO_ROOT, 'soundfonts');
const MANIFEST_PATH  = path.join(SOUNDFONTS_DIR, 'manifest.json');
const CORE_LIB_PATH  = path.join(REPO_ROOT, 'lib', 'spessasynth_core.js');

const args = process.argv.slice(2);
const dryRun        = args.includes('--dry-run');
const keepOriginal   = args.includes('--keep-original');
const qualityArg    = args.find(a => a.startsWith('--quality='));
const quality       = qualityArg ? Number(qualityArg.split('=')[1]) : 4;
const explicitFiles = args.filter(a => !a.startsWith('--'));

if (!Number.isFinite(quality) || quality < 0 || quality > 10) {
  console.error(`✗ --quality must be a number 0-10 (got "${qualityArg}").`);
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────
//  Vorbis encoder — shells out to ffmpeg per sample. This is the
//  `encodeVorbis(audioData, sampleRate)` hook spessasynth's own
//  BasicSample#compressSample expects (see lib/spessasynth_core.js).
//
//  Uses spawn() with the two streams drained/written concurrently,
//  NOT execFile()'s `input` convenience option — that option writes
//  the whole input buffer to stdin first and only then starts reading
//  stdout, which deadlocks against ffmpeg here: ffmpeg starts writing
//  compressed Ogg data to its stdout pipe before it has finished
//  reading all of stdin, that pipe's OS buffer fills because nothing
//  is draining it yet, and ffmpeg blocks on the write — while Node is
//  still blocked trying to finish writing stdin. Confirmed by direct
//  reproduction: execFile's `input` option hangs on this exact
//  command even with a 1000-byte input; writing stdin and draining
//  stdout concurrently (below) does not.
// ─────────────────────────────────────────────────────────────────
function encodeVorbis(audioData, sampleRate) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-nostdin',
      '-f', 'f32le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0',
      '-c:a', 'libvorbis', '-q:a', String(quality),
      '-f', 'ogg', 'pipe:1',
    ]);

    const outChunks = [];
    let stderrText = '';

    proc.stdout.on('data', chunk => outChunks.push(chunk));
    proc.stderr.on('data', chunk => { stderrText += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}${stderrText ? `: ${stderrText.trim()}` : ''}`));
        return;
      }
      const out = Buffer.concat(outChunks);
      resolve(new Uint8Array(out.buffer, out.byteOffset, out.byteLength));
    });

    // audioData is a Float32Array of mono PCM samples — write it as
    // raw f32le. Writing then ending stdin here happens concurrently
    // with the 'data' listeners above, not before them.
    const input = Buffer.from(audioData.buffer, audioData.byteOffset, audioData.byteLength);
    proc.stdin.write(input);
    proc.stdin.end();
  });
}

async function checkFfmpeg() {
  let versionOutput;
  try {
    versionOutput = (await execFileAsync('ffmpeg', ['-version'])).stdout.toString();
  } catch (e) {
    console.error('✗ ffmpeg not found on $PATH. Install it (with libvorbis support) and re-run.');
    process.exit(1);
  }
  if (!versionOutput.includes('--enable-libvorbis')) {
    console.error('✗ ffmpeg is on $PATH but was not built with --enable-libvorbis. Install a build that has it.');
    process.exit(1);
  }
}

function humanSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function main() {
  await checkFfmpeg();

  const { SoundBankLoader } = await import(CORE_LIB_PATH);

  let targets;
  if (explicitFiles.length) {
    targets = explicitFiles.map(f => path.isAbsolute(f) ? f : path.join(SOUNDFONTS_DIR, path.basename(f)));
  } else {
    if (!fs.existsSync(SOUNDFONTS_DIR)) {
      console.error(`✗ ${SOUNDFONTS_DIR} does not exist.`);
      process.exit(1);
    }
    targets = fs.readdirSync(SOUNDFONTS_DIR)
      .filter(f => f.toLowerCase().endsWith('.sf2'))
      .map(f => path.join(SOUNDFONTS_DIR, f));
  }

  if (!targets.length) {
    console.warn('⚠ No .sf2 files to convert.');
    return;
  }

  // file basename (without extension) → new .sf3 basename, for the
  // manifest rewrite pass at the end.
  const renamedFiles = new Map();
  let totalBefore = 0;
  let totalAfter  = 0;
  let failures    = 0;

  for (const sf2Path of targets) {
    const baseName = path.basename(sf2Path);
    if (!fs.existsSync(sf2Path)) {
      console.warn(`⚠ Skipping "${baseName}" — not found.`);
      continue;
    }
    if (!baseName.toLowerCase().endsWith('.sf2')) {
      console.warn(`⚠ Skipping "${baseName}" — not a .sf2 file.`);
      continue;
    }

    const sf3Name = baseName.replace(/\.sf2$/i, '.sf3');
    const sf3Path = path.join(path.dirname(sf2Path), sf3Name);

    process.stdout.write(`→ ${baseName} … `);

    try {
      const arrayBuffer = fs.readFileSync(sf2Path).buffer;
      const bank = SoundBankLoader.fromArrayBuffer(arrayBuffer);

      const written = await bank.writeSF2({
        compress: true,
        compressionFunction: encodeVorbis,
        compressionQuality: quality,
      });

      const beforeSize = fs.statSync(sf2Path).size;
      const afterSize  = written.byteLength ?? written.length;
      totalBefore += beforeSize;
      totalAfter  += afterSize;

      const pct = (100 * (1 - afterSize / beforeSize)).toFixed(0);
      console.log(`${humanSize(beforeSize)} → ${humanSize(afterSize)} (${pct}% smaller)`);

      if (!dryRun) {
        fs.writeFileSync(sf3Path, Buffer.from(written));
        if (!keepOriginal) fs.unlinkSync(sf2Path);
      }

      renamedFiles.set(baseName, sf3Name);
    } catch (e) {
      failures++;
      console.log('FAILED');
      console.error(`  ✗ ${e.message}`);
    }
  }

  if (totalBefore > 0) {
    const pct = (100 * (1 - totalAfter / totalBefore)).toFixed(0);
    console.log(`\nTotal: ${humanSize(totalBefore)} → ${humanSize(totalAfter)} (${pct}% smaller)${dryRun ? '  [dry run — nothing written]' : ''}`);
  }
  if (failures) {
    console.error(`\n✗ ${failures} file(s) failed to convert — see above. Nothing else was skipped because of this.`);
  }

  // ── Keep manifest.json's `file` fields in sync ──
  // Only touches entries whose file we actually renamed above (and only
  // for real, non-dry-run, non---keep-original renames, since otherwise
  // the .sf2 the old entry points at still exists on disk).
  if (!dryRun && !keepOriginal && renamedFiles.size && fs.existsSync(MANIFEST_PATH)) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    } catch (e) {
      console.error(`\n✗ Could not parse ${MANIFEST_PATH} to update it: ${e.message}`);
      console.error('  Update the affected "file" entries by hand.');
      return;
    }

    let manifestChanged = false;
    for (const entry of manifest) {
      const newName = renamedFiles.get(entry.file);
      if (newName) {
        entry.file = newName; // id/label untouched — same stable identifier, same bank
        manifestChanged = true;
      }
    }

    if (manifestChanged) {
      fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + '\n');
      console.log(`\n✓ Updated soundfonts/manifest.json (${renamedFiles.size} entr${renamedFiles.size === 1 ? 'y' : 'ies'} repointed to .sf3).`);
    }
  } else if (dryRun && renamedFiles.size) {
    console.log('\n(dry run — soundfonts/manifest.json was not touched)');
  }

  if (failures) process.exitCode = 1;
}

main();
