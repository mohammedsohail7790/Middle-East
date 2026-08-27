"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildConsultNeuron } from "./consultNeuronGeometry";

const IMPULSE_COUNT = 30;

function ImpulseLayer({ curves }: { curves: THREE.CatmullRomCurve3[] }) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const impulses = useRef(
    Array.from({ length: IMPULSE_COUNT }, () => ({
      t: Math.random(),
      speed: 0.12 + Math.random() * 0.26,
      curve: Math.floor(Math.random() * Math.max(1, curves.length)),
    })),
  );

  useFrame((_, dt) => {
    if (!curves.length) return;
    impulses.current.forEach((imp, i) => {
      imp.t += imp.speed * dt;
      if (imp.t >= 1) {
        imp.t = 0;
        imp.curve = Math.floor(Math.random() * curves.length);
      }
      const mesh = meshRefs.current[i];
      const curve = curves[imp.curve];
      if (!mesh || !curve) return;
      mesh.position.copy(curve.getPoint(imp.t));
      const pulse = 0.4 + Math.sin(imp.t * Math.PI) * 0.55;
      mesh.scale.setScalar(0.7 + pulse * 0.8);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = pulse;
      mesh.visible = true;
    });
  });

  return (
    <>
      {Array.from({ length: IMPULSE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshRefs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.1, 10, 10]} />
          <meshBasicMaterial color="#5eead4" transparent opacity={0.9} />
        </mesh>
      ))}
    </>
  );
}

function NeuronTree({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const parallax = useRef({ x: 0, y: 0 });
  const { curves, somaPos, somaRadius } = useMemo(() => buildConsultNeuron(mobile), [mobile]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      parallax.current.x = (e.clientX / window.innerWidth - 0.5) * 0.45;
      parallax.current.y = (e.clientY / window.innerHeight - 0.5) * 0.28;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, dt) => {
    const group = root.current;
    if (!group) return;
    group.rotation.y += dt * 0.06 + parallax.current.x * dt * 2;
    group.rotation.x = -0.1 + parallax.current.y;
    group.rotation.z = 0.04 + Math.sin(state.clock.elapsedTime * 0.15) * 0.03;
  });

  return (
    <group ref={root} position={[1.2, 0, 0]} scale={mobile ? 1.05 : 1.22}>
      <mesh position={somaPos}>
        <sphereGeometry args={[somaRadius, 32, 32]} />
        <meshPhysicalMaterial
          color="#0d9488"
          emissive="#2dd4bf"
          emissiveIntensity={1.15}
          metalness={0.25}
          roughness={0.22}
          transparent
          opacity={0.96}
        />
      </mesh>
      <mesh position={somaPos}>
        <sphereGeometry args={[somaRadius * 1.7, 24, 24]} />
        <meshBasicMaterial color="#2dd4bf" transparent opacity={0.14} depthWrite={false} />
      </mesh>
      {curves.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 18, 0.045, 8, false]} />
          <meshBasicMaterial color="#2dd4bf" transparent opacity={0.68} />
        </mesh>
      ))}
      <ImpulseLayer curves={curves} />
    </group>
  );
}

export function ConsultNeuralCanvas() {
  const mobile =
    typeof window !== "undefined" &&
    (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches);

  return (
    <Canvas
      camera={{ position: [2.5, 0.2, 15], fov: 48, near: 0.1, far: 200 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "high-performance" }}
      dpr={mobile ? [1, 1.5] : [1, 2]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <ambientLight intensity={0.65} />
      <pointLight position={[6, 8, 12]} intensity={1.8} color="#2dd4bf" />
      <pointLight position={[-8, -4, 6]} intensity={1.0} color="#0d9488" />
      <pointLight position={[0, -6, 8]} intensity={0.45} color="#5eead4" />
      <NeuronTree mobile={mobile} />
    </Canvas>
  );
}
