"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dashboard3DPanel } from "./Dashboard3DPanel";

/** Portals CSS 3D dashboard mockups into static marketing HTML mount points. */
export function Dashboard3DMounts() {
  const [agentMount, setAgentMount] = useState<HTMLElement | null>(null);
  const [summaryMount, setSummaryMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setAgentMount(document.getElementById("dash3d-agent-panel"));
    setSummaryMount(document.getElementById("dash3d-summary-panel"));
  }, []);

  return (
    <>
      {agentMount && createPortal(<Dashboard3DPanel variant="agent" />, agentMount)}
      {summaryMount && createPortal(<Dashboard3DPanel variant="summary" />, summaryMount)}
    </>
  );
}
