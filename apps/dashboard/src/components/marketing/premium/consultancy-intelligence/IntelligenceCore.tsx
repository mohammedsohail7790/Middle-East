"use client";

import { Edges, RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";

function InnerParticles({ count }: { count: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        r: 0.08 + (i % 5) * 0.04,
        a: (i / count) * Math.PI * 2,
        b: ((i * 7) % count) / count,
        red: i % 11 === 0,
      })),
    [count],
  );

  useFrame((state) => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = state.clock.elapsedTime;
    seeds.forEach((s, i) => {
      const pulse = 0.7 + Math.sin(t * 1.2 + i) * 0.3;
      dummy.position.set(
        Math.cos(s.a + t * 0.25) * s.r,
        Math.sin(s.b * Math.PI * 2 + t * 0.35) * s.r * 0.8,
        Math.sin(s.a + t * 0.2) * s.r * 0.7,
      );
      dummy.scale.setScalar(pulse * 0.035);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      <sphereGeometry args={[1, 5, 5]} />
      <meshBasicMaterial color={PALETTE.electric} transparent opacity={0.55} depthWrite={false} />
    </instancedMesh>
  );
}

/** Crystalline glass core, styled after the reference: a faceted cube with
 * glowing purple/red edge lines, an inner pulsing kernel, and orbiting light. */
export function IntelligenceCore({ mobile }: { mobile: boolean }) {
  const shell = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const kernel = useRef<THREE.Mesh>(null);
  const particleCount = mobile ? 18 : 32;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (inner.current) {
      const mat = inner.current.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = 0.6 + Math.sin(t * 0.9) * 0.15;
    }
    if (kernel.current) {
      const mat = kernel.current.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = 0.85 + Math.sin(t * 1.6) * 0.2;
      kernel.current.scale.setScalar(0.28 + Math.sin(t * 1.6) * 0.015);
    }
    if (shell.current) {
      shell.current.rotation.y = t * 0.08;
      shell.current.rotation.x = Math.sin(t * 0.15) * 0.06;
    }
  });

  return (
    <group>
      <RoundedBox ref={shell} args={[0.92, 0.92, 0.92]} radius={0.1} smoothness={4}>
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.4}
          roughness={0.08}
          transmission={0.92}
          thickness={1.1}
          ior={1.5}
          specularIntensity={1}
          transparent
          opacity={0.9}
          emissive={PALETTE.purple}
          emissiveIntensity={0.14}
          clearcoat={0.85}
          clearcoatRoughness={0.12}
          envMapIntensity={1}
        />
        <Edges scale={1.006} threshold={1}>
          <lineBasicMaterial color={PALETTE.light} transparent opacity={0.55} />
        </Edges>
      </RoundedBox>

      <mesh ref={inner} scale={0.42} rotation={[0.4, 0.5, 0]}>
        <icosahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial
          color={PALETTE.deep}
          metalness={0.65}
          roughness={0.22}
          emissive={PALETTE.electric}
          emissiveIntensity={0.6}
        />
        <Edges scale={1.01} threshold={1}>
          <lineBasicMaterial color={PALETTE.magenta} transparent opacity={0.4} />
        </Edges>
      </mesh>

      <mesh ref={kernel} scale={0.28}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshPhysicalMaterial
          color={PALETTE.purpleDeep}
          emissive={PALETTE.violet}
          emissiveIntensity={0.85}
          metalness={0.35}
          roughness={0.28}
          transparent
          opacity={0.9}
        />
      </mesh>

      <InnerParticles count={particleCount} />

      <mesh scale={1.04}>
        <boxGeometry args={[0.94, 0.94, 0.94]} />
        <meshBasicMaterial color={PALETTE.electric} wireframe transparent opacity={0.08} depthWrite={false} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -0.72, 0]}>
        <torusGeometry args={[0.55, 0.012, 8, 64]} />
        <meshBasicMaterial color={PALETTE.purple} transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0.4, 0]} position={[0, -0.72, 0]}>
        <torusGeometry args={[0.62, 0.008, 8, 64]} />
        <meshBasicMaterial color={PALETTE.red} transparent opacity={0.22} depthWrite={false} />
      </mesh>
    </group>
  );
}
