// easter-eggs/carrotfield/index.js
//
// Carrot field easter egg.
// Grass ground with the player skin jumping/walking back and forth,
// blue sky with a heavy downpour of falling carrots.
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at these paths (relative to repo root):
//   ./easter-eggs/carrotfield/bama.png    ← player skin
//   ./easter-eggs/carrotfield/carrot.png  ← falling carrot sprite
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else.
// Independent of the minecraft egg — does not touch its overlay/canvas
// or any of its globals.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger;
  const SKIN_PATH   = './easter-eggs/carrotfield/bama.png';
  const CARROT_PATH = './easter-eggs/carrotfield/carrot.png';

  // ── UV MAP (same player rig as the minecraft egg) ─────────────────
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
  const cfOverlay = document.getElementById('cf-overlay');
  const cfCanvas  = document.getElementById('cf-canvas');

  const cfRenderer = new THREE.WebGLRenderer({ canvas: cfCanvas, antialias: false, alpha: true });
  cfRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  cfRenderer.setClearColor(0x000000, 0);

  const cfScene = new THREE.Scene();
  cfScene.background = new THREE.Color(0x5b9bd5);
  cfScene.fog = new THREE.Fog(0x5b9bd5, 130, 280);

  const cfCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  cfCamera.position.set(0, 28, 88);
  cfCamera.lookAt(0, 10, 0);

  function cfResize() {
    const w = cfOverlay.offsetWidth  || window.innerWidth;
    const h = cfOverlay.offsetHeight || window.innerHeight;
    cfRenderer.setSize(w, h, false);
    cfCamera.aspect = w / h;
    cfCamera.updateProjectionMatrix();
  }
  cfResize();
  window.addEventListener('resize', cfResize);

  // ── Lighting ────────────────────────────────────────────────────
  cfScene.add(new THREE.AmbientLight(0xc8d8ff, 0.65));
  const cfSun = new THREE.DirectionalLight(0xfff4cc, 1.0);
  cfSun.position.set(70, 110, 50);
  cfScene.add(cfSun);
  const cfFill = new THREE.DirectionalLight(0x7090cc, 0.35);
  cfFill.position.set(-50, 20, 60);
  cfScene.add(cfFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex) {
    if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return _matCache.get(hex);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    cfScene.add(m);
    return m;
  }

  // Ground — grass field for the player to jump around on (unchanged from minecraft egg)
  addBox(500, 6,  80, 0x4d8c1e,  0, -3,   0);
  addBox(500, 12, 80, 0x6b4423,  0, -12,  0);
  addBox(500, 8,  80, 0x555555,  0, -22,  0);
  for (let x = -200; x <= 200; x += 8) {
    addBox(4, 0.4, 80, Math.random() > 0.5 ? 0x558a1e : 0x5fa022, x, 0, 0);
  }

  // No trees, no clouds, no sun decor — the sky is carrying the carrot rain instead.

  // ── Carrot rain ─────────────────────────────────────────────────
  // Heavy downpour, straight-fall-only, instant recycle on ground contact.
  const CARROT_COUNT     = 180;
  const CARROT_MIN_SPEED = 55;
  const CARROT_MAX_SPEED = 95;
  const CARROT_MIN_SIZE  = 5;
  const CARROT_MAX_SIZE  = 11;
  const RAIN_X_RANGE     = 220;   // wider than the ground/walk area so there's no hard edge
  const RAIN_Z_MIN       = -60;
  const RAIN_Z_MAX       = 40;
  const RAIN_TOP_Y       = 160;
  const RAIN_BOTTOM_Y    = -4;    // recycle once a carrot reaches ~ground level

  let carrotDrops = [];
  let carrotTexture = null;

  function randRange(min, max) { return min + Math.random() * (max - min); }

  function resetDrop(d, randomizeStartY) {
    d.sprite.position.x = randRange(-RAIN_X_RANGE, RAIN_X_RANGE);
    d.sprite.position.z = randRange(RAIN_Z_MIN, RAIN_Z_MAX);
    d.sprite.position.y = randomizeStartY ? randRange(RAIN_BOTTOM_Y, RAIN_TOP_Y) : RAIN_TOP_Y;
    d.speed = randRange(CARROT_MIN_SPEED, CARROT_MAX_SPEED);
    const size = randRange(CARROT_MIN_SIZE, CARROT_MAX_SIZE);
    d.sprite.scale.set(size * 0.6, size, 1); // carrot.png is taller than wide
    d.sprite.material.rotation = randRange(-0.35, 0.35); // fixed per-spawn tilt, not animated
  }

  function buildCarrotRain(tex) {
    carrotTexture = tex;
    carrotTexture.magFilter = THREE.NearestFilter;
    carrotTexture.minFilter = THREE.NearestFilter;

    for (let i = 0; i < CARROT_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({ map: carrotTexture, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat);
      const drop = { sprite, speed: 0 };
      resetDrop(drop, true); // randomize initial Y so rain looks established on frame one
      cfScene.add(sprite);
      carrotDrops.push(drop);
    }
  }

  function tickCarrotRain(dt) {
    for (let i = 0; i < carrotDrops.length; i++) {
      const d = carrotDrops[i];
      d.sprite.position.y -= d.speed * dt;
      if (d.sprite.position.y <= RAIN_BOTTOM_Y) {
        resetDrop(d, false); // re-enter from the top
      }
    }
  }

  // ── Skin helpers (unchanged rig logic from the minecraft egg) ─────
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

  // ── Animation state — simple turn-around walk, no poof/enderman ───
  const GROUND_Y    = 0;
  const FEET_OFFSET = 16;
  const X_RANGE     = 52;
  const MOVE_SPEED  = 13;
  const SKIP_HZ     = 2.3;
  const BOUNCE_AMP  = 5.2;
  const LEG_SWING   = Math.PI * 0.44;
  const ARM_SWING   = Math.PI * 0.33;

  let cfPlayer  = null;
  let skinImage = null;

  let cfDir     =  1;
  let cfElapsed =  0;

  const shadowGeo  = new THREE.CircleGeometry(5, 8);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = GROUND_Y + 0.3;
  shadowDisc.visible = false;
  cfScene.add(shadowDisc);

  function tickPlayer(dt) {
    if (!cfPlayer) return;
    cfElapsed += dt;
    let px = cfPlayer.position.x + cfDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px = X_RANGE;  cfDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; cfDir =  1; }
    const phi    = cfElapsed * SKIP_HZ * Math.PI * 2;
    const swing  = Math.sin(phi);
    const bounce = Math.abs(Math.sin(phi)) * BOUNCE_AMP;
    cfPlayer.position.x = px;
    cfPlayer.position.y = GROUND_Y + FEET_OFFSET + bounce;
    cfPlayer.position.z = 0;
    const targetY = cfDir > 0 ? -Math.PI * 0.18 : Math.PI * 0.18;
    cfPlayer.rotation.y += (targetY - cfPlayer.rotation.y) * 0.14;
    cfPlayer.rotation.z  = cfDir * 0.045;
    cfPlayer.children[0].rotation.x =  Math.sin(phi * 0.5) * 0.06;
    cfPlayer.children[2].rotation.x = -swing * ARM_SWING;
    cfPlayer.children[3].rotation.x =  swing * ARM_SWING;
    cfPlayer.children[4].rotation.x =  swing * LEG_SWING;
    cfPlayer.children[5].rotation.x = -swing * LEG_SWING;
    const shadowScale = 1.0 - bounce / (BOUNCE_AMP * 1.6);
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(Math.max(0.3, shadowScale));
    shadowMat.opacity = Math.max(0.05, 0.28 * shadowScale);
  }

  function tickAll(dt) {
    tickPlayer(dt);
    tickCarrotRain(dt);
  }

  // ── Render loop ──────────────────────────────────────────────────
  let cfLastNow = null;
  let cfRunning = false;

  function cfLoop(now) {
    if (!cfRunning) return;
    requestAnimationFrame(cfLoop);
    if (cfLastNow === null) cfLastNow = now;
    const dt = Math.min((now - cfLastNow) / 1000, 0.1);
    cfLastNow = now;
    tickAll(dt);
    cfRenderer.render(cfScene, cfCamera);
  }

  // ── Load skin ────────────────────────────────────────────────────
  const skinImg = new Image();
  skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinImage = skinImg;
    if (cfPlayer) { cfScene.remove(cfPlayer); cfPlayer = null; }
    cfPlayer = buildPlayer(skinImg);
    cfPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0);
    cfElapsed = 0; cfDir = 1;
    cfScene.add(cfPlayer);
    shadowDisc.visible = true;
  };
  skinImg.onerror = () => {
    console.warn('[Carrot Field] Could not load bama.png at', SKIN_PATH);
  };
  skinImg.src = SKIN_PATH;

  // ── Load carrot sprite ──────────────────────────────────────────
  const carrotImg = new Image();
  carrotImg.crossOrigin = 'anonymous';
  carrotImg.onload = () => {
    const tex = new THREE.Texture(carrotImg);
    tex.needsUpdate = true;
    buildCarrotRain(tex);
  };
  carrotImg.onerror = () => {
    console.warn('[Carrot Field] Could not load carrot.png at', CARROT_PATH);
  };
  carrotImg.src = CARROT_PATH;

  // ── Show / hide ──────────────────────────────────────────────────
  function showCfOverlay() {
    cfResize();
    cfOverlay.classList.add('visible');
    if (!cfRunning) { cfRunning = true; cfLastNow = null; requestAnimationFrame(cfLoop); }
  }

  function hideCfOverlay() {
    cfOverlay.classList.remove('visible');
    cfRunning = false;
  }

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showCfOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideCfOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideCfOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
