# Adding MIDI Files

Drop your `.mid` file into this folder and commit it to `main`.
The `midilist.json` file will be regenerated automatically by CI.

## Naming convention

Use lowercase letters, numbers, underscores, and hyphens only.
No spaces or special characters.

Format:  title_year_-_artist.mid

Examples:
  maple_leaf_rag_1899_-_joplin.mid
  georgia_on_my_mind_1930_-_carmichael.mid
  a_cruel_angels_thesis_1995.mid

`name.py` will sanitize filenames automatically on commit,
but clean names are preferred.

## To run locally (optional)

From the repo root:
  pip install mido
  python scripts/name.py
