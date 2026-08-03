import type { Metadata } from "next";
import { CallIQLandingFrame } from "@/components/marketing/CallIQLandingFrame";

export const metadata: Metadata = {
  title: "Call IQ – Pure AI Receptionist | Never Miss a Call Again",
  description:
    "Call IQ answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.",
};

/** Homepage: exact root index.html served from /index.html inside an isolated iframe. */
export default function HomePage() {
  return <CallIQLandingFrame />;
}
