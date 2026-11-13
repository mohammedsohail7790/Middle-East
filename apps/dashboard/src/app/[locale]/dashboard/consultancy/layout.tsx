"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { fetchConsultancyTeam } from "@/lib/use-consultancy-team";

/** Everything under /dashboard/consultancy is for the team only. The gateway refuses anyone else; this just explains why the screens are empty. */
export default function ConsultancyLayout({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"checking" | "team" | "denied">("checking");
  useEffect(() => {
    let live = true;
    void fetchConsultancyTeam().then((ok) => live && setState(ok ? "team" : "denied"));
    return () => {
      live = false;
    };
  }, []);
  if (state === "checking") return <p className="p-6 text-sm text-muted-foreground">Checking access…</p>;
  if (state === "denied") {
    return (
      <div className="mx-auto max-w-lg p-8">
        <h1 className="text-xl font-semibold">Team access only</h1>
        <p className="mt-2 text-sm text-muted-foreground">These screens are for the Halla AI consultancy team. If you should have access, ask the owner to add your email to the team list.</p>
      </div>
    );
  }
  return <>{children}</>;
}
