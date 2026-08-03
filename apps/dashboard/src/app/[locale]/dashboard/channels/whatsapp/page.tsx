"use client";

import { MessagesSquare } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function WhatsAppChannelPage() {
  return <ChannelNotConnected icon={MessagesSquare} channelName="WhatsApp" />;
}
