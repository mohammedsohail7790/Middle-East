import * as THREE from "three";

function wavePath(
  radius: number,
  height: number,
  phase: number,
  waves: number,
  points = 28,
): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    pts.push(
      new THREE.Vector3(
        Math.cos(t + phase) * radius + Math.sin(t * waves) * 0.18,
        Math.sin(t * 1.4 + phase) * height,
        Math.sin(t + phase) * radius * 0.55 + Math.cos(t * waves) * 0.12,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.42);
}

/** Elegant data-stream curves orbiting the intelligence core */
export function buildStreamCurves(mobile: boolean): THREE.CatmullRomCurve3[] {
  const count = mobile ? 5 : 8;
  const curves: THREE.CatmullRomCurve3[] = [];
  for (let i = 0; i < count; i++) {
    const phase = (i / count) * Math.PI * 2;
    curves.push(wavePath(1.35 + (i % 3) * 0.12, 0.28 + (i % 2) * 0.1, phase, 2 + (i % 2), mobile ? 20 : 28));
  }
  return curves;
}

export type FloatingSpec = {
  position: [number, number, number];
  scale: number;
  kind: "cube" | "panel" | "node";
  redAccent: boolean;
};

export const FLOATING_SPECS: FloatingSpec[] = [
  { position: [1.45, 0.55, 0.35], scale: 0.11, kind: "cube", redAccent: false },
  { position: [-1.2, -0.35, 0.5], scale: 0.09, kind: "panel", redAccent: false },
  { position: [0.95, -0.65, -0.4], scale: 0.07, kind: "node", redAccent: true },
  { position: [-1.55, 0.25, -0.25], scale: 0.08, kind: "cube", redAccent: false },
  { position: [1.65, -0.15, -0.55], scale: 0.06, kind: "node", redAccent: false },
  { position: [-0.85, 0.72, 0.15], scale: 0.1, kind: "panel", redAccent: false },
  { position: [0.35, 0.85, -0.6], scale: 0.055, kind: "node", redAccent: true },
  { position: [-1.35, -0.7, -0.15], scale: 0.075, kind: "cube", redAccent: false },
];

export type RingSpec = {
  radius: number;
  tube: number;
  tilt: [number, number, number];
  speed: number;
  redSegment?: boolean;
};

export const RING_SPECS: RingSpec[] = [
  { radius: 1.15, tube: 0.014, tilt: [Math.PI / 2.2, 0.15, 0], speed: 0.11 },
  { radius: 1.38, tube: 0.011, tilt: [Math.PI / 2.6, -0.35, 0.45], speed: -0.08, redSegment: true },
  { radius: 1.62, tube: 0.009, tilt: [Math.PI / 2.1, 0.55, -0.25], speed: 0.06 },
  { radius: 1.88, tube: 0.008, tilt: [Math.PI / 2.4, -0.2, 0.6], speed: -0.05 },
];
