import os
from mido import MidiFile

MIDI_DIR = "midi"

def get_instruments(path):
    instruments = set()
    try:
        mid = MidiFile(path)
        for track in mid.tracks:
            for msg in track:
                if msg.type == "program_change":
                    instruments.add(msg.program)
    except Exception as e:
        print(f"Error reading {path}: {e}")
    return instruments

def main():
    results = []

    for root, _, files in os.walk(MIDI_DIR):
        for file in files:
            if file.lower().endswith((".mid", ".midi")):
                path = os.path.join(root, file)
                instruments = get_instruments(path)
                results.append((file, len(instruments), sorted(instruments)))

    # sort by number of instruments (descending)
    results.sort(key=lambda x: x[1], reverse=True)

    for file, count, instruments in results:
        print(f"{file}: {count} instruments -> {instruments}")

if __name__ == "__main__":
    main()
