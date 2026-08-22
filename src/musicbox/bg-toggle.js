// ─────────────────────────────────────────────────────────────────
//  BACKGROUND TOGGLE
//  Split out of the old inline <script> in index.html — unchanged.
// ─────────────────────────────────────────────────────────────────
(function () {
  const btn = document.getElementById('bg-toggle');
  let bgImage = false;

  btn.addEventListener('click', () => {
    bgImage = !bgImage;
    document.body.classList.toggle('bg-image', bgImage);
    btn.textContent = bgImage ? '⬛ BG' : '⬜ BG';
  });
})();
