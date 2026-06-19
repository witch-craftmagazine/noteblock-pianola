#!/usr/bin/env python3
import os
import sys
import mido

def inspect_midi(filepath):
    """Parses a MIDI file to extract metadata, tracks, and note counts."""
    try:
        mid = mido.MidiFile(filepath)
        
        meta_events = []
        track_names = []
        note_count = 0
        other_events = 0
        
        for track in mid.tracks:
            for msg in track:
                if msg.is_meta:
                    meta_events.append(msg)
                    if msg.type == 'track_name' and msg.name.strip():
                        track_names.append(msg.name.strip())
                elif msg.type in ['note_on', 'note_off']:
                    if msg.type == 'note_on' and msg.velocity > 0:
                        note_count += 1
                else:
                    other_events += 1
                    
        file_size = os.path.getsize(filepath) / 1024
        
        # Look for copyright or text markers specifically
        text_samples = [str(m.text).strip() for m in meta_events if m.type in ['text', 'copyright'] if hasattr(m, 'text')]
        
        return {
            "path": filepath,
            "filename": os.path.basename(filepath),
            "size_kb": round(file_size, 2),
            "tracks": len(mid.tracks),
            "meta_count": len(meta_events),
            "track_names": track_names,
            "note_count": note_count,
            "other_events": other_events,
            "text_samples": text_samples[:2]  # Keep up to 2 samples
        }
    except Exception as e:
        return None

def analyze_groups(groups_directory):
    if not os.path.exists(groups_directory):
        print(f"Error: Directory '{groups_directory}' does not exist.")
        return

    # Walk through the output directory
    # We look for immediate subdirectories (the Group folders)
    for root, dirs, files in os.walk(groups_directory):
        # Filter to only look at actual midi files in the current folder
        midi_files = [f for f in files if f.lower().endswith(('.mid', '.midi'))]
        
        if len(midi_files) < 2:
            continue  # Skip folders that don't have multiple files to compare
            
        group_name = os.path.basename(root)
        print("\n" + "="*95)
        print(f" COMPARING: {group_name}")
        print("="*95)
        print(f"{'Filename':<35} | {'Size':<9} | {'Tracks':<6} | {'Meta Evts':<9} | {'Notes':<6} | {'Flags / Recommendation':<25}")
        print("-" * 95)
        
        reports = []
        for file in midi_files:
            full_path = os.path.join(root, file)
            info = inspect_midi(full_path)
            if info:
                reports.append(info)
        
        if not reports:
            continue
            
        # Determine which file has the most metadata
        max_meta = max(r['meta_count'] for r in reports)
        
        for r in reports:
            # Highlight the one with the richest metadata
            recommendation = ""
            if r['meta_count'] == max_meta and max_meta > 0:
                # If all files have the exact same meta count, don't blindly say "KEEP"
                if all(other['meta_count'] == max_meta for other in reports):
                    recommendation = "Identical Meta Count"
                else:
                    recommendation = "⭐ BEST METADATA (KEEP)"
            elif r['meta_count'] == 0:
                recommendation = "Stripped Meta"
                
            print(f"{r['filename'][:35]:<35} | {r['size_kb']:>6} KB | {r['tracks']:<6} | {r['meta_count']:<9} | {r['note_count']:<6} | {recommendation}")
            
        # Print extra textual insights for this specific group if they exist
        print(f"\n -> Metadata Details for {group_name}:")
        for r in reports:
            if r['track_names'] or r['text_samples']:
                print(f"    • {r['filename']}:")
                if r['track_names']:
                    print(f"      Tracks: {', '.join(r['track_names'][:5])} {'...' if len(r['track_names']) > 5 else ''}")
                if r['text_samples']:
                    print(f"      Text:   {', '.join(r['text_samples'])}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inspect_groups.py <organized_duplicates_directory>")
        sys.exit(1)
        
    target_dir = sys.argv[1]
    analyze_groups(target_dir)