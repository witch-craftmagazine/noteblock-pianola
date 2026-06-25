// easter-eggs/duck/index.js
//
// "Peter and the Wolf" easter egg — pond scene with a cast of characters:
//
//   duck    — on the pond (GLB has a walk animation)
//   parrot  — circles in the air above the scene (no GLB animation; procedural)
//   cat     — prowls the near grass, left–right (no GLB animation; procedural)
//   wolf    — stalks the far treeline, left–right (no GLB animation; procedural)
//
// Assets (relative to repo root):
//   ./easter-eggs/duck/duck.glb
//   ./easter-eggs/duck/parrot.glb
//   ./easter-eggs/duck/cat.glb
//   ./easter-eggs/duck/wolf.glb
//
// Palette (pastel):
//   #8cb369  sage green   — grass, foliage
//   #f4e285  soft yellow  — sun, lily flowers
//   #f4a259  warm peach   — trunks, reeds, earth
//   #5b8e7d  muted teal   — pond water
//   #bc4b51  dusty rose   — reed tips, deep ground
//
// Contract: export init({ trigger }) — called by egg-loader.js.

export function init({ trigger }) {
  const TRIGGER_SONG = trigger; // "peter_and_the_wolf_op.67_1936_-_prokofiev"
  const BASE_PATH = "./easter-eggs/duck/";

  // ── Palette ──────────────────────────────────────────────────────
  const C_GREEN = 0x8cb369;
  const C_YELLOW = 0xf4e285;
  const C_PEACH = 0xf4a259;
  const C_TEAL = 0x5b8e7d;
  const C_ROSE = 0xbc4b51;

  // ── Overlay / Canvas ─────────────────────────────────────────────
  const dkOverlay = document.getElementById("duck-overlay");
  const dkCanvas = document.getElementById("duck-canvas");

  // ── Renderer / Scene / Camera ────────────────────────────────────
  const dkRenderer = new THREE.WebGLRenderer({
    canvas: dkCanvas,
    antialias: true,
    alpha: true,
  });
  dkRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  dkRenderer.setClearColor(0x000000, 0);

  const SKY = 0xd6eaf0;
  const dkScene = new THREE.Scene();
  dkScene.background = new THREE.Color(SKY);
  dkScene.fog = new THREE.Fog(SKY, 120, 280);

  const dkCamera = new THREE.PerspectiveCamera(55, 1, 0.5, 500);
  dkCamera.position.set(0, 18, 72);
  dkCamera.lookAt(0, 4, 0);

  function dkResize() {
    const w = dkOverlay.offsetWidth || window.innerWidth;
    const h = dkOverlay.offsetHeight || window.innerHeight;
    dkRenderer.setSize(w, h, false);
    dkCamera.aspect = w / h;
    dkCamera.updateProjectionMatrix();
  }
  dkResize();
  window.addEventListener("resize", dkResize);

  // ── Lighting ─────────────────────────────────────────────────────
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
    if (!_matCache.has(key))
      _matCache.set(
        key,
        new THREE.MeshLambertMaterial({ color: hex, ...opts }),
      );
    return _matCache.get(key);
  }
  function addBox(w, h, d, color, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), solidMat(color));
    m.position.set(x, y, z);
    dkScene.add(m);
    return m;
  }

  // ── Ground ───────────────────────────────────────────────────────
  addBox(600, 6, 120, C_GREEN, 0, -3, 0);
  addBox(600, 8, 120, C_PEACH, 0, -10, 0);
  addBox(600, 10, 120, C_ROSE, 0, -19, 0);
  for (let x = -220; x <= 220; x += 9) {
    addBox(3.5, 0.4, 120, Math.random() > 0.5 ? 0x9ec07a : 0x7da854, x, 0.1, 0);
  }

  // ── Pond ─────────────────────────────────────────────────────────
  const pondMat = new THREE.MeshLambertMaterial({
    color: C_TEAL,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
  });
  const pondBase = new THREE.Mesh(
    new THREE.CylinderGeometry(28, 28, 0.5, 48),
    pondMat,
  );
  pondBase.position.set(0, 0.05, -6);
  pondBase.scale.set(1, 1, 0.7);
  dkScene.add(pondBase);

  for (let r = 1; r <= 3; r++) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 7 - 0.3, r * 7 + 0.3, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7ab8ac,
        transparent: true,
        opacity: 0.22 - r * 0.04,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.2, -6);
    ring.scale.set(1, 0.7, 1);
    dkScene.add(ring);
  }

  // ── Lily pads ────────────────────────────────────────────────────
  [
    [-10, -5],
    [8, -14],
    [-16, -12],
    [14, -2],
  ].forEach(([lx, lz]) => {
    const lily = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 3.8, 0.25, 12),
      solidMat(0x6a9e5c),
    );
    lily.position.set(lx, 0.35, lz);
    dkScene.add(lily);
    if (Math.random() > 0.5) {
      const flower = new THREE.Mesh(
        new THREE.CylinderGeometry(0.9, 0.9, 0.5, 8),
        solidMat(C_YELLOW),
      );
      flower.position.set(lx, 0.7, lz);
      dkScene.add(flower);
    }
  });

  // ── Reeds ────────────────────────────────────────────────────────
  [
    [-25, 2],
    [-20, 8],
    [-22, -4],
    [22, 0],
    [24, 8],
    [19, -8],
    [0, -28],
    [8, -26],
  ].forEach(([rx, rz]) => {
    const h = 6 + Math.random() * 4;
    addBox(0.5, h, 0.5, C_PEACH, rx, h / 2, rz);
    addBox(1.0, 1.4, 1.0, C_ROSE, rx, h + 0.7, rz);
  });

  // ── Trees ────────────────────────────────────────────────────────
  // Two layers: near trees at z ≈ -20 (visible midground) and far trees at z ≈ -35
  const treeData = [
    [-110, -22, 14],
    [-78, -20, 11],
    [-52, -18, 13],
    [56, -20, 12],
    [84, -22, 15],
    [112, -20, 10],
    [-130, -35, 18],
    [108, -36, 16],
  ];
  treeData.forEach(([x, z, r]) => {
    addBox(2.4, 8, 2.4, C_PEACH, x, 4, z);
    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(r * 0.7, 8, 6),
      solidMat(C_GREEN),
    );
    canopy.position.set(x, 8 + r * 0.6, z);
    dkScene.add(canopy);
  });

  // Sun disc
  addBox(14, 14, 2, C_YELLOW, 100, 90, -60);

  // ── Bubbles ──────────────────────────────────────────────────────
  const bubbles = [];
  const bubbleGeo = new THREE.SphereGeometry(0.55, 6, 4);
  function randRange(a, b) {
    return a + Math.random() * (b - a);
  }
  function resetBubble(b, scatter) {
    const ang = Math.random() * Math.PI * 2;
    const d = randRange(4, 22);
    b.mesh.position.set(
      Math.cos(ang) * d,
      scatter ? randRange(0.4, 1.4) : 0.45,
      -6 + Math.sin(ang) * d * 0.7,
    );
    Object.assign(b, {
      bobSpeed: randRange(0.4, 0.9),
      bobAmp: randRange(0.12, 0.35),
      bobPhase: Math.random() * Math.PI * 2,
      driftX: randRange(-0.6, 0.6),
      driftZ: randRange(-0.3, 0.3),
      life: randRange(3, 9),
      age: scatter ? Math.random() * 9 : 0,
    });
  }
  for (let i = 0; i < 18; i++) {
    const b = {
      mesh: new THREE.Mesh(
        bubbleGeo,
        new THREE.MeshLambertMaterial({
          color: 0x8ab8b0,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      ),
    };
    resetBubble(b, true);
    dkScene.add(b.mesh);
    bubbles.push(b);
  }
  function tickBubbles(dt) {
    for (const b of bubbles) {
      b.age += dt;
      if (b.age >= b.life) {
        resetBubble(b, false);
        continue;
      }
      b.mesh.position.y =
        0.45 +
        Math.sin(b.age * b.bobSpeed * Math.PI * 2 + b.bobPhase) * b.bobAmp;
      b.mesh.position.x += b.driftX * dt;
      b.mesh.position.z += b.driftZ * dt;
    }
  }

  // ── Ripples ──────────────────────────────────────────────────────
  let rippleT = 0;
  function tickRipples(dt) {
    rippleT += dt;
    dkScene.children
      .filter((c) => c.geometry?.type === "RingGeometry")
      .forEach((ring, i) => {
        ring.material.opacity = Math.max(
          0,
          0.12 + 0.08 * Math.sin(rippleT * 1.1 + i * 1.3),
        );
      });
  }
  // ── GLB loader helper ─────────────────────────────────────────────
  function loadGLB(filename, targetHeight, groundY, onLoad) {
    if (typeof THREE.GLTFLoader === "undefined") {
      console.warn(
        "[Duck egg] THREE.GLTFLoader unavailable — skipping",
        filename,
      );
      return;
    }
    new THREE.GLTFLoader().load(
      BASE_PATH + filename,
      (gltf) => {
        const model = gltf.scene;

        // FIX: Wrap the raw model in an intermediate group.
        // This preserves the model's baked root transforms and prevents rigged
        // meshes (like the wolf/parrot) from detaching from their skeletons.
        const offsetGroup = new THREE.Group();
        offsetGroup.add(model);

        // Scale the wrapper (not the model) to desired height
        const box1 = new THREE.Box3().setFromObject(offsetGroup);
        const size = new THREE.Vector3();
        box1.getSize(size);
        offsetGroup.scale.setScalar(targetHeight / size.y);

        // Recompute bounds after scaling
        const box2 = new THREE.Box3().setFromObject(offsetGroup);
        const ctr = new THREE.Vector3();
        box2.getCenter(ctr);

        // Wrap in pivot — shift the offsetGroup inside so pivot origin = foot-centre
        const pivot = new THREE.Group();
        offsetGroup.position.set(-ctr.x, -box2.min.y, -ctr.z);
        pivot.add(offsetGroup);
        pivot.position.y = groundY;

        // Animations
        let mixer = null;
        if (gltf.animations?.length) {
          mixer = new THREE.AnimationMixer(model);

          const preferredAnimation = {
            "duck.glb": ["walk", "run", "move"],
            "parrot.glb": ["fly"],
            "cat.glb": ["walk"],
            "wolf.glb": ["walk"],
          };

          const wanted = preferredAnimation[filename] || [];

          let clip = null;

          for (const name of wanted) {
            clip = gltf.animations.find(
              (a) => a.name.toLowerCase() === name.toLowerCase(),
            );
            if (clip) break;
          }

          if (!clip) {
            clip = gltf.animations.find((a) =>
              wanted.some((name) =>
                a.name.toLowerCase().includes(name.toLowerCase()),
              ),
            );
          }

          if (!clip) {
            clip = gltf.animations[0];
          }

          mixer.clipAction(clip).play();

          console.log(
            `[Duck egg] ${filename} playing animation "${clip.name}"`,
            gltf.animations.map((a) => a.name),
          );
        } else {
          console.log(`[Duck egg] ${filename} has no animations`);
        }

        dkScene.add(pivot);
        onLoad(pivot, mixer);
      },
      undefined,
      (err) => console.error(`[Duck egg] Failed to load ${filename}:`, err),
    );
  }

  // ── Smooth turn helper ────────────────────────────────────────────
  // Smoothly lerps rotation.y toward targetY, taking the shortest arc.
  function smoothTurn(model, targetY, ease) {
    const dy = targetY - model.rotation.y;
    model.rotation.y += (((dy + Math.PI) % (Math.PI * 2)) - Math.PI) * ease;
  }

  // ══════════════════════════════════════════════════════════════════
  // DUCK — on the pond surface, has a walk animation
  // ══════════════════════════════════════════════════════════════════
  // The duck GLB faces +Z (away from camera) at rotation.y = 0.
  // BASE_ROT = π flips it to face the camera; then ±π/2 turns it left/right.
  const DUCK_BASE_ROT = Math.PI;
  const DUCK_X_RANGE = 18;
  const DUCK_GROUND_Y = 0.5; // on the water surface
  const DUCK_SPEED = 3.8;

  let dkDuck = null,
    dkDuckMixer = null,
    dkDuckDir = 1,
    dkDuckT = 0;

  // Shadow for the duck
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x3a5a50,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });
  const shadowDisc = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 10),
    shadowMat,
  );
  shadowDisc.rotation.x = -Math.PI / 2;
  shadowDisc.position.set(0, DUCK_GROUND_Y + 0.05, -6);
  shadowDisc.visible = false;
  dkScene.add(shadowDisc);

  loadGLB("duck.glb", 8, DUCK_GROUND_Y, (pivot, mixer) => {
    dkDuck = pivot;
    dkDuckMixer = mixer;
    dkDuck.position.x = -DUCK_X_RANGE;
    dkDuck.position.z = -6;
    dkDuck.rotation.y = DUCK_BASE_ROT + Math.PI / 2;
    shadowDisc.visible = true;
  });

  function tickDuck(dt) {
    if (!dkDuck) return;
    dkDuckT += dt;
    if (dkDuckMixer) dkDuckMixer.update(dt);

    let px = dkDuck.position.x + dkDuckDir * DUCK_SPEED * dt;
    if (px >= DUCK_X_RANGE) {
      px = DUCK_X_RANGE;
      dkDuckDir = -1;
    }
    if (px <= -DUCK_X_RANGE) {
      px = -DUCK_X_RANGE;
      dkDuckDir = 1;
    }

    const bob = Math.abs(Math.sin(dkDuckT * 2.8)) * 0.35;
    dkDuck.position.x = px;
    dkDuck.position.y = DUCK_GROUND_Y + bob;

    smoothTurn(
      dkDuck,
      DUCK_BASE_ROT + (dkDuckDir > 0 ? Math.PI / 2 : -Math.PI / 2),
      0.1,
    );
    dkDuck.rotation.z = -dkDuckDir * 0.06;

    shadowDisc.position.x = px;
    shadowMat.opacity = Math.max(0.05, 0.18 - bob * 0.06);
  }

  // ══════════════════════════════════════════════════════════════════
  // CAT — prowls the near grass, just in front of the pond
  // Sits at z ≈ +10 (between camera and pond), ground level.
  // Procedural idle: gentle head-bob and slow stalk pace.
  // ══════════════════════════════════════════════════════════════════
  const CAT_Z = 10; // near-grass strip, in front of the pond
  const CAT_X_RANGE = 38;
  const CAT_GROUND = 0; // ground surface
  const CAT_SPEED = 2.2; // slow prowl

  let dkCat = null,
    dkCatMixer = null,
    dkCatDir = -1,
    dkCatT = 0;

  loadGLB("cat.glb", 7, CAT_GROUND, (pivot, mixer) => {
    dkCat = pivot;
    dkCatMixer = mixer;
    dkCat.position.set(CAT_X_RANGE, CAT_GROUND, CAT_Z);
    // Cat models typically face +Z; π makes it face camera, then ±π/2 to turn
    dkCat.rotation.y = Math.PI - Math.PI / 2; // start facing left
  });

  function tickCat(dt) {
    if (!dkCat) return;
    dkCatT += dt;
    if (dkCatMixer) dkCatMixer.update(dt);

    let px = dkCat.position.x + dkCatDir * CAT_SPEED * dt;
    if (px >= CAT_X_RANGE) {
      px = CAT_X_RANGE;
      dkCatDir = -1;
    }
    if (px <= -CAT_X_RANGE) {
      px = -CAT_X_RANGE;
      dkCatDir = 1;
    }

    // Very subtle vertical prowl — cats barely bob
    const bob = Math.sin(dkCatT * 3.0) * 0.12;
    dkCat.position.x = px;
    dkCat.position.y = CAT_GROUND + Math.max(0, bob);

    smoothTurn(
      dkCat,
      Math.PI + (dkCatDir > 0 ? Math.PI / 2 : -Math.PI / 2),
      0.08,
    );

    // Tail-tip sway (rotation.z)
    dkCat.rotation.z = Math.sin(dkCatT * 1.2) * 0.04;
  }

  // ══════════════════════════════════════════════════════════════════
  // WOLF — stalks the far tree-line, deeper in the scene.
  // Sits at z ≈ -28, partially behind the reeds/trees.
  // Larger, slower, more menacing pace.
  // ══════════════════════════════════════════════════════════════════
  const WOLF_Z = -28; // behind the pond / treeline
  const WOLF_X_RANGE = 55;
  const WOLF_GROUND = 0;
  const WOLF_SPEED = 4.5; // wolves cover ground faster but appear slower due to distance

  let dkWolf = null,
    dkWolfMixer = null,
    dkWolfDir = 1,
    dkWolfT = 0;

  loadGLB("wolf.glb", 11, WOLF_GROUND, (pivot, mixer) => {
    dkWolf = pivot;
    dkWolfMixer = mixer;
    dkWolf.position.set(-WOLF_X_RANGE, WOLF_GROUND, WOLF_Z);
    dkWolf.rotation.y = Math.PI + Math.PI / 2; // start facing right
  });

  function tickWolf(dt) {
    if (!dkWolf) return;
    dkWolfT += dt;
    if (dkWolfMixer) dkWolfMixer.update(dt);

    let px = dkWolf.position.x + dkWolfDir * WOLF_SPEED * dt;
    if (px >= WOLF_X_RANGE) {
      px = WOLF_X_RANGE;
      dkWolfDir = -1;
    }
    if (px <= -WOLF_X_RANGE) {
      px = -WOLF_X_RANGE;
      dkWolfDir = 1;
    }

    // Wolves have a loping gait — slightly more bounce than the cat
    const bob = Math.abs(Math.sin(dkWolfT * 2.2)) * 0.4;
    dkWolf.position.x = px;
    dkWolf.position.y = WOLF_GROUND + bob;

    smoothTurn(
      dkWolf,
      Math.PI + (dkWolfDir > 0 ? Math.PI / 2 : -Math.PI / 2),
      0.07,
    );
    dkWolf.rotation.z = -dkWolfDir * 0.04;
  }

  // ══════════════════════════════════════════════════════════════════
  // PARROT — circles lazily in the air above the scene.
  // Flies a gentle elliptical orbit, banking into the turn.
  // ══════════════════════════════════════════════════════════════════
  const PARROT_ORBIT_RX = 38; // orbit radius X
  const PARROT_ORBIT_RZ = 22; // orbit radius Z (shallower — perspective foreshortening)
  const PARROT_ORBIT_CZ = -8; // orbit centre Z (over the pond)
  const PARROT_ALT = 36; // altitude
  const PARROT_SPEED = 0.35; // radians/sec — lazy circles

  let dkParrot = null,
    dkParrotMixer = null,
    dkParrotAngle = 0;

  loadGLB("parrot.glb", 5, 0, (pivot, mixer) => {
    dkParrot = pivot;
    dkParrotMixer = mixer;
    // tickParrot sets position every frame, including Y altitude
  });

  function tickParrot(dt) {
    if (!dkParrot) return;
    if (dkParrotMixer) dkParrotMixer.update(dt);

    dkParrotAngle += PARROT_SPEED * dt;

    const px = Math.cos(dkParrotAngle) * PARROT_ORBIT_RX;
    const pz = PARROT_ORBIT_CZ + Math.sin(dkParrotAngle) * PARROT_ORBIT_RZ;

    // Altitude: add a gentle sine dip so it feels alive
    const alt = PARROT_ALT + Math.sin(dkParrotAngle * 1.7) * 3;

    dkParrot.position.set(px, alt, pz);

    // Face the direction of travel (tangent of the ellipse)
    // dx/dθ = -sin θ * Rx,  dz/dθ = cos θ * Rz
    const tx = -Math.sin(dkParrotAngle) * PARROT_ORBIT_RX;
    const tz = Math.cos(dkParrotAngle) * PARROT_ORBIT_RZ;
    const targetY = Math.atan2(tx, tz); // atan2(x, z) gives yaw in Three.js convention
    smoothTurn(dkParrot, targetY, 0.12);

    // Bank into the turn — lean away from centre
    dkParrot.rotation.z = -Math.sin(dkParrotAngle) * 0.25;

    // Wing-flap: gentle pitch oscillation
    dkParrot.rotation.x = Math.sin(dkParrotAngle * 6) * 0.18;
  }

  // ── Master tick ──────────────────────────────────────────────────
  function tickAll(dt) {
    tickDuck(dt);
    tickCat(dt);
    tickWolf(dt);
    tickParrot(dt);
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
    dkOverlay.classList.add("visible");
    if (!dkRunning) {
      dkRunning = true;
      dkLastNow = null;
      requestAnimationFrame(dkLoop);
    }
  }
  function hideDkOverlay() {
    dkOverlay.classList.remove("visible");
    dkRunning = false;
  }

  // Load all models up front (mirrors how Green loads its skin image)
  // loadGLB calls are already made above — models appear as soon as they arrive.

  // ── Music callbacks ───────────────────────────────────────────────
  const _prevPlay = window.onMusicPlay;
  const _prevPause = window.onMusicPause;
  const _prevEnd = window.onMusicEnd;

  window.onMusicPlay = function (songFile) {
    const name = (songFile || window._currentSong || "")
      .replace(/\.mid$/i, "")
      .replace(/^.*[\\/]/, "");
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
  window._setCurrentSong = function (name) {
    window._currentSong = name;
  };
}
