"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, Html } from "@react-three/drei";
import * as THREE from "three";

const GOLD = "#C7A25A";
const BRONZE = "#8C6F3E";
const INK = "#121212";

type SystemDef = {
  id: string;
  label: string;
  position: [number, number, number];
};

/**
 * The eight conceptual systems from the brief, trimmed to six for the hero —
 * enough to read as "a connected business", not so many it turns into noise
 * at hero scale. (Rule: prefer restraint over decoration.)
 */
const SYSTEMS: SystemDef[] = [
  { id: "operations", label: "Operations", position: [1.9, 1.05, -0.3] },
  { id: "acquisition", label: "Client Acquisition", position: [2.05, -0.55, 0.5] },
  { id: "automation", label: "AI Automation", position: [0.55, 1.7, 0.6] },
  { id: "receptionist", label: "AI Receptionist", position: [0.4, -1.75, -0.2] },
  { id: "integrations", label: "Integrations", position: [-0.75, 0.55, 1.6] },
  { id: "data", label: "Data & Insights", position: [1.15, -0.15, 1.75] },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** The architectural heart of the scene — a translucent faceted crystal, not a glowing orb. */
function HallaCore({ reduced }: { reduced: boolean }) {
  const outerRef = useRef<THREE.Mesh>(null);
  const innerRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (reduced) return;
    if (outerRef.current) outerRef.current.rotation.y += delta * 0.06;
    if (innerRef.current) innerRef.current.rotation.y -= delta * 0.09;
  });

  return (
    <group>
      <mesh ref={outerRef}>
        <octahedronGeometry args={[0.62, 0]} />
        <meshPhysicalMaterial
          color={INK}
          transparent
          opacity={0.16}
          roughness={0.15}
          metalness={0.1}
          transmission={0.6}
          thickness={0.8}
        />
      </mesh>
      <mesh>
        <octahedronGeometry args={[0.62, 0]} />
        <meshBasicMaterial color={GOLD} wireframe transparent opacity={0.55} />
      </mesh>
      <mesh ref={innerRef} scale={0.34}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color={GOLD} emissive={BRONZE} emissiveIntensity={0.35} roughness={0.3} metalness={0.4} />
      </mesh>
    </group>
  );
}

/** A single labeled system node — physical depth, gold edge, minimal HTML label. */
function SystemNode({ def, active, onHover }: { def: SystemDef; active: boolean; onHover: (id: string | null) => void }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    const t = state.clock.elapsedTime;
    const lift = hovered ? 0.08 : 0;
    meshRef.current.position.y = def.position[1] + Math.sin(t * 0.6 + def.position[0]) * 0.04 + lift;
  });

  return (
    <group position={[def.position[0], 0, def.position[2]]}>
      <mesh
        ref={meshRef}
        position={[0, def.position[1], 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHover(def.id);
        }}
        onPointerOut={() => {
          setHovered(false);
          onHover(null);
        }}
      >
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshPhysicalMaterial
          color={INK}
          transparent
          opacity={hovered ? 0.35 : 0.2}
          roughness={0.25}
          metalness={0.15}
          transmission={0.4}
        />
      </mesh>
      <mesh position={[0, def.position[1], 0]} scale={1.001}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
        <meshBasicMaterial color={GOLD} wireframe transparent opacity={hovered || active ? 0.95 : 0.45} />
      </mesh>
      <Html position={[0, def.position[1] - 0.22, 0]} center distanceFactor={7} occlude>
        <span
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            color: hovered ? GOLD : "rgba(18,18,18,0.55)",
            whiteSpace: "nowrap",
            transition: "color 0.2s ease",
            fontFamily: "var(--font, sans-serif)",
          }}
        >
          {def.label}
        </span>
      </Html>
    </group>
  );
}

/** Thin gold connection from the core to a node, with a small particle traveling along it. */
function Connection({ def, active, reduced }: { def: SystemDef; active: boolean; reduced: boolean }) {
  const particleRef = useRef<THREE.Mesh>(null);
  const points = useMemo(
    () => [new THREE.Vector3(0, 0, 0), new THREE.Vector3(...def.position)],
    [def.position],
  );
  const curve = useMemo(() => new THREE.LineCurve3(points[0], points[1]), [points]);

  useFrame((state) => {
    if (reduced || !particleRef.current) return;
    const speed = 0.18;
    const t = (state.clock.elapsedTime * speed + def.position[0]) % 1;
    const p = curve.getPoint(t);
    particleRef.current.position.copy(p);
    particleRef.current.visible = active;
  });

  return (
    <group>
      <Line points={points} color={GOLD} transparent opacity={active ? 0.55 : 0.22} lineWidth={1} />
      <mesh ref={particleRef} visible={active}>
        <sphereGeometry args={[0.018, 8, 8]} />
        <meshBasicMaterial color={GOLD} />
      </mesh>
    </group>
  );
}

function Rig({ reduced }: { reduced: boolean }) {
  const { camera, pointer } = useThree();
  const target = useRef(new THREE.Vector2(0, 0));

  useFrame(() => {
    if (reduced) return;
    // Spring-interpolated parallax — never a direct 1:1 cursor mapping.
    target.current.x += (pointer.x - target.current.x) * 0.04;
    target.current.y += (pointer.y - target.current.y) * 0.04;
    camera.position.x = target.current.x * 0.35;
    camera.position.y = 0.2 + target.current.y * 0.2;
    camera.lookAt(0.4, 0, 0);
  });
  return null;
}

function SceneContents({ reduced }: { reduced: boolean }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (reduced || !groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.015;
  });

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[3, 4, 5]} intensity={0.9} color="#FAF8F3" />
      <pointLight position={[-2, -1, 2]} intensity={0.3} color={GOLD} />

      <group ref={groupRef} position={[0.4, 0, 0]}>
        <HallaCore reduced={reduced} />
        {SYSTEMS.map((def) => (
          <Connection key={def.id} def={def} active={hoveredId === def.id || hoveredId === null} reduced={reduced} />
        ))}
        {SYSTEMS.map((def) => (
          <SystemNode key={def.id} def={def} active={hoveredId === def.id} onHover={setHoveredId} />
        ))}
      </group>

      <Rig reduced={reduced} />
    </>
  );
}

export function HallaSystemScene() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <div className="halla-system-scene" aria-hidden style={{ position: "absolute", inset: 0 }}>
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0.2, 5.4], fov: 32 }}
        gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      >
        <SceneContents reduced={reduced} />
      </Canvas>
    </div>
  );
}
