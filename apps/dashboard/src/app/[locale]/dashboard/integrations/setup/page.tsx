"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Legacy URL → main integrations wizard with CRM pre-selected */
export default function CrmSetupRedirectPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const crm = searchParams.get("crm");

  useEffect(() => {
    const qs = crm ? `?provider=${encodeURIComponent(crm)}&wizard=1` : "";
    router.replace(`/dashboard/integrations${qs}`);
  }, [crm, router]);

  return null;
}
