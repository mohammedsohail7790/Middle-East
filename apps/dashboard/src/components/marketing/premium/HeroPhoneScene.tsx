"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, RoundedBox, Sphere, Torus } from "@react-three/drei";

function PhoneModel() {
  return (
    <Float speed={1.6} rotationIntensity={0.35} floatIntensity={0.55}>
      <group rotation={[0.12, -0.42, 0.04]}>
        <RoundedBox args={[1.15, 2.25, 0.14]} radius={0.1} smoothness={6}>
          <meshStandardMaterial color="#151b28" metalness={0.72} roughness={0.22} />
        </RoundedBox>

        <mesh position={[0, 0.08, 0.075]}>
          <planeGeometry args={[0.98, 1.88]} />
          <meshStandardMaterial
            color="#0f172a"
            emissive="#0d9488"
            emissiveIntensity={0.35}
            metalness={0.1}
            roughness={0.4}
          />
        </mesh>

        <Sphere args={[0.14, 24, 24]} position={[0, 0.72, 0.08]}>
          <MeshDistortMaterial
            color="#2dd4bf"
            emissive="#0d9488"
            emissiveIntensity={0.55}
            distort={0.28}
            speed={2.2}
            roughness={0.15}
            metalness={0.2}
          />
        </Sphere>

        <Torus args={[1.55, 0.014, 12, 80]} rotation={[Math.PI / 2.2, 0.15, 0]}>
          <meshStandardMaterial
            color="#2dd4bf"
            emissive="#2dd4bf"
            emissiveIntensity={0.65}
            transparent
            opacity={0.45}
          />
        </Torus>

        <Torus args={[1.75, 0.008, 8, 64]} rotation={[Math.PI / 2.5, -0.2, 0.4]}>
          <meshStandardMaterial
            color="#0d9488"
            emissive="#0d9488"
            emissiveIntensity={0.4}
            transparent
            opacity={0.25}
          />
        </Torus>
      </group>
    </Float>
  );
}

export function HeroPhoneScene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4.4], fov: 36 }}
      gl={{ alpha: true, antialias: true, powerPreference: "high-performance" }}
      dpr={[1, 1.75]}
      style={{ width: "100%", height: "100%" }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 5, 6]} intensity={1.15} />
      <pointLight position={[-3, 2, 4]} intensity={0.55} color="#2dd4bf" />
      <pointLight position={[2, -2, 3]} intensity={0.25} color="#0d9488" />
      <PhoneModel />
    </Canvas>
  );
}
