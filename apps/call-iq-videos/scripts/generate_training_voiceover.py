"""Generate training video voiceovers via Microsoft Edge TTS (free neural voices)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = Path(__file__).resolve().parent / "training-narration-manifest.json"
OUT_ROOT = ROOT / "public" / "voiceover" / "training"


async def synthesize(text: str, path: Path, voice: str, rate: str, pitch: str) -> None:
    communicate = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await communicate.save(str(path))


async def main() -> None:
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    voice_cfg = manifest["voice"]
    voice = voice_cfg["id"]
    rate = voice_cfg.get("rate", "+0%")
    pitch = voice_cfg.get("pitch", "+0Hz")

    total = sum(len(v["chapters"]) for v in manifest["videos"])
    done = 0

    for video in manifest["videos"]:
        slug = video["slug"]
        out_dir = OUT_ROOT / slug
        out_dir.mkdir(parents=True, exist_ok=True)

        for i, chapter in enumerate(video["chapters"], start=1):
            filename = f"{i:02d}.mp3"
            out_path = out_dir / filename
            text = chapter["text"].strip()
            await synthesize(text, out_path, voice, rate, pitch)
            done += 1
            print(f"[{done}/{total}] {slug}/{filename}")

    print(f"Voiceover generation complete — {done} files in {OUT_ROOT}")


if __name__ == "__main__":
    asyncio.run(main())
