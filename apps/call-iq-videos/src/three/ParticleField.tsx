// @ts-nocheck
import { useMemo } from "react";
import { brand } from "../brand";

type ParticleFieldProps = {
  frame: number;
  count?: number;
  spread?: number;
};

export const ParticleField: React.FC<ParticleFieldProps> = ({
  frame,
  count = 120,
  spread = 14,
}) => {
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const seed = i * 1.618;
      return {
        x: (Math.sin(seed * 3.1) * 0.5 + 0.5) * spread - spread / 2,
        y: (Math.cos(seed * 2.7) * 0.5 + 0.5) * spread * 0.6 - spread * 0.3,
        z: (Math.sin(seed * 4.3) * 0.5 + 0.5) * spread - spread / 2,
        size: 0.02 + (i % 5) * 0.008,
        speed: 0.003 + (i % 7) * 0.001,
        phase: seed,
      };
    });
  }, [count, spread]);

  return (
    <group>
      {particles.map((p, i) => {
        const drift = frame * p.speed;
        const y = p.y + Math.sin(frame * 0.02 + p.phase) * 0.15;
        const opacity = 0.35 + Math.sin(frame * 0.03 + p.phase) * 0.15;
        return (
          <mesh
            key={i}
            position={[
              p.x + Math.sin(drift + p.phase) * 0.2,
              y,
              p.z + Math.cos(drift + p.phase) * 0.2,
            ]}
          >
            <sphereGeometry args={[p.size, 8, 8]} />
            <meshStandardMaterial
              color={brand.colors.cyan}
              emissive={brand.colors.cyan}
              emissiveIntensity={opacity}
              transparent
              opacity={0.85}
            />
          </mesh>
        );
      })}
    </group>
  );
};
