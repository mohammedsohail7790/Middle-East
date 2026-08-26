"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Dashboard3DPanel } from "./Dashboard3DPanel";

function findMounts() {
  return {
    agent: document.getElementById("dash3d-agent-panel"),
    summary: document.getElementById("dash3d-summary-panel"),
  };
}

/** Portals CSS 3D dashboard mockups into static marketing HTML mount points. */
export function Dashboard3DMounts() {
  const [agentMount, setAgentMount] = useState<HTMLElement | null>(null);
  const [summaryMount, setSummaryMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const apply = () => {
      const { agent, summary } = findMounts();
      if (agent) setAgentMount(agent);
      if (summary) setSummaryMount(summary);
      return agent && summary;
    };

    if (apply()) return;

    const root = document.getElementById("marketing-spa-root");
    if (!root) {
      const retry = window.setTimeout(apply, 50);
      return () => window.clearTimeout(retry);
    }

    const observer = new MutationObserver(() => {
      if (apply()) observer.disconnect();
    });
    observer.observe(root, { childList: true, subtree: true });
    apply();

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {agentMount && createPortal(<Dashboard3DPanel variant="agent" />, agentMount)}
      {summaryMount && createPortal(<Dashboard3DPanel variant="summary" />, summaryMount)}
    </>
  );
}
