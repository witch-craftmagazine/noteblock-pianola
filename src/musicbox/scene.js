// ─────────────────────────────────────────────────────────────────
//  MUSIC BOX — 3D SCENE
//  Camera, lighting, GLB loading, lid/crank animation state machine,
//  and pointer interaction (drag-to-wind, tap-to-open lid).
//
//  Split out of the old inline <script> in index.html. Behavior is
//  unchanged; only the module boundary and the THREE import are new.
// ─────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// The easter-egg modules (easter-eggs/*/index.js) are loaded independently
// by egg-loader.js and were written against the old setup where three.js
// was a plain `<script src="three.min.js">` global, with a second
// GLTFLoader script that hung `GLTFLoader` off that same global `THREE`
// object. They still reference the bare `THREE` global directly (see e.g.
// easter-eggs/minecraft/index.js, easter-eggs/duck/index.js) and none of
// them import three.js themselves. Now that three.js is loaded via a real
// ES import instead, keep that global alive here so the eggs keep working.
// (Can't just do `THREE.GLTFLoader = GLTFLoader` — a module namespace
// object is frozen — so this copies the exports into a plain object first.)
window.THREE = Object.assign({}, THREE, { GLTFLoader });

// ─────────────────────────────────────────────
//  CONFIG — tweak these values freely
// ─────────────────────────────────────────────
const CONFIG = {
  glbPath: './musicbox.glb',

  // Camera position (where it starts)
  cameraDistance: 5,
  cameraHeight: 1.5,

  // Lighting
  ambientIntensity: 0.7,
  keyLightIntensity: 1.4,
  fillLightIntensity: 0.5,
  rimLightIntensity: 0.8,

  // Crank: how many pixels of drag = one full wind revolution
  DRAG_PX_PER_REV: 120,
  // How many revolutions needed to trigger play
  WINDS_TO_PLAY: 1.5,
};

// ─────────────────────────────────────────────
//  SCENE SETUP
// ─────────────────────────────────────────────
const canvas  = document.getElementById('three-canvas');
const loading  = document.getElementById('loading');
const errorBox  = document.getElementById('error');
const container = document.getElementById('canvas-container');
const windHint  = document.getElementById('wind-hint');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type  = THREE.PCFSoftShadowMap;

const scene  = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);

const cameraBaseAngle = Math.PI / 6;
camera.position.set(
  Math.sin(cameraBaseAngle) * CONFIG.cameraDistance,
  CONFIG.cameraHeight,
  Math.cos(cameraBaseAngle) * CONFIG.cameraDistance
);
camera.lookAt(0, 0.5, 0);

// ─────────────────────────────────────────────
//  CAMERA FOV THAT ADAPTS TO PORTRAIT/NARROW SCREENS
// ─────────────────────────────────────────────
// PerspectiveCamera's fov is the *vertical* FOV; the horizontal FOV three.js
// derives is fov * aspect. On a narrow/portrait mobile viewport (aspect < 1)
// that horizontal FOV collapses, so the box's left/right edges get clipped
// by the canvas even though nothing about the scene changed. We widen the
// vertical FOV on narrow screens so the horizontal FOV stays roughly
// constant, keeping the whole model in frame.
const BASE_FOV = 45;
function updateCameraForViewport() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? BASE_FOV / camera.aspect : BASE_FOV;
  camera.fov = Math.min(camera.fov, 100); // clamp so very tall screens don't get a fisheye look
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
updateCameraForViewport();

// ─────────────────────────────────────────────
//  LIGHTING
// ─────────────────────────────────────────────
const ambient = new THREE.AmbientLight(0xfff4e0, CONFIG.ambientIntensity);
scene.add(ambient);

const keyLight = new THREE.DirectionalLight(0xfff8ee, CONFIG.keyLightIntensity);
keyLight.position.set(-3, 5, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far  = 20;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xddeeff, CONFIG.fillLightIntensity);
fillLight.position.set(4, 2, -1);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0xaaddff, CONFIG.rimLightIntensity);
rimLight.position.set(0, 3, -5);
scene.add(rimLight);

// ─────────────────────────────────────────────
//  GLB LOADER
// ─────────────────────────────────────────────
async function loadGLB(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buffer = await res.arrayBuffer();

  if (new DataView(buffer).getUint32(0, true) !== 0x46546C67) throw new Error('Not a valid GLB file');

  const loader = new GLTFLoader();

  return new Promise((resolve, reject) => {
  loader.parse(buffer, '', resolve, reject);
  });
}

// ─────────────────────────────────────────────
//  ANIMATION SYSTEM
// ─────────────────────────────────────────────
let mixer = null;

// Tracks whether the close animation is currently mid-play.
// Prevents open from firing before close finishes.
let _lidClosing = false;
// Tracks whether the open animation is currently mid-play.
// Used to guard lid state checks and prevent redundant open calls.
let _lidOpening = false;
// If open was requested while close was still playing, queue it.
let _openQueued = false;

window.musicBoxAnimations = {
  crank_spin: null,
  open:  null,
  close:  null,
  idle:  null,

  play(name) {
  const action = this[name];
  if (!action) {
  console.warn(`[MusicBox] ⚠ Animation '${name}' not found on mixer — check clip names in GLB.`);
  return;
  }

  const clipDuration = action.getClip().duration;

  // Stop any animations that would fight the lid pose.
  // A clamped or paused action still contributes its pose to the mixer,
  // so we must fully stop() them — not just pause — before playing close/open.
  if (name === 'close') {
  if (this.open)  { this.open.stop();  }
  if (this.idle)  { this.idle.stop();  }
  _lidClosing = true;
  _lidOpening = false;  // open was interrupted — clear its flag
  _openQueued = false;
  }
  if (name === 'open') {
  if (_lidClosing) {
  _openQueued = true;
  return;
  }
  if (this.close) { this.close.stop(); }
  _lidOpening = true;
  }


  // reset() alone doesn't always re-enable a finished action —
  // Explicitly set enabled = true after reset() to guarantee it runs.
  action.stop();
  action.reset();
  action.enabled = true;
  action.clampWhenFinished = true;
  action.setLoop(THREE.LoopOnce, 1);
  action.play();

  },

  setCrankSpinning(on) {
  const crank = this.crank_spin;
  const idle  = this.idle;
  if (on) {
  if (crank) {
  // Resume path: action was playing and then paused (enabled stays true, time is preserved).
  // Fresh path:  action was stopped (enabled=false) or never played — needs full reset.
  if (crank.paused && crank.enabled) {
  crank.paused = false;
  } else {
  crank.reset();
  crank.enabled = true;
  crank.paused  = false;
  crank.setLoop(THREE.LoopRepeat, Infinity);
  crank.play();
  }
  }
  if (idle) {
  idle.stop();
  idle.reset();
  idle.enabled = true;
  idle.setLoop(THREE.LoopRepeat, Infinity);
  idle.play();
  }
  } else {
  // Pause rather than stop so the handle stays at its current pose
  // and position is preserved for the next resume.
  if (crank) { crank.paused = true; }
  if (idle)  { idle.stop(); }
  }
  },
};

// ─────────────────────────────────────────────
//  LOAD MODEL
// ─────────────────────────────────────────────
(async () => {
  try {
  const gltf = await loadGLB(CONFIG.glbPath);
  const model = gltf.scene;
  scene.add(model);

  // Center model
  const box = new THREE.Box3().setFromObject(model);
  const cen = box.getCenter(new THREE.Vector3());
  model.position.sub(cen);
  model.position.y += (box.max.y - box.min.y) / 2;

  // Shadows
  model.traverse(child => {
  if (child.isMesh) {
  child.castShadow  = true;
  child.receiveShadow = true;
  }
  });

  // Register interactive meshes
  window._registerCrankMeshes && window._registerCrankMeshes(model);
  window._registerLidMeshes  && window._registerLidMeshes(model);

  // Animations
  if (gltf.animations && gltf.animations.length > 0) {
  mixer = new THREE.AnimationMixer(model);

  gltf.animations.forEach(clip => {
  const action = mixer.clipAction(clip);
  const key  = clip.name.toLowerCase().replace(/\s+/g, '_');
  if (window.musicBoxAnimations.hasOwnProperty(key)) {
  window.musicBoxAnimations[key] = action;
  }
  });

  // Strip lid tracks from looping animations so they can't fight open/close.
  // A looping action that includes lid keyframes holds the lid at whatever
  // pose those keyframes define, blending against and defeating close/open.
  const LID_PATTERN = /lid|top|cover/i;
  ['crank_spin', 'idle'].forEach(key => {
  const clip = window.musicBoxAnimations[key]?.getClip();
  if (!clip) return;
  const before = clip.tracks.length;
  clip.tracks = clip.tracks.filter(t => !LID_PATTERN.test(t.name));
  });
  mixer.addEventListener('finished', (e) => {
  const clipName = e.action.getClip().name;
  const key  = clipName.toLowerCase().replace(/\s+/g, '_');

  if (key === 'close') {
  _lidClosing = false;
  if (_openQueued) {
  _openQueued = false;
  window.musicBoxAnimations.play('open');
  }
  }

  if (key === 'open') {
  _lidOpening = false;
  // Crank spin was already started in onMusicPlay — nothing more to do here.
  }
  });

  } else {
  console.warn('[MusicBox] No animations found in GLB. Lid and crank will not animate.');
  }

  loading.classList.add('hidden');

  // Show wind hint
  windHint.classList.add('show');
  setTimeout(() => windHint.classList.remove('show'), 3000);

  } catch (err) {
  console.error('GLB load error:', err);
  loading.classList.add('hidden');
  errorBox.classList.add('visible');
  }
})();

// ─────────────────────────────────────────────
//  RENDER LOOP
// ─────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  // While the user is manually scrubbing the crank, pass 0 so the mixer
  // renders the current pose without advancing time and overwriting action.time.
  if (mixer) mixer.update(isDragging ? 0 : delta);
  renderer.render(scene, camera);
}
animate();

// ─────────────────────────────────────────────
//  INTERACTION STATE
// ─────────────────────────────────────────────
let isDragging  = false;
let lastMouseX  = 0;
let lastMouseY  = 0;
let windAccum  = 0;
let hasPlayed  = false;
let lidOpen  = false;
let crankMeshes  = [];
let lidMeshes  = [];

// Tracks which AnimationActions have been initialized in the mixer
// (avoids using non-standard properties on Three.js objects).
const _initializedActions = new WeakSet();

// ── Raycaster for mesh hit testing ────────────
const raycaster = new THREE.Raycaster();
const mouse  = new THREE.Vector2();

function hitTest(event, meshes) {
  if (!meshes.length) return false;
  const rect = canvas.getBoundingClientRect();
  mouse.x =  ((event.clientX - rect.left)  / rect.width)  * 2 - 1;
  mouse.y = -((event.clientY - rect.top)  / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  return raycaster.intersectObjects(meshes, true).length > 0;
}

// ── Lid toggle ─────────────────────────────────
function toggleLid() {
  if (lidOpen) {
  window.musicBoxAnimations.play('close');
  lidOpen = false;
  } else {
  window.musicBoxAnimations.play('open');
  lidOpen = true;
  }
}


// ─────────────────────────────────────────────
//  INTERACTION — Pointer Events (mouse + touch + stylus)
//
//  P1: Using the Pointer Events API instead of mouse-only events means
//  the crank drag works correctly on touchscreens without any extra code.
//  pointer capture keeps the drag live even if the finger leaves the canvas.
//  touch-action: none (set in CSS) prevents the browser hijacking the touch
//  for scrolling while a drag is in progress.
// ─────────────────────────────────────────────

canvas.style.touchAction = 'none'; // prevent browser scroll hijack during drag

canvas.addEventListener('pointermove', e => {
  if (isDragging) {
    const dx = e.clientX - lastMouseX;
    const dy = e.clientY - lastMouseY;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    const action = window.musicBoxAnimations.crank_spin;
    if (action) {
      const duration  = action.getClip().duration;
      const timePerPx = duration / CONFIG.DRAG_PX_PER_REV;

      const vertDelta  = Math.abs(dy);
      const horizDelta = Math.max(0, -dx);
      const forwardDelta = vertDelta >= Math.abs(dx) ? vertDelta : horizDelta;

      windAccum += forwardDelta;

      if (!action.isRunning() && !_initializedActions.has(action)) {
        action.reset();
        action.enabled = true;
        action.setLoop(THREE.LoopRepeat, Infinity);
        action.play();
        action.paused = true;
        _initializedActions.add(action);
        mixer && mixer.update(0);
      }

      action.time   = (action.time + forwardDelta * timePerPx) % duration;
      action.paused = true;
      mixer && mixer.update(0);
    }
  } else {
    // Only update cursor on non-touch pointers — touch has no visible cursor
    if (e.pointerType !== 'touch') {
      const overCrank = hitTest(e, crankMeshes);
      const overLid   = hitTest(e, lidMeshes);
      canvas.style.cursor = overCrank ? 'grab' : (overLid ? 'pointer' : 'default');
    }
  }
});

canvas.addEventListener('pointerdown', e => {
  const overCrank = hitTest(e, crankMeshes);
  const overLid   = hitTest(e, lidMeshes);

  if (overCrank) {
    // Capture the pointer so pointermove keeps firing even if finger
    // leaves the canvas element bounds during a fast drag.
    canvas.setPointerCapture(e.pointerId);

    isDragging  = true;
    lastMouseX  = e.clientX;
    lastMouseY  = e.clientY;
    if (e.pointerType !== 'touch') canvas.style.cursor = 'grabbing';

    const action = window.musicBoxAnimations.crank_spin;
    if (action) action.paused = true;
    const idleAction = window.musicBoxAnimations.idle;
    if (idleAction) idleAction.stop();
    if (window.musicPlayer && window.musicPlayer.isPlaying()) {
      window.musicPlayer.pause();
    }
    windAccum = 0;
    hasPlayed = false;
  } else if (overLid) {
    toggleLid();
  }
});

window.addEventListener('pointerup', e => {
  if (!isDragging) return;
  isDragging = false;
  if (e.pointerType !== 'touch') canvas.style.cursor = 'default';

  const windsCompleted = windAccum / CONFIG.DRAG_PX_PER_REV;
  if (windsCompleted >= CONFIG.WINDS_TO_PLAY && !hasPlayed) {
    hasPlayed = true;
    if (window.musicPlayer) window.musicPlayer.play();
    // Discrete, user-meaningful crank signal — fires once per completed
    // wind-up (not per pointermove tick), mirroring the window.onMusic*
    // no-op-if-undefined extension-point pattern from script.js so native
    // shells (see NowPlayingBridge.swift) can hook it without this file
    // needing to know anything native exists.
    if (window.onCrankTurn) window.onCrankTurn();
  }
});






window._registerCrankMeshes = function(root) {
  crankMeshes = [];
  root.traverse(child => {
  if (child.name && /crank/i.test(child.name)) crankMeshes.push(child);
  });
};

window._registerLidMeshes = function(root) {
  lidMeshes = [];
  root.traverse(child => {
  if (child.name && /lid|top|cover/i.test(child.name)) lidMeshes.push(child);
  });
};

// ─────────────────────────────────────────────
//  MUSIC CALLBACKS — Goal 3: Lid + crank sync
// ─────────────────────────────────────────────
window.onMusicPlay = () => {

  // Open the lid if it isn't already (animation runs in parallel with music + crank).
  if (!lidOpen) {
  lidOpen = true;
  window.musicBoxAnimations.play('open');
  }

  // Start crank immediately — don't wait for the lid animation to finish.
  // Music and crank are tightly coupled; the lid opening is a parallel flourish.
  window.musicBoxAnimations.setCrankSpinning(true);
};

window.onMusicPause = () => {

  // #2: Stop the crank spinning animation but leave it at its current pose
  // by pausing instead of stopping, so the handle stays put visually.
  const crank = window.musicBoxAnimations.crank_spin;
  if (crank) { crank.paused = true; }
  const idle = window.musicBoxAnimations.idle;
  if (idle)  { idle.stop(); }

  // Close lid (if open or mid-open — play('close') handles the queue guard internally).
  if (lidOpen) {
  window.musicBoxAnimations.play('close');
  lidOpen = false;
  }
};

// Bug #5: handled in script.js — song end now always autoplays next track.
// onMusicEnd resets local wind state so the crank is ready for the next song.
window.onMusicEnd = () => {
  windAccum = 0;
  hasPlayed = false;
  // Stop crank so it restarts cleanly when next song's onMusicPlay fires
  window.musicBoxAnimations.setCrankSpinning(false);
};

// ─────────────────────────────────────────────
//  RESIZE HANDLER
// ─────────────────────────────────────────────
window.addEventListener('resize', () => {
  updateCameraForViewport();
});

export {};
