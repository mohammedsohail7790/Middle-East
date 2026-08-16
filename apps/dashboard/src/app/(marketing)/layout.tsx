import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "../globals.css";

export const metadata: Metadata = {
  title: "Halla AI – Smart • Seamless • Always",
  description:
    "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.hallaai.com"
  ),
  icons: {
    icon: "/logo.png",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

// Prevent FOUC on theme toggle
const themeInitScript = `(function(){try{var t=localStorage.getItem('halla_theme')||localStorage.getItem('calliq_theme');document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

// Override dashboard gold accent with Halla AI teal for marketing/auth pages
const tealOverride = `
  :root {
    --gold: #0D9488;
    --gold-dark: #0F766E;
    --gold-light: #2DD4BF;
    --gold-text: #0F766E;
    --gold-glow: rgba(13,148,136,0.25);
    --gold-muted: rgba(13,148,136,0.12);
    --gold-border: rgba(13,148,136,0.35);
    --accent: #0D9488;
    --accent-dark: #0F766E;
    --accent-mid: #2DD4BF;
  }
`;

export default function MarketingRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Remap accent vars to Halla AI teal for marketing & auth pages */}
        <style dangerouslySetInnerHTML={{ __html: tealOverride }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
      </head>
      <body suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
