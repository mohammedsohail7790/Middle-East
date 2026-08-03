"use client";

import type { LucideIcon } from "lucide-react";
import { PlugZap } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";

export function ChannelNotConnected({
  icon: Icon,
  channelName,
}: {
  icon: LucideIcon;
  channelName: string;
}) {
  return (
    <DashboardPage
      title={channelName}
      description={`Connect ${channelName} to start receiving and replying to conversations here.`}
    >
      <EmptyState
        icon={Icon}
        title={`${channelName} isn't connected yet`}
        description={`Once ${channelName} is connected, conversations will appear here alongside your other channels.`}
        action={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <PlugZap className="size-4" />
            Connection setup is coming in a future update
          </span>
        }
      />
    </DashboardPage>
  );
}
