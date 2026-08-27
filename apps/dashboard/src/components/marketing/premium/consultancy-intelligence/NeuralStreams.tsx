"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { PALETTE } from "./palette";
import { buildStreamCurves } from "./paths";

function StreamImpulses({
  curves,
  count,
  animate,
}: {
  curves: THREE.CatmullRomCurve3[];
  count: number;
  animate: boolean;
}) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const impulses = useRef(
    Array.from({ length: count }, (_, i) => ({
      t: (i / count) * 0.9,
      speed: 0.08 + (i % 5) * 0.025,
      curve: i % Math.max(1, curves.length),
      red: i % 7 === 0,
    })),
  );

  useEffect(() => {
    impulses.current.forEach((imp, i) => {
      imp.curve = i % Math.max(1, curves.length);
    });
  }, [curves]);

  useFrame((_, dt) => {
    if (!curves.length || !animate) return;
    impulses.current.forEach((imp, i) => {
      imp.t += imp.speed * dt;
      if (imp.t >= 1) {
        imp.t = 0;
        imp.curve = (imp.curve + 2) % curves.length;
        imp.red = Math.random() < 0.14;
      }
      const mesh = refs.current[i];
      const curve = curves[imp.curve];
      if (!mesh || !curve) return;
      mesh.position.copy(curve.getPoint(imp.t));
      const pulse = 0.3 + Math.sin(imp.t * Math.PI) * 0.5;
      mesh.scale.setScalar(0.35 + pulse * 0.4);
      const mat = mesh.material as THREE.MeshBasicMaterial;
      mat.color.set(imp.red ? PALETTE.redHot : PALETTE.light);
      mat.opacity = 0.25 + pulse * 0.55;
      mesh.visible = true;
    });
  });

  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <mesh
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          visible={false}
        >
          <sphereGeometry args={[0.04, 5, 5]} />
          <meshBasicMaterial color={PALETTE.electric} transparent opacity={0.7} depthWrite={false} />
        </mesh>
      ))}
    </>
  );
}

export function NeuralStreams({ mobile, animate }: { mobile: boolean; animate: boolean }) {
  const curves = useMemo(() => buildStreamCurves(mobile), [mobile]);
  const impulseCount = mobile ? 8 : 14;

  return (
    <group>
      {curves.map((curve, i) => (
        <mesh key={`stream-${i}`} frustumCulled={false}>
          <tubeGeometry args={[curve, mobile ? 24 : 36, 0.008 + (i % 2) * 0.003, 5, false]} />
          <meshBasicMaterial
            color={i % 9 === 0 ? PALETTE.red : PALETTE.violet}
            transparent
            opacity={0.14 + (i % 3) * 0.04}
            depthWrite={false}
          />
        </mesh>
      ))}
      <StreamImpulses curves={curves} count={impulseCount} animate={animate} />
    </group>
  );
}
