# scripts/name.py
# Normalizes all MIDI filenames in ./midi/ and regenerates midilist.json.
#
# Must be run from the repo root:
#   pip install mido
#   python scripts/name.py
#
# Also run automatically by .github/workflows/update-midilist.yml
# on every push to main that touches the midi/ folder.

import os
import re
import json

MIDI_DIR = "midi"


def normalize_filename(name):
    # NOTE: this used to be name.lower() + re.sub(r"[^a-z0-9_\-\.]", "", name),
    # which silently deleted every non-ASCII character. Any filename with
    # Cyrillic (or Greek, CJK, etc.) text — e.g. "Чайковский - Времена года.mid"
    # — came out as garbage or an empty string, so the song's title never
    # rendered anywhere in the app. str.lower() and \w are Unicode-aware in
    # Python 3, so this keeps letters/digits from any script while still
    # stripping punctuation that's actually unsafe in filenames.
    name = name.lower()
    name = name.replace(" ", "_")
    name = re.sub(r"[^\w\-\.]", "", name, flags=re.UNICODE)  # keep any script's letters/digits
    return name


def main():
    midi_files = []
    collisions = []  # (original_name, normalized_name) pairs that were skipped

    # Track every normalized name we've already committed to,
    # so we can detect duplicates across different source filenames.
    seen_normalized = {}  # normalized_name -> original path that claimed it first

    for root, _, files in os.walk(MIDI_DIR):
        for file in sorted(files):  # sorted so collision reporting is deterministic
            if not file.lower().endswith((".mid", ".midi")):
                continue

            old_path = os.path.join(root, file)
            new_name = normalize_filename(file)
            new_path = os.path.join(root, new_name)

            # Duplicate detection: two source files normalize to the same name
            if new_name in seen_normalized and os.path.abspath(old_path) != os.path.abspath(new_path):
                collisions.append((old_path, new_name, seen_normalized[new_name]))
                print(f"⚠  COLLISION skipped: '{file}' → '{new_name}' (already claimed by '{seen_normalized[new_name]}')")
                continue

            # Rename on disk if the filename needs cleaning
            if file != new_name:
                if os.path.exists(new_path) and os.path.abspath(old_path) != os.path.abspath(new_path):
                    # File with the normalized name already exists on disk from a previous run
                    collisions.append((old_path, new_name, new_path))
                    print(f"⚠  COLLISION skipped: '{file}' → '{new_name}' (file already exists on disk)")
                    continue
                else:
                    os.rename(old_path, new_path)
                    print(f"Renamed: {file} → {new_name}")

            seen_normalized[new_name] = new_path

            rel_path = os.path.relpath(new_path, ".")
            rel_path = "./" + rel_path.replace("\\", "/")
            midi_files.append(rel_path)

    midi_files.sort()

    with open("midilist.json", "w") as f:
        json.dump(midi_files, f, indent=2)

    print(f"\nWrote {len(midi_files)} entries to midilist.json")

    if collisions:
        print(f"\n{'='*60}")
        print(f"⚠  {len(collisions)} collision(s) detected — these files were NOT added:")
        for src, normalized, claimed_by in collisions:
            print(f"   {src}  →  '{normalized}'  (conflicts with: {claimed_by})")
        print("Rename or remove the conflicting files and re-run.")
        print(f"{'='*60}")
        # Exit with a non-zero code so CI marks the step as failed,
        # making the collision visible in the Actions summary.
        raise SystemExit(1)


if __name__ == "__main__":
    main()
