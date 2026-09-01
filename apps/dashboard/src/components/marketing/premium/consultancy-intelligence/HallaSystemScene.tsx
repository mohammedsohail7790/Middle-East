"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const GOLD = "#C7A25A";
const BRONZE = "#8C6F3E";
const INK = "#121212";

type SystemDef = {
  id: string;
  label: string;
  position: [number, number, number];
};

/**
 * The eight conceptual systems from the brief, trimmed to six for the hero —
 * enough to read as "a connected business", not so many it turns into noise
 * at hero scale. (Rule: prefer restraint over decoration.)
 *
 * Driven with plain Three.js rather than @react-three/fiber: r3f 8.x's
 * react-reconciler crashes ("Cannot read properties of undefined (reading
 * 'ReactCurrentOwner')") against this app's React 18.3.1 — a known
 * incompatibility between react-reconciler@0.27 and React 18.3's internals
 * that takes down the whole marketing page (verified in dev: the R3F
 * version of this component threw inside createRenderer and the page fell
 * back to its error boundary). This mirrors the existing halla_plexus.js
 * pattern already shipped on this site — imperative three.js, no reconciler.
 */
const SYSTEMS: SystemDef[] = [
  { id: "operations", label: "Operations", position: [1.9, 1.05, -0.3] },
  { id: "acquisition", label: "Client Acquisition", position: [2.05, -0.55, 0.5] },
  { id: "automation", label: "AI Automation", position: [0.55, 1.7, 0.6] },
  { id: "receptionist", label: "AI Receptionist", position: [0.4, -1.75, -0.2] },
  { id: "integrations", label: "Integrations", position: [-0.75, 0.55, 1.6] },
  { id: "data", label: "Data & Insights", position: [1.15, -0.15, 1.75] },
];

type PerformanceTier = "high" | "medium" | "low";

/**
 * Coarse device-capability tiering (Phase 14 of the brief): cores + device
 * memory are the cheapest reliable signals available without a WebGL probe.
 * Only used to scale render cost (pixel ratio, AA, whether we pay for a
 * PMREM environment pass) — never to change what's shown, so there's no
 * "mobile got a worse composition" risk, just a cheaper render of the same
 * scene on weaker hardware.
 */
function getPerformanceTier(): PerformanceTier {
  if (typeof navigator === "undefined") return "high";
  const cores = navigator.hardwareConcurrency ?? 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (cores <= 2 || mem <= 2) return "low";
  if (cores <= 4 || mem <= 4) return "medium";
  return "high";
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

type NodeRig = {
  def: SystemDef;
  outer: THREE.Group;
  inner: THREE.Mesh;
  edge: THREE.LineSegments;
  line: THREE.Line;
  lineMaterial: THREE.LineBasicMaterial;
  particle: THREE.Mesh;
  labelEl: HTMLDivElement | null;
  baseY: number;
  baseOpacity: number;
};

/** Builds and animates the Halla System scene with plain Three.js (no react-reconciler). */
function useHallaSystem(
  mountRef: React.RefObject<HTMLDivElement | null>,
  labelRefs: React.RefObject<Record<string, HTMLDivElement | null>>,
  reduced: boolean,
  onHover: (id: string | null) => void,
) {
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const tier = getPerformanceTier();
    const maxPixelRatio = tier === "high" ? 1.75 : tier === "medium" ? 1.25 : 1;
    const useEnvironment = tier !== "low";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(0, 0.2, 5.4);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: tier !== "low",
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;";

    const root = new THREE.Group();
    root.position.set(0.4, 0, 0);
    scene.add(root);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const dirLight = new THREE.DirectionalLight(0xfaf8f3, 0.9);
    dirLight.position.set(3, 4, 5);
    scene.add(dirLight);
    const goldLight = new THREE.PointLight(new THREE.Color(GOLD), 0.3);
    goldLight.position.set(-2, -1, 2);
    scene.add(goldLight);

    // A real environment map is what makes MeshPhysicalMaterial's
    // `transmission` actually read as glass (refracting *something*)
    // instead of a flat translucent color — without it the core looked
    // like a solid matte rock. RoomEnvironment is a neutral studio-lit
    // box used purely for reflections/refraction; it's never rendered as
    // a visible background, only baked into an env map via PMREM. Skipped
    // on the low performance tier — the PMREM bake is the single most
    // expensive thing this scene does, and transmission without it just
    // falls back to a flat (still on-brand) translucent fill below.
    let pmremGenerator: THREE.PMREMGenerator | null = null;
    let envTexture: THREE.Texture | null = null;
    if (useEnvironment) {
      pmremGenerator = new THREE.PMREMGenerator(renderer);
      envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTexture;
    }

    // Halla Core — a translucent faceted crystal, not a glowing orb.
    const coreOuter = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(INK),
        transparent: true,
        opacity: useEnvironment ? 0.22 : 0.4,
        roughness: 0.1,
        metalness: 0,
        transmission: useEnvironment ? 0.92 : 0,
        thickness: 0.9,
        ior: 1.4,
        envMapIntensity: 1.1,
      }),
    );
    const coreWire = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.62, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD), wireframe: true, transparent: true, opacity: 0.7 }),
    );
    const coreInner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(GOLD),
        emissive: new THREE.Color(BRONZE),
        emissiveIntensity: 0.35,
        roughness: 0.3,
        metalness: 0.4,
      }),
    );
    coreInner.scale.setScalar(0.34);
    const coreGroup = new THREE.Group();
    coreGroup.add(coreOuter, coreWire, coreInner);
    root.add(coreGroup);

    // System nodes + connections.
    const nodes: NodeRig[] = SYSTEMS.map((def) => {
      const nodeGroup = new THREE.Group();
      nodeGroup.position.set(def.position[0], 0, def.position[2]);

      const baseOpacity = useEnvironment ? 0.22 : 0.32;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(INK),
          transparent: true,
          opacity: baseOpacity,
          roughness: 0.12,
          metalness: 0,
          transmission: useEnvironment ? 0.75 : 0,
          thickness: 0.4,
          ior: 1.4,
          envMapIntensity: 1,
        }),
      );
      box.position.y = def.position[1];

      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.22, 0.22, 0.22)),
        new THREE.LineBasicMaterial({ color: new THREE.Color(GOLD), transparent: true, opacity: 0.65 }),
      );
      edge.position.y = def.position[1];

      nodeGroup.add(box, edge);
      nodeGroup.userData.id = def.id;
      nodeGroup.userData.hitMesh = box;
      root.add(nodeGroup);

      const lineMaterial = new THREE.LineBasicMaterial({ color: new THREE.Color(GOLD), transparent: true, opacity: 0.22 });
      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(...def.position),
      ]);
      const line = new THREE.Line(lineGeometry, lineMaterial);
      root.add(line);

      const particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.018, 8, 8),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(GOLD) }),
      );
      particle.visible = false;
      root.add(particle);

      return {
        def,
        outer: nodeGroup,
        inner: box,
        edge,
        line,
        lineMaterial,
        particle,
        labelEl: null,
        baseY: def.position[1],
        baseOpacity,
      };
    });

    const raycaster = new THREE.Raycaster();
    const pointerNDC = new THREE.Vector2(0, 0);
    const pointerTarget = new THREE.Vector2(0, 0);
    let hoveredId: string | null = null;

    function resize() {
      const { clientWidth, clientHeight } = mount!;
      if (clientWidth === 0 || clientHeight === 0) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    }
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(mount);

    function onPointerMove(e: PointerEvent) {
      const rect = mount!.getBoundingClientRect();
      pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }
    function onPointerLeave() {
      pointerNDC.set(0, 0);
    }
    mount.addEventListener("pointermove", onPointerMove);
    mount.addEventListener("pointerleave", onPointerLeave);

    const clock = new THREE.Clock();
    let raf = 0;
    const projected = new THREE.Vector3();

    function frame() {
      raf = requestAnimationFrame(frame);
      const delta = reduced ? 0 : clock.getDelta();
      const t = clock.elapsedTime;

      if (!reduced) {
        coreOuter.rotation.y += delta * 0.06;
        coreInner.rotation.y -= delta * 0.09;
        root.rotation.y += delta * 0.015;

        pointerTarget.x += (pointerNDC.x - pointerTarget.x) * 0.04;
        pointerTarget.y += (pointerNDC.y - pointerTarget.y) * 0.04;
        camera.position.x = pointerTarget.x * 0.35;
        camera.position.y = 0.2 + pointerTarget.y * 0.2;
        camera.lookAt(0.4, 0, 0);
      }

      // Hover raycast (kept live even under reduced motion — it's a
      // discrete state change, not continuous motion).
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(nodes.map((n) => n.inner));
      const nextHoveredId = hits.length > 0 ? (hits[0].object.parent?.userData.id as string) : null;
      if (nextHoveredId !== hoveredId) {
        hoveredId = nextHoveredId;
        onHover(hoveredId);
        mount!.style.cursor = hoveredId ? "pointer" : "default";
      }

      for (const node of nodes) {
        const isHovered = node.def.id === hoveredId;
        const isActive = hoveredId === null || isHovered;
        const lift = isHovered ? 0.08 : 0;
        const bob = reduced ? 0 : Math.sin(t * 0.6 + node.def.position[0]) * 0.04;
        node.inner.position.y = node.baseY + bob + lift;
        node.edge.position.y = node.inner.position.y;
        (node.inner.material as THREE.MeshPhysicalMaterial).opacity = isHovered
          ? node.baseOpacity + 0.16
          : node.baseOpacity;
        (node.edge.material as THREE.LineBasicMaterial).opacity = isHovered ? 1 : 0.65;
        node.lineMaterial.opacity = isActive ? 0.55 : 0.22;
        node.particle.visible = isActive && !reduced;

        if (!reduced && node.particle.visible) {
          const speed = 0.18;
          const pt = (t * speed + node.def.position[0]) % 1;
          node.particle.position.set(0, 0, 0).lerp(new THREE.Vector3(...node.def.position), pt);
        }

        const labelEl = labelRefs.current?.[node.def.id];
        if (labelEl) {
          projected.set(node.def.position[0], node.inner.position.y - 0.22, node.def.position[2]);
          root.localToWorld(projected);
          projected.project(camera);
          const rect = mount!.getBoundingClientRect();
          const x = (projected.x * 0.5 + 0.5) * rect.width;
          const y = (-projected.y * 0.5 + 0.5) * rect.height;
          const behind = projected.z > 1;
          labelEl.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
          labelEl.style.opacity = behind ? "0" : isHovered ? "1" : "0.7";
          labelEl.style.color = isHovered ? GOLD : "rgba(18,18,18,0.55)";
        }
      }

      renderer.render(scene, camera);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      mount!.removeEventListener("pointermove", onPointerMove);
      mount!.removeEventListener("pointerleave", onPointerLeave);
      mount!.removeChild(renderer.domElement);
      envTexture?.dispose();
      pmremGenerator?.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.LineSegments) {
          obj.geometry?.dispose();
          const mat = obj.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
}

export function HallaSystemScene() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const mountRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);
  useHallaSystem(mountRef, labelRefs, reduced, setHoveredId);

  return (
    <div className="halla-system-scene" aria-hidden style={{ position: "absolute", inset: 0 }}>
      {mounted && <div ref={mountRef} style={{ position: "absolute", inset: 0 }} />}
      {mounted &&
        SYSTEMS.map((def) => (
          <div
            key={def.id}
            ref={(el) => {
              labelRefs.current[def.id] = el;
            }}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.02em",
              whiteSpace: "nowrap",
              transition: "color 0.2s ease, opacity 0.2s ease",
              fontFamily: "var(--font, sans-serif)",
              pointerEvents: "none",
              opacity: def.id === hoveredId ? 1 : 0.7,
            }}
          >
            {def.label}
          </div>
        ))}
    </div>
  );
}
