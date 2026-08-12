import type { Metadata } from "next";
import HomeMarketingPage from "@/app/HomeMarketingPage";

export const metadata: Metadata = {
  title: "Halla AI – Pure AI Receptionist | Never Miss a Call Again",
  description:
    "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.",
};

export default function HomePage() {
  return <HomeMarketingPage />;
}
