import * as THREE from "three";

const GOLDEN = (1 + Math.sqrt(5)) / 2;

/** Even surface nodes on a brain-shaped ellipsoid (deterministic). */
function brainSurfaceNodes(count: number): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const theta = (2 * Math.PI * i) / GOLDEN;
    const y = 1 - t * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const r = 1.02 + (i % 4) * 0.04;
    nodes.push(
      new THREE.Vector3(
        Math.cos(theta) * ring * r * 0.98,
        y * r * 1.12 + 0.04,
        Math.sin(theta) * ring * r * 0.84,
      ),
    );
  }
  return nodes;
}

/** Curved synapse paths between nearby cortex nodes. */
export function buildBrainSynapses(mobile: boolean) {
  const nodeCount = mobile ? 14 : 18;
  const maxConnections = mobile ? 20 : 28;
  const nodes = brainSurfaceNodes(nodeCount);

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (pairs.length >= maxConnections) break;
      if (nodes[i].distanceTo(nodes[j]) < 0.82) {
        pairs.push([i, j]);
      }
    }
  }

  const curves = pairs.map(([a, b]) => {
    const mid = nodes[a].clone().lerp(nodes[b], 0.5);
    mid.multiplyScalar(1.04 + ((a + b) % 3) * 0.02);
    return new THREE.CatmullRomCurve3([nodes[a].clone(), mid, nodes[b].clone()]);
  });

  return { nodes, curves };
}
