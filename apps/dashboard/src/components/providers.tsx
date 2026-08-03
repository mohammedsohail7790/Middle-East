"use client";

import { ThemeProvider } from "@/lib/theme";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { SupabaseConfigGuard } from "@/components/SupabaseConfigGuard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <SupabaseConfigGuard>
        <ChunkLoadRecovery />
        {children}
      </SupabaseConfigGuard>
    </ThemeProvider>
  );
}
