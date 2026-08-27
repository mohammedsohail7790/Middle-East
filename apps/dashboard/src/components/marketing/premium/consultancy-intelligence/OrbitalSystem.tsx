"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";
import { RING_SPECS } from "./paths";

function OrbitRing({
  radius,
  tube,
  tilt,
  speed,
  redSegment,
  animate,
}: {
  radius: number;
  tube: number;
  tilt: [number, number, number];
  speed: number;
  redSegment?: boolean;
  animate: boolean;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame((_, dt) => {
    if (!ref.current || !animate) return;
    ref.current.rotation.z += dt * speed;
  });

  return (
    <group rotation={tilt}>
      <mesh ref={ref}>
        <torusGeometry args={[radius, tube, 12, 96]} />
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.72}
          roughness={0.28}
          emissive={redSegment ? PALETTE.red : PALETTE.purple}
          emissiveIntensity={redSegment ? 0.35 : 0.28}
          transparent
          opacity={0.82}
        />
      </mesh>
    </group>
  );
}

export function OrbitalSystem({ mobile, animate }: { mobile: boolean; animate: boolean }) {
  const specs = mobile ? RING_SPECS.slice(0, 3) : RING_SPECS;

  return (
    <group>
      {specs.map((ring, i) => (
        <OrbitRing key={i} {...ring} animate={animate} />
      ))}
    </group>
  );
}
