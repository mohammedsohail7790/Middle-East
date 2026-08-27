"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";
import { FLOATING_SPECS, type FloatingSpec } from "./paths";

function Module({ spec, index, animate }: { spec: FloatingSpec; index: number; animate: boolean }) {
  const ref = useRef<THREE.Group>(null);

  useFrame((state, dt) => {
    const g = ref.current;
    if (!g) return;
    const t = state.clock.elapsedTime;
    if (animate) {
      g.position.y = spec.position[1] + Math.sin(t * 0.35 + index) * 0.04;
      g.rotation.y += dt * (0.08 + index * 0.02);
      g.rotation.x = Math.sin(t * 0.25 + index) * 0.12;
    }
  });

  const color = spec.redAccent ? PALETTE.red : PALETTE.electric;

  if (spec.kind === "panel") {
    return (
      <group ref={ref} position={spec.position} scale={spec.scale}>
        <mesh>
          <planeGeometry args={[1.6, 1]} />
          <meshPhysicalMaterial
            color={PALETTE.metal}
            metalness={0.4}
            roughness={0.2}
            transmission={0.65}
            transparent
            opacity={0.35}
            emissive={PALETTE.purple}
            emissiveIntensity={0.08}
            side={THREE.DoubleSide}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, 0, 0.01]}>
          <planeGeometry args={[1.4, 0.06]} />
          <meshBasicMaterial color={PALETTE.light} transparent opacity={0.2} depthWrite={false} />
        </mesh>
      </group>
    );
  }

  if (spec.kind === "node") {
    return (
      <group ref={ref} position={spec.position} scale={spec.scale}>
        <mesh>
          <sphereGeometry args={[1, 10, 10]} />
          <meshPhysicalMaterial
            color={PALETTE.deep}
            metalness={0.5}
            roughness={0.25}
            emissive={color}
            emissiveIntensity={spec.redAccent ? 0.7 : 0.45}
            transparent
            opacity={0.88}
          />
        </mesh>
      </group>
    );
  }

  return (
    <group ref={ref} position={spec.position} scale={spec.scale}>
      <mesh rotation={[0.4, 0.6, 0.2]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.55}
          roughness={0.2}
          transmission={0.55}
          transparent
          opacity={0.5}
          emissive={PALETTE.purple}
          emissiveIntensity={0.1}
        />
      </mesh>
    </group>
  );
}

export function FloatingModules({ mobile, animate }: { mobile: boolean; animate: boolean }) {
  const specs = useMemo(() => (mobile ? FLOATING_SPECS.slice(0, 5) : FLOATING_SPECS), [mobile]);

  return (
    <group>
      {specs.map((spec, i) => (
        <Module key={i} spec={spec} index={i} animate={animate} />
      ))}
    </group>
  );
}
