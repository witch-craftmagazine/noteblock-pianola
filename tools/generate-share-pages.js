#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────
//  GENERATE SHARE PAGES
//
//  Produces one static HTML file per song at  song/<slug>/index.html
//  Each page carries proper per-song Open Graph / Twitter meta tags
//  (so Discord, Twitter, iMessage, etc. show a real preview with the
//  song title instead of the generic homepage card), then immediately
//  redirects the visitor into the live player at /?song=<slug>.
//
//  Run from the repo root:
//    node tools/generate-share-pages.js
//
//  Re-run this any time midilist.json changes (songs added/removed/
//  renamed) so the share pages stay in sync.
//
//  Requires: plain Node.js, no dependencies, no network access.
// ─────────────────────────────────────────────────────────────────

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── Config — edit if your hosting changes ─────────────────────────
const BASE_URL   = 'https://witch-craftmagazine.github.io/noteblock-pianola/';
const SITE_TITLE = 'Noteblock Pianola';
const OG_IMAGE    = BASE_URL + 'musicbox.webp?v=1';
const REPO_ROOT   = path.join(__dirname, '..');
const LIST_PATH   = path.join(REPO_ROOT, 'midilist.json');
const OUT_DIR     = path.join(REPO_ROOT, 'song');

// ── Metadata parsing — MUST stay in sync with parseMeta() in script.js ──
// (best-effort, filename-derived — see the comment in script.js for why)
const YEAR_RE = /(1[5-9]\d{2}|20\d{2})/;
const CATALOG_SUFFIX_RE = /_(qrs|vocalstyle|royal|duoart|ampico|mastertouch|electra|broadwaymusicroll|melographic|reliance|weltedeluxe|imperial)_?\w*$/i;

function parseMeta(trackPath) {
  const base = trackPath.split('/').pop().replace(/\.midi?$/i, '');
  const m = YEAR_RE.exec(base);

  if (!m) {
    return { slug: base, title: base.replace(/[_\-]+/g, ' ').trim(), artist: '', year: null };
  }

  const year = parseInt(m[0], 10);
  const before = base.slice(0, m.index);
  let after = base.slice(m.index + m[0].length);

  const title = before.replace(/[_\-]+$/, '').replace(/[_\-]+/g, ' ').trim();

  after = after.replace(/^[_\-]+/, '');
  after = after.replace(/_\d+$/, '');
  after = after.replace(CATALOG_SUFFIX_RE, '');
  const artist = after.replace(/[_\-]+/g, ' ').trim();

  return { slug: base, title, artist, year };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function buildDescription({ title, artist, year }) {
  let desc = `🎹 "${title}"`;
  if (artist) desc += ` by ${artist}`;
  if (year)   desc += ` (${year})`;
  desc += ' — tap to listen on the music box 🎵';
  return desc;
}

function buildPage(meta) {
  const title       = escapeHtml(meta.title || meta.slug);
  const description = escapeHtml(buildDescription(meta));
  const pageUrl      = BASE_URL + 'song/' + encodeURIComponent(meta.slug) + '/';
  const targetUrl    = BASE_URL + '?song=' + encodeURIComponent(meta.slug);
  const fullTitle    = `${title} — ${SITE_TITLE}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<meta name="robots" content="noindex"/>
<title>${fullTitle}</title>
<meta name="description" content="${description}"/>

<meta property="og:type" content="website"/>
<meta property="og:url" content="${pageUrl}"/>
<meta property="og:site_name" content="Noteblock Pianola"/>
<meta property="og:title" content="${title}"/>
<meta property="og:description" content="${description}"/>
<meta property="og:image" content="${OG_IMAGE}"/>
<meta property="og:image:secure_url" content="${OG_IMAGE}"/>
<meta property="og:image:type" content="image/webp"/>
<meta property="og:image:width" content="2000"/>
<meta property="og:image:height" content="1138"/>

<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:url" content="${pageUrl}"/>
<meta name="twitter:title" content="${title}"/>
<meta name="twitter:description" content="${description}"/>
<meta name="twitter:image" content="${OG_IMAGE}"/>

<meta name="theme-color" content="#2b2b2b"/>
<link rel="canonical" href="${targetUrl}"/>
<meta http-equiv="refresh" content="0; url=${targetUrl}"/>
<script>location.replace(${JSON.stringify(targetUrl)});</script>
<style>
  body {
    margin: 0; height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #1a1a2e; color: #e8d5a3; font-family: monospace; font-size: 14px;
    text-align: center; padding: 24px; box-sizing: border-box;
  }
  a { color: #c8a85a; }
</style>
</head>
<body>
  <p>Loading “${title}” on the music box…<br/>
  <a href="${targetUrl}">Click here if you're not redirected.</a></p>
</body>
</html>
`;
}

function main() {
  let tracks;
  try {
    tracks = JSON.parse(fs.readFileSync(LIST_PATH, 'utf8'));
  } catch (e) {
    console.error(`Could not read ${LIST_PATH}:`, e.message);
    process.exit(1);
  }

  // Wipe and recreate the output dir so removed/renamed songs don't leave
  // stale share pages behind.
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const slugs = new Set();
  let written = 0;

  for (const trackPath of tracks) {
    const meta = parseMeta(trackPath);

    if (slugs.has(meta.slug)) {
      console.warn(`⚠ duplicate slug, skipping: ${meta.slug}`);
      continue;
    }
    slugs.add(meta.slug);

    const dir = path.join(OUT_DIR, meta.slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), buildPage(meta), 'utf8');
    written++;
  }

  console.log(`✓ Wrote ${written} share pages to ${path.relative(REPO_ROOT, OUT_DIR)}/`);
  console.log(`  Example: ${BASE_URL}song/${tracks[0].split('/').pop().replace(/\.midi?$/i, '')}/`);
  console.log('\nCommit the song/ directory and push — re-run this script whenever midilist.json changes.');
}

main();
