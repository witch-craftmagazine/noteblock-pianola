// easter-eggs/green/index.js
//
// "Green" easter egg — a dark, moody, Pre-Raphaelite-inspired scene
// (think Rossetti twilight gardens: deep plum/burgundy sky, muted gold
// rim light, dusky moss-green ground, drifting rose petals, slow and
// demure player movement instead of a bouncy skip).
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at this path (relative to repo root):
//   ./easter-eggs/green/gwyn.png   ← player skin
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else,
// and uses its own #gr-overlay/#gr-canvas elements so it never collides
// with the other eggs.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger;
  const SKIN_PATH = './easter-eggs/green/gwyn.png';

  // ── UV MAP (same player rig as the other eggs) ─────────────────
  const UV = {
    head:        [[16,8,8,8],  [0,8,8,8],   [8,0,8,8],  [16,7,8,-8],  [8,8,8,8],   [24,8,8,8]],
    hat:         [[48,8,8,8],  [32,8,8,8],  [40,0,8,8], [48,7,8,-8],  [40,8,8,8],  [56,8,8,8]],
    torso:       [[28,20,4,12],[16,20,4,12],[20,16,8,4],[28,19,8,-4], [20,20,8,12],[32,20,8,12]],
    jacket:      [[28,36,4,12],[16,36,4,12],[20,32,8,4],[28,35,8,-4], [20,36,8,12],[32,36,8,12]],
    rightArm:    [[48,20,4,12],[40,20,4,12],[44,16,4,4],[48,19,4,-4], [44,20,4,12],[52,20,4,12]],
    rightSleeve: [[48,36,4,12],[40,36,4,12],[44,32,4,4],[48,35,4,-4], [44,36,4,12],[52,36,4,12]],
    leftArm:     [[40,52,4,12],[32,52,4,12],[36,48,4,4],[40,51,4,-4], [36,52,4,12],[44,52,4,12]],
    leftSleeve:  [[56,52,4,12],[48,52,4,12],[52,48,4,4],[56,51,4,-4], [52,52,4,12],[60,52,4,12]],
    rightLeg:    [[8,20,4,12], [0,20,4,12], [4,16,4,4], [8,19,4,-4],  [4,20,4,12], [12,20,4,12]],
    rightPant:   [[8,36,4,12], [0,36,4,12], [4,32,4,4], [8,35,4,-4],  [4,36,4,12], [12,36,4,12]],
    leftLeg:     [[24,52,4,12],[16,52,4,12],[20,48,4,4],[24,51,4,-4], [20,52,4,12],[28,52,4,12]],
    leftPant:    [[8,52,4,12], [0,52,4,12], [4,48,4,4], [8,51,4,-4],  [4,52,4,12], [12,52,4,12]],
    leftArmV0:   [[43,20,-4,12],[51,20,-4,12],[47,16,-4,4],[51,19,-4,-4],[47,20,-4,12],[55,20,-4,12]],
    leftLegV0:   [[3,20,-4,12], [11,20,-4,12],[7,16,-4,4], [11,19,-4,-4],[7,20,-4,12], [15,20,-4,12]],
  };

  // ── Renderer / Scene / Camera ───────────────────────────────────
  const grOverlay = document.getElementById('gr-overlay');
  const grCanvas  = document.getElementById('gr-canvas');

  const grRenderer = new THREE.WebGLRenderer({ canvas: grCanvas, antialias: false, alpha: true });
  grRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  grRenderer.setClearColor(0x000000, 0);

  const grScene = new THREE.Scene();
  // Deep plum/burgundy dusk sky — Pre-Raphaelite twilight, not a bright midday blue.
  grScene.background = new THREE.Color(0x2a1530);
  grScene.fog = new THREE.Fog(0x2a1530, 90, 240);

  const grCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  grCamera.position.set(0, 28, 88);
  grCamera.lookAt(0, 10, 0);

  function grResize() {
    const w = grOverlay.offsetWidth  || window.innerWidth;
    const h = grOverlay.offsetHeight || window.innerHeight;
    grRenderer.setSize(w, h, false);
    grCamera.aspect = w / h;
    grCamera.updateProjectionMatrix();
  }
  grResize();
  window.addEventListener('resize', grResize);

  // ── Lighting ────────────────────────────────────────────────────
  // Low, warm gold rim light against cool violet ambient — chiaroscuro mood.
  grScene.add(new THREE.AmbientLight(0x4a3a66, 0.55));
  const grRim = new THREE.DirectionalLight(0xd9a85c, 0.9);
  grRim.position.set(-70, 35, 60);
  grScene.add(grRim);
  const grFill = new THREE.DirectionalLight(0x6a3550, 0.4);
  grFill.position.set(60, 15, -40);
  grScene.add(grFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex) {
    if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return _matCache.get(hex);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    grScene.add(m);
    return m;
  }

  // Ground — dusky moss, not bright grass.
  addBox(500, 6,  80, 0x2e3a22,  0, -3,   0);
  addBox(500, 12, 80, 0x3a2a26,  0, -12,  0);
  addBox(500, 8,  80, 0x241c22,  0, -22,  0);
  for (let x = -200; x <= 200; x += 8) {
    addBox(4, 0.4, 80, Math.random() > 0.5 ? 0x32421f : 0x283b1f, x, 0, 0);
  }

  // Gnarled, sparse trees — dark emerald/near-black canopies, thin twisted trunks.
  const treeData = [
    [-110,-20,16],[-78,-20,13],[-50,-20,18],[-20,-20,14],
    [22,-20,15],[52,-20,19],[82,-20,14],[114,-20,17],
    [-130,-36,20],[-95,-36,16],[-60,-36,21],[-25,-36,17],
    [12,-36,19],[44,-36,15],[78,-36,20],[108,-36,16],
  ];
  treeData.forEach(([x, z, h]) => {
    addBox(2.6, h, 2.6, 0x241712, x, h / 2, z);
    addBox(12, 11, 12, 0x1d2f17, x, h + 4, z);
    addBox(8,  8,  8,  0x14210f, x, h + 7, z + 1);
  });

  // Distant moon — pale, cold, low — instead of a bright sun.
  addBox(16, 16, 2, 0xe8e0c8, -90, 78, -60);
  addBox(20, 3,  2, 0xd8d0b0, -90, 78, -60);
  addBox(3, 20,  2, 0xd8d0b0, -90, 78, -60);

  // Drifting fog banks — slow, low, horizontal — moodier than puffy clouds.
  const grFogBanks = [];
  function makeFogBank(x, y, z) {
    const g = new THREE.Group();
    [[0,0,0,30,3,12],[18,0,-1,18,2.5,10],[-16,0,1,16,2.5,9],[6,1,0,20,2,8]]
      .forEach(([cx,cy,cz,cw,ch,cd]) => {
        const m = new THREE.Mesh(
          new THREE.BoxGeometry(cw, ch, cd),
          new THREE.MeshLambertMaterial({ color: 0x6a5a72, transparent: true, opacity: 0.22, depthWrite: false })
        );
        m.position.set(cx, cy, cz);
        g.add(m);
      });
    g.position.set(x, y, z);
    grScene.add(g);
    grFogBanks.push({ obj: g, speed: 0.5 + Math.random() * 0.4 }); // slow drift, matches the demure mood
  }
  makeFogBank(-100, 8, -25); makeFogBank(10, 10, -20);
  makeFogBank(130, 6, -35); makeFogBank(-200, 9, -18);
  makeFogBank(220, 7, -40);

  // ── Falling rose petals ─────────────────────────────────────────
  // Sparse and slow — drifting, not raining. Flat dark-red diamond shapes
  // built from plane geometry so no external sprite asset is required.
  const PETAL_COUNT     = 26;
  const PETAL_MIN_SPEED = 5;
  const PETAL_MAX_SPEED = 11;
  const PETAL_X_RANGE   = 180;
  const PETAL_Z_MIN     = -55;
  const PETAL_Z_MAX     = 35;
  const PETAL_TOP_Y     = 120;
  const PETAL_BOTTOM_Y  = -4;
  const petalColors = [0x6e1f2b, 0x8a2a3a, 0x4f1722, 0x9c3b2e];

  const petalGeo = new THREE.PlaneGeometry(3, 4);
  let petals = [];

  function randRange(min, max) { return min + Math.random() * (max - min); }

  function resetPetal(p, randomizeStartY) {
    p.mesh.position.x = randRange(-PETAL_X_RANGE, PETAL_X_RANGE);
    p.mesh.position.z = randRange(PETAL_Z_MIN, PETAL_Z_MAX);
    p.mesh.position.y = randomizeStartY ? randRange(PETAL_BOTTOM_Y, PETAL_TOP_Y) : PETAL_TOP_Y;
    p.fallSpeed = randRange(PETAL_MIN_SPEED, PETAL_MAX_SPEED);
    p.swaySpeed = randRange(0.4, 0.9);
    p.swayAmp   = randRange(6, 14);
    p.swayPhase = Math.random() * Math.PI * 2;
    p.spinSpeed = randRange(-0.6, 0.6);
    p.baseX     = p.mesh.position.x;
  }

  function buildPetals() {
    for (let i = 0; i < PETAL_COUNT; i++) {
      const mat = new THREE.MeshLambertMaterial({
        color: petalColors[i % petalColors.length],
        transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      });
      const mesh = new THREE.Mesh(petalGeo, mat);
      mesh.rotation.x = Math.PI * 0.06;
      const p = { mesh, elapsed: Math.random() * 10 };
      resetPetal(p, true);
      grScene.add(mesh);
      petals.push(p);
    }
  }
  buildPetals();

  function tickPetals(dt) {
    for (let i = 0; i < petals.length; i++) {
      const p = petals[i];
      p.elapsed += dt;
      p.mesh.position.y -= p.fallSpeed * dt;
      p.mesh.position.x = p.baseX + Math.sin(p.elapsed * p.swaySpeed + p.swayPhase) * p.swayAmp;
      p.mesh.rotation.z += p.spinSpeed * dt;
      if (p.mesh.position.y <= PETAL_BOTTOM_Y) {
        resetPetal(p, false);
        p.elapsed = 0;
      }
    }
  }

  // ── Skin helpers (unchanged rig logic) ─────────────────────────
  function makeFaceMaterials(skinImg, faceUVs) {
    return faceUVs.map(([sx, sy, sw, sh]) => {
      const aw = Math.abs(sw), ah = Math.abs(sh);
      const c = document.createElement('canvas');
      c.width = aw; c.height = ah;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.save();
      if (sw < 0) { ctx.translate(aw, 0); ctx.scale(-1,  1); }
      if (sh < 0) { ctx.translate(0, ah); ctx.scale( 1, -1); }
      ctx.drawImage(skinImg, sx, sy, aw, ah, 0, 0, aw, ah);
      ctx.restore();
      const tex = new THREE.CanvasTexture(c);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      return new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.05 });
    });
  }

  function detectAlpha(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx2d = c.getContext('2d');
    ctx2d.drawImage(img, 0, 0);
    const d = ctx2d.getImageData(0, 0, img.width, img.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 255) return true;
    return false;
  }

  function meshPart(group, geo, img, uvKey) {
    group.add(new THREE.Mesh(geo, makeFaceMaterials(img, UV[uvKey])));
  }

  function buildPlayer(img) {
    const v     = img.height >= 64 ? 1 : 0;
    const alpha = detectAlpha(img);
    const root  = new THREE.Group();

    const headG = new THREE.Group(); headG.position.set(0, 12, 0);
    meshPart(headG, new THREE.BoxGeometry(8, 8, 8), img, 'head');
    if (alpha) meshPart(headG, new THREE.BoxGeometry(9.25, 9.25, 9.25), img, 'hat');
    root.add(headG);

    const torsoG = new THREE.Group(); torsoG.position.set(0, 2, 0);
    meshPart(torsoG, new THREE.BoxGeometry(8, 12, 4), img, 'torso');
    if (v >= 1 && alpha) meshPart(torsoG, new THREE.BoxGeometry(8.5, 12.5, 4.5), img, 'jacket');
    root.add(torsoG);

    const rArmG = new THREE.Group(); rArmG.position.set(-6, 6, 0);
    const rArmGeo = new THREE.BoxGeometry(4, 12, 4); rArmGeo.translate(0, -6, 0);
    meshPart(rArmG, rArmGeo, img, 'rightArm');
    if (v >= 1 && alpha) { const g = new THREE.BoxGeometry(4.55,12.55,4.55); g.translate(0,-6,0); meshPart(rArmG, g, img, 'rightSleeve'); }
    root.add(rArmG);

    const lArmG = new THREE.Group(); lArmG.position.set(6, 6, 0);
    const lArmGeo = new THREE.BoxGeometry(4, 12, 4); lArmGeo.translate(0, -6, 0);
    meshPart(lArmG, lArmGeo, img, v >= 1 ? 'leftArm' : 'leftArmV0');
    if (v >= 1 && alpha) { const g = new THREE.BoxGeometry(4.55,12.55,4.55); g.translate(0,-6,0); meshPart(lArmG, g, img, 'leftSleeve'); }
    root.add(lArmG);

    const rLegG = new THREE.Group(); rLegG.position.set(-2, -4, 0);
    const rLegGeo = new THREE.BoxGeometry(4, 12, 4); rLegGeo.translate(0, -6, 0);
    meshPart(rLegG, rLegGeo, img, 'rightLeg');
    if (v >= 1 && alpha) { const g = new THREE.BoxGeometry(4.55,12.55,4.55); g.translate(0,-6,0); meshPart(rLegG, g, img, 'rightPant'); }
    root.add(rLegG);

    const lLegG = new THREE.Group(); lLegG.position.set(2, -4, 0);
    const lLegGeo = new THREE.BoxGeometry(4, 12, 4); lLegGeo.translate(0, -6, 0);
    meshPart(lLegG, lLegGeo, img, v >= 1 ? 'leftLeg' : 'leftLegV0');
    if (v >= 1 && alpha) { const g = new THREE.BoxGeometry(4.55,12.55,4.55); g.translate(0,-6,0); meshPart(lLegG, g, img, 'leftPant'); }
    root.add(lLegG);

    return root;
  }

  // ── Animation state — slow, demure glide (not a bouncy skip) ──────
  const GROUND_Y    = 0;
  const FEET_OFFSET = 16;
  const X_RANGE     = 52;
  const MOVE_SPEED  = 4.5;          // was 13 on the other eggs — a slow, measured pace
  const SWAY_HZ     = 0.55;         // was SKIP_HZ 2.3 — gentle, not a skip
  const BOUNCE_AMP  = 1.1;          // was 5.2 — barely any vertical bounce
  const LIMB_SWING  = Math.PI * 0.10; // was ~0.33–0.44 — minimal, graceful limb motion
  const TURN_EASE   = 0.04;         // was 0.14 — slower, more deliberate turns

  let grPlayer  = null;
  let skinImage = null;

  let grDir     =  1;
  let grElapsed =  0;

  const shadowGeo  = new THREE.CircleGeometry(5, 8);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = GROUND_Y + 0.3;
  shadowDisc.visible = false;
  grScene.add(shadowDisc);

  function tickPlayer(dt) {
    if (!grPlayer) return;
    grElapsed += dt;
    let px = grPlayer.position.x + grDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px = X_RANGE;  grDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; grDir =  1; }
    const phi    = grElapsed * SWAY_HZ * Math.PI * 2;
    const swing  = Math.sin(phi);
    const bounce = Math.abs(Math.sin(phi)) * BOUNCE_AMP;
    grPlayer.position.x = px;
    grPlayer.position.y = GROUND_Y + FEET_OFFSET + bounce;
    grPlayer.position.z = 0;
    const targetY = grDir > 0 ? -Math.PI * 0.09 : Math.PI * 0.09; // shallower turn than the other eggs
    grPlayer.rotation.y += (targetY - grPlayer.rotation.y) * TURN_EASE;
    grPlayer.rotation.z  = grDir * 0.018;
    grPlayer.children[0].rotation.x =  Math.sin(phi * 0.5) * 0.03;
    grPlayer.children[2].rotation.x = -swing * LIMB_SWING;
    grPlayer.children[3].rotation.x =  swing * LIMB_SWING;
    grPlayer.children[4].rotation.x =  swing * LIMB_SWING;
    grPlayer.children[5].rotation.x = -swing * LIMB_SWING;
    const shadowScale = 1.0 - bounce / (BOUNCE_AMP * 1.6);
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(Math.max(0.3, shadowScale));
    shadowMat.opacity = Math.max(0.08, 0.3 * shadowScale);
  }

  function tickAll(dt) {
    tickPlayer(dt);
    tickPetals(dt);
    grFogBanks.forEach(({ obj, speed }) => {
      obj.position.x += dt * speed;
      if (obj.position.x > 240) obj.position.x = -240;
    });
  }

  // ── Render loop ──────────────────────────────────────────────────
  let grLastNow = null;
  let grRunning = false;

  function grLoop(now) {
    if (!grRunning) return;
    requestAnimationFrame(grLoop);
    if (grLastNow === null) grLastNow = now;
    const dt = Math.min((now - grLastNow) / 1000, 0.1);
    grLastNow = now;
    tickAll(dt);
    grRenderer.render(grScene, grCamera);
  }

  // ── Load skin ────────────────────────────────────────────────────
  const skinImg = new Image();
  skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinImage = skinImg;
    if (grPlayer) { grScene.remove(grPlayer); grPlayer = null; }
    grPlayer = buildPlayer(skinImg);
    grPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0);
    grElapsed = 0; grDir = 1;
    grScene.add(grPlayer);
    shadowDisc.visible = true;
  };
  skinImg.onerror = () => {
    console.warn('[Green] Could not load gwyn.png at', SKIN_PATH);
  };
  skinImg.src = SKIN_PATH;

  // ── Show / hide ──────────────────────────────────────────────────
  function showGrOverlay() {
    grResize();
    grOverlay.classList.add('visible');
    if (!grRunning) { grRunning = true; grLastNow = null; requestAnimationFrame(grLoop); }
  }

  function hideGrOverlay() {
    grOverlay.classList.remove('visible');
    grRunning = false;
  }

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showGrOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideGrOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideGrOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
