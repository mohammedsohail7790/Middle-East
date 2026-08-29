import type { Metadata } from "next";

import { IndustriesIndexGrid } from "@/components/marketing/IndustriesIndexGrid";

export const metadata: Metadata = {
  title: "Industries We Serve — Halla AI",
};

export default function IndustriesIndexPage() {
  return (
    <div data-brand="receptionist" className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10 lg:px-16">
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Industries
        </span>
        <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
          Industries We Serve
        </h1>
        <p className="mt-3 max-w-xl text-foreground-secondary">
          50+ industries. Pre-configured. Ready in minutes.
        </p>
        <div className="mt-12">
          <IndustriesIndexGrid />
        </div>
      </div>
    </div>
  );
}
