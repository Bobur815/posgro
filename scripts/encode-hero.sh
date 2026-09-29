#!/usr/bin/env bash
#
# Encode the posgro.uz hero background video — run LOCALLY, not on the VPS.
#
#   scripts/encode-hero.sh <input-video> [output-dir]      (default output: assets/out)
#
# Writes the five files the super-admin "Hero video" card uploads:
#   hero.webm         VP9, ≤1920 wide          — Chrome/Firefox take this one
#   hero.mp4          H.264, ≤1920 wide        — Safari falls through to it
#   hero-mobile.mp4   H.264, ≤1280 wide        — served under (max-width: 768px)
#   hero-poster.jpg   + hero-poster.webp       — LCP image and the no-motion fallback, < 150 KB
#
# Every output loops seamlessly: the last CROSSFADE seconds fade into the first frame, so there is
# no visible jump at the loop point. Output is capped at MAX_SECONDS. No slow motion here — do that
# in an editor before encoding (slowing low-fps footage in ffmpeg only duplicates frames).
#
# Never upscales: a 768-wide source stays 768 wide, because stretching it only adds bytes.
set -euo pipefail

MAX_SECONDS=60
CROSSFADE=0.5
FPS=24
POSTER_MAX_BYTES=$((150 * 1024))
VIDEO_WARN_BYTES=$((3 * 1024 * 1024))

in="${1:-}"
out="${2:-assets/out}"
[ -n "$in" ] && [ -f "$in" ] || { echo "usage: $0 <input-video> [output-dir]" >&2; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null \
  || { echo "❌ ffmpeg/ffprobe not found" >&2; exit 1; }

mkdir -p "$out"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

probe() { ffprobe -v error -select_streams v:0 -show_entries "$1" -of default=nw=1:nk=1 "$in" | head -1; }
src_w="$(probe stream=width)"
duration="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$in")"

# Even widths only (yuv420p), and never wider than the source.
cap_width() { local w=$(( src_w < $1 ? src_w : $1 )); echo $(( w - w % 2 )); }
desk_w="$(cap_width 1920)"
mob_w="$(cap_width 1280)"

# Take MAX_SECONDS + CROSSFADE of source: the crossfade overlaps the ends, so the loop comes out
# exactly MAX_SECONDS long (or shorter, for a short source).
take="$(awk -v d="$duration" -v m="$MAX_SECONDS" -v c="$CROSSFADE" 'BEGIN { t = m + c; printf "%.3f", (d < t ? d : t) }')"
offset="$(awk -v t="$take" -v c="$CROSSFADE" 'BEGIN { printf "%.3f", t - 2 * c }')"
awk -v o="$offset" 'BEGIN { exit !(o > 0) }' || { echo "❌ source too short to loop (${duration}s)" >&2; exit 1; }

echo "🎞  $in — ${src_w}px, ${duration}s → loop of $(awk -v t="$take" -v c="$CROSSFADE" 'BEGIN{printf "%.1f", t-c}')s at ${FPS} fps"

# 1) Seamless master at desktop width, near-lossless, so each delivery encode starts from one clean
#    source. Body = [CROSSFADE, take]; head = [0, CROSSFADE]; the body's tail fades into the head,
#    whose last frame is exactly where the body starts — the loop point.
master="$tmp/master.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$in" -an -filter_complex "
  [0:v]fps=${FPS},scale=${desk_w}:-2,setsar=1,trim=0:${take},setpts=PTS-STARTPTS,split[a][b];
  [a]trim=start=${CROSSFADE},setpts=PTS-STARTPTS[body];
  [b]trim=0:${CROSSFADE},setpts=PTS-STARTPTS[head];
  [body][head]xfade=transition=fade:duration=${CROSSFADE}:offset=${offset},format=yuv420p[v]" \
  -map "[v]" -c:v libx264 -crf 12 -preset veryfast "$master"

# 2) Delivery encodes (the recipe agreed in tasks/todo.md).
echo "⏳ hero.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$master" -an \
  -c:v libx264 -crf 28 -preset slow -profile:v high -pix_fmt yuv420p \
  -movflags +faststart "$out/hero.mp4"

echo "⏳ hero.webm"
ffmpeg -hide_banner -loglevel error -y -i "$master" -an \
  -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 "$out/hero.webm"

echo "⏳ hero-mobile.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$master" -an -vf "scale=${mob_w}:-2" \
  -c:v libx264 -crf 30 -preset slow -profile:v high -pix_fmt yuv420p \
  -movflags +faststart "$out/hero-mobile.mp4"

# 3) Posters from the master's first frame — the frame the video opens on, so there is no jump
#    when playback replaces the poster. Quality steps down until the file is under the cap.
frame="$tmp/frame.png"
ffmpeg -hide_banner -loglevel error -y -i "$master" -frames:v 1 "$frame"

size() { stat -c %s "$1"; }

for q in 3 5 7 9 11 13 15 18 21 24 27 31; do
  ffmpeg -hide_banner -loglevel error -y -i "$frame" -q:v "$q" "$out/hero-poster.jpg"
  [ "$(size "$out/hero-poster.jpg")" -lt "$POSTER_MAX_BYTES" ] && break
done
for q in 82 75 68 60 52 45 38 30; do
  ffmpeg -hide_banner -loglevel error -y -i "$frame" -c:v libwebp -quality "$q" "$out/hero-poster.webp"
  [ "$(size "$out/hero-poster.webp")" -lt "$POSTER_MAX_BYTES" ] && break
done

# 4) Report.
echo
status=0
for f in hero.webm hero.mp4 hero-mobile.mp4 hero-poster.jpg hero-poster.webp; do
  bytes="$(size "$out/$f")"
  note=""
  case "$f" in
    *.jpg|*.webp) [ "$bytes" -ge "$POSTER_MAX_BYTES" ] && { note="  ⚠️  over 150 KB"; status=1; } ;;
    *)            [ "$bytes" -gt "$VIDEO_WARN_BYTES" ] && note="  ⚠️  over 3 MB — raise -crf, narrow, or shorten" ;;
  esac
  printf '  %-18s %8s KB%s\n' "$f" "$(( bytes / 1024 ))" "$note"
done
echo
echo "✅ $out — upload these five in Dashboard → Landing Page → Hero video"
exit "$status"
