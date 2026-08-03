// @ts-nocheck
import { ThreeCanvas } from "@remotion/three";
import { interpolate, useVideoConfig } from "remotion";
import { brand } from "../brand";
import { easeOutExpo } from "../lib/motion";
import { EnterpriseLighting } from "./EnterpriseLighting";
import { OrbitalRings } from "./OrbitalRings";

const INTEGRATIONS = [
  "HubSpot",
  "Salesforce",
  "Calendar",
  "Zoho",
  "Twilio",
  "Stripe",
];

type IntegrationOrbit3DProps = {
  frame: number;
};

export const IntegrationOrbit3D: React.FC<IntegrationOrbit3DProps> = ({ frame }) => {
  const { width, height } = useVideoConfig();
  const orbit = frame * 0.012;

  return (
    <ThreeCanvas
      width={width}
      height={height}
      camera={{ fov: 48, position: [0, 1.5, 9] }}
    >
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 5, 20]} />
      <EnterpriseLighting />
      <OrbitalRings frame={frame} intensity={1.2} />

      <group rotation={[0.2, orbit, 0]}>
        {INTEGRATIONS.map((_, i) => {
          const angle = (i / INTEGRATIONS.length) * Math.PI * 2;
          const radius = 3.2;
          const x = Math.cos(angle) * radius;
          const z = Math.sin(angle) * radius;
          const y = Math.sin(frame * 0.03 + i * 1.2) * 0.25;
          const panelScale = interpolate(
            frame,
            [i * 4, i * 4 + 20],
            [0.5, 1],
            { extrapolateRight: "clamp", extrapolateLeft: "clamp", easing: easeOutExpo },
          );

          return (
            <group key={i} position={[x, y, z]} scale={panelScale}>
              <mesh rotation={[0, -angle + Math.PI / 2, 0]}>
                <boxGeometry args={[1.6, 0.9, 0.06]} />
                <meshPhysicalMaterial
                  color="#14141a"
                  metalness={0.5}
                  roughness={0.35}
                  clearcoat={0.8}
                  emissive={brand.colors.cyan}
                  emissiveIntensity={0.08}
                />
              </mesh>
              <mesh position={[0, 0, 0.04]} rotation={[0, -angle + Math.PI / 2, 0]}>
                <boxGeometry args={[1.2, 0.08, 0.01]} />
                <meshStandardMaterial
                  color={brand.colors.cyan}
                  emissive={brand.colors.cyan}
                  emissiveIntensity={0.5}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      {/* Center hub */}
      <mesh position={[0, 0, 0]}>
        <icosahedronGeometry args={[0.55, 1]} />
        <meshPhysicalMaterial
          color={brand.colors.cyan}
          metalness={0.9}
          roughness={0.15}
          emissive={brand.colors.cyan}
          emissiveIntensity={0.4}
          clearcoat={1}
        />
      </mesh>
    </ThreeCanvas>
  );
};
