"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";

function Orb() {
  return (
    <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.35}>
      <Sphere args={[0.42, 28, 28]}>
        <MeshDistortMaterial
          color="#0d9488"
          emissive="#2dd4bf"
          emissiveIntensity={0.3}
          distort={0.22}
          speed={1.8}
          roughness={0.2}
          metalness={0.25}
        />
      </Sphere>
    </Float>
  );
}

export function DashboardHeaderOrb() {
  return (
    <Canvas
      camera={{ position: [0, 0, 2], fov: 44 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 1.25]}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[2, 2, 2]} intensity={0.9} />
      <Orb />
    </Canvas>
  );
}
