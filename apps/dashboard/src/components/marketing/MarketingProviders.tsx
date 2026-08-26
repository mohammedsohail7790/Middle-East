"use client";

import { ThemeProvider } from "@/lib/theme";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";

/** Marketing pages must render even when Supabase env vars are unset (preview builds). */
export function MarketingProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <ChunkLoadRecovery />
      {children}
    </ThemeProvider>
  );
}
