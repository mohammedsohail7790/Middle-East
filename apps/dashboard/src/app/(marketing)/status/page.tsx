import type { Metadata } from "next";
import { AuthCard, AuthPageShell } from "@/components/auth/AuthPageShell";
import { SystemStatus } from "@/components/status/SystemStatus";

export const metadata: Metadata = {
  title: "System status",
  description: "Is Halla AI answering calls and messages right now? A live check of the gateway, the database and the website.",
};

export default function StatusPage() {
  return (
    <AuthPageShell>
      <AuthCard title="System status" description="A live check, run in your browser.">
        <SystemStatus />
      </AuthCard>
    </AuthPageShell>
  );
}
