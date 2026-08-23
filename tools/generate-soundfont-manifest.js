#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  GENERATE SOUNDFONT MANIFEST
//
//  Scans ./soundfonts/*.sf2 and reconciles it with
//  soundfonts/manifest.json:
//
//    - .sf2 files already listed in the manifest are left exactly as
//      they are (id, label, and position all preserved) — the id is
//      a stable identifier (localStorage + ?sf= deep links), so it
//      must never change or get reassigned to a different file.
//    - .sf2 files found on disk but NOT in the manifest are appended
//      at the end, with an id/label auto-derived from the filename.
//    - manifest entries whose file no longer exists on disk are left
//      alone by default (just warned about) since deleting them out
//      from under a saved id could silently break a returning
//      visitor's choice — pass --prune to actually remove them.
//
//  The first entry in the manifest is the default soundfont (per
//  soundfonts/README.md), so newly-discovered files are always
//  appended, never inserted at the front.
//
//  Usage:
//    node tools/generate-soundfont-manifest.js            write changes
//    node tools/generate-soundfont-manifest.js --check     exit 1 if the
//                                                           manifest is
//                                                           out of date,
//                                                           don't write
//                                                           (useful in CI)
//    node tools/generate-soundfont-manifest.js --prune     also remove
//                                                           entries whose
//                                                           file is gone
// ─────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const REPO_ROOT  = path.join(__dirname, '..');

const SOUNDFONTS_DIR = path.join(REPO_ROOT, 'soundfonts');
const MANIFEST_PATH  = path.join(SOUNDFONTS_DIR, 'manifest.json');

const checkOnly = process.argv.includes('--check');
const prune     = process.argv.includes('--prune');

// Turns "minecraft_classic-v2.sf2" into "Minecraft Classic V2".
function humanizeLabel(filename) {
  const base = filename.replace(/\.sf2$/i, '');
  return base
    .replace(/[_\-]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(word => word.length ? word[0].toUpperCase() + word.slice(1) : word)
    .join(' ');
}

// Turns a filename into a slug-style id: lowercase, alnum + dashes only.
function slugifyId(filename) {
  const base = filename.replace(/\.sf2$/i, '');
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'soundfont';
}

function uniqueId(candidate, takenIds) {
  if (!takenIds.has(candidate)) return candidate;
  let n = 2;
  while (takenIds.has(`${candidate}-${n}`)) n++;
  return `${candidate}-${n}`;
}

function main() {
  if (!fs.existsSync(SOUNDFONTS_DIR)) {
    console.error(`✗ ${SOUNDFONTS_DIR} does not exist.`);
    process.exit(1);
  }

  const filesOnDisk = fs.readdirSync(SOUNDFONTS_DIR)
    .filter(f => f.toLowerCase().endsWith('.sf2'))
    .sort((a, b) => a.localeCompare(b));

  let existing = [];
  if (fs.existsSync(MANIFEST_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
      if (!Array.isArray(existing)) throw new Error('manifest.json is not an array');
    } catch (e) {
      console.error(`✗ Could not parse existing ${MANIFEST_PATH}: ${e.message}`);
      process.exit(1);
    }
  }

  const onDiskSet = new Set(filesOnDisk);
  const takenIds  = new Set(existing.map(e => e.id));

  // 1. Keep existing entries as-is (in their original order), unless
  //    --prune is set and the file's gone.
  const kept = [];
  const missing = [];
  for (const entry of existing) {
    if (onDiskSet.has(entry.file)) {
      kept.push(entry);
    } else {
      missing.push(entry);
      if (!prune) kept.push(entry); // keep, just warn
    }
  }

  // 2. Append any .sf2 on disk that isn't already referenced by some
  //    entry (kept or dropped) — every existing `file` value counts,
  //    not just ones with a file on disk, so we never double-add.
  const referencedFiles = new Set(existing.map(e => e.file));
  const added = [];
  for (const file of filesOnDisk) {
    if (referencedFiles.has(file)) continue;
    const id = uniqueId(slugifyId(file), takenIds);
    takenIds.add(id);
    const entry = { id, label: humanizeLabel(file), file };
    added.push(entry);
    kept.push(entry);
  }

  // 3. Report.
  if (missing.length) {
    console.warn(`⚠ ${missing.length} manifest entr${missing.length === 1 ? 'y references' : 'ies reference'} file(s) not found in soundfonts/:`);
    for (const e of missing) {
      console.warn(`   "${e.id}" → ${e.file}${prune ? '  (removing, --prune set)' : '  (kept — pass --prune to remove)'}`);
    }
  }
  if (added.length) {
    console.log(`+ ${added.length} new soundfont(s) found on disk, added to the manifest:`);
    for (const e of added) {
      console.log(`   "${e.id}" → ${e.file}  (label: "${e.label}")`);
    }
    console.log('  Review/edit the auto-generated labels in soundfonts/manifest.json if you want nicer names.');
  }
  if (!missing.length && !added.length) {
    console.log(`✓ soundfonts/manifest.json already matches soundfonts/*.sf2 (${filesOnDisk.length} file(s)). Nothing to do.`);
  }

  const changed = added.length > 0 || (prune && missing.length > 0);

  if (checkOnly) {
    if (changed) {
      console.error('\n✗ Manifest is out of date. Run `node tools/generate-soundfont-manifest.js` (without --check) to update it.');
      process.exit(1);
    }
    return;
  }

  if (changed) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(kept, null, 2) + '\n');
    console.log(`\n✓ Wrote ${MANIFEST_PATH} (${kept.length} entr${kept.length === 1 ? 'y' : 'ies'}).`);
  }

  if (filesOnDisk.length === 0) {
    console.warn(`⚠ No .sf2 files found in ${SOUNDFONTS_DIR} — the manifest may be empty or stale.`);
  }
}

main();
