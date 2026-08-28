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
        <torusGeometry args={[radius, tube, 16, 128]} />
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.8}
          roughness={0.16}
          clearcoat={0.6}
          emissive={redSegment ? PALETTE.redHot : PALETTE.purple}
          emissiveIntensity={redSegment ? 0.5 : 0.32}
          transparent
          opacity={0.86}
        />
      </mesh>
      {/* soft additive glow halo — cheap stand-in for bloom */}
      <mesh scale={1}>
        <torusGeometry args={[radius, tube * 2.6, 8, 96]} />
        <meshBasicMaterial
          color={redSegment ? PALETTE.redHot : PALETTE.electric}
          transparent
          opacity={0.1}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
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
