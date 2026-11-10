"use client";

import { Canvas, type CanvasProps } from "@react-three/fiber";
import { useEffect, useState } from "react";

function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return Boolean(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/**
 * react-three-fiber Canvas that renders nothing when WebGL is unavailable (headless CI,
 * blocklisted GPUs) instead of throwing console errors. These scenes are decorative only.
 */
export function SafeCanvas(props: CanvasProps) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(webglAvailable()), []);
  return ok ? <Canvas {...props} /> : null;
}
