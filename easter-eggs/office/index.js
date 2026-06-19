// easter-eggs/office/index.js
//
// "Office" easter egg — bright fluorescent-lit cubicle office scene,
// fast and fun player movement (same energetic skip/bounce as the
// original Minecraft egg).
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at this path (relative to repo root):
//   ./easter-eggs/office/p.png   ← player skin
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else,
// and uses its own #of-overlay/#of-canvas elements so it never collides
// with the other eggs.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger;
  const SKIN_PATH = './easter-eggs/office/p.png';

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
  const ofOverlay = document.getElementById('of-overlay');
  const ofCanvas  = document.getElementById('of-canvas');

  const ofRenderer = new THREE.WebGLRenderer({ canvas: ofCanvas, antialias: false, alpha: true });
  ofRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  ofRenderer.setClearColor(0x000000, 0);

  const ofScene = new THREE.Scene();
  // Flat fluorescent-office ceiling/wall tone instead of an outdoor sky.
  ofScene.background = new THREE.Color(0xc7cdd4);
  ofScene.fog = new THREE.Fog(0xc7cdd4, 130, 280);

  const ofCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  ofCamera.position.set(0, 28, 88);
  ofCamera.lookAt(0, 10, 0);

  function ofResize() {
    const w = ofOverlay.offsetWidth  || window.innerWidth;
    const h = ofOverlay.offsetHeight || window.innerHeight;
    ofRenderer.setSize(w, h, false);
    ofCamera.aspect = w / h;
    ofCamera.updateProjectionMatrix();
  }
  ofResize();
  window.addEventListener('resize', ofResize);

  // ── Lighting ────────────────────────────────────────────────────
  // Flat, even, slightly cool fluorescent lighting — no warm sun/fill split.
  ofScene.add(new THREE.AmbientLight(0xf0f4ff, 0.85));
  const ofMain = new THREE.DirectionalLight(0xffffff, 0.55);
  ofMain.position.set(40, 120, 60);
  ofScene.add(ofMain);
  const ofFill = new THREE.DirectionalLight(0xdde4f5, 0.3);
  ofFill.position.set(-60, 60, -30);
  ofScene.add(ofFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex) {
    if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return _matCache.get(hex);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    ofScene.add(m);
    return m;
  }

  // Floor — speckled office carpet tile, replaces grass.
  addBox(500, 6,  80, 0x5a6270,  0, -3,   0);
  addBox(500, 12, 80, 0x3f454f,  0, -12,  0);
  addBox(500, 8,  80, 0x2b2f36,  0, -22,  0);
  for (let x = -200; x <= 200; x += 8) {
    addBox(4, 0.4, 80, Math.random() > 0.5 ? 0x646c7a : 0x5d6573, x, 0, 0);
  }

  // Cubicle dividers — replaces trees, same repeating-row layout.
  const cubicleData = [
    [-110,-20,16],[-85,-20,14],[-60,-20,18],[-35,-20,15],[-8,-20,17],
    [18,-20,14],[45,-20,18],[68,-20,15],[92,-20,17],[115,-20,14],
    [-120,-35,20],[-90,-35,18],[-65,-35,22],[-40,-35,19],[-15,-35,21],
    [10,-35,18],[38,-35,22],[62,-35,19],[88,-35,21],[112,-35,18],
  ];
  cubicleData.forEach(([x, z, h]) => {
    // desk
    addBox(14, 1.2, 8, 0xb98a5a, x, 6, z);
    // monitor
    addBox(5, 4, 0.6, 0x1a1d22, x, 9.5, z - 3);
    // partition wall behind the desk
    addBox(16, 13, 1.2, 0x9aa3ad, x, h / 2 + 2, z + 5);
    // partition fabric panel accent
    addBox(15, 9, 1.4, 0x6f93a8, x, h / 2, z + 5.1);
  });

  // Ceiling fluorescent light panels — replaces sun, scattered overhead.
  const lightPanels = [
    [-80,-55,-30],[0,-55,-30],[80,-55,-30],
    [-160,-55,-45],[160,-55,-45],
  ];
  lightPanels.forEach(([x, z, y]) => {
    addBox(24, 2, 10, 0xfafdff, x, -y, z);
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

  let ofPlayer  = null;
  let skinImage = null;

  let ofDir     =  1;
  let ofElapsed =  0;

  const shadowGeo  = new THREE.CircleGeometry(5, 8);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = GROUND_Y + 0.3;
  shadowDisc.visible = false;
  ofScene.add(shadowDisc);

  function tickPlayer(dt) {
    if (!ofPlayer) return;
    ofElapsed += dt;
    let px = ofPlayer.position.x + ofDir * MOVE_SPEED * dt;
    if (px >= X_RANGE)  { px = X_RANGE;  ofDir = -1; }
    if (px <= -X_RANGE) { px = -X_RANGE; ofDir =  1; }
    const phi    = ofElapsed * SKIP_HZ * Math.PI * 2;
    const swing  = Math.sin(phi);
    const bounce = Math.abs(Math.sin(phi)) * BOUNCE_AMP;
    ofPlayer.position.x = px;
    ofPlayer.position.y = GROUND_Y + FEET_OFFSET + bounce;
    ofPlayer.position.z = 0;
    const targetY = ofDir > 0 ? -Math.PI * 0.18 : Math.PI * 0.18;
    ofPlayer.rotation.y += (targetY - ofPlayer.rotation.y) * 0.14;
    ofPlayer.rotation.z  = ofDir * 0.045;
    ofPlayer.children[0].rotation.x =  Math.sin(phi * 0.5) * 0.06;
    ofPlayer.children[2].rotation.x = -swing * ARM_SWING;
    ofPlayer.children[3].rotation.x =  swing * ARM_SWING;
    ofPlayer.children[4].rotation.x =  swing * LEG_SWING;
    ofPlayer.children[5].rotation.x = -swing * LEG_SWING;
    const shadowScale = 1.0 - bounce / (BOUNCE_AMP * 1.6);
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(Math.max(0.3, shadowScale));
    shadowMat.opacity = Math.max(0.05, 0.28 * shadowScale);
  }

  function tickAll(dt) {
    tickPlayer(dt);
  }

  // ── Render loop ──────────────────────────────────────────────────
  let ofLastNow = null;
  let ofRunning = false;

  function ofLoop(now) {
    if (!ofRunning) return;
    requestAnimationFrame(ofLoop);
    if (ofLastNow === null) ofLastNow = now;
    const dt = Math.min((now - ofLastNow) / 1000, 0.1);
    ofLastNow = now;
    tickAll(dt);
    ofRenderer.render(ofScene, ofCamera);
  }

  // ── Load skin ────────────────────────────────────────────────────
  const skinImg = new Image();
  skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinImage = skinImg;
    if (ofPlayer) { ofScene.remove(ofPlayer); ofPlayer = null; }
    ofPlayer = buildPlayer(skinImg);
    ofPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0);
    ofElapsed = 0; ofDir = 1;
    ofScene.add(ofPlayer);
    shadowDisc.visible = true;
  };
  skinImg.onerror = () => {
    console.warn('[Office] Could not load p.png at', SKIN_PATH);
  };
  skinImg.src = SKIN_PATH;

  // ── Show / hide ──────────────────────────────────────────────────
  function showOfOverlay() {
    ofResize();
    ofOverlay.classList.add('visible');
    if (!ofRunning) { ofRunning = true; ofLastNow = null; requestAnimationFrame(ofLoop); }
  }

  function hideOfOverlay() {
    ofOverlay.classList.remove('visible');
    ofRunning = false;
  }

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showOfOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideOfOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideOfOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
