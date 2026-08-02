#!/usr/bin/env python3
"""
Encode the rendered frames and narration into media/alpha-forge.mp4.

Audio is concatenated in scene order, so it stays aligned with the frames, which were timed from
the same WAV lengths. Run render_video.py first.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.join(HERE, "vo")
OUT = os.path.join(HERE, "alpha-forge.mp4")
FRAMES = os.environ.get("AF_FRAME_DIR") or os.path.join(
    os.environ.get("TEMP", "/tmp"), "alphaforge_frames"
)
FPS = 30


def run(cmd):
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode:
        print(" ".join(cmd[:6]), "...")
        print(p.stderr[-2500:])
        sys.exit(p.returncode)
    return p


def main():
    manifest = json.load(open(os.path.join(VO, "manifest.json"), encoding="utf-8-sig"))
    frames = sorted(f for f in os.listdir(FRAMES) if f.endswith(".png"))
    expected = sum(int(round(m["seconds"] * FPS)) for m in manifest)
    print(f"frames: {len(frames)} on disk, {expected} expected")
    if len(frames) < expected:
        print("Incomplete render. Run render_video.py to completion first.")
        sys.exit(1)

    # Concat the per-scene narration. The demuxer needs forward slashes and quoted paths.
    listing = os.path.join(FRAMES, "audio.txt")
    with open(listing, "w", encoding="utf-8") as f:
        for m in manifest:
            p = os.path.join(HERE, m.get("audio", f"vo/{m['id']}.mp3")).replace("\\", "/")
            if not os.path.exists(p):
                print(f"missing narration: {p}\nRun synth_vo.py first.")
                sys.exit(1)
            f.write(f"file '{p}'\n")

    voice = os.path.join(FRAMES, "voice.wav")
    print("concatenating narration...")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-f", "concat", "-safe", "0", "-i", listing,
         # The neural voice is already clean and evenly levelled, so this only trims sub-bass and
         # sets broadcast loudness. Heavy compression here would flatten its natural dynamics,
         # which is exactly the quality worth keeping.
         "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11",
         "-ar", "48000", "-ac", "2", voice])

    print("encoding video...")
    run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
         "-framerate", str(FPS), "-i", os.path.join(FRAMES, "f%06d.png"),
         "-i", voice,
         "-c:v", "libx264", "-preset", "slow", "-crf", "20",
         "-pix_fmt", "yuv420p", "-movflags", "+faststart",
         "-c:a", "aac", "-b:a", "160k",
         "-shortest", OUT])

    probe = run(["ffprobe", "-v", "error", "-show_entries",
                 "format=duration,size:stream=codec_name,width,height,r_frame_rate",
                 "-of", "json", OUT])
    info = json.loads(probe.stdout)
    dur = float(info["format"]["duration"])
    mb = int(info["format"]["size"]) / 1e6
    print(f"\n{OUT}")
    print(f"  {int(dur // 60)}m {dur % 60:04.1f}s   {mb:.1f} MB")
    for s in info["streams"]:
        if s["codec_name"] in ("h264", "aac"):
            dims = f'{s.get("width", "")}x{s.get("height", "")}'.strip("x")
            print(f'  {s["codec_name"]:6} {dims} {s.get("r_frame_rate", "")}')


if __name__ == "__main__":
    main()
