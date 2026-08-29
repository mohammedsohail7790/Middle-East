"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "../palette";
import { generateNetwork } from "./generateNetwork";

type Props = {
  mobile: boolean;
  animate: boolean;
};

const PARTICLE_COLOR = new THREE.Color(PALETTE.light);
const dummy = new THREE.Object3D();

export function IntelligenceNetwork({ mobile, animate }: Props) {
  const data = useMemo(() => generateNetwork(mobile), [mobile]);

  const nodesRef = useRef<THREE.InstancedMesh>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const particlesRef = useRef<THREE.InstancedMesh>(null);

  const nodeGeometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);

  const lineGeometry = useMemo(() => {
    const positions = new Float32Array(data.edges.length * 6);
    const colors = new Float32Array(data.edges.length * 6);
    data.edges.forEach((edge, i) => {
      const a = data.nodes[edge.a].position;
      const b = data.nodes[edge.b].position;
      positions.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
      const cA = edge.active ? edge.colorA : edge.colorA.clone().multiplyScalar(0.35);
      const cB = edge.active ? edge.colorB : edge.colorB.clone().multiplyScalar(0.35);
      colors.set([cA.r, cA.g, cA.b, cB.r, cB.g, cB.b], i * 6);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [data]);

  const particleCount = data.activeEdgeIndices.length;
  const particleGeometry = useMemo(() => new THREE.SphereGeometry(1, 6, 6), []);
  const particleState = useMemo(
    () =>
      data.activeEdgeIndices.map((edgeIdx) => ({
        edgeIdx,
        t: Math.random(),
        speed: 0.18 + Math.random() * 0.22,
      })),
    [data],
  );

  const time = useRef(0);

  useEffect(() => {
    const mesh = nodesRef.current;
    if (!mesh) return;
    data.nodes.forEach((node, i) => mesh.setColorAt(i, node.color));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data]);

  useFrame((_, dt) => {
    time.current += dt;
    const t = time.current;

    const nodesMesh = nodesRef.current;
    if (nodesMesh) {
      data.nodes.forEach((node, i) => {
        const pulse = animate
          ? 1 + Math.sin(t * 0.8 + i * 0.37) * (node.tier === "dim" ? 0.05 : 0.15)
          : 1;
        dummy.position.copy(node.position);
        dummy.scale.setScalar(node.size * pulse);
        dummy.updateMatrix();
        nodesMesh.setMatrixAt(i, dummy.matrix);
      });
      nodesMesh.instanceMatrix.needsUpdate = true;
    }

    if (animate && particlesRef.current) {
      particleState.forEach((p, i) => {
        p.t += p.speed * dt;
        if (p.t >= 1) {
          p.t = 0;
          p.edgeIdx = data.activeEdgeIndices[Math.floor(Math.random() * data.activeEdgeIndices.length)];
        }
        const edge = data.edges[p.edgeIdx];
        const a = data.nodes[edge.a].position;
        const b = data.nodes[edge.b].position;
        dummy.position.lerpVectors(a, b, p.t);
        const fade = Math.sin(p.t * Math.PI);
        dummy.scale.setScalar(0.022 * (0.6 + fade));
        dummy.updateMatrix();
        particlesRef.current!.setMatrixAt(i, dummy.matrix);
      });
      particlesRef.current.instanceMatrix.needsUpdate = true;
    }

    if (linesRef.current && animate) {
      const material = linesRef.current.material as THREE.LineBasicMaterial;
      material.opacity = 0.55 + Math.sin(t * 0.4) * 0.08;
    }
  });

  return (
    <group>
      <lineSegments ref={linesRef} geometry={lineGeometry}>
        <lineBasicMaterial vertexColors transparent opacity={0.55} depthWrite={false} />
      </lineSegments>

      <instancedMesh ref={nodesRef} args={[nodeGeometry, undefined, data.nodes.length]} frustumCulled={false}>
        <meshBasicMaterial vertexColors toneMapped={false} transparent opacity={0.92} />
      </instancedMesh>

      {particleCount > 0 && (
        <instancedMesh ref={particlesRef} args={[particleGeometry, undefined, particleCount]} frustumCulled={false}>
          <meshBasicMaterial color={PARTICLE_COLOR} transparent opacity={0.9} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}
