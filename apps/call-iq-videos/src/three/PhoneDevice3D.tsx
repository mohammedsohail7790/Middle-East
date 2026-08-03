// @ts-nocheck
import { ThreeCanvas } from "@remotion/three";
import { interpolate, useVideoConfig } from "remotion";
import { brand } from "../brand";
import { easeOutExpo } from "../lib/motion";
import { EnterpriseLighting } from "./EnterpriseLighting";
import { ParticleField } from "./ParticleField";

type PhoneDevice3DProps = {
  frame: number;
  enterDelay?: number;
};

export const PhoneDevice3D: React.FC<PhoneDevice3DProps> = ({
  frame,
  enterDelay = 0,
}) => {
  const { width, height } = useVideoConfig();
  const local = Math.max(0, frame - enterDelay);
  const rotY = local * 0.018;
  const floatY = Math.sin(local * 0.04) * 0.08;
  const scale = interpolate(local, [0, 30], [0.6, 1], {
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });
  const tiltX = interpolate(local, [0, 40], [0.4, 0.15], {
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: 42, position: [0, 0.5, 5.5] }}
    >
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 4, 16]} />
      <EnterpriseLighting />
      <ParticleField frame={frame} count={80} spread={10} />

      <group
        scale={scale}
        position={[0, floatY, 0]}
        rotation={[tiltX, rotY, 0]}
      >
        {/* Phone body */}
        <mesh castShadow receiveShadow>
          <boxGeometry args={[1.05, 2.1, 0.12]} />
          <meshPhysicalMaterial
            color="#1a1a1f"
            metalness={0.85}
            roughness={0.25}
            clearcoat={1}
            clearcoatRoughness={0.1}
          />
        </mesh>
        {/* Screen bezel glow */}
        <mesh position={[0, 0, 0.065]}>
          <boxGeometry args={[0.92, 1.88, 0.01]} />
          <meshStandardMaterial
            color="#0a1628"
            emissive={brand.colors.cyan}
            emissiveIntensity={0.15}
          />
        </mesh>
        {/* Screen */}
        <mesh position={[0, 0, 0.072]}>
          <boxGeometry args={[0.88, 1.82, 0.008]} />
          <meshStandardMaterial
            color="#0ea5e9"
            emissive={brand.colors.cyan}
            emissiveIntensity={0.35}
            transparent
            opacity={0.9}
          />
        </mesh>
        {/* Side accent strip */}
        <mesh position={[0.52, 0.3, 0]}>
          <boxGeometry args={[0.02, 0.35, 0.06]} />
          <meshStandardMaterial
            color={brand.colors.cyan}
            emissive={brand.colors.cyan}
            emissiveIntensity={0.8}
          />
        </mesh>
        {/* Floating UI cards */}
        {[0, 1, 2].map((i) => {
          const cardY = 0.6 - i * 0.55 + Math.sin(local * 0.05 + i) * 0.03;
          const cardX = 1.4 + i * 0.15;
          return (
            <mesh key={i} position={[cardX, cardY, 0.2]} rotation={[0, -0.35, 0]}>
              <boxGeometry args={[0.9, 0.35, 0.02]} />
              <meshPhysicalMaterial
                color="#111827"
                metalness={0.3}
                roughness={0.4}
                transparent
                opacity={0.92}
                transmission={0.2}
              />
            </mesh>
          );
        })}
      </group>
    </ThreeCanvas>
  );
};
