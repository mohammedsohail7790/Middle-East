import * as THREE from "three";

const GOLDEN = (1 + Math.sqrt(5)) / 2;

function fibonacciSphere(count: number, radius: number): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (2 * Math.PI * i) / GOLDEN;
    const y = 1 - (i / Math.max(1, count - 1)) * 2;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    nodes.push(
      new THREE.Vector3(
        Math.cos(theta) * ring * radius,
        y * radius * 1.05,
        Math.sin(theta) * ring * radius * 0.9,
      ),
    );
  }
  return nodes;
}

function connectNearest(
  nodes: THREE.Vector3[],
  neighbors: number,
  maxEdges: number,
): Array<[number, number]> {
  const edges: Array<[number, number]> = [];
  const seen = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const ranked = nodes
      .map((node, j) => ({ j, d: i === j ? Infinity : node.distanceTo(nodes[j]) }))
      .sort((a, b) => a.d - b.d);

    for (let n = 0; n < neighbors && edges.length < maxEdges; n++) {
      const j = ranked[n].j;
      const key = `${Math.min(i, j)}-${Math.max(i, j)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push([i, j]);
    }
  }

  return edges;
}

/** Evenly distributed nodes + restrained edge graph for consultancy backdrop. */
export function buildIntelligenceNetwork(nodeCount: number, maxEdges: number) {
  const nodes = fibonacciSphere(nodeCount, 1.32);
  const edges = connectNearest(nodes, 3, maxEdges);

  const positions = new Float32Array(edges.length * 6);
  edges.forEach(([a, b], idx) => {
    const offset = idx * 6;
    positions[offset] = nodes[a].x;
    positions[offset + 1] = nodes[a].y;
    positions[offset + 2] = nodes[a].z;
    positions[offset + 3] = nodes[b].x;
    positions[offset + 4] = nodes[b].y;
    positions[offset + 5] = nodes[b].z;
  });

  return { nodes, positions };
}
