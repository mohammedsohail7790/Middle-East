"use client";

import { MessageSquare } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function WebChatChannelPage() {
  return <ChannelNotConnected icon={MessageSquare} channelName="Web Chat" />;
}
