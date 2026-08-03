"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolvePostAuthPath } from "@/lib/ensure-tenant";
import { navigateAfterSignIn } from "@/lib/auth-navigate";

/**
 * Guest auth pages (login/signup): send signed-in users to dashboard or onboarding.
 */
export function useGuestAuthRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session || cancelled) return;

      const path = await resolvePostAuthPath(session, { maxWaitMs: 2_500 });
      if (cancelled) return;
      navigateAfterSignIn(router, path);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);
}
