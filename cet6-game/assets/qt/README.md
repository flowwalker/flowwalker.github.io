# Qt-Gaming Web Assets

These animated WebP files are optimized derivatives of the final GIF files in
`../../../Qt-Gaming-main/images/`. The selected sources are loaded by the current
Qt runtime in `player.cpp`, `pet.cpp`, or `game.cpp`; files from `raw1/` and
`raw2/` are intentionally excluded.

Regenerate the assets on macOS with:

```bash
./tools/build_qt_assets.sh
```

The build preserves animation, transparency, timing, and looping while reducing
the 720-800 px source canvases to browser-appropriate dimensions. Do not edit
the generated WebP files by hand.
