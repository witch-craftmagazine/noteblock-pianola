// easter-eggs/egg-loader.js
// Fetches the egg registry and initialises each egg module.
//
// Each egg module must export:
//   init({ trigger: string }) → void
//
// The loader does not know what any egg renders.
// Eggs subscribe to onMusicPlay/Pause/End themselves using the
// wrap-and-chain pattern used throughout this codebase.
//
// To add a new easter egg:
//   1. Create easter-eggs/[name]/index.js exporting init({ trigger })
//   2. Add one entry to easter-eggs/registry.json
//   3. No changes to index.html or this file

(async () => {
  let registry;
  try {
    const res = await fetch('./easter-eggs/registry.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    registry = await res.json();
  } catch (e) {
    console.error('[EggLoader] Could not load registry.json:', e);
    return;
  }

  for (const egg of registry) {
    try {
      const mod = await import(egg.module);
      if (typeof mod.init !== 'function') {
        console.warn(`[EggLoader] ${egg.id}: module has no init() export — skipping`);
        continue;
      }
      mod.init({ trigger: egg.trigger });
      console.log(`[EggLoader] ✓ loaded egg: ${egg.id} (trigger: "${egg.trigger}")`);
    } catch (e) {
      console.error(`[EggLoader] Failed to load egg "${egg.id}":`, e);
      // One broken egg does not prevent others from loading
    }
  }
})();
