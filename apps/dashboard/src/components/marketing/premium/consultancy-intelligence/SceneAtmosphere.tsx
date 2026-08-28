"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";

export function SceneAtmosphere({ count, animate }: { count: number; animate: boolean }) {
  const ref = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const leftBias = i % 3 === 0 ? -1.8 : 0;
      arr[i * 3] = leftBias + (Math.random() - 0.5) * 7;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 4.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 4 - 1;
    }
    return arr;
  }, [count]);

  useFrame((state) => {
    if (!ref.current || !animate) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.015;
  });

  return (
    <points ref={ref} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color={PALETTE.light}
        size={0.028}
        transparent
        opacity={0.35}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

export function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.38} color={PALETTE.deep} />
      <directionalLight position={[4, 5, 6]} intensity={0.85} color={PALETTE.white} />
      <pointLight position={[1.8, 1.2, 4]} intensity={1.65} color={PALETTE.electric} distance={16} decay={2} />
      <pointLight position={[-2.2, -0.4, 3]} intensity={0.85} color={PALETTE.red} distance={12} decay={2} />
      <pointLight position={[0, -1.8, 2]} intensity={0.55} color={PALETTE.violet} distance={10} decay={2} />
    </>
  );
}
