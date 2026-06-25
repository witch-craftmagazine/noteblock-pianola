// easter-eggs/duck/index.js
//
// "Duck" easter egg — a soft pond scene with a waddling rubber duck.
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at this path (relative to repo root):
//   ./easter-eggs/duck/duck.glb   ← duck model (must include a "walk" animation clip)
//
// Palette (pastel):
//   #8cb369  sage green   — grass, foliage
//   #f4e285  soft yellow  — sun, lily flowers
//   #f4a259  warm peach   — trunks, reeds, earth
//   #5b8e7d  muted teal   — pond water
//   #bc4b51  dusty rose   — accents (reed tips, deep ground layer)
//
// Contract: export init({ trigger }) — called by egg-loader.js.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger; // "peter_and_the_wolf_op.67_1936_-_prokofiev"
  const MODEL_PATH   = './easter-eggs/duck/duck.glb';

  // ── Palette ─────────────────────────────────────────────────────
  const C_GREEN  = 0x8cb369; // sage grass / foliage
  const C_YELLOW = 0xf4e285; // soft sun / lily flowers
  const C_PEACH  = 0xf4a259; // trunks / reeds / earth
  const C_TEAL   = 0x5b8e7d; // pond water
  const C_ROSE   = 0xbc4b51; // reed tips / deep ground / accents

  // ── Overlay / Canvas ────────────────────────────────────────────
  const dkOverlay = document.getElementById('duck-overlay');
  const dkCanvas  = document.getElementById('duck-canvas');

  // ── Renderer / Scene / Camera ───────────────────────────────────
  const dkRenderer = new THREE.WebGLRenderer({ canvas: dkCanvas, antialias: true, alpha: true });
  dkRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  dkRenderer.setClearColor(0x000000, 0);

  const SKY = 0xd6eaf0; // pale blue-grey sky, not blinding

  const dkScene = new THREE.Scene();
  dkScene.background = new THREE.Color(SKY);
  dkScene.fog = new THREE.Fog(SKY, 120, 280);

  const dkCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  dkCamera.position.set(0, 18, 72);
  dkCamera.lookAt(0, 4, 0);

  function dkResize() {
    const w = dkOverlay.offsetWidth  || window.innerWidth;
    const h = dkOverlay.offsetHeight || window.innerHeight;
    dkRenderer.setSize(w, h, false);
    dkCamera.aspect = w / h;
    dkCamera.updateProjectionMatrix();
  }
  dkResize();
  window.addEventListener('resize', dkResize);

  // ── Lighting ────────────────────────────────────────────────────
  dkScene.add(new THREE.AmbientLight(0xf0ece0, 0.75));
  const dkSun = new THREE.DirectionalLight(0xfff5cc, 1.0);
  dkSun.position.set(60, 80, 40);
  dkScene.add(dkSun);
  const dkFill = new THREE.DirectionalLight(0xc8dde8, 0.3);
  dkFill.position.set(-40, 20, -30);
  dkScene.add(dkFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex, opts = {}) {
    const key = hex + JSON.stringify(opts);
    if (!_matCache.has(key)) _matCache.set(key, new THREE.MeshLambertMaterial({ color: hex, ...opts }));
    return _matCache.get(key);
  }
  function addBox(w, h, d, color, x, y, z, opts) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color, opts));
    m.position.set(x, y, z);
    dkScene.add(m);
    return m;
  }

  // ── Ground ───────────────────────────────────────────────────────
  // Top grass layer — sage green
  addBox(600, 6,  120, C_GREEN, 0, -3,  0);
  // Mid earth layer — warm peach
  addBox(600, 8,  120, C_PEACH, 0, -10, 0);
  // Deep ground — dusty rose
  addBox(600, 10, 120, C_ROSE,  0, -19, 0);
  // Subtle grass stripe variation
  for (let x = -220; x <= 220; x += 9) {
    const col = Math.random() > 0.5 ? 0x9ec07a : 0x7da854; // lighter/darker sage variants
    addBox(3.5, 0.4, 120, col, x, 0.1, 0);
  }

  // ── Pond ─────────────────────────────────────────────────────────
  const pondMat = new THREE.MeshLambertMaterial({
    color: C_TEAL, transparent: true, opacity: 0.80, depthWrite: false,
  });
  const pondBase = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.5, 48), pondMat);
  pondBase.position.set(0, 0.05, -6);
  pondBase.scale.set(1, 1, 0.7);
  dkScene.add(pondBase);

  // Ripple rings — slightly lighter teal
  for (let r = 1; r <= 3; r++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 7 - 0.3, r * 7 + 0.3, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7ab8ac, transparent: true, opacity: 0.22 - r * 0.04,
        side: THREE.DoubleSide, depthWrite: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.2, -6);
    ring.scale.set(1, 0.7, 1);
    dkScene.add(ring);
  }

  // ── Lily pads ────────────────────────────────────────────────────
  const lilyPositions = [[-10, -5], [8, -14], [-16, -12], [14, -2]];
  lilyPositions.forEach(([lx, lz]) => {
    const lily = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.25, 12),
      new THREE.MeshLambertMaterial({ color: 0x6a9e5c }) // mid sage-green
    );
    lily.position.set(lx, 0.35, lz);
    dkScene.add(lily);
    if (Math.random() > 0.5) {
      const flower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: C_YELLOW })
      );
      flower.position.set(lx, 0.7, lz);
      dkScene.add(flower);
    }
  });

  // ── Reeds ────────────────────────────────────────────────────────
  const reedPositions = [[-25, 2], [-20, 8], [-22, -4], [22, 0], [24, 8], [19, -8], [0, -28], [8, -26]];
  reedPositions.forEach(([rx, rz]) => {
    const h = 6 + Math.random() * 4;
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, h, 5),
      new THREE.MeshLambertMaterial({ color: C_PEACH })
    );
    stalk.position.set(rx, h / 2, rz);
    dkScene.add(stalk);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: C_ROSE })
    );
    tip.position.set(rx, h + 0.7, rz);
    dkScene.add(tip);
  });

  // ── Trees ────────────────────────────────────────────────────────
  const foliageData = [
    [-110, -22, 14], [-78, -20, 11], [-52, -18, 13], [56,  -20, 12],
    [ 84,  -22, 15], [112, -20, 10], [-130,-35, 18], [108, -36, 16],
  ];
  foliageData.forEach(([x, z, r]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 8, 6),
      new THREE.MeshLambertMaterial({ color: C_PEACH })
    );
    trunk.position.set(x, 4, z);
    dkScene.add(trunk);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.7, 8, 6),
      new THREE.MeshLambertMaterial({ color: C_GREEN })
    );
    canopy.position.set(x, 8 + r * 0.6, z);
    dkScene.add(canopy);
  });

  // Sun disc — soft yellow, not blinding white
  addBox(14, 14, 2, C_YELLOW, 100, 90, -60);

  // ── Floating bubbles on the pond ─────────────────────────────────
  const BUBBLE_COUNT = 18;
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.55, 6, 4);

  function randRange(min, max) { return min + Math.random() * (max - min); }

  function resetBubble(b, scatter) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = randRange(4, 22);
    b.mesh.position.x = Math.cos(angle) * dist;
    b.mesh.position.z = -6 + Math.sin(angle) * dist * 0.7;
    b.mesh.position.y = scatter ? randRange(0.4, 1.4) : 0.45;
    b.bobSpeed  = randRange(0.4, 0.9);
    b.bobAmp    = randRange(0.12, 0.35);
    b.bobPhase  = Math.random() * Math.PI * 2;
    b.driftX    = randRange(-0.6, 0.6);
    b.driftZ    = randRange(-0.3, 0.3);
    b.life      = randRange(3, 9);
    b.age       = scatter ? Math.random() * b.life : 0;
  }

  for (let i = 0; i < BUBBLE_COUNT; i++) {
    // Teal-tinted bubbles matching the pond
    const mat = new THREE.MeshLambertMaterial({
      color: 0x8ab8b0, transparent: true, opacity: 0.45, depthWrite: false,
    });
    const mesh = new THREE.Mesh(bubbleGeo, mat);
    const b = { mesh };
    resetBubble(b, true);
    dkScene.add(mesh);
    bubbles.push(b);
  }

  function tickBubbles(dt) {
    for (const b of bubbles) {
      b.age += dt;
      if (b.age >= b.life) { resetBubble(b, false); continue; }
      b.mesh.position.y = 0.45 + Math.sin(b.age * b.bobSpeed * Math.PI * 2 + b.bobPhase) * b.bobAmp;
      b.mesh.position.x += b.driftX * dt;
      b.mesh.position.z += b.driftZ * dt;
    }
  }

  // ── Ripple ring animation ────────────────────────────────────────
  let rippleElapsed = 0;
  function tickRipples(dt) {
    rippleElapsed += dt;
    dkScene.children
      .filter(c => c.geometry && c.geometry.type === 'RingGeometry')
      .forEach((ring, i) => {
        ring.material.opacity = Math.max(0, 0.12 + 0.08 * Math.sin(rippleElapsed * 1.1 + i * 1.3));
      });
  }

  // ── Duck (GLB model with walk animation) ────────────────────────
  //
  // The duck.glb model's natural forward direction is +Z (it faces away from
  // the camera at rotation.y = 0). We apply a BASE_ROT of Math.PI so it faces
  // toward the camera (-Z, i.e. toward the viewer) at rest, then turn left/right
  // from that base:
  //   moving right (+X): BASE_ROT + π/2  → faces right
  //   moving left  (-X): BASE_ROT - π/2  → faces left
  //
  const BASE_ROT   = Math.PI; // model's +Z forward → flip to face camera
  const X_RANGE    = 18;
  const GROUND_Y   = 0.5;
  const MOVE_SPEED = 3.8;

  let dkDuck    = null;
  let dkMixer   = null;
  let dkDir     = 1;
  let dkElapsed = 0;

  const shadowGeo  = new THREE.CircleGeometry(3.2, 10);
  const shadowMat  = new THREE.MeshBasicMaterial({
    color: 0x3a5a50, transparent: true, opacity: 0.18, depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, GROUND_Y + 0.05, -6);
  shadowDisc.visible = false;
  dkScene.add(shadowDisc);

  function loadDuck() {
    if (typeof THREE.GLTFLoader === 'undefined') {
      console.warn('[Duck] THREE.GLTFLoader not available — duck will not render.');
      return;
    }
    const loader = new THREE.GLTFLoader();
    loader.load(
      MODEL_PATH,
      (gltf) => {
        dkDuck = gltf.scene;

        // Scale so the duck is ~8 units tall regardless of GLB internal units
        const box = new THREE.Box3().setFromObject(dkDuck);
        const size = new THREE.Vector3();
        box.getSize(size);
        const TARGET_HEIGHT = 8;
        const scale = TARGET_HEIGHT / size.y;
        dkDuck.scale.setScalar(scale);

        // Pin bottom of model to GROUND_Y, centred on pond Z
        const box2 = new THREE.Box3().setFromObject(dkDuck);
        const centre = new THREE.Vector3();
        box2.getCenter(centre);
        dkDuck.position.set(-centre.x, GROUND_Y - box2.min.y, -6 - centre.z);

        // Start at left edge, facing right
        dkDuck.position.x = -X_RANGE;
        dkDuck.rotation.y = BASE_ROT + Math.PI / 2; // facing +X (right)

        dkScene.add(dkDuck);

        // Animation mixer — prefer a "walk" clip, fall back to first
        if (gltf.animations && gltf.animations.length > 0) {
          dkMixer = new THREE.AnimationMixer(dkDuck);
          const clip = gltf.animations.find(a => /walk/i.test(a.name)) || gltf.animations[0];
          dkMixer.clipAction(clip).play();
        } else {
          console.warn('[Duck] GLB has no animation clips.');
        }

        shadowDisc.visible = true;
        console.log('[Duck] loaded. animations:', gltf.animations.map(a => a.name));
      },
      undefined,
      (err) => console.error('[Duck] Failed to load duck.glb:', err)
    );
  }

  function tickDuck(dt) {
    if (!dkDuck) return;
    dkElapsed += dt;

    if (dkMixer) dkMixer.update(dt);

    // Move side to side within pond bounds
    let px = dkDuck.position.x + dkDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px =  X_RANGE; dkDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; dkDir =  1; }

    const bob = Math.abs(Math.sin(dkElapsed * 2.8)) * 0.35;
    dkDuck.position.x = px;
    dkDuck.position.y = GROUND_Y + bob;

    // Target rotation: BASE_ROT ± π/2 so the duck faces left or right
    // (both orientations keep the duck facing toward the camera / viewer)
    const targetY = BASE_ROT + (dkDir > 0 ? Math.PI / 2 : -Math.PI / 2);
    const dy = targetY - dkDuck.rotation.y;
    const dyClamped = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
    dkDuck.rotation.y += dyClamped * 0.10;

    // Gentle lean into direction of travel
    dkDuck.rotation.z = -dkDir * 0.06;

    shadowDisc.position.x = px;
    shadowMat.opacity = Math.max(0.05, 0.18 - bob * 0.06);
  }

  function tickAll(dt) {
    tickDuck(dt);
    tickBubbles(dt);
    tickRipples(dt);
  }

  // ── Render loop ──────────────────────────────────────────────────
  let dkLastNow = null;
  let dkRunning = false;

  function dkLoop(now) {
    if (!dkRunning) return;
    requestAnimationFrame(dkLoop);
    if (dkLastNow === null) dkLastNow = now;
    const dt = Math.min((now - dkLastNow) / 1000, 0.1);
    dkLastNow = now;
    tickAll(dt);
    dkRenderer.render(dkScene, dkCamera);
  }

  // ── Show / hide ──────────────────────────────────────────────────
  function showDkOverlay() {
    dkResize();
    dkOverlay.classList.add('visible');
    if (!dkRunning) { dkRunning = true; dkLastNow = null; requestAnimationFrame(dkLoop); }
  }

  function hideDkOverlay() {
    dkOverlay.classList.remove('visible');
    dkRunning = false;
  }

  loadDuck();

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showDkOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideDkOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideDkOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
