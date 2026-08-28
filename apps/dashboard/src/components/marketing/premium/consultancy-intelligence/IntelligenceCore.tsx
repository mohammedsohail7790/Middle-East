"use client";

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

/** Deforms a subdivided icosahedron into a brain-like silhouette: a central
 * groove splitting left/right hemispheres plus layered sine "folds" (gyri/sulci). */
function useBrainGeometry(detail: number) {
  return useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1, detail);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const ny = v.clone().normalize().y;
      const groove = Math.exp(-(v.x * v.x) / (2 * 0.045)) * 0.18;
      const fold =
        (Math.sin(v.x * 3.4 + v.y * 2.1) * 0.5 +
          Math.sin(v.y * 2.6 - v.z * 3.3) * 0.32 +
          Math.sin(v.z * 4.2 + v.x * 2.8) * 0.24 +
          Math.sin((v.x + v.y + v.z) * 5.6) * 0.14) *
        0.075;
      const frontalLift = ny > 0 ? 0.05 : -0.03;
      const scale = 1 + fold - groove + frontalLift * Math.abs(ny);
      v.multiplyScalar(scale);
      pos.setXYZ(i, v.x, v.y * 0.9, v.z * 1.05);
    }
    geo.computeVertexNormals();
    return geo;
  }, [detail]);
}

export function IntelligenceCore({ mobile }: { mobile: boolean }) {
  const shell = useRef<THREE.Mesh>(null);
  const wireframe = useRef<THREE.Mesh>(null);
  const inner = useRef<THREE.Mesh>(null);
  const particleCount = mobile ? 18 : 32;
  const brainGeo = useBrainGeometry(mobile ? 3 : 4);

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
    if (wireframe.current) {
      wireframe.current.rotation.y = shell.current?.rotation.y ?? 0;
      wireframe.current.rotation.x = shell.current?.rotation.x ?? 0;
    }
  });

  return (
    <group scale={0.62}>
      <mesh ref={shell} geometry={brainGeo}>
        <meshPhysicalMaterial
          color={PALETTE.metal}
          metalness={0.32}
          roughness={0.12}
          transmission={0.88}
          thickness={1.15}
          ior={1.45}
          specularIntensity={1}
          transparent
          opacity={0.93}
          emissive={PALETTE.purple}
          emissiveIntensity={0.2}
          clearcoat={0.7}
          clearcoatRoughness={0.2}
          envMapIntensity={0.8}
        />
      </mesh>

      <mesh ref={wireframe} geometry={brainGeo} scale={1.012}>
        <meshBasicMaterial color={PALETTE.electric} wireframe transparent opacity={0.15} depthWrite={false} />
      </mesh>

      <mesh ref={inner} scale={0.3}>
        <icosahedronGeometry args={[1, 1]} />
        <meshPhysicalMaterial
          color={PALETTE.deep}
          metalness={0.65}
          roughness={0.22}
          emissive={PALETTE.electric}
          emissiveIntensity={0.6}
        />
      </mesh>

      <mesh scale={0.2}>
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
