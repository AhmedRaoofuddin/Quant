#!/usr/bin/env python3
"""
Synthesize the narration with a neural voice, one file per scene.

Windows ships only the 2013-era SAPI voices (Zira, David, Mark), which sound obviously synthetic
on a product video. edge-tts reaches Microsoft's neural voices instead: free, no API key, but it
does need a network connection.

Per-scene files let the renderer time each scene to its real audio length rather than guessing.

    pip install edge-tts
    python media/synth_vo.py                      # default voice
    python media/synth_vo.py --voice en-US-EmmaMultilingualNeural
    python media/synth_vo.py --list               # show natural English female voices
"""

import argparse
import asyncio
import json
import os
import subprocess
import sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
VO = os.path.join(HERE, "vo")

# Ava is Microsoft's conversational voice: warm, unhurried, and it does not over-perform the
# numbers, which matters when most sentences contain one.
DEFAULT_VOICE = "en-US-AvaMultilingualNeural"

# Slightly under natural pace. Narration read at conversational speed runs ahead of the visuals.
RATE = "-6%"
PITCH = "-2Hz"


def duration(path):
    """Real length in seconds, read from the file rather than estimated from word count."""
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "csv=p=0", path],
        capture_output=True, text=True, check=True,
    )
    return round(float(out.stdout.strip()), 3)


async def list_voices():
    voices = await edge_tts.list_voices()
    for v in sorted(voices, key=lambda x: x["ShortName"]):
        if v["Locale"].startswith("en") and v["Gender"] == "Female":
            tags = v.get("VoiceTag", {}).get("VoicePersonalities", [])
            print(f'{v["ShortName"]:34} {", ".join(tags)}')


async def synth(voice):
    script = json.load(open(os.path.join(HERE, "script.json"), encoding="utf-8"))
    os.makedirs(VO, exist_ok=True)
    print(f"voice: {voice}   rate: {RATE}   pitch: {PITCH}\n")

    manifest = []
    for scene in script["scenes"]:
        path = os.path.join(VO, f'{scene["id"]}.mp3')
        communicate = edge_tts.Communicate(scene["vo"], voice, rate=RATE, pitch=PITCH)
        await communicate.save(path)
        secs = duration(path)
        manifest.append({"id": scene["id"], "beat": scene["beat"],
                         "seconds": secs, "audio": f'vo/{scene["id"]}.mp3'})
        print(f'{scene["id"]:10} {secs:7.2f}s')

    with open(os.path.join(VO, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    total = sum(m["seconds"] for m in manifest)
    print(f"\ntotal narration: {total:.1f}s across {len(manifest)} scenes "
          f"({int(total // 60)}m {total % 60:04.1f}s)")

    # Stale WAVs from the old SAPI pipeline would silently be picked up by encode.py.
    stale = [f for f in os.listdir(VO) if f.endswith(".wav")]
    for f in stale:
        os.remove(os.path.join(VO, f))
    if stale:
        print(f"removed {len(stale)} stale WAV files from the previous voice")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default=DEFAULT_VOICE)
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    asyncio.run(list_voices() if a.list else synth(a.voice))


if __name__ == "__main__":
    main()
