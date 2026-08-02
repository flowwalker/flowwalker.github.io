#!/bin/sh
set -eu

GAME_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
QT_IMAGES=${QT_IMAGES:-"$GAME_DIR/../Qt-Gaming-main/images"}
OUT_DIR="$GAME_DIR/assets/qt"
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/game-v13-qt-assets.XXXXXX")
WORKSPACE_DIR=$(CDPATH= cd -- "$GAME_DIR/../../../.." && pwd)
TRASH_DIR="$WORKSPACE_DIR/.Trash/game_v13_asset_build"

cleanup() {
    if test -d "$TMP_DIR"; then
        mkdir -p "$TRASH_DIR"
        mv "$TMP_DIR" "$TRASH_DIR/$(basename "$TMP_DIR").$(date +%s)"
    fi
}
trap cleanup EXIT INT TERM

command -v clang >/dev/null 2>&1 || { echo "clang is required" >&2; exit 1; }
command -v gif2webp >/dev/null 2>&1 || { echo "gif2webp is required" >&2; exit 1; }
command -v webpmux >/dev/null 2>&1 || { echo "webpmux is required" >&2; exit 1; }
mkdir -p "$OUT_DIR"

clang -fobjc-arc \
    -framework Foundation \
    -framework ImageIO \
    -framework CoreGraphics \
    "$GAME_DIR/tools/resize_animated_gif.m" \
    -o "$TMP_DIR/resize_animated_gif"

build_asset() {
    source_name=$1
    output_name=$2
    max_pixels=$3
    frame_step=${4:-1}
    delay_ms=${5:-0}
    source_path="$QT_IMAGES/$source_name"
    resized_path="$TMP_DIR/$output_name.gif"
    encoded_path="$TMP_DIR/$output_name.webp"

    test -f "$source_path" || { echo "Missing final Qt asset: $source_path" >&2; exit 1; }
    "$TMP_DIR/resize_animated_gif" "$source_path" "$resized_path" "$max_pixels" "$frame_step" "$delay_ms"
    gif2webp -quiet -lossy -q 76 -m 4 -min_size "$resized_path" -o "$encoded_path"
    webpmux -set bgcolor 0,0,0,0 "$encoded_path" -o "$OUT_DIR/$output_name.webp" >/dev/null
    printf '%-24s %8s bytes\n' "$output_name.webp" "$(stat -f '%z' "$OUT_DIR/$output_name.webp")"
}

# Every source below is loaded by the current Qt C++ runtime. raw1/raw2 are excluded.
build_asset player.gif player-idle 192
build_asset player_run.gif player-run 192
build_asset player_enhanced.gif player-enhanced-idle 192
build_asset player_enhanced_right_run.gif player-enhanced-run 192
build_asset pet.gif pet-idle 144
build_asset pet_right_run.gif pet-run 144
# Qt decodes fire-hit at 8 ms/frame and bomb at every second frame. Browsers
# clamp very short GIF delays, so 20 ms preserves the intended fast impact.
build_asset fire_hit.gif fire-hit 192 1 20
build_asset bomb.gif bomb 192 2 20
# Qt's I-key projectile reuses these two runtime GIFs with rotation/mirroring
# to cover all eight directions. Match its roughly 30fps frame cadence.
build_asset fly_fire_right.gif fly-fire-right 144 1 34
build_asset fly_fire_left_down.gif fly-fire-left-down 144 1 34
