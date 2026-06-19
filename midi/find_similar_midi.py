#!/usr/bin/env python3
import os
import sys
from collections import defaultdict
import mido

def get_midi_fingerprint(filepath):
    """Generates a rough fingerprint based on duration and total note events."""
    try:
        mid = mido.MidiFile(filepath)
        duration = round(mid.length, 1) # Round to nearest 0.1 seconds
        
        note_count = 0
        for track in mid.tracks:
            for msg in track:
                if msg.type == 'note_on' and msg.velocity > 0:
                    note_count += 1
                    
        # Group together if they share the same approximate duration and note count
        return (duration, note_count)
    except Exception:
        # Skip corrupted or unreadable MIDI files
        return None

def scan_directory(root_dir):
    fingerprints = defaultdict(list)
    
    print(f"Scanning '{root_dir}' recursively for similar MIDI files...")
    for root, _, files in os.walk(root_dir):
        for file in files:
            if file.lower().endswith(('.mid', '.midi')):
                full_path = os.path.join(root, file)
                print(f"Processing: {file}", end="\r")
                
                print_print = get_midi_fingerprint(full_path)
                if print_print and print_print[0] > 0:  # Ignore empty MIDIs
                    fingerprints[print_print].append(full_path)
                    
    print("\n\n--- SIMILAR/DUPLICATE MIDI GROUPS FOUND ---")
    found_any = False
    for (dur, notes), paths in fingerprints.items():
        if len(paths) > 1:
            found_any = True
            print(f"\nGroup: Approx {dur}s long with {notes} notes:")
            for path in paths:
                print(f"  - {path}")
                
    if not found_any:
        print("No similar MIDI files detected.")

if __name__ == "__main__":
    target_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    scan_directory(target_dir)