// easter-eggs/duck/index.js
//
// "Duck" easter egg — a cheerful pond scene with a waddling rubber duck.
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at this path (relative to repo root):
//   ./easter-eggs/duck/duck.glb   ← duck model (must include a "walk" animation clip)
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else,
// and uses its own #duck-overlay/#duck-canvas elements so it never collides
// with the other eggs.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger; // "peter_and_the_wolf_op.67_1936_-_prokofiev"
  const MODEL_PATH   = './easter-eggs/duck/duck.glb';

  // ── Renderer / Scene / Camera ───────────────────────────────────
  const dkOverlay = document.getElementById('duck-overlay');
  const dkCanvas  = document.getElementById('duck-canvas');

  const dkRenderer = new THREE.WebGLRenderer({ canvas: dkCanvas, antialias: true, alpha: true });
  dkRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  dkRenderer.setClearColor(0x000000, 0);
  dkRenderer.shadowMap.enabled = true;

  const dkScene = new THREE.Scene();
  dkScene.background = new THREE.Color(0x87ceeb); // bright sky blue
  dkScene.fog = new THREE.Fog(0x87ceeb, 120, 280);

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
  dkScene.add(new THREE.AmbientLight(0xfff5e0, 0.7));
  const dkSun = new THREE.DirectionalLight(0xfff0b0, 1.2);
  dkSun.position.set(60, 80, 40);
  dkSun.castShadow = true;
  dkScene.add(dkSun);
  const dkFill = new THREE.DirectionalLight(0xc8e8ff, 0.35);
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

  // Ground — bright green grass
  addBox(600, 6, 120, 0x5aad3c,  0, -3,   0);
  addBox(600, 8, 120, 0x3d7a28,  0, -10,  0);
  // Grass stripe detail
  for (let x = -220; x <= 220; x += 9) {
    addBox(3.5, 0.4, 120, Math.random() > 0.5 ? 0x66c245 : 0x4e9e32, x, 0.1, 0);
  }

  // Pond — a flat shimmery blue ellipse approximated by overlapping boxes
  const pondMat = new THREE.MeshLambertMaterial({ color: 0x3fa7d6, transparent: true, opacity: 0.82, depthWrite: false });
  const pondBase = new THREE.Mesh(new THREE.CylinderGeometry(28, 28, 0.5, 48), pondMat);
  pondBase.position.set(0, 0.05, -6);
  pondBase.scale.set(1, 1, 0.7);
  dkScene.add(pondBase);
  // Subtle ripple rings
  for (let r = 1; r <= 3; r++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 7 - 0.3, r * 7 + 0.3, 48),
      new THREE.MeshBasicMaterial({ color: 0x5bbfe0, transparent: true, opacity: 0.25 - r * 0.05, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.2, -6);
    ring.scale.set(1, 0.7, 1);
    dkScene.add(ring);
  }

  // Lily pads — flat dark-green circles on the pond
  const lilyPositions = [[-10, -5], [8, -14], [-16, -12], [14, -2]];
  lilyPositions.forEach(([lx, lz]) => {
    const lily = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.25, 12),
      new THREE.MeshLambertMaterial({ color: 0x2e7d32 })
    );
    lily.position.set(lx, 0.35, lz);
    dkScene.add(lily);
    // Tiny yellow flower on some
    if (Math.random() > 0.5) {
      const flower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.5, 8),
        new THREE.MeshLambertMaterial({ color: 0xf9e04b })
      );
      flower.position.set(lx, 0.7, lz);
      dkScene.add(flower);
    }
  });

  // Reeds — thin dark stalks around the pond edge
  const reedPositions = [[-25, 2], [-20, 8], [-22, -4], [22, 0], [24, 8], [19, -8], [0, -28], [8, -26]];
  reedPositions.forEach(([rx, rz]) => {
    const h = 6 + Math.random() * 4;
    const stalk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.3, h, 5),
      new THREE.MeshLambertMaterial({ color: 0x6d4c1f })
    );
    stalk.position.set(rx, h / 2, rz);
    dkScene.add(stalk);
    const tip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.4, 5),
      new THREE.MeshLambertMaterial({ color: 0x4a3010 })
    );
    tip.position.set(rx, h + 0.7, rz);
    dkScene.add(tip);
  });

  // Distant rounded bushes and a couple of round trees
  const foliageData = [
    [-110, -22, 14, 0x3a8c28], [-78, -20, 11, 0x4aaa32],
    [-52,  -18, 13, 0x348a20], [56,  -20, 12, 0x3c9228],
    [84,   -22, 15, 0x46a030], [112, -20, 10, 0x3a8820],
    [-130, -35, 18, 0x2e7020], [108, -36, 16, 0x36882a],
  ];
  foliageData.forEach(([x, z, r, col]) => {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(1.2, 1.4, 8, 6),
      new THREE.MeshLambertMaterial({ color: 0x5c3a1e })
    );
    trunk.position.set(x, 4, z);
    dkScene.add(trunk);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.7, 8, 6),
      new THREE.MeshLambertMaterial({ color: col })
    );
    canopy.position.set(x, 8 + r * 0.6, z);
    dkScene.add(canopy);
  });

  // Sun disc in the sky
  addBox(14, 14, 2, 0xfff176, 100, 90, -60);

  // ── Floating bubbles on the pond ─────────────────────────────────
  const BUBBLE_COUNT = 18;
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.55, 6, 4);
  const bubbleMat = new THREE.MeshLambertMaterial({ color: 0xa8dff5, transparent: true, opacity: 0.55, depthWrite: false });

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
    const mesh = new THREE.Mesh(bubbleGeo, bubbleMat.clone());
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

  // ── Ripple ring animation ─────────────────────────────────────────
  // We'll animate the existing rings by scaling them slowly
  let rippleElapsed = 0;

  function tickRipples(dt) {
    rippleElapsed += dt;
    // gentle oscillation of ring opacity — gives the illusion of spreading water
    const rings = dkScene.children.filter(c => c.geometry && c.geometry.type === 'RingGeometry');
    rings.forEach((ring, i) => {
      ring.material.opacity = Math.max(0, 0.15 + 0.1 * Math.sin(rippleElapsed * 1.1 + i * 1.3));
    });
  }

  // ── Duck (GLB model with walk animation) ────────────────────────
  const X_RANGE    = 18;   // stays on the pond
  const GROUND_Y   = 0.5;  // sits on water surface
  const MOVE_SPEED = 3.8;

  let dkDuck     = null;
  let dkMixer    = null;
  let dkWalkClip = null;
  let dkDir      = 1;
  let dkElapsed  = 0;

  const shadowGeo  = new THREE.CircleGeometry(3.2, 10);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false });
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

        // Centre and scale the model to fit the scene.
        // Measure bounding box so the duck lands exactly on the water surface
        // regardless of the GLB's internal origin.
        const box = new THREE.Box3().setFromObject(dkDuck);
        const size = new THREE.Vector3();
        box.getSize(size);
        const centre = new THREE.Vector3();
        box.getCenter(centre);

        // Target height of ~8 scene units — feels right relative to pond size
        const TARGET_HEIGHT = 8;
        const scale = TARGET_HEIGHT / size.y;
        dkDuck.scale.setScalar(scale);

        // Recompute after scaling
        box.setFromObject(dkDuck);
        box.getCenter(centre);
        const minY = box.min.y;

        // Offset so the bottom of the model sits on GROUND_Y, centred on pond
        dkDuck.position.set(-centre.x, GROUND_Y - minY * scale - centre.y * 0, -6 - centre.z);
        // Simpler: just pin bottom to GROUND_Y
        dkDuck.position.set(-X_RANGE, GROUND_Y - (box.min.y), -6);

        dkScene.add(dkDuck);

        // ── Animation mixer ──────────────────────────────────────
        if (gltf.animations && gltf.animations.length > 0) {
          dkMixer = new THREE.AnimationMixer(dkDuck);
          // Try to find a clip named "walk" (case-insensitive), fall back to first clip
          dkWalkClip = gltf.animations.find(a => /walk/i.test(a.name)) || gltf.animations[0];
          const action = dkMixer.clipAction(dkWalkClip);
          action.play();
        } else {
          console.warn('[Duck] GLB has no animation clips.');
        }

        shadowDisc.visible = true;
        console.log('[Duck] model loaded. animations:', gltf.animations.map(a => a.name));
      },
      undefined,
      (err) => {
        console.error('[Duck] Failed to load duck.glb:', err);
      }
    );
  }

  function tickDuck(dt) {
    if (!dkDuck) return;
    dkElapsed += dt;

    // Advance animation mixer
    if (dkMixer) dkMixer.update(dt);

    // Waddle side-to-side across the pond
    let px = dkDuck.position.x + dkDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px = X_RANGE;  dkDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; dkDir =  1; }

    // Gentle vertical bob in time with the walk cycle
    const bob = Math.abs(Math.sin(dkElapsed * 2.8)) * 0.35;

    dkDuck.position.x = px;
    dkDuck.position.y = GROUND_Y + bob - (/* keep feet on water */ 0);
    dkDuck.position.z = -6;

    // Smooth turn to face direction of travel
    const targetY = dkDir > 0 ? 0 : Math.PI;
    const dy = targetY - dkDuck.rotation.y;
    // handle wrapping so we always take the short arc
    const dyClamped = ((dy + Math.PI) % (Math.PI * 2)) - Math.PI;
    dkDuck.rotation.y += dyClamped * 0.10;

    // Slight tilt into the direction of travel — the duck leans forward/back
    dkDuck.rotation.z = -dkDir * 0.06;

    // Shadow follows
    shadowDisc.position.x = px;
    shadowDisc.position.z = -6;
    shadowMat.opacity = 0.22 - bob * 0.08;
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

  // Load the model once, up front (same as how Green loads its skin image).
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
