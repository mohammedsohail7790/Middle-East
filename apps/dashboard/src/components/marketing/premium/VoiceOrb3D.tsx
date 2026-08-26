"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";

function Orb() {
  return (
    <Float speed={2.2} rotationIntensity={0.3} floatIntensity={0.45}>
      <Sphere args={[0.55, 32, 32]}>
        <MeshDistortMaterial
          color="#0d9488"
          emissive="#2dd4bf"
          emissiveIntensity={0.45}
          distort={0.35}
          speed={2.8}
          roughness={0.12}
          metalness={0.35}
        />
      </Sphere>
    </Float>
  );
}

export function VoiceOrb3D({ className }: { className?: string }) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 2.2], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        dpr={[1, 1.5]}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[2, 3, 2]} intensity={1} />
        <pointLight position={[-1, -1, 2]} intensity={0.35} color="#2dd4bf" />
        <Orb />
      </Canvas>
    </div>
  );
}
