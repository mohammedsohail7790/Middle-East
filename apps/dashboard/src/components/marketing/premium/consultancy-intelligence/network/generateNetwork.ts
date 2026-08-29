import * as THREE from "three";
import { PALETTE } from "../palette";

/** Deterministic PRNG so the network looks designed, not noisy, across reloads. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type NodeTier = "dim" | "purple" | "magenta" | "red" | "highlight";

export type NetworkNode = {
  position: THREE.Vector3;
  size: number;
  tier: NodeTier;
  color: THREE.Color;
};

export type NetworkEdge = {
  a: number;
  b: number;
  active: boolean;
  colorA: THREE.Color;
  colorB: THREE.Color;
};

export type NetworkData = {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
  activeEdgeIndices: number[];
};

const TIER_COLORS: Record<NodeTier, string> = {
  dim: PALETTE.purpleDeep,
  purple: PALETTE.purple,
  magenta: PALETTE.magenta,
  red: PALETTE.red,
  highlight: PALETTE.white,
};

function pickTier(rng: () => number, importance: number): NodeTier {
  const roll = rng();
  if (importance > 0.85) {
    if (roll < 0.06) return "highlight";
    if (roll < 0.22) return "red";
    return "magenta";
  }
  if (importance > 0.55) {
    if (roll < 0.12) return "red";
    if (roll < 0.4) return "magenta";
    return "purple";
  }
  if (roll < 0.08) return "magenta";
  return "dim";
}

type Cluster = {
  center: THREE.Vector3;
  radius: number;
  count: number;
  density: number;
};

/**
 * Builds an asymmetric, organically-clustered node graph: a denser core plus
 * looser satellite clusters, connected by short intra-cluster edges and a
 * handful of long inter-cluster links. Seeded so the silhouette is repeatable.
 */
export function generateNetwork(mobile: boolean, seed = 1337): NetworkData {
  const rng = mulberry32(seed);
  const scale = mobile ? 0.72 : 1;

  const clusters: Cluster[] = [
    { center: new THREE.Vector3(0, 0, 0), radius: 1.4 * scale, count: mobile ? 60 : 130, density: 1 },
    { center: new THREE.Vector3(1.9 * scale, 0.6 * scale, -0.4 * scale), radius: 0.85 * scale, count: mobile ? 22 : 46, density: 0.7 },
    { center: new THREE.Vector3(-2.1 * scale, -0.5 * scale, 0.3 * scale), radius: 0.95 * scale, count: mobile ? 20 : 42, density: 0.65 },
    { center: new THREE.Vector3(0.6 * scale, -1.5 * scale, 0.6 * scale), radius: 0.7 * scale, count: mobile ? 14 : 30, density: 0.55 },
    { center: new THREE.Vector3(-0.9 * scale, 1.5 * scale, -0.5 * scale), radius: 0.65 * scale, count: mobile ? 12 : 26, density: 0.5 },
  ];

  const nodes: NetworkNode[] = [];
  const clusterOf: number[] = [];

  clusters.forEach((cluster, ci) => {
    for (let i = 0; i < cluster.count; i++) {
      // Gaussian-ish falloff via averaged uniforms — denser near the cluster center.
      const r = cluster.radius * Math.pow(rng(), 1.6);
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const pos = new THREE.Vector3(
        cluster.center.x + r * Math.sin(phi) * Math.cos(theta),
        cluster.center.y + r * Math.sin(phi) * Math.sin(theta) * 0.75,
        cluster.center.z + r * Math.cos(phi) * 0.85,
      );

      const distFromCenter = pos.length();
      const importance = THREE.MathUtils.clamp(1 - distFromCenter / 3.2, 0, 1) * cluster.density;
      const tier = pickTier(rng, importance);
      const size = tier === "highlight"
        ? 0.05 + rng() * 0.02
        : tier === "red"
          ? 0.04 + rng() * 0.018
          : tier === "magenta"
            ? 0.03 + rng() * 0.014
            : 0.016 + rng() * 0.012;

      nodes.push({ position: pos, size, tier, color: new THREE.Color(TIER_COLORS[tier]) });
      clusterOf.push(ci);
    }
  });

  const edges: NetworkEdge[] = [];
  const maxNeighborDist = mobile ? 0.55 : 0.62;
  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    let linked = 0;
    for (let j = i + 1; j < nodes.length && linked < 5; j++) {
      if (clusterOf[i] !== clusterOf[j]) continue;
      const dist = nodes[i].position.distanceTo(nodes[j].position);
      if (dist < maxNeighborDist && rng() < 0.5) {
        const key = `${i}-${j}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ a: i, b: j, active: false, colorA: nodes[i].color, colorB: nodes[j].color });
        linked++;
      }
    }
  }

  // Sparse long-distance links stitching clusters together.
  const bridgeCount = mobile ? 5 : 10;
  for (let k = 0; k < bridgeCount; k++) {
    const ci = Math.floor(rng() * clusters.length);
    let cj = Math.floor(rng() * clusters.length);
    if (cj === ci) cj = (cj + 1) % clusters.length;
    const candidatesA = nodes.map((n, idx) => idx).filter((idx) => clusterOf[idx] === ci);
    const candidatesB = nodes.map((n, idx) => idx).filter((idx) => clusterOf[idx] === cj);
    if (!candidatesA.length || !candidatesB.length) continue;
    const a = candidatesA[Math.floor(rng() * candidatesA.length)];
    const b = candidatesB[Math.floor(rng() * candidatesB.length)];
    edges.push({ a, b, active: false, colorA: nodes[a].color, colorB: nodes[b].color });
  }

  // Mark a small subset of edges as active data-flow paths.
  const activeCount = Math.min(edges.length, mobile ? 6 : 12);
  const activeEdgeIndices: number[] = [];
  const pool = edges.map((_, idx) => idx);
  for (let i = 0; i < activeCount && pool.length; i++) {
    const pick = Math.floor(rng() * pool.length);
    const idx = pool.splice(pick, 1)[0];
    edges[idx].active = true;
    activeEdgeIndices.push(idx);
  }

  return { nodes, edges, activeEdgeIndices };
}
