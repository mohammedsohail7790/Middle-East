"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { buildIntelligenceNetwork } from "./consultIntelligenceNetwork";

const NODE_COLOR = "#94d4c8";
const EDGE_COLOR = "#0f766e";
const CORE_COLOR = "#134e4a";

function IntelligenceNetwork({ mobile }: { mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const linesRef = useRef<THREE.LineSegments>(null);
  const nodesRef = useRef<THREE.InstancedMesh>(null);
  const parallax = useRef({ x: 0, y: 0 });
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const nodeCount = mobile ? 22 : 30;
  const maxEdges = mobile ? 36 : 50;
  const { nodes, positions } = useMemo(
    () => buildIntelligenceNetwork(nodeCount, maxEdges),
    [nodeCount, maxEdges],
  );

  useEffect(() => {
    const mesh = nodesRef.current;
    if (!mesh) return;
    nodes.forEach((pos, i) => {
      dummy.position.copy(pos);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [nodes, dummy]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      parallax.current.x = (e.clientX / window.innerWidth - 0.5) * 0.1;
      parallax.current.y = (e.clientY / window.innerHeight - 0.5) * 0.06;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  useFrame((state, dt) => {
    const group = root.current;
    if (group) {
      group.rotation.y += dt * 0.045 + parallax.current.x * dt * 0.25;
      group.rotation.x = THREE.MathUtils.lerp(
        group.rotation.x,
        -0.06 + parallax.current.y * 0.2,
        0.035,
      );
    }

    const t = state.clock.elapsedTime;
    const mesh = nodesRef.current;
    if (mesh) {
      nodes.forEach((pos, i) => {
        const pulse = 0.88 + Math.sin(t * 0.75 + i * 0.65) * 0.12;
        dummy.position.copy(pos);
        dummy.scale.setScalar(pulse);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    const lines = linesRef.current;
    if (lines) {
      const mat = lines.material as THREE.LineBasicMaterial;
      mat.opacity = 0.14 + Math.sin(t * 0.4) * 0.03;
    }
  });

  return (
    <group ref={root} position={[2.3, 0.02, 0]} scale={mobile ? 0.9 : 1.02}>
      <mesh>
        <icosahedronGeometry args={[0.46, 2]} />
        <meshBasicMaterial
          color={CORE_COLOR}
          wireframe
          transparent
          opacity={0.11}
          depthWrite={false}
        />
      </mesh>

      <mesh>
        <sphereGeometry args={[0.34, 28, 28]} />
        <meshBasicMaterial color="#0d9488" transparent opacity={0.035} depthWrite={false} />
      </mesh>

      <lineSegments ref={linesRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color={EDGE_COLOR} transparent opacity={0.17} depthWrite={false} />
      </lineSegments>

      <instancedMesh ref={nodesRef} args={[undefined, undefined, nodes.length]} frustumCulled={false}>
        <sphereGeometry args={[0.024, 6, 6]} />
        <meshBasicMaterial color={NODE_COLOR} transparent opacity={0.42} depthWrite={false} />
      </instancedMesh>

      <mesh>
        <sphereGeometry args={[2.05, 32, 32]} />
        <meshBasicMaterial color="#0d9488" transparent opacity={0.022} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function ConsultNeuralCanvas() {
  const mobile =
    typeof window !== "undefined" &&
    (window.innerWidth < 768 || window.matchMedia("(pointer: coarse)").matches);

  return (
    <Canvas
      camera={{ position: [3.6, 0.15, 7.2], fov: 38, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: !mobile, powerPreference: "high-performance" }}
      dpr={mobile ? [1, 1.25] : [1, 1.5]}
      style={{ width: "100%", height: "100%", display: "block" }}
    >
      <ambientLight intensity={0.55} />
      <IntelligenceNetwork mobile={mobile} />
    </Canvas>
  );
}
