"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { IntelligenceNetwork } from "./network/IntelligenceNetwork";
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
  const baseCam = useRef({ x: 0, y: 0.05, z: mobile ? 7.4 : 6.4 });
  const animate = visible && motion.current.animate;

  useEffect(() => {
    camera.position.set(baseCam.current.x, baseCam.current.y, baseCam.current.z);
    camera.lookAt(0, 0, 0);
  }, [camera, mobile]);

  useFrame((_, dt) => {
    const group = root.current;
    if (!group) return;

    const m = motion.current;
    const scrollScale = m.scroll;
    const targetScale = (mobile ? 0.92 : 1.08) * scrollScale;

    group.position.x = THREE.MathUtils.lerp(group.position.x, 0, 0.06);
    group.scale.setScalar(THREE.MathUtils.lerp(group.scale.x, targetScale, 0.05));

    if (animate) {
      group.rotation.y += dt * 0.035;
      group.rotation.x = THREE.MathUtils.lerp(
        group.rotation.x,
        -0.04 + m.parallax.y * 0.14,
        0.04,
      );
      group.rotation.y += m.parallax.x * dt * 0.12;

      camera.position.x = THREE.MathUtils.lerp(
        camera.position.x,
        baseCam.current.x + m.parallax.x * 0.28,
        0.04,
      );
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        baseCam.current.y + m.parallax.y * 0.18,
        0.04,
      );
      camera.lookAt(0, 0, 0);
    }
  });

  const particleCount = mobile ? 36 : 72;

  return (
    <group ref={root} position={[0, 0.2, 0]}>
      <SceneLighting />
      <SceneAtmosphere count={particleCount} animate={animate} />
      <IntelligenceNetwork mobile={mobile} animate={animate} />
    </group>
  );
}
