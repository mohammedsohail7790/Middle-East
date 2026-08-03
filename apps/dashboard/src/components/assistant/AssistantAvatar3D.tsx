"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";

export type AssistantMood = "idle" | "thinking" | "speaking";

function AvatarOrb({ mood }: { mood: AssistantMood }) {
  const speed = mood === "thinking" ? 4.2 : mood === "speaking" ? 2.8 : 1.4;
  const distort = mood === "thinking" ? 0.5 : mood === "speaking" ? 0.35 : 0.22;
  const scale = mood === "speaking" ? 1.06 : 1;

  return (
    <Float speed={1.8} rotationIntensity={0.25} floatIntensity={0.55}>
      <Sphere args={[0.82, 40, 40]} scale={scale}>
        <MeshDistortMaterial
          color="#0ea5e9"
          emissive="#0369a1"
          emissiveIntensity={0.35}
          roughness={0.15}
          metalness={0.25}
          distort={distort}
          speed={speed}
        />
      </Sphere>
    </Float>
  );
}

export function AssistantAvatar3D({
  mood = "idle",
  className,
}: {
  mood?: AssistantMood;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 2.6], fov: 42 }}
        gl={{ alpha: true, antialias: true }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[3, 4, 2]} intensity={1.1} />
        <pointLight position={[-2, -1, 2]} intensity={0.4} color="#38bdf8" />
        <AvatarOrb mood={mood} />
      </Canvas>
    </div>
  );
}
