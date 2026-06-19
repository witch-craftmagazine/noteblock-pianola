# BlockBard — Engineering Plan
### Fabric 1.21.1 Kotlin Mod | NoteBlock Performance System

---

## Table of Contents
1. [Project Overview](#1-project-overview)
2. [User Flow](#2-user-flow)
3. [Architecture Overview](#3-architecture-overview)
4. [Instrument Reference](#4-instrument-reference)
5. [Module Breakdown](#5-module-breakdown)
6. [Key Algorithms](#6-key-algorithms)
7. [Data Formats](#7-data-formats)
8. [Dependencies & Versions](#8-dependencies--versions)
9. [File Structure](#9-file-structure)
10. [Build & Test Guide](#10-build--test-guide)
11. [GitHub Actions CI](#11-github-actions-ci)
12. [Reference Links](#12-reference-links)

---

## 1. Project Overview

**BlockBard** is a survival-friendly Fabric client mod for Minecraft 1.21.1 written in Kotlin.

The core concept is the **NoteBlock Organ**: the player builds a cluster of noteblocks (any layout, any instruments) near where they stand. BlockBard scans the organ, **auto-tunes** each noteblock to whatever pitch a loaded MIDI file needs (by right-clicking it the correct number of times — a real, legitimate interaction), and plays the file back by turning to face and clicking each block in sequence.

This differs from a "type on keys 1–9" performance instrument — BlockBard's primary mode is **automated MIDI organ playback**, with manual keyboard/MIDI-keyboard live play as a secondary mode (still planned, see Section 5.6–5.7).

**Survival-friendliness contract:**
- The mod **never sends fake packets or bypasses anti-cheat** hooks. Every noteblock interaction — including auto-tuning — is a real `PlayerInteractBlock` action, identical to right-clicking.
- The player must have placed the noteblocks themselves. The mod automates *tuning* (right-click cycling, a vanilla action), *look direction*, and *micro-movement* — never inventory or block placement.
- Server operators cannot distinguish BlockBard play from manual play, because there is nothing to distinguish — it is manual play, automated.

---

## 2. User Flow

This is the exact end-to-end flow the implementation must support. Each step maps to specific modules described in Section 5.

```
┌────────────────────────────────────────────────────────────────────┐
│ 1. OPEN GUI                                                         │
│    Hotkey (default: B) or ModMenu → BlockBard entry                 │
│    → opens MainScreen                                               │
├────────────────────────────────────────────────────────────────────┤
│ 2. SELECT MIDI FILE                                                  │
│    MainScreen lists .mid files from config/blockbard/midis/         │
│    Player clicks one → becomes the "loaded track"                   │
├────────────────────────────────────────────────────────────────────┤
│ 3. SCAN THE ORGAN                                                    │
│    OrganScanner scans noteblocks within radius of player             │
│    OrganOverlayHud shows live counts per instrument:                │
│      "Harp: 14  Bass: 6  Bell: 3  Flute: 0  ..."                    │
├────────────────────────────────────────────────────────────────────┤
│ 4. CENTER THE PLAYER                                                  │
│    PlayerController walks/rotates player to the organ's              │
│    geometric center (or best vantage point) so max noteblocks        │
│    are in reach without further movement during playback             │
│    → OrganMap built: BlockPos → reachability + facing data           │
├────────────────────────────────────────────────────────────────────┤
│ 5. AUTO-TUNE                                                          │
│    MidiToOrganMapper decides which noteblock plays which note         │
│    NoteBlockTuner right-clicks each block N times to reach the        │
│    required pitch (vanilla cycle: 0→24→0, one step per click)         │
├────────────────────────────────────────────────────────────────────┤
│ 6. TRANSLATE & PLAY                                                   │
│    MidiFilePlayer reads the file; MidiToOrganMapper assigns           │
│    each event to a tuned block; ArpeggioScheduler sequences           │
│    simultaneous notes; PlayerController executes clicks on time       │
├────────────────────────────────────────────────────────────────────┤
│ 7. PLAYBACK CONTROLS (in MainScreen / PlaybackHud)                    │
│    • Shuffle  → pick next track at random from the midis folder       │
│    • Pause/Resume                                                     │
│    • Tempo slider → scales playback speed (0.5x–2.0x)                 │
└────────────────────────────────────────────────────────────────────┘
```

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    BlockBard Mod (Client-side only)              │
│                                                                   │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐ │
│  │  GUI Layer   │   │  Organ Layer      │   │  Playback Engine │ │
│  │              │   │                   │   │                  │ │
│  │ • MainScreen │──▶│ • OrganScanner    │──▶│ • MidiFilePlayer │ │
│  │ • FilePicker │   │ • OrganMap        │   │ • MidiToOrgan-   │ │
│  │ • OrganOverlay│   │ • NoteBlockTuner  │   │   Mapper         │ │
│  │ • PlaybackHud│   │ • NoteBlockRegistry│  │ • ArpeggioSched. │ │
│  │ • ModMenu    │   │                   │   │ • InstrumentShift│ │
│  │   integration│   │                   │   │                  │ │
│  └──────┬───────┘   └─────────┬─────────┘   └────────┬─────────┘ │
│         │                     │                       │           │
│         └─────────────────────▼───────────────────────┘           │
│                       ┌──────────────────┐                        │
│                       │ PlayerController │                        │
│                       │ • Center-on-organ│                        │
│                       │ • Rotate + step  │                        │
│                       │ • Interact       │                        │
│                       │   (tune / play)  │                        │
│                       └──────────────────┘                        │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ Live Input   │  │ Secondary    │   (kept from original spec   │
│  │ (secondary)  │  │ GUI: Virtual │    for manual play — lower    │
│  │ • Keys 1–9   │  │ Keyboard     │    priority than the organ    │
│  │ • MIDI In    │  │ Screen       │    auto-play pipeline above)  │
│  └──────────────┘  └──────────────┘                              │
└─────────────────────────────────────────────────────────────────┘
```
All logic runs **client-side only**. No server-side component, no networking beyond vanilla MC packets.

---

## 4. Instrument Reference

This section is the ground truth for all noteblock audio behavior. Every other module (Scanner, Registry, Instrument Shifter) derives its logic from these tables.

### 4.1 All Instruments by MIDI Range

Minecraft noteblocks have 25 pitches (0–24). The absolute MIDI note each pitch maps to depends on the instrument's octave offset from the standard range (F♯3–F♯5 = MIDI 54–78).

| Instrument | Sound ID | Block Below | MIDI Range | Note Range | Octave Offset |
|------------|----------|-------------|-----------|------------|---------------|
| **Bass (String Bass)** | `note.bass` | Any wood plank, log, wood, bamboo, hyphae | 30–54 | F♯1–F♯3 | −2 oct |
| **Didgeridoo** | `note.didgeridoo` | Pumpkin | 30–54 | F♯1–F♯3 | −2 oct |
| **Guitar** | `note.guitar` | Any wool | 42–66 | F♯2–F♯4 | −1 oct |
| **Weathered Trumpet** | `note.trumpet_weathered` | Weathered copper, weathered cut copper, weathered chiseled copper | 42–66 | F♯2–F♯4 | −1 oct |
| **Oxidized Trumpet** | `note.trumpet_oxidized` | Oxidized copper, oxidized cut copper, oxidized chiseled copper | 42–66 | F♯2–F♯4 | −1 oct |
| **Harp** | `note.harp` | Dirt, grass block, mycelium, podzol, farmland, path, mud, rooted dirt | 54–78 | F♯3–F♯5 | 0 (standard) |
| **Bass Drum** | `note.bd` | Stone, cobblestone, netherrack, obsidian, concrete, terracotta, ore blocks, bedrock, and most "hard" blocks | 54–78 | F♯3–F♯5 | 0 |
| **Snare** | `note.snare` | Sand, gravel, soul sand, soul soil, concrete powder | 54–78 | F♯3–F♯5 | 0 |
| **Hat (Hi-hat)** | `note.hat` | Glass, sea lantern, beacon, conduit | 54–78 | F♯3–F♯5 | 0 |
| **Banjo** | `note.banjo` | Hay bale | 54–78 | F♯3–F♯5 | 0 |
| **Cow Bell** | `note.cow_bell` | Soul sand | 54–78 | F♯3–F♯5 | 0 |
| **Bit** | `note.bit` | Emerald block | 54–78 | F♯3–F♯5 | 0 |
| **Iron Xylophone** | `note.iron_xylophone` | Iron block | 54–78 | F♯3–F♯5 | 0 |
| **Pling** | `note.pling` | Glowstone | 54–78 | F♯3–F♯5 | 0 |
| **Trumpet** | `note.trumpet` | Copper block, cut copper, chiseled copper | 54–78 | F♯3–F♯5 | 0 |
| **Exposed Trumpet** | `note.trumpet_exposed` | Exposed copper, exposed cut copper, exposed chiseled copper | 54–78 | F♯3–F♯5 | 0 |
| **Flute** | `note.flute` | Clay | 66–90 | F♯4–F♯6 | +1 oct |
| **Bell** | `note.bell` | Gold block | 78–102 | F♯5–F♯7 | +2 oct |
| **Chime** | `note.chime` | Packed ice | 78–102 | F♯5–F♯7 | +2 oct |
| **Xylophone** | `note.xylophone` | Bone block | 78–102 | F♯5–F♯7 | +2 oct |

> **Engineer note:** Soul sand appears twice in vanilla (Cow Bell AND Bass Drum per some sources). Verify against 1.21.1 source — the `NoteBlockInstrument` enum in the decompiled source is authoritative. If there is a conflict, check the `NoteBlockInstrument.of(BlockState)` method logic directly.

> **Engineer note on Minecraft 1.21.1:** The four trumpet instruments (`TRUMPET`, `TRUMPET_EXPOSED`, `TRUMPET_WEATHERED`, `TRUMPET_OXIDIZED`) may be newly added in 1.21 or adjacent snapshots. Verify they exist in the `NoteBlockInstrument` enum for exactly 1.21.1 using Yarn mappings. If the enum names differ from above, use the actual enum constant names.

### 4.2 Mob Head Instruments

When a **mob head is placed on top** of a noteblock, the noteblock plays that mob's ambient sound instead of a musical note. These sounds **do not respond to the noteblock's pitch setting** — they always play at fixed pitch. Note particles do not appear.

| Block on Top | Sound Played | Notes |
|---|---|---|
| `Blocks.SKELETON_SKULL` | Skeleton ambient | `entity.skeleton.ambient` |
| `Blocks.WITHER_SKELETON_SKULL` | Wither Skeleton ambient | `entity.wither_skeleton.ambient` |
| `Blocks.ZOMBIE_HEAD` | Zombie ambient | `entity.zombie.ambient` |
| `Blocks.CREEPER_HEAD` | Creeper **primed** (hiss) | Not the death sound — the fuse sound |
| `Blocks.PIGLIN_HEAD` | Piglin ambient | `entity.piglin.ambient` |
| `Blocks.DRAGON_HEAD` | Ender Dragon ambient | `entity.ender_dragon.ambient` |
| `Blocks.PLAYER_HEAD` | Plays a random note (harp) | Pitch IS used for player heads |

> **Engineer note:** Mob head block variants include wall-mounted forms (`SKELETON_WALL_SKULL`, `ZOMBIE_WALL_HEAD`, etc.). The scanner must check for both floor and wall variants. However, only floor-mounted heads directly above the noteblock (`pos.up()`) trigger the mob sound. Wall-mounted heads on the side of a noteblock do nothing special.

### 4.3 Silenced Noteblocks

A noteblock is **silent** if the block directly above it (`pos.up()`) is:
- Any solid, non-transparent block that is **not** a mob head
- Water or lava source blocks
- Blocks like pressure plates, signs, or torches placed directly above

A noteblock **can** play if the block above is:
- Air
- Any mob head (floor-mounted)
- Transparent / non-solid blocks (e.g., glass — though glass *below* sets Hat instrument; glass *above* does not silence)

> **Engineer note:** Use `BlockState.isAir()` and check the `Block` instance against the mob head set. For other cases, check `BlockState.blocksMovement()` or `Block.hasSolidTopSurface(...)` — but the simplest and most correct approach is to check if the above block is in the `MobHeadSet` (see Section 4.1), otherwise treat any non-air block as silencing.

### 4.4 MIDI Coverage Map

With all instrument types present, BlockBard can cover MIDI 30–102 (6 octaves). Here is the coverage by MIDI note:

```
MIDI  30–41  │ ████ Bass, Didgeridoo only
MIDI  42–53  │ ████ + Guitar, Weathered/Oxidized Trumpet
MIDI  54–65  │ ████ + ALL standard instruments + Trumpet/Exposed Trumpet
MIDI  66–78  │ ████ + Flute (Flute starts at 66; standard ends at 78)
MIDI  78–90  │ ████ Bell, Chime, Xylophone + Flute (overlap at 78–90)
MIDI  90–102 │ ████ Bell, Chime, Xylophone only
```

The instrument shifter (Section 5.3) uses this map to find the best available noteblock for any incoming MIDI note.

---

## 5. Module Breakdown

### 5.1 `OrganScanner` (formerly NoteBlockScanner)
**Purpose:** Discover and catalogue all noteblocks within range, including their playability state. Feeds both `MainScreen`'s live organ overlay (Section 5.12.3) and `PlayerController.centerOnOrgan(...)` (Section 5.3.1).

**How it works:**
- On every `ClientTickEvent` (or on manual rescan), iterate all blocks within a 5-block radius of the player's feet.
- For each `Blocks.NOTE_BLOCK` found, read its `BlockState`:
  - `NoteBlock.INSTRUMENT` — determined by the block *below* the noteblock (see Section 4.1 table).
  - `NoteBlock.NOTE` — integer 0–24. Maps to MIDI note via `instrument.midiBase + note`.
  - `NoteBlock.POWERED` — ignore; we trigger by interaction.
- **Check the block above** (`world.getBlockState(pos.up())`):
  - If in `MOB_HEAD_BLOCKS` set → mark as `MobHeadEntry` with the head type. Not pitch-playable; register separately.
  - If non-air and not a mob head → mark `isSilenced = true`. Still register (player may remove the block), but skip during playback.
  - If air or transparent non-mob-head → normal playable noteblock.

```kotlin
val MOB_HEAD_BLOCKS: Set<Block> = setOf(
    Blocks.SKELETON_SKULL, Blocks.WITHER_SKELETON_SKULL,
    Blocks.ZOMBIE_HEAD, Blocks.CREEPER_HEAD,
    Blocks.PIGLIN_HEAD, Blocks.DRAGON_HEAD, Blocks.PLAYER_HEAD
    // Do NOT include wall variants — only floor-mounted heads directly above silence-break
)
```

**Instrument ↔ block-below mapping** is encoded in `NoteBlockInstrument.of(blockState)` in Minecraft source. Do **not** re-implement this manually — call the vanilla method. See Section 4.1 for the full human-readable table.

**Scan radius:** default 5 blocks, configurable up to 10 in `BlockBardConfig` for larger organ builds. A larger radius means more candidate blocks for `PlayerController.centerOnOrgan(...)` to choose a vantage point from, but also a longer scan time — show a brief loading spinner in `MainScreen` for radius ≥ 8.

**Rescan trigger:** Automatic re-scan every few seconds while `MainScreen` is open (Section 5.12.3), or on a dedicated "rescan" keybind. A full rescan invalidates the current `OrganMap` and requires re-running `PlayerController.centerOnOrgan(...)` if the set of available blocks changed materially (more than a configurable threshold of blocks added/removed).

---

### 5.2 `NoteBlockRegistry`
**Purpose:** Central in-memory map of `BlockPos → NoteBlockEntry`.

```kotlin
enum class NoteBlockStatus { PLAYABLE, SILENCED, MOB_HEAD }

data class NoteBlockEntry(
    val pos: BlockPos,
    val instrument: NoteBlockInstrument,
    val note: Int,                    // 0–24 (Minecraft note index)
    val midiNote: Int,                // instrument.midiBase + note
    val distanceFromPlayer: Double,
    val status: NoteBlockStatus,
    val mobHeadType: Block? = null    // non-null only when status == MOB_HEAD
)
```

**MIDI base per instrument** (derived from Section 3.1 octave offsets):

```kotlin
val NoteBlockInstrument.midiBase: Int get() = when (this) {
    NoteBlockInstrument.BASS,
    NoteBlockInstrument.DIDGERIDOO    -> 30   // F#1
    NoteBlockInstrument.GUITAR,
    NoteBlockInstrument.TRUMPET_WEATHERED,
    NoteBlockInstrument.TRUMPET_OXIDIZED -> 42 // F#2
    NoteBlockInstrument.FLUTE         -> 66   // F#4
    NoteBlockInstrument.BELL,
    NoteBlockInstrument.CHIME,
    NoteBlockInstrument.XYLOPHONE     -> 78   // F#5
    else                              -> 54   // F#3 (standard)
}
```

> **Engineer note:** The enum constant names for the four trumpet variants (`TRUMPET`, `TRUMPET_EXPOSED`, `TRUMPET_WEATHERED`, `TRUMPET_OXIDIZED`) must be verified against the actual Yarn-mapped 1.21.1 source. Use `./gradlew genSources` and search `NoteBlockInstrument` in the generated sources.

- `findBestForMidi(midiNote: Int): NoteBlockEntry?` — returns the closest `PLAYABLE` noteblock matching the pitch exactly. Returns `null` if not found (caller invokes `InstrumentShifter`).
- `findWithShift(midiNote: Int, mode: ShiftMode): NoteBlockEntry?` — delegates to `InstrumentShifter` (Section 4.4).
- `allPlayableMidiNotes(): Set<Int>` — used by the GUI to grey out unavailable keys.
- `allMobHeadEntries(): List<NoteBlockEntry>` — displayed separately in GUI.

---

### 5.3 `PlayerController`
**Purpose:** (a) Find and move the player to the best vantage point to reach the most noteblocks in the organ, and (b) rotate/micro-step/interact with individual blocks during tuning and playback.

**Reach distance:** Minecraft survival reach is 4.5 blocks (measured from player eye position to block face center). The controller must verify this *before* and *during* any approach.

#### 5.3.1 `centerOnOrgan(blocks: List<BlockPos>): CenterResult`

Run once after scanning, before tuning begins (User Flow step 4).

```
FUNCTION centerOnOrgan(blocks):
  // 1. Compute geometric centroid of all candidate noteblocks
  centroid = average(blocks.map { it.toVec3d() })

  // 2. Find the best standing position: the point (on a walkable surface,
  //    within the player's current accessible area) that maximizes the
  //    count of blocks within 4.5-block reach, weighted toward the centroid.
  candidates = generateCandidateStandPositions(centroid, searchRadius = 6)
  // Candidates are existing walkable BlockPos near the centroid -- the
  // controller does NOT place or break blocks to create a stand spot.

  best = candidates.maxByOrNull { pos ->
      blocks.count { it.distanceTo(pos) <= 4.5 }
  }

  IF best == null:
    RETURN CenterResult.NoValidPosition

  // 3. Walk the player to `best` using the same micro-step approach as
  //    individual note reach (Section 6.1), but allow more ticks (up to 20)
  //    since this is a one-time setup move, not a real-time note trigger.
  walkPlayerTo(best, maxTicks = 20)

  RETURN CenterResult.Centered(best, reachableCount = candidates count at best)
```

- This produces the **OrganMap**: a `Map<BlockPos, ReachInfo>` where `ReachInfo` contains whether each block is reachable from the final standing position, and the yaw/pitch needed to face it. Built once after centering; rebuilt only if the player is manually moved or a rescan is triggered.
- Blocks that remain unreachable after centering are flagged `OUT_OF_REACH` and excluded from tuning/playback, with a count shown in `OrganOverlayHud`.

#### 5.3.2 `interactWith(entry, mode: InteractMode)`

Used for both tuning (`InteractMode.TUNE`) and playback (`InteractMode.PLAY`) -- same underlying mechanism, just called at different times.

1. **Check reachability:** Look up precomputed `ReachInfo` from the OrganMap (no need to recompute every call during playback -- this is the performance-critical path).
2. **Rotate:** Set `player.yaw` and `player.pitch` to the precomputed facing. Use smooth interpolation over 1-2 ticks to avoid jarring snapping. Clamp pitch to [-90, 90].
   - Use `MathHelper.wrapDegrees()` to avoid yaw wrapping artifacts.
3. **Micro-step if needed:** Only relevant if the player moved since centering (e.g., knockback, manual movement). If `ReachInfo` reports a block now out of range, recompute a one-off micro-step (same algorithm as 5.3.1, scoped to 1-3 ticks) before interacting.
4. **Interact:** Use `MinecraftClient.instance.interactionManager.interactBlock(...)` with a correctly computed `BlockHitResult`. **Do not touch the packet layer.**
   - `InteractMode.TUNE` interactions are issued by `NoteBlockTuner` (Section 5.5) and are spaced out (not real-time), since tuning happens once before playback starts.
   - `InteractMode.PLAY` interactions are issued by `ArpeggioScheduler` (Section 5.8) on the tick schedule.

> Engineer note: Rotation must happen in `ClientTickEvent` *before* the interact call in the same tick. Interacting before the rotation completes causes a desync. Queue the interact for the tick *after* the rotation is confirmed. This matters most for `PLAY` mode where timing accuracy affects musicality; `TUNE` mode can afford to be slower and more conservative.

---

### 5.4 `InstrumentShifter`
**Purpose:** When a MIDI note has no exact-match noteblock registered, find the best available noteblock using instrument range shifting or octave transposition.

**Shift modes** (user-configurable):

```kotlin
enum class ShiftMode {
    EXACT_ONLY,      // Skip the note if no exact match (live purists)
    INSTRUMENT_SHIFT, // Use a different instrument that natively covers this note
    OCTAVE_SHIFT,    // Transpose by ±1 or ±2 octaves until a match is found
    BEST_EFFORT      // Try INSTRUMENT_SHIFT first, then OCTAVE_SHIFT as fallback
}
```

**`INSTRUMENT_SHIFT` algorithm:**

The core idea: MIDI note 45 (A2) has no standard-range noteblock, but if a Bass or Guitar noteblock is registered at MIDI 45, it can play the note natively at the correct pitch. This is not a "shift" in the musical sense — it's finding an instrument whose range *already includes* this note.

```
FUNCTION findWithInstrumentShift(midiNote: Int): NoteBlockEntry?
  // Check all PLAYABLE entries across all instruments
  FOR each entry IN registry.allPlayable():
    IF entry.midiNote == midiNote:
      candidates.add(entry)

  IF candidates.isNotEmpty():
    RETURN candidates.minByOrNull { it.distanceFromPlayer }

  RETURN null  // no instrument covers this note at any registered pitch
```

This is simply a broader version of `findBestForMidi` — it searches ALL instruments, not just the first one found. The standard `findBestForMidi` already does this; the "shift" really happens during **octave transposition**.

**`OCTAVE_SHIFT` algorithm:**

Used when no instrument covers the target MIDI note at any registered pitch. Transposes by ±12 semitones (1 octave) up to ±24 (2 octaves).

```
FUNCTION findWithOctaveShift(midiNote: Int): Pair<NoteBlockEntry, Int>?
  FOR shift IN [0, -12, +12, -24, +24]:
    val shifted = midiNote + shift
    val entry = registry.findBestForMidi(shifted)
    IF entry != null:
      RETURN Pair(entry, shift)  // caller can report the shift to the HUD
  RETURN null
```

**Reporting shifts to the player:**
- The HUD shows the last shift applied: e.g., `↓1 oct (no Bass register for F#1)`
- In the virtual keyboard GUI, keys that would require a shift are shown with a small arrow indicator.
- During file playback, out-of-range notes that can't be shifted are counted and shown in a post-play summary toast: `"12 notes skipped (out of range)"`.

**Recommended default:** `BEST_EFFORT` — most transparent for players who have placed a diverse set of noteblocks.

> **Integration note:** In the auto-tuning organ pipeline, `InstrumentShifter` is consulted by `MidiToOrganMapper` (Section 5.6) rather than by live keyboard/MIDI input. Since every block can be *re-tuned* to any pitch its instrument supports (not just its current pitch), `coversNatively(midiNote)` should check the full possible range (`midiBase` to `midiBase + 24`) of each block's instrument — not its currently-set note. The "shift" concept still applies for octave transposition when no instrument's range covers a note at all.

---

### 5.5 `NoteBlockTuner`
**Purpose:** Automatically tune each noteblock in the organ to the pitch required by the loaded MIDI file, using the vanilla right-click cycling mechanic -- no NBT editing, no packet shortcuts.

**Vanilla tuning mechanic:** Right-clicking a noteblock with an empty hand (and no block-placement item) cycles its pitch up by one semitone, wrapping 24 -> 0. This is the *only* legitimate way to change a noteblock's pitch in survival, and BlockBard uses exactly this.

```kotlin
data class TuneTarget(
    val pos: BlockPos,
    val currentNote: Int,      // read from BlockState at scan time
    val targetNote: Int,       // required by MidiToOrganMapper assignment
    val instrument: NoteBlockInstrument
)

fun clicksNeeded(current: Int, target: Int): Int =
    ((target - current) % 25 + 25) % 25   // shortest *forward* distance (cycle only goes up)
```

**Tuning sequence (runs once, after `MidiToOrganMapper` has assigned notes to blocks, before playback starts):**

```
FUNCTION tuneOrgan(targets: List<TuneTarget>):
  FOR target IN targets:
    IF target.currentNote == target.targetNote:
      CONTINUE  // already correct, save clicks

    clicks = clicksNeeded(target.currentNote, target.targetNote)
    REPEAT clicks TIMES:
      PlayerController.interactWith(target.pos, InteractMode.TUNE)
      AWAIT 1 tick   // vanilla note-block click has a short cooldown; do not spam faster than 1/tick
    UPDATE TuningProgressHud (e.g., "Tuning block 14/42...")

  RETURN TuningComplete
```

- Tuning is visually slower than playback (one click per tick per block, sequential across all blocks) -- this is expected and shown to the player via a progress bar in `MainScreen`, since a 40-noteblock organ needing an average of 12 clicks each is ~480 ticks (~24 seconds).
- **Re-tuning between songs:** when the player picks a new MIDI file, the tuner only needs to send the *delta* in clicks from each block's current note to its new target note -- it does not need to fully reset to 0 first.
- **Idle/no-pitch blocks** (mob heads, or instruments excluded by `InstrumentShifter` because no MIDI note maps to them) are skipped entirely.

> Engineer note: Because the cycle only goes forward (no "right-click to decrease"), tuning is always `(target - current) mod 25` clicks -- never assume a shorter "backward" path exists.

---

### 5.6 `MidiToOrganMapper`
**Purpose:** Decide which physical noteblock in the organ will play which note from the loaded MIDI file. This is the bridge between "what the song needs" and "what the player built."

**Inputs:**
- The full note list from `MidiFilePlayer` (Section 5.7) -- every distinct MIDI pitch used in the file, with usage counts.
- The `OrganMap` from `PlayerController.centerOnOrgan(...)` -- every reachable noteblock with its instrument and current note.

**Algorithm:**

```
FUNCTION buildAssignment(midiNotesUsed: Set<Int>, organBlocks: List<OrganMapEntry>):
  assignment = mutableMapOf<Int, BlockPos>()   // midiNote -> assigned block

  FOR midiNote IN midiNotesUsed.sortedByUsageFrequencyDescending():
    // 1. Prefer a block whose instrument's native range includes this note
    //    exactly (no shift needed) and is not yet assigned.
    candidate = organBlocks
        .filter { it.instrument.coversNatively(midiNote) && it.pos !in assignment.values }
        .minByOrNull { it.distanceFromCenter }

    IF candidate == null:
      // 2. Fall back to InstrumentShifter logic (Section 5.4): find any
      //    unassigned block reachable via octave shift.
      candidate = InstrumentShifter.findWithOctaveShift(midiNote, organBlocks, excluding = assignment.values)

    IF candidate == null:
      markNoteAsUnplayable(midiNote)   // reported in post-scan summary, see OrganOverlayHud
      CONTINUE

    assignment[midiNote] = candidate.pos

  RETURN assignment
```

**Polyphony note:** Each physical noteblock can only hold *one* tuned pitch at a time. If the organ has fewer noteblocks than the song has distinct simultaneous notes, the `ArpeggioScheduler` (Section 5.8) handles the timing collision by playing them in rapid sequence (per the existing arpeggio behavior) -- but the *pitch* assignment itself, done here, is fixed once per song load, not per chord.

**Re-running the mapper:**
- Triggered on: new MIDI file selected, organ rescanned (player added/removed noteblocks), or tempo-affecting changes that don't change pitch needs (tempo changes do NOT require re-running this -- only re-running `NoteBlockTuner` if assignments changed).
- The mapper should try to **keep previous assignments stable** where possible (minimize re-tuning clicks) when only a few notes in the song change -- e.g., shuffling to a new track reuses already-correctly-tuned blocks where the new song happens to need the same pitches.

**Unplayable note reporting:**
- After mapping, `OrganOverlayHud` shows: `"38/42 notes covered. 4 notes unplayable (need: F#1 x2, C7 x2) -- add Bass or Bell noteblocks."`
- This directly tells the player which instrument to build more of -- core to the "organ" concept where the player iteratively expands their build.

---

### 5.7 `MidiFilePlayer`
**Purpose:** Parse standard `.mid` files from `config/blockbard/midis/`, expose the distinct note set (for `MidiToOrganMapper`), and produce a timed, tempo-scalable, pausable/seekable event stream for playback.

Use **javax.sound.midi** built-in MIDI file parsing -- no external library needed.

```kotlin
class LoadedMidi(
    val sequence: Sequence,
    val ticksPerBeat: Int,
    val baseTempoUsPerBeat: Int,        // from the first Set Tempo meta event, default 500000
    val events: List<TimedNoteEvent>,   // pre-extracted, sorted by tick
    val distinctNotes: Set<Int>         // fed directly to MidiToOrganMapper.buildAssignment(...)
)

data class TimedNoteEvent(val tick: Long, val midiNote: Int)

fun load(file: File): LoadedMidi {
    val sequence = MidiSystem.getSequence(file)
    val events = mutableListOf<TimedNoteEvent>()
    sequence.tracks.forEach { track ->
        for (i in 0 until track.size()) {
            val event = track.get(i)
            val msg = event.message
            if (msg is ShortMessage && msg.command == ShortMessage.NOTE_ON && msg.data2 > 0) {
                events.add(TimedNoteEvent(event.tick, msg.data1))
            }
        }
    }
    return LoadedMidi(
        sequence, sequence.resolution, /* parsed tempo */ 500000,
        events.sortedBy { it.tick }, events.map { it.midiNote }.toSet()
    )
}
```

**Tempo scaling for the slider (Section 5.12.4):**

```kotlin
fun tickToScaledMs(tick: Long, ticksPerBeat: Int, usPerBeat: Int, tempoMultiplier: Float): Long {
    val realMs = (tick.toDouble() / ticksPerBeat) * (usPerBeat / 1000.0)
    return (realMs / tempoMultiplier).toLong()   // higher multiplier = faster = smaller delay
}
```

- The tempo multiplier is applied at schedule time, not baked into the loaded sequence -- so the slider can be adjusted live mid-playback without reloading the file.
- Respect tempo change meta events (0xFF 0x51) mid-sequence as additional scaling breakpoints, combined multiplicatively with the user's slider value.
- Ignore all non-NOTE_ON messages for playback (no need for pitch bend, CC, etc. since noteblocks are fixed-pitch).
- **Pause:** stop dispatching scheduled events; record the current tick position. **Resume:** reschedule remaining events from that tick using current wall-clock time as the new origin.
- **Seek (progress bar click):** jump the playback head to a target tick; if the notes needed from that point forward differ from the currently tuned assignment (rare), trigger a partial re-tune via `NoteBlockTuner` before resuming.

---

### 5.8 `ArpeggioScheduler`
**Purpose:** Accept simultaneous note requests and serialize them into rapid sequential interactions, simulating chords.

**Problem:** Two noteblocks cannot be interacted with in the same tick because the player can only face one direction at a time.

**Solution:** A tick-based queue.

```kotlin
data class NoteRequest(
    val midiNote: Int,
    val enqueuedAtMs: Long = System.currentTimeMillis()
)

object ArpeggioScheduler {
    private val queue: ArrayDeque<NoteRequest> = ArrayDeque()
    private var lastTickMs = 0L

    // Called every ClientTickEvent (~50ms per tick)
    fun onTick() {
        if (queue.isEmpty()) return
        val request = queue.removeFirst()
        // Drop stale requests (> 200ms old) to avoid note build-up lag
        if (System.currentTimeMillis() - request.enqueuedAtMs > 200) {
            onTick() // recurse to next item
            return
        }
        val entry = NoteBlockRegistry.findBestForMidi(request.midiNote) ?: return
        PlayerController.interactWith(entry)
    }
}
```

- Maximum throughput: 20 notes/second (one per tick at 20 TPS).
- For chord files, notes within a 50ms window are grouped and queued as a burst.
- The scheduler drops notes older than 200ms to prevent runaway lag during missed ticks.

---

### 5.9 `KeyboardInputHandler` (secondary: manual live play)
**Purpose:** Map keys 1–9 to specific MIDI notes and dispatch play requests.

- Register 9 `KeyBinding` objects via `KeyBindingHelper.registerKeyBinding(...)` (Fabric API).
- Default mapping: keys 1–9 → MIDI notes 54–62 (F#3 to D#4). Configurable via mod config.
- On keypress, push a `NoteRequest(midiNote)` to the `ArpeggioScheduler`.
- Keys can be held for sustained play in file-playback mode, but for live keyboard play, one press = one trigger.

**Key registration example:**
```kotlin
val key1 = KeyBindingHelper.registerKeyBinding(
    KeyBinding("key.blockbard.note1", InputUtil.Type.KEYSYM, GLFW.GLFW_KEY_1, "category.blockbard")
)
```

Docs: [Fabric Wiki — Key Bindings](https://fabricmc.net/wiki/tutorial:keybinds)

---

### 5.10 `MidiInputHandler` (secondary: manual live play)
**Purpose:** Receive MIDI events from physical or virtual MIDI devices and convert them to `NoteRequest`s.

**Java MIDI API** (`javax.sound.midi`) works for both USB and virtual MIDI ports (e.g., loopMIDI on Windows, IAC Driver on macOS).

```kotlin
// Device enumeration
MidiSystem.getMidiDeviceInfo().forEach { info ->
    val device = MidiSystem.getMidiDevice(info)
    if (device.maxTransmitters != 0) {
        // This device can send MIDI (keyboard, virtual port)
        availableInputs.add(device)
    }
}

// Receiving events
device.open()
val transmitter = device.transmitter
transmitter.receiver = object : Receiver {
    override fun send(message: MidiMessage, timeStamp: Long) {
        if (message is ShortMessage && message.command == ShortMessage.NOTE_ON) {
            val midiNote = message.data1
            val velocity = message.data2
            if (velocity > 0) {
                ArpeggioScheduler.enqueue(NoteRequest(midiNote))
            }
        }
    }
    override fun close() {}
}
```

- The selected device is saved in mod config by device name.
- If the saved device is not found on load, show an in-game warning toast.
- Handle `NOTE_OFF` (command = `0x80`) and `NOTE_ON` with velocity 0 identically (both = note off — relevant for file playback sustain logic only; live play ignores off events).

Docs: [javax.sound.midi package](https://docs.oracle.com/en/java/docs/api/java.desktop/javax/sound/midi/package-summary.html)

---

### 5.11 `VirtualKeyboardScreen` (secondary GUI)
**Purpose:** An in-game GUI showing a piano keyboard. Clicking a key plays the corresponding noteblock.

- Extend `Screen` from Minecraft's GUI API.
- Draw using `DrawContext` (Fabric 1.21 uses `net.minecraft.client.gui.DrawContext`).
- Keys that have a matching noteblock in `NoteBlockRegistry` are shown in their normal color (white/black). Keys with no registered noteblock are greyed out. Keys that exist but are `SILENCED` show a red tint with a tooltip explaining the block-above issue.
- Mob head noteblocks are shown in a separate panel below the keyboard (labelled "Sound Effects") with clickable icons — one per mob head type detected. Clicking plays that mob's ambient sound via the noteblock.
- Hovering a key shows a tooltip: instrument name, Minecraft note name (F#3, G3, etc.), block position, and shift status if `InstrumentShifter` would be needed.
- Clicking a key dispatches a `NoteRequest` to `ArpeggioScheduler`.
- The keyboard spans 2 octaves by default (configurable). An octave shift button shifts the displayed range.
- Open/close with a dedicated keybind (default: `K`).

Docs: [Fabric Wiki — Screens](https://fabricmc.net/wiki/tutorial:screens)

---

### 5.12 `MainScreen` + ModMenu Integration

**Purpose:** The primary entry point and control surface for the whole organ pipeline (User Flow steps 1, 2, 3, 7).

#### 5.12.1 Opening the GUI

Two entry points, both opening the same `MainScreen`:

1. **Hotkey** -- a `KeyBinding` (default `B`) registered the same way as the keys in Section 5.9.
2. **ModMenu** -- BlockBard implements the `ModMenuApi` interface so it shows up in the ModMenu mod list with a config-screen entry point that opens `MainScreen` directly (not a separate settings-only screen, since the whole mod's primary interaction surface IS this screen).

```kotlin
// ModMenuIntegration.kt
class BlockBardModMenuIntegration : ModMenuApi {
    override fun getModConfigScreenFactory(): ConfigScreenFactory<*> =
        ConfigScreenFactory { parent -> MainScreen(parent) }
}
```

Register this as a `modmenu` entrypoint in `fabric.mod.json`:
```json
"entrypoints": {
  "modmenu": ["com.blockbard.gui.BlockBardModMenuIntegration"]
}
```

ModMenu must be an **optional** dependency (`"modmenu": "*"` in the `recommends` block, not `depends`) -- the hotkey must work standalone without ModMenu installed.

#### 5.12.2 File Picker (User Flow step 2)

- MIDI files live in `config/blockbard/midis/` -- created on first launch if missing, with a README placeholder explaining where to drop `.mid` files.
- `MainScreen` lists every `.mid` file found in that directory (simple `File.listFiles { it.extension == "mid" }`), showing filename, duration (parsed from the MIDI sequence), and a "last played" indicator.
- Clicking an entry calls `MidiFilePlayer.load(file)` and stores it as the active track; does **not** start tuning/playback automatically -- the player presses a separate "Play" button so they can review the organ overlay (next) first.
- A "Refresh" button re-lists the directory in case the player just added files via their OS file browser.

#### 5.12.3 Organ Overlay (User Flow step 3)

Once a file is loaded, `MainScreen` triggers `OrganScanner.scan()` and displays a live-updating panel:

```
┌─────────────────────────────────────┐
│  Organ Scan                          │
│  Harp:        14                     │
│  Bass:         6                     │
│  Bell:         3                     │
│  Flute:        0   <- needed!        │
│  Trumpet:      2                     │
│  ...                                 │
│  Total reachable: 23 / 25 found      │
│                                       │
│  Coverage for "Fur Elise.mid":       │
│  38 / 42 notes playable               │
│  Missing: F#1 x2, C7 x2               │
└─────────────────────────────────────┘
```

This is the same data computed by `MidiToOrganMapper` (Section 5.6) -- the GUI just renders it. Re-scans automatically every few seconds while `MainScreen` is open, in case the player is mid-build and adding blocks while watching the coverage number.

#### 5.12.4 Playback Controls (User Flow step 7)

A persistent control bar at the bottom of `MainScreen` (also mirrored in the lightweight `PlaybackHud`, Section 5.14, for when the GUI is closed):

| Control | Behavior |
|---|---|
| **Play / Pause** | Toggles `ArpeggioScheduler` processing. Pausing does not un-tune blocks. |
| **Stop** | Halts playback and clears the current position (next Play restarts from the beginning). |
| **Shuffle** | Picks a random `.mid` file from the directory (excluding the current one if more than one exists), loads it, and re-runs the scan -> map -> tune pipeline automatically. |
| **Tempo slider** | Range 0.5x-2.0x, default 1.0x. Scales the inter-note delay computed by `MidiFilePlayer` (Section 5.7) without altering pitch (noteblocks have no pitch-bend, so tempo change is pure timing scale, not resampling). |
| **Progress bar** | Shows playback position in the current track; click-to-seek triggers a re-tune only if the upcoming section needs different notes than what's currently tuned (rare, since most organs cover the full song after one tuning pass). |

> Engineer note: "Shuffle" re-running the full scan -> map -> tune pipeline means there will be a brief pause (the tuning delay described in Section 5.5) between tracks. Show a loading state ("Tuning next track...") rather than leaving the GUI looking frozen.

---

### 5.13 `NbsFileLoader` (optional/secondary format)
**Purpose:** Parse `.nbs` files and produce a timed sequence of `NoteRequest`s.

**NBS format spec:** [OpenNBS Specification](https://opennbs.org/nbs)

NBS files contain layers of notes with tick-based timing. The header specifies `tempo` (ticks per second). Each note has:
- `tick` — which NBS tick it falls on
- `layer` — which instrument track
- `key` — MIDI note (0–87 in NBS = MIDI 21–108 after +21 offset)
- `velocity`, `panning`, `pitch` — we use only `key` for noteblock matching

**Parser outline:**
```kotlin
class NbsFile(
    val version: Byte,
    val tempo: Float,          // ticks per second
    val notes: List<NbsNote>
)

data class NbsNote(
    val tick: Int,
    val instrument: Int,       // NBS instrument index
    val key: Int,              // 0–87; add 21 for MIDI note number
    val velocity: Byte
)
```

Reading is done with `java.io.DataInputStream` in little-endian order (NBS uses LE). Write a `readLEShort()`, `readLEInt()` extension.

**Playback:**
- Convert NBS ticks to real-time using `tempo`. Schedule a `CoroutineScope` (use Fabric's `ClientLifecycleEvents` to scope it) that dispatches `NoteRequest`s at the correct intervals.
- Use `kotlinx.coroutines.delay()` between note groups, not `Thread.sleep()` (avoid blocking the game thread).

---

### 5.14 `PlaybackHud` (renamed from NoteWeaverHud)
**Purpose:** Persistent on-screen overlay showing current status when `MainScreen` is closed -- the player shouldn't have to keep the GUI open just to see what's playing or to pause it.

Rendered via `HudRenderCallback` (Fabric API event).

Display:
- Current mode (`PLAYING: Fur Elise.mid (0:42 / 2:18)` / `PAUSED` / `TUNING (14/42)` / `IDLE`)
- Tempo multiplier (e.g., `1.0x`)
- Organ coverage summary (e.g., `38/42 notes covered`)
- Last shift applied (e.g., `↓12st via Bass` or `exact match`)
- Small warning icon if noteblocks are silenced or the organ has gaps in coverage

Mini playback controls overlaid on the HUD itself (clickable even with the HUD-only view, no need to reopen `MainScreen`):
- Pause/Resume button
- Skip/Shuffle button
- Compact tempo +/- buttons (0.1x increments)

Keep it compact -- bottom-left corner, ~6 lines plus the control row. Toggle visibility with a keybind (default: `H`); this only hides the passive display, not the clickable controls' availability via `MainScreen`.

---

### 5.15 `BlockBardConfig` (renamed from NoteWeaverConfig)
**Purpose:** Persist user settings between sessions.

Settings to persist:
- Key 1–9 MIDI note mapping (List of 9 ints) — secondary live-play mode
- MIDI device name — secondary live-play mode
- HUD enabled/position
- Arpeggio stale timeout (ms)
- Default octave for virtual keyboard — secondary live-play mode
- Rescan radius (blocks, default 5, max 10)
- **`shiftMode: ShiftMode`** — default `BEST_EFFORT`
- **`maxOctaveShift: Int`** — max octaves to transpose during shift (1 or 2), default 1
- **`reportShiftsInHud: Boolean`** — whether to show shift indicators, default true
- **`midiFolder: String`** — default `config/blockbard/midis/`, overridable
- **`defaultTempoMultiplier: Float`** — default `1.0`
- **`autoRescanIntervalSeconds: Int`** — how often `MainScreen` re-scans while open, default 3
- **`maxTuningClicksPerTick: Int`** — throttle for `NoteBlockTuner`, default 1 (do not increase — see Section 5.5 cooldown note)
- **`lastPlayedTrack: String?`** — for resuming on next launch
- **`shuffleHistory: List<String>`** — avoid immediate repeats when shuffling

Docs: [Cloth Config API](https://github.com/shedaniel/cloth-config)

---

## 6. Key Algorithms

### 6.1 Reaching a NoteBlock — Step by Step

```
FUNCTION interactWith(entry: NoteBlockEntry):
  eyePos = player.eyePosition
  blockFaceCenter = entry.pos.toVec3d().add(0.5, 1.0, 0.5)  // top face center
  delta = blockFaceCenter - eyePos
  distance = delta.length()

  IF distance > 4.5:
    // Compute a position 4.0 blocks toward the block from the player
    direction = delta.normalize()
    targetPlayerPos = blockFaceCenter - direction * 4.0
    
    // Move toward target for up to 3 ticks
    FOR tick IN 1..3:
      moveToward(targetPlayerPos)
      AWAIT next tick
      IF newDistance <= 4.5: BREAK
    
    IF newDistance > 4.5:
      RETURN UNREACHABLE

  // Face the block
  yaw, pitch = vectorToYawPitch(delta)
  smoothRotateTo(yaw, pitch)
  AWAIT 1 tick  // ensure rotation applied before interact

  // Interact
  hitResult = BlockHitResult(blockFaceCenter, Direction.UP, entry.pos, false)
  interactionManager.interactBlock(player, Hand.MAIN_HAND, hitResult)
```

### 6.2 MIDI Note → Minecraft Note Mapping

Minecraft noteblocks have 25 pitches (0–24). The MIDI note each pitch produces depends on the instrument's base MIDI note:

```kotlin
// General formula:
fun noteBlockToMidi(instrument: NoteBlockInstrument, note: Int): Int =
    instrument.midiBase + note

// Reverse: given a target MIDI note, what MC note index does an instrument need?
fun midiToNoteForInstrument(midiNote: Int, instrument: NoteBlockInstrument): Int? {
    val note = midiNote - instrument.midiBase
    return if (note in 0..24) note else null
}
```

This replaces the old hardcoded `54 + note` formula. Every instrument has a different base.

### 6.3 Silenced Block Check

```kotlin
fun isNoteBlockSilenced(world: World, noteBlockPos: BlockPos): Boolean {
    val aboveState = world.getBlockState(noteBlockPos.up())
    val aboveBlock = aboveState.block
    return !aboveState.isAir && aboveBlock !in MOB_HEAD_BLOCKS
}

fun getMobHeadType(world: World, noteBlockPos: BlockPos): Block? {
    val aboveBlock = world.getBlockState(noteBlockPos.up()).block
    return if (aboveBlock in MOB_HEAD_BLOCKS) aboveBlock else null
}
```

### 6.4 Yaw/Pitch Calculation

```kotlin
fun vecToYawPitch(delta: Vec3d): Pair<Float, Float> {
    val horizontalDist = sqrt(delta.x * delta.x + delta.z * delta.z)
    val yaw = Math.toDegrees(atan2(-delta.x, delta.z)).toFloat()
    val pitch = Math.toDegrees(-atan2(delta.y, horizontalDist)).toFloat()
    return Pair(MathHelper.wrapDegrees(yaw), pitch.coerceIn(-90f, 90f))
}
```

---

## 7. Data Formats

### 7.1 NBS (Note Block Studio) File

Binary format, little-endian. Reference: [https://opennbs.org/nbs](https://opennbs.org/nbs)

Key fields to parse:
| Offset | Type | Field |
|--------|------|-------|
| 0 | short | `nbsVersion` (0 for classic, 1–5 for newer) |
| 2 | byte | `instrumentCount` (new format only) |
| varies | short | `songLength` (in NBS ticks) |
| varies | short | `layerCount` |
| varies | short | `tempo` (ticks per second × 100) |

Note jump encoding: NBS uses "jump" encoding — read the jump count, then read the note data for that tick. See spec for full detail.

### 7.2 MIDI File

Standard MIDI File (SMF) format. Parsed by `javax.sound.midi.MidiSystem` — no manual parsing needed.

Relevant message types:
- `ShortMessage.NOTE_ON` (0x90) — pitch in data1, velocity in data2
- `MetaMessage` type 0x51 — tempo in microseconds per beat (3-byte big-endian in meta data)

---

## 8. Dependencies & Versions

```toml
# gradle/libs.versions.toml

[versions]
minecraft = "1.21.1"
yarn-mappings = "1.21.1+build.3"
fabric-loader = "0.16.7"
fabric-api = "0.102.0+1.21.1"
fabric-kotlin = "1.12.3+kotlin.2.0.21"
cloth-config = "15.0.140"
modmenu = "11.0.3"   # check latest compatible with 1.21.1 on Modrinth before pinning

[dependencies]
fabric-api = { module = "net.fabricmc.fabric-api:fabric-api", version.ref = "fabric-api" }
fabric-kotlin = { module = "net.fabricmc:fabric-language-kotlin", version.ref = "fabric-kotlin" }
cloth-config = { module = "me.shedaniel.cloth:cloth-config-fabric", version.ref = "cloth-config" }
modmenu = { module = "com.terraformersmc:modmenu", version.ref = "modmenu" }
# javax.sound.midi is part of the JDK — no extra dependency needed
# kotlinx-coroutines is bundled with fabric-language-kotlin — no extra dep needed
```

> **Engineer note:** ModMenu must be declared `modCompileOnly` + `modLocalRuntime` in `build.gradle.kts` (not a hard `modImplementation`), since it's an optional integration — BlockBard must build and run fine without it installed by the end user. See Section 5.12.1 for the `ModMenuApi` entrypoint registration.

No additional libraries are required beyond the above. Crucially:
- **No Mixin on NoteBlock packet** — we interact legitimately via `InteractionManager`.
- **No packet manipulation libraries.**

---

## 9. File Structure

```
blockbard/
├── build.gradle.kts
├── gradle/
│   └── libs.versions.toml
├── gradle.properties
├── settings.gradle.kts
├── .github/
│   └── workflows/
│       └── build.yml
└── src/
    └── main/
        ├── kotlin/
        │   └── com/blockbard/
        │       ├── BlockBardMod.kt           ← mod entry point, event registration, hotkey (B)
        │       ├── config/
        │       │   └── BlockBardConfig.kt    ← Cloth Config data class + AutoConfig reg
        │       ├── organ/
        │       │   ├── OrganScanner.kt       ← world scan, instrument + above-block detection
        │       │   ├── NoteBlockRegistry.kt  ← BlockPos → NoteBlockEntry map
        │       │   ├── NoteBlockEntry.kt     ← data class (status, mobHeadType, midiNote)
        │       │   ├── MobHeadBlocks.kt      ← MOB_HEAD_BLOCKS set constant
        │       │   ├── OrganMap.kt           ← BlockPos → ReachInfo, built by centerOnOrgan()
        │       │   ├── NoteBlockTuner.kt     ← auto-tune via right-click cycling
        │       │   └── MidiToOrganMapper.kt  ← assigns MIDI notes → physical blocks
        │       ├── player/
        │       │   ├── PlayerController.kt   ← centerOnOrgan() + rotate/micro-move/interact
        │       │   └── ReachCalculator.kt    ← distance + occlusion check
        │       ├── input/
        │       │   ├── KeyboardInputHandler.kt   ← secondary: manual live play
        │       │   └── MidiInputHandler.kt       ← secondary: manual live play
        │       ├── scheduler/
        │       │   ├── ArpeggioScheduler.kt  ← tick queue + staleness pruning
        │       │   ├── NoteRequest.kt
        │       │   └── InstrumentShifter.kt  ← ShiftMode enum + shift resolution logic
        │       ├── playback/
        │       │   ├── NbsFileLoader.kt      ← NBS binary parser (secondary format)
        │       │   ├── NbsPlayer.kt          ← coroutine-based timed playback
        │       │   └── MidiFilePlayer.kt     ← load/tempo-scale/pause/seek MIDI playback
        │       ├── gui/
        │       │   ├── MainScreen.kt             ← primary GUI: file picker, organ overlay, controls
        │       │   ├── BlockBardModMenuIntegration.kt  ← ModMenuApi entrypoint
        │       │   ├── FileListWidget.kt          ← scrollable .mid file list for MainScreen
        │       │   ├── OrganOverlayPanel.kt       ← instrument counts + coverage display
        │       │   ├── PlaybackControlBar.kt      ← play/pause/stop/shuffle/tempo widgets
        │       │   ├── VirtualKeyboardScreen.kt   ← secondary GUI: piano + mob head sound panel
        │       │   ├── KeyboardKey.kt              ← individual key widget (tint for silenced)
        │       │   └── PlaybackHud.kt              ← HudRenderCallback overlay + mini controls
        │       └── util/
        │           ├── NoteUtils.kt          ← instrument.midiBase, MIDI ↔ MC note
        │           ├── LittleEndianReader.kt ← DataInputStream extensions for NBS
        │           └── VecMath.kt            ← yaw/pitch helpers
        ├── resources/
        │   ├── fabric.mod.json               ← declares "modmenu" entrypoint (optional dep)
        │   ├── blockbard.mixins.json         ← empty or minimal; no packet hacks
        │   ├── assets/blockbard/
        │   │   ├── lang/
        │   │   │   └── en_us.json            ← all user-facing strings
        │   │   └── textures/gui/
        │   │       ├── keyboard.png          ← virtual keyboard sprite sheet
        │   │       └── mob_heads.png         ← mob head icons for sound effects panel
        │   └── data/blockbard/               ← empty; no data pack content
        └── resources/META-INF/
            └── services/ (if using ServiceLoader for MIDI)

# Created at runtime, not part of the source tree:
config/blockbard/
├── config.json           ← BlockBardConfig serialized (Cloth Config / AutoConfig)
└── midis/                ← player drops .mid files here; created with README.txt on first launch
    └── README.txt
```

---

## 10. Build & Test Guide

> **For the AI Engineer:** Follow every numbered step in order. Commands are for macOS/Linux terminal. Windows users substitute `./gradlew` → `gradlew.bat`.

### 10.1 Prerequisites

```bash
# Java 21 is required for Minecraft 1.21.1
java -version  # must show 21.x

# If not installed (macOS):
brew install --cask temurin@21

# If not installed (Ubuntu/Debian):
sudo apt install temurin-21-jdk

# Verify Gradle wrapper (no global Gradle needed)
./gradlew --version  # should show Gradle 8.x
```

### 10.2 Initial Project Setup

```bash
# 1. Clone / create the repo
git clone https://github.com/YOUR_USER/blockbard.git
cd blockbard

# 2. Generate Minecraft sources for IDE navigation (IMPORTANT for finding NoteBlockInstrument enum)
./gradlew genSources
# After this, search for NoteBlockInstrument in the generated sources to verify:
#   - Trumpet variant enum constant names
#   - midiBase offset per instrument (verify against Section 3.1 of this plan)

# 3. Import into IntelliJ IDEA:
#    File → Open → select blockbard/ folder → Import as Gradle project
#    IntelliJ will auto-detect the Fabric Loom setup.

# 4. Verify the Fabric Loom toolchain downloads correctly
./gradlew dependencies
```

Docs: [Setting up a mod development environment](https://fabricmc.net/wiki/tutorial:setup)

### 10.3 Building the Mod

```bash
# Full clean build — outputs JAR to build/libs/
./gradlew clean build

# The production JAR (with no -dev or -sources suffix) goes to:
# build/libs/blockbard-1.0.0+1.21.1.jar
```

### 10.4 Running in Development

```bash
# Launch a Minecraft client with the mod loaded (Fabric Loom dev environment)
./gradlew runClient

# This opens a real Minecraft 1.21.1 instance.
# Your mod is hot-reloaded from source; no need to copy the JAR anywhere.
```

### 10.5 Testing Checklist

Run through these manually in the dev client before every release:

| # | Test | Expected Result |
|---|------|----------------|
| 1 | Place a noteblock on dirt (harp) | Scanner detects it; Registry shows MIDI 54 at note 0 |
| 2 | Place a noteblock on a wood plank (bass) at note 0 | Registry shows MIDI 30 (not 54) |
| 3 | Place a noteblock on clay (flute) at note 0 | Registry shows MIDI 66 |
| 4 | Place a noteblock on gold block (bell) at note 0 | Registry shows MIDI 78 |
| 5 | Place a copper block under a noteblock (trumpet) | Registry shows instrument TRUMPET, MIDI 54 |
| 6 | Place a weathered copper block under a noteblock | Registry shows TRUMPET_WEATHERED, MIDI 42 at note 0 |
| 7 | Place any solid block directly above a noteblock | Scanner marks it `SILENCED`; HUD shows "1 silenced" |
| 8 | Place a skeleton skull on top of a noteblock | Scanner marks it `MOB_HEAD`; GUI shows skull icon in Effects panel |
| 9 | Place a creeper head on top of a noteblock | Clicking it plays the fuse/primed sound, not a musical note |
| 10 | Press key `1` while harp noteblock in range | Noteblock plays |
| 11 | Move away > 4.5 blocks, press `1` | Mod micro-steps into range and plays |
| 12 | Place noteblock > 5 blocks away, press `1` | Reports UNREACHABLE, no crash |
| 13 | Set ShiftMode = INSTRUMENT_SHIFT; send MIDI 42 | Plays on Guitar or Weathered Trumpet if registered |
| 14 | Set ShiftMode = OCTAVE_SHIFT; send MIDI 40 (no bass) | Transposes up 12st → plays MIDI 52 on harp; HUD shows "↑12st" |
| 15 | Set ShiftMode = EXACT_ONLY; send MIDI 40 (no bass) | Note skipped silently; HUD shows 0 activity |
| 16 | Connect MIDI keyboard, press a key | Note plays via MIDI handler |
| 17 | Open virtual keyboard (`K`), click a white key | Plays corresponding noteblock |
| 18 | In virtual keyboard, hover a silenced key | Red tint; tooltip shows "blocked by [block name] above" |
| 19 | In virtual keyboard, click a mob head icon | Plays mob ambient sound via that noteblock |
| 20 | Load a `.nbs` file via GUI | Plays correctly timed sequence |
| 21 | Load a `.mid` file via GUI | Plays at correct tempo |
| 22 | Play a 3-note chord in NBS file | Arpeggiates rapidly, all 3 notes sound |
| 23 | Load NBS file with notes outside 30–102 range | Post-play toast shows skipped note count |
| 24 | Join a vanilla server (no anti-cheat) | Noteblocks play server-side correctly |
| 25 | Toggle HUD (`H`) | HUD appears/disappears |
| 26 | Reopen config screen | All saved settings persist, including ShiftMode |
| 27 | Press `B` with no GUI open | `MainScreen` opens |
| 28 | Open ModMenu mod list (with ModMenu installed) | BlockBard entry present; clicking opens `MainScreen` |
| 29 | Build without ModMenu installed | Mod loads fine; `B` hotkey still opens `MainScreen` |
| 30 | Drop a `.mid` file into `config/blockbard/midis/`, click Refresh | File appears in `MainScreen` list |
| 31 | Build a 10-block harp-only organ, select a polyphonic MIDI file | Organ overlay shows coverage gaps for non-Harp-range notes |
| 32 | Click "Play" with organ selected | Player walks/turns to centered position; tuning progress bar appears |
| 33 | After tuning completes | Each tuned noteblock's pitch matches `MidiToOrganMapper` assignment (verify via F3 block info or right-click cycling count) |
| 34 | Let a full song play | Notes play in correct order/timing; chords arpeggiate via existing scheduler |
| 35 | Press Pause mid-song, then Resume | Playback resumes from the paused position, not from the start |
| 36 | Press Shuffle | A different `.mid` file loads; re-scan/re-map/re-tune runs automatically |
| 37 | Move tempo slider to 2.0x mid-song | Subsequent notes play twice as fast; already-queued notes unaffected mid-flight |
| 38 | Build organ with zero noteblocks of a needed instrument (e.g., no Bell) | Overlay explicitly names missing instrument and required block-below material |
| 39 | Click progress bar to seek to a later point in the song | Playback jumps there; re-tune only triggers if needed notes differ |

### 10.6 Installing the Built JAR Manually

```bash
# After build, copy JAR to your live Minecraft installation:
cp build/libs/blockbard-*+1.21.1.jar ~/.minecraft/mods/

# Required dependencies in mods/:
# 1. fabric-language-kotlin  → https://modrinth.com/mod/fabric-language-kotlin
# 2. cloth-config            → https://modrinth.com/mod/cloth-config
# 3. fabric-api              → https://modrinth.com/mod/fabric-api
# 4. modmenu (optional)      → https://modrinth.com/mod/modmenu
```

---

## 11. GitHub Actions CI

Create `.github/workflows/build.yml`:

```yaml
name: Build BlockBard

on:
  push:
    branches: [ main, dev ]
  pull_request:
    branches: [ main ]

jobs:
  build:
    name: Build and Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java 21
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'

      - name: Cache Gradle packages
        uses: actions/cache@v4
        with:
          path: |
            ~/.gradle/caches
            ~/.gradle/wrapper
            .gradle
          key: ${{ runner.os }}-gradle-${{ hashFiles('**/*.gradle.kts', '**/libs.versions.toml') }}
          restore-keys: |
            ${{ runner.os }}-gradle-

      - name: Make gradlew executable
        run: chmod +x ./gradlew

      - name: Build mod
        run: ./gradlew clean build --no-daemon

      - name: Upload build artifact
        uses: actions/upload-artifact@v4
        with:
          name: blockbard-mod-jar
          path: build/libs/blockbard-*+1.21.1.jar
          if-no-files-found: error

      - name: Verify JAR is non-empty
        run: |
          JAR=$(ls build/libs/blockbard-*+1.21.1.jar | grep -v sources | grep -v dev)
          SIZE=$(stat -c%s "$JAR")
          echo "JAR size: $SIZE bytes"
          [ "$SIZE" -gt 10000 ] || (echo "JAR too small, build likely failed" && exit 1)
```

> **For the AI Engineer:** The CI workflow above runs on every push. The built JAR is uploaded as a GitHub Actions artifact — the mod owner can download it directly from the Actions tab without needing a local Java environment. The sanity check at the end ensures the JAR is not empty (which can happen if Gradle "succeeds" but produces a broken output).

---

## 12. Reference Links

### Fabric / Mod Development
| Resource | URL |
|----------|-----|
| Fabric Wiki (main) | https://fabricmc.net/wiki/ |
| ModMenu (GitHub) | https://github.com/TerraformersMC/ModMenu |
| ModMenu on Modrinth | https://modrinth.com/mod/modmenu |
| Setting up dev environment | https://fabricmc.net/wiki/tutorial:setup |
| fabric.mod.json reference | https://fabricmc.net/wiki/documentation:fabric_mod_json |
| Fabric API GitHub | https://github.com/FabricMC/fabric |
| Fabric Language Kotlin | https://github.com/FabricMC/fabric-language-kotlin |
| Fabric Loom (build tool) | https://github.com/FabricMC/fabric-loom |
| Key Bindings tutorial | https://fabricmc.net/wiki/tutorial:keybinds |
| Screens / GUI tutorial | https://fabricmc.net/wiki/tutorial:screens |
| HUD rendering | https://fabricmc.net/wiki/tutorial:hud |
| Events reference | https://fabricmc.net/wiki/tutorial:event |
| Mixin intro (SpongePowered) | https://github.com/SpongePowered/Mixin/wiki/Introduction-to-Mixins---The-Mixin-Environment |

### Minecraft Internals (1.21.1)
| Resource | URL |
|----------|-----|
| NoteBlock wiki page | https://minecraft.wiki/w/Note_Block |
| NoteBlock instrument mapping | https://minecraft.wiki/w/Note_Block#Instrument |
| NoteBlock notes & ranges | https://minecraft.wiki/w/Note_Block#Notes |
| Mob head instruments | https://minecraft.wiki/w/Note_Block#Mob_heads |
| Copper block variants (trumpet bases) | https://minecraft.wiki/w/Copper |
| Yarn mappings (1.21.1) | https://maven.fabricmc.net/net/fabricmc/yarn/ |
| MC Wiki BlockState | https://minecraft.wiki/w/Block_states |
| PlayerInteractBlockC2SPacket | Search "PlayerInteractBlock" in Yarn-mapped sources |

### MIDI / Audio
| Resource | URL |
|----------|-----|
| javax.sound.midi package | https://docs.oracle.com/en/java/docs/api/java.desktop/javax/sound/midi/package-summary.html |
| MidiSystem JavaDoc | https://docs.oracle.com/en/java/docs/api/java.desktop/javax/sound/midi/MidiSystem.html |
| ShortMessage JavaDoc | https://docs.oracle.com/en/java/docs/api/java.desktop/javax/sound/midi/ShortMessage.html |
| MIDI note number reference | https://www.inspiredacoustics.com/en/MIDI_note_numbers_and_center_frequencies |
| loopMIDI (virtual MIDI, Windows) | https://www.tobias-erichsen.de/software/loopmidi.html |
| IAC Driver setup (macOS) | https://support.apple.com/guide/audio-midi-setup/transfer-midi-information-between-apps-ams1013/mac |

### NBS Format
| Resource | URL |
|----------|-----|
| OpenNBS file format spec | https://opennbs.org/nbs |
| Note Block Studio (editor) | https://noteblock.studio/ |

### Config / UI Libraries
| Resource | URL |
|----------|-----|
| Cloth Config API (GitHub) | https://github.com/shedaniel/cloth-config |
| Cloth Config on Modrinth | https://modrinth.com/mod/cloth-config |
| Auto Config 2 (included in Cloth Config) | https://github.com/shedaniel/cloth-config#auto-config |

### Kotlin / Coroutines
| Resource | URL |
|----------|-----|
| kotlinx.coroutines guide | https://kotlinlang.org/docs/coroutines-guide.html |
| Kotlin stdlib | https://kotlinlang.org/api/latest/jvm/stdlib/ |

---

## Appendix A — Full Note/Pitch Reference by Instrument

Each instrument has its own MIDI base, so the same Minecraft note index (0–24) maps to different absolute pitches. This table shows every instrument's note 0 and note 24 (the extremes), plus the MIDI base for computing any note in between: `midiNote = midiBase + noteIndex`.

| Instrument | MIDI Base | Note 0 | Note 12 (mid) | Note 24 |
|---|---|---|---|---|
| Bass (String Bass) | 30 | F♯1 | F♯2 | F♯3 |
| Didgeridoo | 30 | F♯1 | F♯2 | F♯3 |
| Guitar | 42 | F♯2 | F♯3 | F♯4 |
| Weathered Trumpet | 42 | F♯2 | F♯3 | F♯4 |
| Oxidized Trumpet | 42 | F♯2 | F♯3 | F♯4 |
| Harp | 54 | F♯3 | F♯4 | F♯5 |
| Bass Drum | 54 | F♯3 | F♯4 | F♯5 |
| Snare | 54 | F♯3 | F♯4 | F♯5 |
| Hat (Hi-hat) | 54 | F♯3 | F♯4 | F♯5 |
| Banjo | 54 | F♯3 | F♯4 | F♯5 |
| Cow Bell | 54 | F♯3 | F♯4 | F♯5 |
| Bit | 54 | F♯3 | F♯4 | F♯5 |
| Iron Xylophone | 54 | F♯3 | F♯4 | F♯5 |
| Pling | 54 | F♯3 | F♯4 | F♯5 |
| Trumpet | 54 | F♯3 | F♯4 | F♯5 |
| Exposed Trumpet | 54 | F♯3 | F♯4 | F♯5 |
| Flute | 66 | F♯4 | F♯5 | F♯6 |
| Bell | 78 | F♯5 | F♯6 | F♯7 |
| Chime | 78 | F♯5 | F♯6 | F♯7 |
| Xylophone | 78 | F♯5 | F♯6 | F♯7 |

**Chromatic note names for index 0–24** (same for all instruments; add to midiBase for absolute pitch):

| Index | Semitone | Name |
|-------|----------|------|
| 0 | 0 | F♯ |
| 1 | 1 | G |
| 2 | 2 | G♯ |
| 3 | 3 | A |
| 4 | 4 | A♯ |
| 5 | 5 | B |
| 6 | 6 | C |
| 7 | 7 | C♯ |
| 8 | 8 | D |
| 9 | 9 | D♯ |
| 10 | 10 | E |
| 11 | 11 | F |
| 12 | 12 | F♯ (+1 oct) |
| 13 | 13 | G |
| 14 | 14 | G♯ |
| 15 | 15 | A |
| 16 | 16 | A♯ |
| 17 | 17 | B |
| 18 | 18 | C |
| 19 | 19 | C♯ |
| 20 | 20 | D |
| 21 | 21 | D♯ |
| 22 | 22 | E |
| 23 | 23 | F |
| 24 | 24 | F♯ (+2 oct) |

> **For the AI Engineer:** `NoteUtils.kt` should expose a `noteIndexToName(index: Int): String` function and a `noteIndexToFullName(index: Int, instrument: NoteBlockInstrument): String` that appends the correct octave number using the instrument's midiBase.

---

## Appendix B — Suggested Implementation Order

Build in this order to enable incremental testing at each stage. The **organ auto-play pipeline (steps 1–10) is the primary deliverable** and should be fully working end-to-end before investing in the secondary live-play features (steps 11–13).

1. **Project scaffold** — `build.gradle.kts`, `fabric.mod.json` (with optional `modmenu` entrypoint declared), `BlockBardMod.kt` entry point, CI workflow. Verify `runClient` opens Minecraft.
2. **OrganScanner + Registry (basic)** — detect noteblocks, log instrument + pitch to console using vanilla `NoteBlockInstrument.of(...)`. Verify against Section 4.1 table for at least 5 instrument types (harp, bass, flute, bell, trumpet).
3. **Above-block detection** — add `SILENCED` / `MOB_HEAD` status detection (`MobHeadBlocks.kt`, Section 5.1 logic). Verify with manual placement tests (checklist #7–9).
4. **PlayerController.centerOnOrgan()** — build a small test organ (5–10 blocks in a cluster), verify the controller picks a sensible standing position and the `OrganMap` correctly marks reachable vs. out-of-range blocks.
5. **NoteBlockTuner** — verify right-click cycling tunes a single block to a target pitch correctly, including the wraparound case (e.g., current note 20, target note 3).
6. **MidiFilePlayer (load + parse only)** — load a `.mid` file from `config/blockbard/midis/`, extract `distinctNotes` and the timed event list. Log to console; no playback yet.
7. **MidiToOrganMapper** — given the test organ from step 4 and the note set from step 6, verify it produces a sensible assignment and correctly reports unplayable notes when the organ lacks coverage.
8. **InstrumentShifter** — implement `ShiftMode` resolution (EXACT_ONLY → INSTRUMENT_SHIFT → OCTAVE_SHIFT → BEST_EFFORT), wired into `MidiToOrganMapper`. Test with a deliberately sparse noteblock layout (e.g., only Bass + Bell placed) to confirm shifting/skipping behaves correctly.
9. **ArpeggioScheduler + full playback** — wire `MidiFilePlayer` → `MidiToOrganMapper` → `ArpeggioScheduler` → `PlayerController` together. Play a full simple song end-to-end (steps 32–34 in the checklist) before touching any GUI code.
10. **MainScreen + ModMenu integration** — file picker, organ overlay panel, and playback controls (play/pause/stop/shuffle/tempo). This is the first point the player interacts with the mod visually — most of Section 5.12.
11. **PlaybackHud** — passive status + mini controls for when `MainScreen` is closed.
12. **BlockBardConfig** — settings screen and persistence for all settings listed in Section 5.15.
13. **Secondary live-play mode** — `KeyboardInputHandler`, `MidiInputHandler`, `VirtualKeyboardScreen`, `NbsFileLoader`/`NbsPlayer`. Build these only after the primary organ pipeline is solid; they share `PlayerController.interactWith(...)` and `ArpeggioScheduler` with the main pipeline, so most of the heavy lifting is already done.
14. **Polish pass** — error handling, unreachable/unplayable note toasts, edge cases (empty organ, organ with only one instrument, MIDI files with extreme ranges), README.
