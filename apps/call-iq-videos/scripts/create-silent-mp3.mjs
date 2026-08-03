import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal valid MPEG-1 Layer III silent frame (~0.026s)
const silentMp3 = Buffer.from(
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRwmHAAAAAAD/+1DEAAAHAAGf9AAAIgAANIAAAAQAAAaEAAAAAABAAAAAA//tQxAAACAAADSAAAAABpAAAAAA=",
  "base64",
);

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "audio");
writeFileSync(join(dir, "background-music.mp3"), silentMp3);
writeFileSync(join(dir, "transition-sfx.mp3"), silentMp3);
console.log("Created placeholder audio files in public/audio/");
