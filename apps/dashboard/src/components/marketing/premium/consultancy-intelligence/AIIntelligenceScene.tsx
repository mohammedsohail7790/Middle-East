"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FloatingModules } from "./FloatingModules";
import { IntelligenceCore } from "./IntelligenceCore";
import { NeuralStreams } from "./NeuralStreams";
import { OrbitalSystem } from "./OrbitalSystem";
import { SceneAtmosphere, SceneLighting } from "./SceneAtmosphere";
import { useConsultSceneMotion } from "./useConsultSceneMotion";

type Props = {
  mobile: boolean;
  reduced: boolean;
  visible: boolean;
};

export function AIIntelligenceScene({ mobile, reduced, visible }: Props) {
  const root = useRef<THREE.Group>(null);
  const motion = useConsultSceneMotion(mobile, reduced);
  const { camera } = useThree();
  const baseCam = useRef({ x: 2.2, y: 0.12, z: 6.8 });
  const animate = visible && motion.current.animate;

  useEffect(() => {
    camera.position.set(baseCam.current.x, baseCam.current.y, baseCam.current.z);
    camera.lookAt(2.1, 0, 0);
  }, [camera]);

  useFrame((_, dt) => {
    const group = root.current;
    if (!group) return;

    const m = motion.current;
    const scrollScale = m.scroll;
    const targetX = 2.15 + (mobile ? 0 : 0.35);
    const targetScale = (mobile ? 0.78 : 1) * scrollScale;

    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, 0.04);
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, targetScale, 0.05));

    if (animate) {
      group.rotation.y += dt * 0.035;
      group.rotation.x = THREE.MathUtils.lerp(
        group.rotation.x,
        -0.06 + m.parallax.y * 0.18,
        0.04,
      );
      group.rotation.y += m.parallax.x * dt * 0.12;

      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        baseCam.current.x + m.parallax.x * 0.35,
        0.04,
      );
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        baseCam.current.y + m.parallax.y * 0.22,
        0.04,
      );
      camera.lookAt(group.position.x, 0, 0);
    }
  });

  const particleCount = mobile ? 36 : 72;

  return (
    <group ref={root}>
      <SceneLighting />
      <SceneAtmosphere count={particleCount} animate={animate} />
      <OrbitalSystem mobile={mobile} animate={animate} />
      <NeuralStreams mobile={mobile} animate={animate} />
      <FloatingModules mobile={mobile} animate={animate} />
      <IntelligenceCore mobile={mobile} />
    </group>
  );
}
