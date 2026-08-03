"use client";

import { Facebook } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function FacebookChannelPage() {
  return <ChannelNotConnected icon={Facebook} channelName="Facebook" />;
}
