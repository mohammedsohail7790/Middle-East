/** Single source of truth for cinematic launch pacing @ 30fps */
export const FPS = 30;
export const TRANSITION = 12;

/** Per-scene duration in frames (content length before transition overlap) */
export const SCENE_FRAMES = [
  360, // 1  Problem          0:00–0:12
  300, // 2  Intro            0:12–0:22
  390, // 3  AI Answers       0:22–0:35
  360, // 4  Lead Capture     0:35–0:47
  330, // 5  Appointments     0:47–0:58
  420, // 6  Dashboard        0:58–1:12
  300, // 7  Integrations     1:12–1:22
  360, // 8  Industries       1:22–1:34
  330, // 9  Results          1:34–1:45
  300, // 10 Finale           1:45–1:55
] as const;

export const CINEMATIC_LAUNCH_DURATION =
  SCENE_FRAMES.reduce((sum, n) => sum + n, 0) -
  (SCENE_FRAMES.length - 1) * TRANSITION;

export function computeSceneStarts(): number[] {
  const starts: number[] = [0];
  for (let i = 1; i < SCENE_FRAMES.length; i++) {
    starts.push(starts[i - 1]! + SCENE_FRAMES[i - 1]! - TRANSITION);
  }
  return starts;
}

/** Scale scene-local animation delays for snappier motion */
export const PACE = 0.48;

export function t(frame: number): number {
  return Math.round(frame * PACE);
}
