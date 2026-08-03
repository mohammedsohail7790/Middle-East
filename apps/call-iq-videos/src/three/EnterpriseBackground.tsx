// @ts-nocheck — Three.js JSX intrinsics from @react-three/fiber
import { ThreeCanvas } from "@remotion/three";
import { useVideoConfig } from "remotion";
import { EnterpriseLighting } from "./EnterpriseLighting";
import { InfiniteGrid } from "./InfiniteGrid";
import { OrbitalRings } from "./OrbitalRings";
import { ParticleField } from "./ParticleField";

export type BackgroundVariant = "hero" | "feature" | "cta" | "minimal";

type EnterpriseBackgroundProps = {
  frame: number;
  variant?: BackgroundVariant;
};

export const EnterpriseBackground: React.FC<EnterpriseBackgroundProps> = ({
  frame,
  variant = "hero",
}) => {
  const { width, height } = useVideoConfig();
  const cameraZ = variant === "cta" ? 7 : 8;
  const cameraY = variant === "feature" ? 1.2 : 0.8;
  const camRot = frame * 0.0015;

  return (
    <ThreeCanvas width={width} height={height} camera={{ fov: 45, position: [0, cameraY, cameraZ] }}>
      <color attach="background" args={["#050508"]} />
      <fog attach="fog" args={["#050508", 6, 22]} />
      <EnterpriseLighting />
      <group rotation={[0, camRot, 0]}>
        <ParticleField frame={frame} count={variant === "minimal" ? 60 : 140} />
        <InfiniteGrid frame={frame} />
        {variant !== "minimal" && <OrbitalRings frame={frame} intensity={variant === "cta" ? 1.4 : 1} />}
      </group>
    </ThreeCanvas>
  );
};
