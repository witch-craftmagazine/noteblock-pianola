import os
import re
import json

MIDI_DIR = "midi"

def normalize_filename(name):
    name = name.lower()
    name = name.replace(" ", "_")
    name = re.sub(r"[^a-z0-9_\-\.]", "", name)  # keep only allowed chars
    return name

def main():
    midi_files = []

    for root, _, files in os.walk(MIDI_DIR):
        for file in files:
            if file.lower().endswith((".mid", ".midi")):
                old_path = os.path.join(root, file)

                new_name = normalize_filename(file)
                new_path = os.path.join(root, new_name)

                # Rename if needed
                if file != new_name:
                    if os.path.exists(new_path):
                        print(f"Skipping rename (exists): {new_path}")
                    else:
                        os.rename(old_path, new_path)
                        print(f"Renamed: {file} -> {new_name}")

                rel_path = os.path.relpath(new_path, ".")
                rel_path = "./" + rel_path.replace("\\", "/")

                midi_files.append(rel_path)

    midi_files.sort()

    with open("midilist.json", "w") as f:
        json.dump(midi_files, f, indent=2)

    print(f"\nWrote {len(midi_files)} entries to midilist.json")

if __name__ == "__main__":
    main()
