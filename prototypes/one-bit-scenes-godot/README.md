# Invisible Hand — 1BIT Scene Study

> PROTOTYPE ONLY. This is a throwaway visual and pacing study, not production architecture.

This prototype reconstructs the reference video's visual grammar for a tiny
`The Wealth of Nations` demonstration: large readable actors, real scene
changes, a two-phase dither wipe, a gameplay log that changes size, and a
layered result reveal.

## Run

```bash
/opt/homebrew/bin/godot --path /Users/mahaoxuan/Desktop/一本书/prototypes/one-bit-scenes-godot
```

Click **开始演示**, then let the 15-second sequence play. Click during playback
to jump to the next scene. Press `R` to return to the title.

## Export Web

```bash
/opt/homebrew/bin/godot --headless \
  --path /Users/mahaoxuan/Desktop/一本书/prototypes/one-bit-scenes-godot \
  --export-release Web web/index.html
```

The included Fusion Pixel font is licensed under the SIL Open Font License;
its license is copied next to the font file.
