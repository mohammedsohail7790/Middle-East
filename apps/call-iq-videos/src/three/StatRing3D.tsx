// @ts-nocheck
import { ThreeCanvas } from "@remotion/three";
import { interpolate, useVideoConfig } from "remotion";
import { brand } from "../brand";
import { easeOutExpo } from "../lib/motion";
import { EnterpriseLighting } from "./EnterpriseLighting";
import { OrbitalRings } from "./OrbitalRings";
import { ParticleField } from "./ParticleField";

type StatRing3DProps = {
  frame: number;
  value?: number;
};

export const StatRing3D: React.FC<StatRing3DProps> = ({
  frame,
  value = 62,
}) => {
  const { width, height } = useVideoConfig();
  const rot = frame * 0.01;
  const scale = interpolate(frame, [0, 35], [0.7, 1], {
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });
  const fillAngle = interpolate(frame, [15, 70], [0, (value / 100) * Math.PI * 2], {
    extrapolateRight: "clamp",
    easing: easeOutExpo,
  });

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: 45, position: [0, 0, 6] }}
    >
      <color attach="background" args={["#050508"]} />
      <EnterpriseLighting />
      <ParticleField frame={frame} count={60} spread={8} />

      <group scale={scale} rotation={[0.3, rot, 0]}>
        <OrbitalRings frame={frame} intensity={0.8} />
        {/* Base ring */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2, 0.08, 16, 64]} />
          <meshStandardMaterial color="#1f2937" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Progress arc segments */}
        {Array.from({ length: 32 }).map((_, i) => {
          const segAngle = (i / 32) * Math.PI * 2;
          if (segAngle > fillAngle) return null;
          const x = Math.cos(segAngle) * 2;
          const z = Math.sin(segAngle) * 2;
          return (
            <mesh key={i} position={[x, 0, z]}>
              <sphereGeometry args={[0.06, 8, 8]} />
              <meshStandardMaterial
                color={brand.colors.cyan}
                emissive={brand.colors.cyan}
                emissiveIntensity={0.7}
              />
            </mesh>
          );
        })}
        {/* Inner glow sphere */}
        <mesh>
          <sphereGeometry args={[0.5, 32, 32]} />
          <meshPhysicalMaterial
            color={brand.colors.cyan}
            emissive={brand.colors.cyan}
            emissiveIntensity={0.5}
            transparent
            opacity={0.25}
            transmission={0.6}
          />
        </mesh>
      </group>
    </ThreeCanvas>
  );
};
