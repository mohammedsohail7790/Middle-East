import { computeSceneStarts, SCENE_FRAMES, TRANSITION } from "./timing";

export const CINEMATIC_VOICEOVERS = [
  "voiceover/cinematic/01-problem.wav",
  "voiceover/cinematic/02-intro.wav",
  "voiceover/cinematic/03-ai-answers.wav",
  "voiceover/cinematic/04-lead-capture.wav",
  "voiceover/cinematic/05-appointments.wav",
  "voiceover/cinematic/06-dashboard.wav",
  "voiceover/cinematic/07-integrations.wav",
  "voiceover/cinematic/08-industries.wav",
  "voiceover/cinematic/09-results.wav",
  "voiceover/cinematic/10-finale.wav",
] as const;

export const CINEMATIC_SCENE_STARTS = computeSceneStarts();

export const VOICEOVER_DELAY = 10;

export { SCENE_FRAMES, TRANSITION };
