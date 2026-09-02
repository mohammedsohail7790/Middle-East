import type { Metadata } from "next";
import { MarketingProviders } from "@/components/marketing/MarketingProviders";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Halla AI – AI Consultancy & Pure AI Receptionist",
    template: "%s | Halla AI",
  },
  description:
    "Halla AI Consultancy installs connected automation for small businesses. Plus a 24/7 AI receptionist that answers every call — starting at $39/month.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://www.hallaai.com"
  ),
  openGraph: {
    title: "Halla AI – AI Consultancy & Pure AI Receptionist",
    description:
      "We install AI systems for operations, growth, and brand — plus a receptionist that never misses a call.",
    type: "website",
    siteName: "Halla AI",
    images: [{ url: "/logo-consultancy.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Halla AI – AI Consultancy & Pure AI Receptionist",
    description:
      "Connected AI systems for small business — and a 24/7 receptionist from $39/month.",
    images: ["/logo-consultancy.jpg"],
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/logo-consultancy.jpg", type: "image/jpeg" }],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#8C6F3E",
};

// Prevent FOUC on theme toggle
const themeInitScript = `(function(){try{var t=localStorage.getItem('halla_theme')||localStorage.getItem('calliq_theme');document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

// Marketing & auth pages share the dashboard's warm gold/bronze accent —
// no override needed; halla_styles.css already sets --accent to Aureate Gold.

export default function MarketingRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        {/* Marketing SPA styles — body HTML strips <head>; SSR link required for first paint. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link id="halla-styles" rel="stylesheet" href="/halla_styles.css" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link id="marketing-premium" rel="stylesheet" href="/marketing-premium.css" />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link
          id="tabler-icons"
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.46.0/dist/tabler-icons.min.css"
        />
        {/* eslint-disable-next-line @next/next/no-css-tags, @next/next/no-page-custom-font */}
        <link
          id="halla-fonts"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300;400;500;600;700;800;900&family=Cairo:wght@300;400;500;600;700;800;900&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <MarketingProviders>{children}</MarketingProviders>
      </body>
    </html>
  );
}
