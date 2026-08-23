// ─────────────────────────────────────────────────────────────────
//  BACKGROUND TOGGLE
//  Split out of the old inline <script> in index.html — logic
//  unchanged. Currently dormant: index.html no longer has a
//  #bg-toggle button (replaced on-screen by the GitHub source flap
//  in the same top-right corner — see #github-flap). This module
//  stays imported by main.js and now guards on a missing button so
//  it's a harmless no-op rather than a load-time crash. Re-adding
//  <button id="bg-toggle">...</button> to index.html is the only
//  step needed to bring the toggle back.
// ─────────────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('bg-toggle');
  if (!btn) return;

  let bgImage = false;

  btn.addEventListener('click', () => {
    bgImage = !bgImage;
    document.body.classList.toggle('bg-image', bgImage);
    btn.textContent = bgImage ? '⬛ BG' : '⬜ BG';
  });
})();
