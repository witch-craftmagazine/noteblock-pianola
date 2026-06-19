// easter-eggs/minecraft/index.js
//
// Minecraft character overlay easter egg.
// Shown when the trigger song plays; hidden on pause or end.
//
// Assets expected at these paths (relative to repo root):
//   ./easter-eggs/minecraft/sweetpea.png   ← player skin
//   ./easter-eggs/minecraft/enderman.glb   ← optional; falls back to procedural
//
// Contract: export init({ trigger }) — called by egg-loader.js.
// This module hooks into onMusicPlay/Pause/End using the wrap-and-chain
// pattern used throughout the codebase. It does not modify anything else.

export function init({ trigger }) {

  const TRIGGER_SONG = trigger;
  const SKIN_PATH    = './easter-eggs/minecraft/sweetpea.png';
  const ENDERMAN_GLB = './easter-eggs/minecraft/enderman.glb';

  // ── UV MAP ──────────────────────────────────────────────────────
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
  const mcOverlay = document.getElementById('mc-overlay');
  const mcCanvas  = document.getElementById('mc-canvas');

  const mcRenderer = new THREE.WebGLRenderer({ canvas: mcCanvas, antialias: false, alpha: true });
  mcRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  mcRenderer.setClearColor(0x000000, 0);

  const mcScene = new THREE.Scene();
  mcScene.background = new THREE.Color(0x5b9bd5);
  mcScene.fog = new THREE.Fog(0x5b9bd5, 130, 280);

  const mcCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  mcCamera.position.set(0, 28, 88);
  mcCamera.lookAt(0, 10, 0);

  function mcResize() {
    const w = mcOverlay.offsetWidth  || window.innerWidth;
    const h = mcOverlay.offsetHeight || window.innerHeight;
    mcRenderer.setSize(w, h, false);
    mcCamera.aspect = w / h;
    mcCamera.updateProjectionMatrix();
  }
  mcResize();
  window.addEventListener('resize', mcResize);

  // ── Lighting ────────────────────────────────────────────────────
  mcScene.add(new THREE.AmbientLight(0xc8d8ff, 0.65));
  const mcSun = new THREE.DirectionalLight(0xfff4cc, 1.0);
  mcSun.position.set(70, 110, 50);
  mcScene.add(mcSun);
  const mcFill = new THREE.DirectionalLight(0x7090cc, 0.35);
  mcFill.position.set(-50, 20, 60);
  mcScene.add(mcFill);

  // ── World helpers ────────────────────────────────────────────────
  const _matCache = new Map();
  function solidMat(hex) {
    if (!_matCache.has(hex)) _matCache.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
    return _matCache.get(hex);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    mcScene.add(m);
    return m;
  }

  // Ground
  addBox(500, 6,  80, 0x4d8c1e,  0, -3,   0);
  addBox(500, 12, 80, 0x6b4423,  0, -12,  0);
  addBox(500, 8,  80, 0x555555,  0, -22,  0);
  for (let x = -200; x <= 200; x += 8) {
    addBox(4, 0.4, 80, Math.random() > 0.5 ? 0x558a1e : 0x5fa022, x, 0, 0);
  }

  // Trees
  const treeData = [
    [-110,-20,16],[-85,-20,14],[-60,-20,18],[-35,-20,15],[-8,-20,17],
    [18,-20,14],[45,-20,18],[68,-20,15],[92,-20,17],[115,-20,14],
    [-120,-35,20],[-90,-35,18],[-65,-35,22],[-40,-35,19],[-15,-35,21],
    [10,-35,18],[38,-35,22],[62,-35,19],[88,-35,21],[112,-35,18],
  ];
  treeData.forEach(([x, z, h]) => {
    addBox(4, h,   4, 0x5c3d1e, x, h / 2, z);
    addBox(14,14, 14, 0x2d7a1f, x, h + 5, z);
    addBox(10,10, 10, 0x267316, x, h + 8, z + 1);
  });

  // Clouds
  const mcClouds = [];
  function makeCloud(x, y, z) {
    const g = new THREE.Group();
    [[0,0,0,20,5,10],[14,0,-2,12,4,8],[-12,0,1,10,4,7],[4,5,0,14,4,8],[-5,4,2,10,3,6]]
      .forEach(([cx,cy,cz,cw,ch,cd]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(cw,ch,cd), solidMat(0xeef5ff));
        m.position.set(cx,cy,cz);
        g.add(m);
      });
    g.position.set(x, y, z);
    mcScene.add(g);
    mcClouds.push({ obj: g, speed: 1.5 + Math.random() });
  }
  makeCloud(-90, 65, -30); makeCloud(20, 72, -25);
  makeCloud(120, 60, -38); makeCloud(-180, 68, -20);
  makeCloud(200, 64, -45); makeCloud(60, 75, -50);

  // Sun
  addBox(20, 20, 2, 0xFFE060, 80, 85, -55);
  addBox(26,  4, 2, 0xFFCC30, 80, 85, -55);
  addBox(4,  26, 2, 0xFFCC30, 80, 85, -55);

  // ── Skin helpers ─────────────────────────────────────────────────
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

  // ── Poof particle system ─────────────────────────────────────────
  const POOF_DURATION = 0.55;
  const POOF_COUNT    = 14;
  let   activePoofs   = [];

  function spawnPoof(x, y, isEnderman) {
    const color  = isEnderman ? 0x8833cc : 0xdddddd;
    const color2 = isEnderman ? 0x330066 : 0xaaaaaa;
    for (let i = 0; i < POOF_COUNT; i++) {
      const size = 2 + Math.random() * 3.5;
      const geo  = new THREE.BoxGeometry(size, size, size);
      const mat  = new THREE.MeshLambertMaterial({
        color: Math.random() > 0.4 ? color : color2,
        transparent: true, opacity: 1.0, depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      mcScene.add(mesh);
      const angle = Math.random() * Math.PI * 2;
      const speed = 8 + Math.random() * 22;
      activePoofs.push({
        mesh, mat,
        vx: Math.cos(angle) * speed,
        vy: 6 + Math.random() * 18,
        vz: (Math.random() - 0.5) * 6,
        spin: (Math.random() - 0.5) * 8,
        age: 0,
      });
    }
  }

  function tickPoofs(dt) {
    for (let i = activePoofs.length - 1; i >= 0; i--) {
      const p = activePoofs[i];
      p.age += dt;
      const t = p.age / POOF_DURATION;
      if (t >= 1) {
        mcScene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mat.dispose();
        activePoofs.splice(i, 1);
        continue;
      }
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 18 * dt;
      p.mesh.rotation.x += p.spin * dt;
      p.mesh.rotation.z += p.spin * 0.7 * dt;
      p.mesh.scale.setScalar(1 + t * 1.4);
      p.mat.opacity = 1 - t * t;
    }
  }

  // ── Enderman ─────────────────────────────────────────────────────
  let mcEnderman     = null;
  let endermanMixer  = null;
  let endermanLoaded = false;
  let endermanFailed = false;

  function buildProceduralEnderman() {
    const g    = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const eye  = new THREE.MeshBasicMaterial({ color: 0xff44ff });
    function pb(w, h, d, x, y, z, mat) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat || dark);
      m.position.set(x, y, z); g.add(m); return m;
    }
    pb(3, 15, 2,  0, 7.5, 0);
    pb(3, 10, 2, -2.5, 0, 0);
    pb(3, 10, 2,  2.5, 0, 0);
    pb(2, 22, 2, -4, 13, 0);
    pb(2, 22, 2,  4, 13, 0);
    const head = pb(5, 5, 5, 0, 19, 0);
    const eL = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.2), eye);
    eL.position.set(-1.2, 0.4, 2.6); head.add(eL);
    const eR = new THREE.Mesh(new THREE.BoxGeometry(1, 0.6, 0.2), eye);
    eR.position.set( 1.2, 0.4, 2.6); head.add(eR);
    g.userData.headPart = g.children[5];
    g.userData.lLeg     = g.children[1];
    g.userData.rLeg     = g.children[2];
    g.userData.lArm     = g.children[3];
    g.userData.rArm     = g.children[4];
    return g;
  }

  function loadEnderman(onReady) {
    if (endermanLoaded) { onReady(mcEnderman); return; }
    if (endermanFailed) { onReady(null);       return; }
    const Loader = window.THREE && THREE.GLTFLoader;
    if (Loader) {
      new Loader().load(
        ENDERMAN_GLB,
        (gltf) => {
          mcEnderman    = gltf.scene;
          endermanMixer = gltf.animations.length ? new THREE.AnimationMixer(mcEnderman) : null;
          if (endermanMixer) endermanMixer.clipAction(gltf.animations[0]).play();
          mcEnderman.scale.setScalar(12);
          endermanLoaded = true;
          onReady(mcEnderman);
        },
        undefined,
        (err) => {
          console.warn('[MC Overlay] enderman.glb failed, using procedural fallback.', err);
          endermanFailed = true;
          mcEnderman = buildProceduralEnderman();
          endermanLoaded = true;
          onReady(mcEnderman);
        }
      );
    } else {
      endermanFailed = true;
      mcEnderman = buildProceduralEnderman();
      endermanLoaded = true;
      onReady(mcEnderman);
    }
  }

  // ── Animation state machine ──────────────────────────────────────
  const GROUND_Y    = 0;
  const FEET_OFFSET = 16;
  const X_RANGE     = 52;
  const MOVE_SPEED  = 13;
  const SKIP_HZ     = 2.3;
  const BOUNCE_AMP  = 5.2;
  const LEG_SWING   = Math.PI * 0.44;
  const ARM_SWING   = Math.PI * 0.33;
  const END_MOVE_SPEED = 11;
  const END_WALK_HZ    = 1.6;
  const END_LEG_SWING  = Math.PI * 0.30;
  const END_ARM_SWING  = Math.PI * 0.20;

  let mcPlayer  = null;
  let skinImage = null;

  let mcState   = 'player';
  let poofTimer = 0;
  const POOF_PAUSE = 0.28;

  let mcDir      =  1;
  let mcElapsed  =  0;
  let endElapsed =  0;

  const shadowGeo  = new THREE.CircleGeometry(5, 8);
  const shadowMat  = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false });
  const shadowDisc = new THREE.Mesh(shadowGeo, shadowMat);
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.y = GROUND_Y + 0.3;
  shadowDisc.visible = false;
  mcScene.add(shadowDisc);

  function tickPlayer(dt) {
    if (!mcPlayer) return;
    mcElapsed += dt;
    let px = mcPlayer.position.x + mcDir * MOVE_SPEED * dt;
    if (px >= X_RANGE && mcState === 'player') { px = X_RANGE; triggerPoofToEnderman(px); return; }
    const phi    = mcElapsed * SKIP_HZ * Math.PI * 2;
    const swing  = Math.sin(phi);
    const bounce = Math.abs(Math.sin(phi)) * BOUNCE_AMP;
    mcPlayer.position.x = px;
    mcPlayer.position.y = GROUND_Y + FEET_OFFSET + bounce;
    mcPlayer.position.z = 0;
    const targetY = mcDir > 0 ? -Math.PI * 0.18 : Math.PI * 0.18;
    mcPlayer.rotation.y += (targetY - mcPlayer.rotation.y) * 0.14;
    mcPlayer.rotation.z  = mcDir * 0.045;
    mcPlayer.children[0].rotation.x =  Math.sin(phi * 0.5) * 0.06;
    mcPlayer.children[2].rotation.x = -swing * ARM_SWING;
    mcPlayer.children[3].rotation.x =  swing * ARM_SWING;
    mcPlayer.children[4].rotation.x =  swing * LEG_SWING;
    mcPlayer.children[5].rotation.x = -swing * LEG_SWING;
    const shadowScale = 1.0 - bounce / (BOUNCE_AMP * 1.6);
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(Math.max(0.3, shadowScale));
    shadowMat.opacity = Math.max(0.05, 0.28 * shadowScale);
  }

  function tickEnderman(dt) {
    if (!mcEnderman) return;
    endElapsed += dt;
    if (endermanMixer) endermanMixer.update(dt);
    let px = mcEnderman.position.x + (-1) * END_MOVE_SPEED * dt;
    if (px <= -X_RANGE && mcState === 'enderman') { px = -X_RANGE; triggerPoofToPlayer(px); return; }
    const phi   = endElapsed * END_WALK_HZ * Math.PI * 2;
    const swing = Math.sin(phi);
    mcEnderman.position.x = px;
    mcEnderman.position.y = GROUND_Y + FEET_OFFSET - 2;
    mcEnderman.position.z = 0;
    mcEnderman.rotation.y = Math.PI * 0.12;
    if (!endermanMixer) {
      const ud = mcEnderman.userData;
      if (ud.headPart) ud.headPart.rotation.x = Math.sin(endElapsed * 0.8) * 0.06;
      if (ud.lArm) ud.lArm.rotation.x =  swing * END_ARM_SWING;
      if (ud.rArm) ud.rArm.rotation.x = -swing * END_ARM_SWING;
      if (ud.lLeg) ud.lLeg.rotation.x = -swing * END_LEG_SWING;
      if (ud.rLeg) ud.rLeg.rotation.x =  swing * END_LEG_SWING;
    }
    shadowDisc.position.x = px;
    shadowDisc.scale.setScalar(0.85);
    shadowMat.opacity = 0.18;
  }

  function triggerPoofToEnderman(atX) {
    mcState = 'poofing_to_enderman'; poofTimer = 0;
    if (mcPlayer) mcPlayer.visible = false;
    shadowDisc.visible = false;
    spawnPoof(atX, GROUND_Y + FEET_OFFSET + 4, false);
  }

  function triggerPoofToPlayer(atX) {
    mcState = 'poofing_to_player'; poofTimer = 0;
    if (mcEnderman) mcEnderman.visible = false;
    shadowDisc.visible = false;
    spawnPoof(atX, GROUND_Y + FEET_OFFSET + 8, true);
  }

  function finishPoofToEnderman(atX) {
    loadEnderman((em) => {
      if (!em) {
        mcDir = -1;
        if (mcPlayer) { mcPlayer.visible = true; mcPlayer.position.x = X_RANGE; }
        shadowDisc.visible = true;
        mcState = 'player';
        return;
      }
      if (!em.parent) mcScene.add(em);
      em.position.set(atX, GROUND_Y + FEET_OFFSET - 2, 0);
      em.visible = true;
      endElapsed = 0;
      shadowDisc.visible = true;
      mcState = 'enderman';
    });
  }

  function finishPoofToPlayer() {
    if (mcEnderman) mcEnderman.visible = false;
    mcDir = 1;
    if (mcPlayer) { mcPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0); mcPlayer.visible = true; }
    mcElapsed = 0;
    shadowDisc.visible = true;
    mcState = 'player';
  }

  function tickAll(dt) {
    tickPoofs(dt);
    switch (mcState) {
      case 'player':              tickPlayer(dt);  break;
      case 'poofing_to_enderman': poofTimer += dt; if (poofTimer >= POOF_PAUSE) finishPoofToEnderman(X_RANGE); break;
      case 'enderman':            tickEnderman(dt); break;
      case 'poofing_to_player':   poofTimer += dt; if (poofTimer >= POOF_PAUSE) finishPoofToPlayer(); break;
    }
  }

  // ── Render loop ──────────────────────────────────────────────────
  let mcLastNow = null;
  let mcRunning = false;

  function mcLoop(now) {
    if (!mcRunning) return;
    requestAnimationFrame(mcLoop);
    if (mcLastNow === null) mcLastNow = now;
    const dt = Math.min((now - mcLastNow) / 1000, 0.1);
    mcLastNow = now;
    tickAll(dt);
    mcClouds.forEach(({ obj, speed }) => {
      obj.position.x += dt * speed;
      if (obj.position.x > 220) obj.position.x = -220;
    });
    mcRenderer.render(mcScene, mcCamera);
  }

  // ── Load skin ────────────────────────────────────────────────────
  const skinImg = new Image();
  skinImg.crossOrigin = 'anonymous';
  skinImg.onload = () => {
    skinImage = skinImg;
    if (mcPlayer) { mcScene.remove(mcPlayer); mcPlayer = null; }
    mcPlayer = buildPlayer(skinImg);
    mcPlayer.position.set(-X_RANGE, GROUND_Y + FEET_OFFSET, 0);
    mcElapsed = 0; mcDir = 1;
    mcScene.add(mcPlayer);
    shadowDisc.visible = true;
    mcState = 'player';
    loadEnderman(() => {}); // pre-load in background
  };
  skinImg.onerror = () => {
    console.warn('[MC Overlay] Could not load sweetpea.png at', SKIN_PATH);
  };
  skinImg.src = SKIN_PATH;

  // ── Show / hide ──────────────────────────────────────────────────
  function showMcOverlay() {
    mcResize();
    mcOverlay.classList.add('visible');
    if (!mcRunning) { mcRunning = true; mcLastNow = null; requestAnimationFrame(mcLoop); }
  }

  function hideMcOverlay() {
    mcOverlay.classList.remove('visible');
    mcRunning = false;
  }

  // ── Hook into music callbacks ────────────────────────────────────
  const _prevPlay  = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd   = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const raw  = songFile || window._currentSong || '';
    const name = raw.replace(/\.mid$/i, '').replace(/^.*[\\/]/, '');
    if (name === TRIGGER_SONG) showMcOverlay();
    if (_prevPlay) _prevPlay(songFile);
  };

  window.onMusicPause = function (songFile) {
    hideMcOverlay();
    if (_prevPause) _prevPause(songFile);
  };

  window.onMusicEnd = function (songFile) {
    hideMcOverlay();
    if (_prevEnd) _prevEnd(songFile);
  };

  window._setCurrentSong = function (name) { window._currentSong = name; };
}
