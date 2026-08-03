"use client";

import { Instagram } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function InstagramChannelPage() {
  return <ChannelNotConnected icon={Instagram} channelName="Instagram" />;
}
