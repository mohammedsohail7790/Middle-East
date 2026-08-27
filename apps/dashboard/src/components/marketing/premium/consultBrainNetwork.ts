import * as THREE from "three";

const SYNAPSE_NODES = 18;
const MAX_CONNECTIONS = 26;

/** Surface nodes + curved synapse paths on a brain-shaped ellipsoid. */
export function buildBrainSynapses() {
  const nodes: THREE.Vector3[] = [];

  for (let i = 0; i < SYNAPSE_NODES; i++) {
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = Math.random() * Math.PI * 2;
    const r = 1.05 + Math.random() * 0.22;
    nodes.push(
      new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * r * 1.08,
        Math.cos(phi) * r * 1.18 + 0.08,
        Math.sin(phi) * Math.sin(theta) * r * 0.82,
      ),
    );
  }

  const pairs: [number, number][] = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      if (pairs.length >= MAX_CONNECTIONS) break;
      if (nodes[i].distanceTo(nodes[j]) < 0.9) {
        pairs.push([i, j]);
      }
    }
  }

  const curves = pairs.map(([a, b]) => {
    const mid = nodes[a].clone().lerp(nodes[b], 0.5);
    mid.multiplyScalar(1.06 + Math.random() * 0.08);
    return new THREE.CatmullRomCurve3([nodes[a].clone(), mid, nodes[b].clone()]);
  });

  return { nodes, curves };
}
