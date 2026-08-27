"use client";

import { RoundedBox } from "@react-three/drei";
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

export function IntelligenceCore({ mobile }: { mobile: boolean }) {
  const shell = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const particleCount = mobile ? 18 : 32;

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (inner.current) {
      const mat = inner.current.material as THREE.MeshPhysicalMaterial;
      mat.emissiveIntensity = 0.55 + Math.sin(t * 0.8) * 0.12;
    }
    if (shell.current) {
      shell.current.rotation.y = t * 0.08;
      shell.current.rotation.x = Math.sin(t * 0.15) * 0.06;
    }
  });

  return (
    <group>
      <RoundedBox ref={shell} args={[0.92, 0.92, 0.92]} radius={0.14} smoothness={4}>
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.55}
          roughness={0.18}
          transmission={0.82}
          thickness={0.75}
          ior={1.48}
          transparent
          opacity={0.94}
          emissive={PALETTE.purple}
          emissiveIntensity={0.12}
          envMapIntensity={0.8}
        />
      </RoundedBox>

      <mesh ref={inner} scale={0.42}>
        <icosahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial
          color={PALETTE.deep}
          metalness={0.65}
          roughness={0.22}
          emissive={PALETTE.electric}
          emissiveIntensity={0.6}
        />
      </mesh>

      <mesh scale={0.28}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshPhysicalMaterial
          color={PALETTE.purpleDeep}
          emissive={PALETTE.violet}
          emissiveIntensity={0.85}
          metalness={0.35}
          roughness={0.28}
          transparent
          opacity={0.88}
        />
      </mesh>

      <InnerParticles count={particleCount} />

      <mesh scale={1.02}>
        <boxGeometry args={[0.94, 0.94, 0.94]} />
        <meshBasicMaterial color={PALETTE.electric} wireframe transparent opacity={0.06} depthWrite={false} />
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
