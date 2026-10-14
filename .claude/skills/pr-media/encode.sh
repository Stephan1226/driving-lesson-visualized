#!/bin/zsh
# 프레임(20fps) → MP4(원본 크기) + GIF(PR 본문용, 10fps · 기본 가로 520)
# ./encode.sh <framesDir> <outBase> [gifWidth] [startSec] [endSec]
set -e
frames=$1; out=$2; w=${3:-520}; ss=${4:-0}; to=${5:-}
range=(-ss $ss); [ -n "$to" ] && range+=(-to $to)
ffmpeg -loglevel error -y -framerate 20 -i "$frames/f_%04d.png" $range -c:v libx264 -pix_fmt yuv420p -crf 20 -preset slow -movflags +faststart "$out.mp4"
ffmpeg -loglevel error -y -framerate 20 -i "$frames/f_%04d.png" $range \
  -vf "fps=10,scale=$w:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${GIF_COLORS:-128}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" "$out.gif"
ls -lh "$out.mp4" "$out.gif" | awk '{print $5, $9}'
