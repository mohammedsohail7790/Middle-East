"use client";

import { Link2, Zap } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import type { IntegrationDef } from "@/lib/integration-hub-catalog";
import { navigateToZapierSetup } from "@/lib/zapier-connect";

type Props = {
  integration: IntegrationDef;
  onUseDirectApi: () => void;
};

export function IntegrationZapierEasyPath({ integration, onUseDirectApi }: Props) {
  return (
    <div className="space-y-5 max-w-lg">
      <p className="text-sm text-muted-foreground leading-relaxed">
        <strong className="text-foreground">{integration.name}</strong> connects through Zapier — paste
        your Catch Hook URL in the Zapier section on this page.
      </p>

      <div className="rounded-xl border border-border bg-muted/20 p-4 sm:p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-8 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <Zap className="size-4" strokeWidth={ICON_STROKE} />
          </span>
          <p className="text-sm font-semibold text-foreground">Connect via Zapier</p>
        </div>

        <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside leading-relaxed">
          <li>Create a Zap in Zapier with Webhooks → Catch Hook</li>
          <li>Add {integration.name} as the action and turn the Zap ON</li>
          <li>Copy the webhook URL and paste it in the Zapier section below</li>
        </ol>

        <button
          type="button"
          className="btn-primary text-sm w-full inline-flex items-center justify-center gap-2"
          onClick={() => navigateToZapierSetup(integration.id)}
        >
          <Link2 className="size-3.5" strokeWidth={ICON_STROKE} />
          Go to Zapier section
        </button>
      </div>

      {!integration.zapierOnly && (
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={onUseDirectApi}
        >
          Advanced: connect with API key instead
        </button>
      )}
    </div>
  );
}
