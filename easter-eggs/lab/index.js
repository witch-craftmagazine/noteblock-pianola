// easter-eggs/lab/index.js
//
// "Lab" easter egg — bright white blocky Minecraft-style laboratory scene,
// fast and fun player movement (same energetic skip/bounce as the
// original Minecraft egg).
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at this path (relative to repo root):
//   ./easter-eggs/lab/link.png   ← player skin
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else,
// and uses its own #lb-overlay/#lb-canvas elements so it never collides
// with the other eggs.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger;
  const SKIN_PATH = './easter-eggs/lab/link.png';

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
  const lbOverlay = document.getElementById('lb-overlay');
  const lbCanvas  = document.getElementById('lb-canvas');

  const lbRenderer = new THREE.WebGLRenderer({ canvas: lbCanvas, antialias: false, alpha: true });
  lbRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  lbRenderer.setClearColor(0x000000, 0);

  const lbScene = new THREE.Scene();
  // Bright clinical white — laboratory, not an outdoor sky.
  lbScene.background = new THREE.Color(0xf2f5f8);
  lbScene.fog = new THREE.Fog(0xf2f5f8, 140, 290);

  const lbCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  lbCamera.position.set(0, 28, 88);
  lbCamera.lookAt(0, 10, 0);

  function lbResize() {
    const w = lbOverlay.offsetWidth  || window.innerWidth;
    const h = lbOverlay.offsetHeight || window.innerHeight;
    lbRenderer.setSize(w, h, false);
    lbCamera.aspect = w / h;
    lbCamera.updateProjectionMatrix();
  }
  lbResize();
  window.addEventListener('resize', lbResize);

  // ── Lighting ────────────────────────────────────────────────────
  // Flat, bright, near-shadowless lab lighting.
  lbScene.add(new THREE.AmbientLight(0xffffff, 0.95));
  const lbMain = new THREE.DirectionalLight(0xffffff, 0.6);
  lbMain.position.set(40, 130, 60);
  lbScene.add(lbMain);
  const lbFill = new THREE.DirectionalLight(0xeaf2ff, 0.35);
  lbFill.position.set(-60, 60, -30);
  lbScene.add(lbFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex) {
    if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return _matCache.get(hex);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    lbScene.add(m);
    return m;
  }

  // Floor — white/light-gray blocky tile, replaces grass.
  addBox(500, 6,  80, 0xe4e8ec,  0, -3,   0);
  addBox(500, 12, 80, 0xc7ccd2,  0, -12,  0);
  addBox(500, 8,  80, 0xa6abb2,  0, -22,  0);
  for (let x = -200; x <= 200; x += 8) {
    addBox(4, 0.4, 80, Math.random() > 0.5 ? 0xeef1f4 : 0xe0e4e8, x, 0, 0);
  }

  // Lab benches — replaces trees, same repeating-row layout.
  const benchData = [
    [-110,-20,16],[-85,-20,14],[-60,-20,18],[-35,-20,15],[-8,-20,17],
    [18,-20,14],[45,-20,18],[68,-20,15],[92,-20,17],[115,-20,14],
    [-120,-35,20],[-90,-35,18],[-65,-35,22],[-40,-35,19],[-15,-35,21],
    [10,-35,18],[38,-35,22],[62,-35,19],[88,-35,21],[112,-35,18],
  ];
  benchData.forEach(([x, z, h]) => {
    // bench top
    addBox(14, 1.4, 8, 0xffffff, x, 6, z);
    // bench legs/base
    addBox(13, 5, 7, 0xd5dadf, x, 3, z);
    // beaker (cylinder, glassy teal)
    const beaker = new THREE.Mesh(
      new THREE.CylinderGeometry(1.4, 1.2, 4, 8),
      new THREE.MeshLambertMaterial({ color: 0x6fd1c8, transparent: true, opacity: 0.75 })
    );
    beaker.position.set(x - 3, 8.7, z - 2);
    lbScene.add(beaker);
    // glowing vial accent
    const vial = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.7, 3, 6),
      new THREE.MeshBasicMaterial({ color: 0x7ee787 })
    );
    vial.position.set(x + 3, 8.2, z - 1);
    lbScene.add(vial);
    // backsplash partition
    addBox(16, 13, 1.2, 0xeef1f4, x, h / 2 + 2, z + 5);
    addBox(15, 9, 1.4, 0xcfe6ff, x, h / 2, z + 5.1);
  });

  // Overhead lab light panels — replaces sun, scattered overhead.
  const lightPanels = [
    [-80,-55,-30],[0,-55,-30],[80,-55,-30],
    [-160,-55,-45],[160,-55,-45],
  ];
  lightPanels.forEach(([x, z, y]) => {
    addBox(24, 2, 10, 0xffffff, x, -y, z);
  });

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

  // ── Animation state — fast, fun skip (same as the original Minecraft egg) ──
  const GROUND_Y    = 0;
  const FEET_OFFSET = 16;
  const X_RANGE     = 52;
  const MOVE_SPEED  = 13;
  const SKIP_HZ     = 2.3;
  const BOUNCE_AMP  = 5.2;
  const LEG_SWING   = Math.PI * 0.44;
  const ARM_SWING   = Math.PI * 0.33;

  let lbPlayer  = null;
  let skinImage = null;

  let lbDir     =  1;
  let lbElapsed =  0;

  const shadowGeo  = new THREE.CircleGeometry(5, 8);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = GROUND_Y + 0.3;
  shadowDisc.visible = false;
  lbScene.add(shadowDisc);

  function tickPlayer(dt) {
    if (!lbPlayer) return;
    lbElapsed += dt;
    let px = lbPlayer.position.x + lbDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px = X_RANGE;  lbDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; lbDir =  1; }
    const phi    = lbElapsed * SKIP_HZ * Math.PI * 2;
    const swing  = Math.sin(phi);
    const bounce = Math.abs(Math.sin(phi)) * BOUNCE_AMP;
    lbPlayer.position.x = px;
    lbPlayer.position.y = GROUND_Y + FEET_OFFSET + bounce;
    lbPlayer.position.z = 0;
    const targetY = lbDir > 0 ? -Math.PI * 0.18 : Math.PI * 0.18;
    lbPlayer.rotation.y += (targetY - lbPlayer.rotation.y) * 0.14;
    lbPlayer.rotation.z  = lbDir * 0.045;
    lbPlayer.children[0].rotation.x =  Math.sin(phi * 0.5) * 0.06;
    lbPlayer.children[2].rotation.x = -swing * ARM_SWING;
    lbPlayer.children[3].rotation.x =  swing * ARM_SWING;
    lbPlayer.children[4].rotation.x =  swing * LEG_SWING;
    lbPlayer.children[5].rotation.x = -swing * LEG_SWING;
    const shadowScale = 1.0 - bounce / (BOUNCE_AMP * 1.6);
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(Math.max(0.3, shadowScale));
    shadowMat.opacity = Math.max(0.05, 0.28 * shadowScale);
  }

  function tickAll(dt) {
    tickPlayer(dt);
  }

  // ── Render loop ──────────────────────────────────────────────────
  let lbLastNow = null;
  let lbRunning = false;

  function lbLoop(now) {
    if (!lbRunning) return;
    requestAnimationFrame(lbLoop);
    if (lbLastNow === null) lbLastNow = now;
    const dt = Math.min((now - lbLastNow) / 1000, 0.1);
    lbLastNow = now;
    tickAll(dt);
    lbRenderer.render(lbScene, lbCamera);
  }

  // ── Load skin ────────────────────────────────────────────────────
  const skinImg = new Image();
  skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinImage = skinImg;
    if (lbPlayer) { lbScene.remove(lbPlayer); lbPlayer = null; }
    lbPlayer = buildPlayer(skinImg);
    lbPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0);
    lbElapsed = 0; lbDir = 1;
    lbScene.add(lbPlayer);
    shadowDisc.visible = true;
  };
  skinImg.onerror = () => {
    console.warn('[Lab] Could not load link.png at', SKIN_PATH);
  };
  skinImg.src = SKIN_PATH;

  // ── Show / hide ──────────────────────────────────────────────────
  function showLbOverlay() {
    lbResize();
    lbOverlay.classList.add('visible');
    if (!lbRunning) { lbRunning = true; lbLastNow = null; requestAnimationFrame(lbLoop); }
  }

  function hideLbOverlay() {
    lbOverlay.classList.remove('visible');
    lbRunning = false;
  }

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showLbOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideLbOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideLbOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
