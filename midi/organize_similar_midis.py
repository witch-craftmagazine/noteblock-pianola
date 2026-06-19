#!/usr/bin/env python3
import os
import sys
import shutil
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
                    
        return (duration, note_count)
    except Exception:
        return None

def get_unique_destination_path(dest_folder, original_filename):
    """Handles name collisions by appending _1, _2, etc., if the file exists."""
    name, ext = os.path.splitext(original_filename)
    counter = 1
    
    # Initial path attempt
    dest_path = os.path.join(dest_folder, original_filename)
    
    # If file exists, keep incrementing a counter suffix
    while os.path.exists(dest_path):
        new_filename = f"{name}_{counter}{ext}"
        dest_path = os.path.join(dest_folder, new_filename)
        counter += 1
        
    return dest_path

def organize_midis(source_dir, output_dir):
    fingerprints = defaultdict(list)
    
    print(f"Scanning '{source_dir}' recursively for similar MIDI files...")
    for root, _, files in os.walk(source_dir):
        for file in files:
            if file.lower().endswith(('.mid', '.midi')):
                full_path = os.path.join(root, file)
                
                # Skip files already in the output directory if it happens to be a subdirectory
                if os.path.abspath(output_dir) in os.path.abspath(full_path):
                    continue
                    
                print(f"Processing: {file}", end="\r")
                
                fingerprint = get_midi_fingerprint(full_path)
                if fingerprint and fingerprint[0] > 0:  
                    fingerprints[fingerprint].append(full_path)
                    
    print("\n\nProcessing duplicate groups...")
    
    group_counter = 1
    total_moved = 0
    
    for (dur, notes), paths in fingerprints.items():
        # We only care if there are 2 or more similar files
        if len(paths) > 1:
            # Create a specific subfolder for this specific song group
            group_folder_name = f"Group_{group_counter}_{dur}s_{notes}notes"
            specific_dest_dir = os.path.join(output_dir, group_folder_name)
            os.makedirs(specific_dest_dir, exist_ok=True)
            
            print(f"\nMoving {len(paths)} files to: {group_folder_name}")
            
            for path in paths:
                filename = os.path.basename(path)
                # Resolve potential name collisions inside this specific group folder
                final_dest_path = get_unique_destination_path(specific_dest_dir, filename)
                
                try:
                    shutil.move(path, final_dest_path)
                    print(f"  -> Moved: {filename} (as {os.path.basename(final_dest_path)})")
                    total_moved += 1
                except Exception as e:
                    print(f"  [ERROR] Could not move {filename}: {e}")
            
            group_counter += 1
            
    print(f"\nDone! Successfully moved {total_moved} files into structured groups inside '{output_dir}'.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python organize_similar_midis.py <source_directory> <output_directory>")
        sys.exit(1)
        
    source = sys.argv[1]
    output = sys.argv[2]
    
    organize_midis(source, output)