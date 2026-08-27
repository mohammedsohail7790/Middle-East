"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildBrainSynapses } from "./consultBrainNetwork";

const IMPULSE_COUNT = 14;

function SynapseImpulses({ curves }: { curves: THREE.CatmullRomCurve3[] }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const impulses = useRef(
    Array.from({ length: IMPULSE_COUNT }, () => ({
      t: Math.random(),
      speed: 0.18 + Math.random() * 0.28,
      curve: 0,
    })),
  );

  useEffect(() => {
    impulses.current.forEach((imp) => {
      imp.curve = Math.floor(Math.random() * Math.max(1, curves.length));
    });
  }, [curves]);

  useFrame((_, dt) => {
    if (!curves.length) return;
    impulses.current.forEach((imp, i) => {
      imp.t += imp.speed * dt;
      if (imp.t >= 1) {
        imp.t = 0;
        imp.curve = Math.floor(Math.random() * curves.length);
      }
      const mesh = refs.current[i];
      const curve = curves[imp.curve];
      if (!mesh || !curve) return;
      mesh.position.copy(curve.getPoint(imp.t));
      const pulse = 0.45 + Math.sin(imp.t * Math.PI) * 0.5;
      mesh.scale.setScalar(0.55 + pulse * 0.65);
      (mesh.material as THREE.MeshBasicMaterial).opacity = pulse;
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
          <sphereGeometry args={[0.06, 8, 8]} />
          <meshBasicMaterial color="#a7f3d0" transparent opacity={0.95} />
        </mesh>
      ))}
    </>
  );
}

function BrainHemisphere({ side, mobile }: { side: "left" | "right"; mobile: boolean }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const x = side === "left" ? -0.44 : 0.44;
  const segments = mobile ? 36 : 56;

  useFrame((state) => {
    const mat = meshRef.current?.material as THREE.MeshPhysicalMaterial | undefined;
    if (mat) {
      mat.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 1.4) * 0.4;
    }
  });

  return (
    <group position={[x, 0.06, 0]} scale={[1.02, 1.14, 0.9]}>
      <Sphere ref={meshRef} args={[1.05, segments, segments]}>
        <MeshDistortMaterial
          color="#0a5c54"
          emissive="#2dd4bf"
          emissiveIntensity={0.7}
          metalness={0.35}
          roughness={0.28}
          distort={mobile ? 0.32 : 0.42}
          speed={1.8}
          transparent
          opacity={0.94}
        />
      </Sphere>
      <Sphere args={[1.08, segments, segments]} scale={1.02}>
        <meshBasicMaterial color="#5eead4" wireframe transparent opacity={0.1} />
      </Sphere>
    </group>
  );
}

function IntelligenceBrain({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const rings = useRef<THREE.Group>(null);
  const parallax = useRef({ x: 0, y: 0 });
  const { nodes, curves } = useMemo(() => buildBrainSynapses(), []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      parallax.current.x = (e.clientX / window.innerWidth - 0.5) * 0.35;
      parallax.current.y = (e.clientY / window.innerHeight - 0.5) * 0.22;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, dt) => {
    const group = root.current;
    if (group) {
      group.rotation.y += dt * 0.14 + parallax.current.x * dt * 1.6;
      group.rotation.x = -0.12 + parallax.current.y;
      group.rotation.z = Math.sin(state.clock.elapsedTime * 0.2) * 0.04;
    }
    const ringGroup = rings.current;
    if (ringGroup) {
      ringGroup.rotation.z += dt * 0.08;
      ringGroup.rotation.x = Math.sin(state.clock.elapsedTime * 0.35) * 0.12;
    }
  });

  return (
    <Float speed={1.2} rotationIntensity={0.15} floatIntensity={0.35}>
      <group ref={root} position={[2.4, -0.05, 0]} scale={mobile ? 0.92 : 1.08}>
        {/* outer intelligence glow */}
        <Sphere args={[1.55, 32, 32]}>
          <meshBasicMaterial color="#2dd4bf" transparent opacity={0.06} depthWrite={false} />
        </Sphere>

        <BrainHemisphere side="left" mobile={mobile} />
        <BrainHemisphere side="right" mobile={mobile} />

        {/* corpus callosum bridge */}
        <mesh position={[0, 0.12, 0.05]} scale={[0.55, 0.22, 0.35]}>
          <sphereGeometry args={[1, 20, 20]} />
          <meshPhysicalMaterial
            color="#0d9488"
            emissive="#5eead4"
            emissiveIntensity={0.7}
            metalness={0.2}
            roughness={0.35}
            transparent
            opacity={0.88}
          />
        </mesh>

        {/* synapse nodes on cortex */}
        {nodes.map((node, i) => (
          <mesh key={i} position={node}>
            <sphereGeometry args={[0.045, 8, 8]} />
            <meshBasicMaterial color="#5eead4" transparent opacity={0.75} />
          </mesh>
        ))}

        {/* neural pathways */}
        {curves.map((curve, i) => (
          <mesh key={`path-${i}`} frustumCulled={false}>
            <tubeGeometry args={[curve, 10, 0.012, 5, false]} />
            <meshBasicMaterial color="#2dd4bf" transparent opacity={0.45} />
          </mesh>
        ))}

        <SynapseImpulses curves={curves} />

        {/* AI orbit rings */}
        <group ref={rings}>
          <mesh rotation={[Math.PI / 2.1, 0.2, 0]}>
            <torusGeometry args={[1.75, 0.008, 8, 96]} />
            <meshBasicMaterial color="#5eead4" transparent opacity={0.35} />
          </mesh>
          <mesh rotation={[Math.PI / 2.5, -0.35, 0.5]}>
            <torusGeometry args={[2.05, 0.006, 8, 96]} />
            <meshBasicMaterial color="#0d9488" transparent opacity={0.22} />
          </mesh>
        </group>
      </group>
    </Float>
  );
}

export function ConsultNeuralCanvas() {
  const mobile =
    typeof window !== "undefined" &&
    (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches);

  return (
    <Canvas
      camera={{ position: [4.2, 0.35, 8.5], fov: 42, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "high-performance" }}
      dpr={mobile ? [1, 1.35] : [1, 1.75]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <ambientLight intensity={0.45} />
      <pointLight position={[5, 6, 8]} intensity={2.2} color="#2dd4bf" />
      <pointLight position={[-4, -2, 5]} intensity={1.1} color="#0d9488" />
      <pointLight position={[0, -4, 6]} intensity={0.5} color="#5eead4" />
      <IntelligenceBrain mobile={mobile} />
    </Canvas>
  );
}
