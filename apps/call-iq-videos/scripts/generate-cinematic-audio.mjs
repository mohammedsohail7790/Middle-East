import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const audioDir = join(__dirname, "..", "public", "audio");
mkdirSync(audioDir, { recursive: true });

const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const numChannels = 2;
  const bitsPerSample = 16;
  const byteRate = (SAMPLE_RATE * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  writeFileSync(filePath, buffer);
}

function stereoFromMono(mono) {
  const stereo = new Float32Array(mono.length * 2);
  for (let i = 0; i < mono.length; i++) {
    stereo[i * 2] = mono[i];
    stereo[i * 2 + 1] = mono[i] * 0.97;
  }
  return stereo;
}

/** Cinematic ambient pad — matches launch video length */
function generateBackgroundMusic() {
  const durationSec = 112;
  const total = SAMPLE_RATE * durationSec;
  const mono = new Float32Array(total);

  const freqs = [55, 82.5, 110, 165, 220];
  const amps = [0.08, 0.06, 0.05, 0.035, 0.025];

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    let sample = 0;
    for (let f = 0; f < freqs.length; f++) {
      const env = 0.55 + 0.45 * Math.sin(t * (0.15 + f * 0.04) + f);
      sample += Math.sin(2 * Math.PI * freqs[f] * t) * amps[f] * env;
    }
    const fadeIn = Math.min(1, t / 3);
    const fadeOut = Math.min(1, (durationSec - t) / 4);
    mono[i] = sample * fadeIn * fadeOut * 0.65;
  }

  writeWav(join(audioDir, "background-music.wav"), stereoFromMono(mono));
  console.log("Created background-music.wav");
}

/** Short transition swoosh */
function generateTransitionSfx() {
  const durationSec = 0.45;
  const total = Math.floor(SAMPLE_RATE * durationSec);
  const mono = new Float32Array(total);

  for (let i = 0; i < total; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / durationSec;
    const freq = 800 - progress * 600;
    const env = Math.sin(progress * Math.PI) * (1 - progress * 0.3);
    mono[i] = Math.sin(2 * Math.PI * freq * t) * env * 0.35;
    mono[i] += (Math.random() * 2 - 1) * env * 0.04;
  }

  writeWav(join(audioDir, "transition-sfx.wav"), stereoFromMono(mono));
  console.log("Created transition-sfx.wav");
}

generateBackgroundMusic();
generateTransitionSfx();
console.log("Cinematic audio generation complete.");
