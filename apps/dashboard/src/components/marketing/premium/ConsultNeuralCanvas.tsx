"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { MeshDistortMaterial, Sphere } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildBrainSynapses } from "./consultBrainNetwork";

const PURPLE = "#a855f7";
const PURPLE_DEEP = "#6d28d9";
const RED = "#ef4444";
const RED_SOFT = "#f87171";
const BRAIN_BASE = "#0a0a10";

const IMPULSE_COUNT = 10;

function SynapseImpulses({ curves }: { curves: THREE.CatmullRomCurve3[] }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const impulses = useRef(
    Array.from({ length: IMPULSE_COUNT }, (_, i) => ({
      t: (i / IMPULSE_COUNT) * 0.85,
      speed: 0.12 + (i % 4) * 0.04,
      curve: i % Math.max(1, curves.length),
      red: i % 2 === 0,
    })),
  );

  useEffect(() => {
    impulses.current.forEach((imp, i) => {
      imp.curve = i % Math.max(1, curves.length);
    });
  }, [curves]);

  useFrame((_, dt) => {
    if (!curves.length) return;
    impulses.current.forEach((imp, i) => {
      imp.t += imp.speed * dt;
      if (imp.t >= 1) {
        imp.t = 0;
        imp.curve = (imp.curve + 3) % curves.length;
      }
      const mesh = refs.current[i];
      const curve = curves[imp.curve];
      if (!mesh || !curve) return;
      mesh.position.copy(curve.getPoint(imp.t));
      const pulse = 0.35 + Math.sin(imp.t * Math.PI) * 0.45;
      mesh.scale.setScalar(0.4 + pulse * 0.45);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(imp.red ? RED : PURPLE);
      mat.opacity = 0.35 + pulse * 0.55;
      mesh.visible = true;
    });
  });

  return (
    <>
      {Array.from({ length: IMPULSE_COUNT }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.045, 6, 6]} />
          <meshBasicMaterial color={PURPLE} transparent opacity={0.8} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

function BrainHemisphere({ side, mobile }: { side: "left" | "right"; mobile: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const x = side === "left" ? -0.43 : 0.43;
  const segments = mobile ? 32 : 48;

  useFrame((state) => {
    const mat = meshRef.current?.material as THREE.MeshPhysicalMaterial | undefined;
    if (!mat) return;
    const wave = Math.sin(state.clock.elapsedTime * 0.9 + (side === "left" ? 0 : 1.2));
    mat.emissiveIntensity = 0.32 + wave * 0.18;
  });

  return (
    <group position={[x, 0.04, 0]} scale={[1, 1.12, 0.88]}>
      <Sphere ref={meshRef} args={[1.04, segments, segments]}>
        <MeshDistortMaterial
          color={BRAIN_BASE}
          emissive={PURPLE_DEEP}
          emissiveIntensity={0.42}
          metalness={0.55}
          roughness={0.42}
          distort={mobile ? 0.22 : 0.3}
          speed={1.2}
          transparent
          opacity={0.96}
        />
      </Sphere>
      <Sphere args={[1.06, segments, segments]} scale={1.015}>
        <meshBasicMaterial color={PURPLE} wireframe transparent opacity={0.07} depthWrite={false} />
      </Sphere>
    </group>
  );
}

function NeuralBrain({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const parallax = useRef({ x: 0, y: 0 });
  const { nodes, curves } = useMemo(() => buildBrainSynapses(mobile), [mobile]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      parallax.current.x = (e.clientX / window.innerWidth - 0.5) * 0.08;
      parallax.current.y = (e.clientY / window.innerHeight - 0.5) * 0.05;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, dt) => {
    const group = root.current;
    if (!group) return;
    group.rotation.y += dt * 0.055 + parallax.current.x * dt * 0.2;
    group.rotation.x = THREE.MathUtils.lerp(
      group.rotation.x,
      -0.1 + parallax.current.y * 0.15,
      0.04,
    );
  });

  return (
    <group ref={root} position={[2.35, -0.02, 0]} scale={mobile ? 0.9 : 1.05}>
      <Sphere args={[1.65, 32, 32]}>
        <meshBasicMaterial color={PURPLE_DEEP} transparent opacity={0.04} depthWrite={false} />
      </Sphere>
      <Sphere args={[1.75, 32, 32]}>
        <meshBasicMaterial color={RED} transparent opacity={0.02} depthWrite={false} />
      </Sphere>

      <BrainHemisphere side="left" mobile={mobile} />
      <BrainHemisphere side="right" mobile={mobile} />

      <mesh position={[0, 0.1, 0.04]} scale={[0.5, 0.2, 0.32]}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshPhysicalMaterial
          color="#12121a"
          emissive={PURPLE_DEEP}
          emissiveIntensity={0.35}
          metalness={0.45}
          roughness={0.5}
          transparent
          opacity={0.9}
        />
      </mesh>

      {nodes.map((node, i) => (
        <mesh key={`n-${i}`} position={node}>
          <sphereGeometry args={[0.038, 6, 6]} />
          <meshBasicMaterial
            color={i % 3 === 0 ? RED_SOFT : PURPLE}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      ))}

      {curves.map((curve, i) => (
        <mesh key={`c-${i}`} frustumCulled={false}>
          <tubeGeometry args={[curve, 8, 0.01, 4, false]} />
          <meshBasicMaterial
            color={i % 2 === 0 ? PURPLE : RED}
            transparent
            opacity={0.28}
            depthWrite={false}
          />
        </mesh>
      ))}

      <SynapseImpulses curves={curves} />
    </group>
  );
}

export function ConsultNeuralCanvas() {
  const mobile =
    typeof window !== "undefined" &&
    (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches);

  return (
    <Canvas
      camera={{ position: [3.8, 0.2, 7.4], fov: 38, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "high-performance" }}
      dpr={mobile ? [1, 1.25] : [1, 1.5]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <ambientLight intensity={0.35} />
      <pointLight position={[4, 5, 6]} intensity={1.4} color={PURPLE} />
      <pointLight position={[-3, -1, 5]} intensity={0.7} color={RED} />
      <pointLight position={[0, -3, 4]} intensity={0.35} color="#ffffff" />
      <NeuralBrain mobile={mobile} />
    </Canvas>
  );
}
