"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";

export function ReflectivePedestal({ animate }: { animate: boolean }) {
  const rings = useRef<THREE.Mesh[]>([]);

  useFrame((_, dt) => {
    if (!animate) return;
    rings.current.forEach((ring, i) => {
      ring.rotation.z += dt * (0.04 + i * 0.02);
    });
  });

  const platformMat = {
    color: PALETTE.metal,
    metalness: 0.88,
    roughness: 0.16,
    transparent: true,
    opacity: 0.94,
    emissive: PALETTE.purpleDeep,
    emissiveIntensity: 0.08,
  };

  return (
    <group position={[0, -0.95, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <cylinderGeometry args={[1.85, 2.05, 0.1, 64]} />
        <meshPhysicalMaterial {...platformMat} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <cylinderGeometry args={[1.22, 1.38, 0.06, 64]} />
        <meshPhysicalMaterial {...platformMat} emissiveIntensity={0.12} />
      </mesh>

      <mesh
        ref={(el) => {
          if (el) rings.current[0] = el;
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.11, 0]}
      >
        <torusGeometry args={[1.05, 0.016, 8, 64]} />
        <meshBasicMaterial color={PALETTE.purple} transparent opacity={0.45} depthWrite={false} />
      </mesh>

      <mesh
        ref={(el) => {
          if (el) rings.current[1] = el;
        }}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.115, 0]}
      >
        <torusGeometry args={[0.72, 0.012, 8, 64]} />
        <meshBasicMaterial color={PALETTE.red} transparent opacity={0.32} depthWrite={false} />
      </mesh>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.12, 0]}>
        <circleGeometry args={[1.9, 64]} />
        <meshPhysicalMaterial
          color={PALETTE.deep}
          metalness={0.95}
          roughness={0.08}
          transparent
          opacity={0.35}
          emissive={PALETTE.violet}
          emissiveIntensity={0.06}
        />
      </mesh>
    </group>
  );
}
