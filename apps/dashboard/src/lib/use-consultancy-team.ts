"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let cached: boolean | null = null;
let inflight: Promise<boolean> | null = null;

/** Asks the gateway once whether the signed-in user is on the consultancy team list. Any error counts as "no", so the team screens stay hidden. */
export function fetchConsultancyTeam(): Promise<boolean> {
  if (cached !== null) return Promise.resolve(cached);
  if (!inflight) {
    inflight = api
      .get<{ admin?: boolean }>("/consultancy-admin/me")
      .then((r) => r?.admin === true)
      .catch(() => false)
      .then((ok) => {
        cached = ok;
        inflight = null;
        return ok;
      });
  }
  return inflight;
}

/** Test helper: forget the answer so the next call asks again. */
export function resetConsultancyTeamCache(): void {
  cached = null;
  inflight = null;
}

export function useConsultancyTeam(): boolean {
  const [team, setTeam] = useState<boolean>(cached === true);
  useEffect(() => {
    let live = true;
    void fetchConsultancyTeam().then((ok) => {
      if (live) setTeam(ok);
    });
    return () => {
      live = false;
    };
  }, []);
  return team;
}
