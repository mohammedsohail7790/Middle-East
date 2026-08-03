// @ts-nocheck
import { brand } from "../brand";

type OrbitalRingsProps = {
  frame: number;
  intensity?: number;
};

export const OrbitalRings: React.FC<OrbitalRingsProps> = ({
  frame,
  intensity = 1,
}) => {
  const rot1 = frame * 0.012;
  const rot2 = frame * -0.008;
  const rot3 = frame * 0.005;

  return (
    <group position={[2.5, 0.5, -2]}>
      <mesh rotation={[Math.PI / 2.4, rot1, 0.3]}>
        <torusGeometry args={[2.2, 0.015, 16, 120]} />
        <meshStandardMaterial
          color={brand.colors.cyan}
          emissive={brand.colors.cyan}
          emissiveIntensity={0.6 * intensity}
          transparent
          opacity={0.7}
        />
      </mesh>
      <mesh rotation={[Math.PI / 3, rot2, -0.2]}>
        <torusGeometry args={[2.8, 0.01, 16, 120]} />
        <meshStandardMaterial
          color="#6366f1"
          emissive="#6366f1"
          emissiveIntensity={0.35 * intensity}
          transparent
          opacity={0.5}
        />
      </mesh>
      <mesh rotation={[Math.PI / 1.8, rot3, 0.5]}>
        <torusGeometry args={[3.4, 0.008, 16, 120]} />
        <meshStandardMaterial
          color={brand.colors.white}
          emissive={brand.colors.white}
          emissiveIntensity={0.2 * intensity}
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
  );
};
