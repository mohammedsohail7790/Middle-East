import type { Metadata } from "next";
import { MarketingProviders } from "@/components/marketing/MarketingProviders";
import "../globals.css";
import "@/styles/apple-dashboard.css";

export const metadata: Metadata = {
  title: {
    default: "Halla AI | AI Consultancy & AI Receptionist for the GCC",
    template: "%s | Halla AI",
  },
  description:
    "We don’t sell AI — we install it. Halla AI builds connected AI systems for operations, client acquisition and brand visibility for businesses in the UAE, Saudi Arabia and the wider GCC, plus a 24/7 Arabic and English AI receptionist.",
  // The marketing site's own address. NEXT_PUBLIC_SITE_URL is the app's address on production (used for sign-in redirects), so it must not decide where search engines send visitors.
  metadataBase: new URL(process.env.NEXT_PUBLIC_MARKETING_URL || "https://www.hallaai.com"),
  openGraph: {
    title: "Halla AI | AI Consultancy & AI Receptionist for the GCC",
    description:
      "We install AI systems for operations, growth, and brand — plus a receptionist that never misses a call.",
    type: "website",
    siteName: "Halla AI",
    images: [{ url: "/logo-consultancy.jpg" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Halla AI | AI Consultancy & AI Receptionist for the GCC",
    description:
      "Connected AI systems for small business — and a 24/7 receptionist from $39/month.",
    images: ["/logo-consultancy.jpg"],
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }, { url: "/logo-consultancy-favicon.jpg", type: "image/jpeg" }],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0066CC",
};

// Prevent FOUC on theme toggle
const themeInitScript = `(function(){try{var t=localStorage.getItem('halla_theme')||localStorage.getItem('calliq_theme');document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

// Marketing & auth pages share the Apple blue action color with the dashboard and meetklaros.com;
// /marketing-apple.css (loaded last) is the Apple surface layer over halla_styles.css.

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
        <link id="marketing-apple" rel="stylesheet" href="/marketing-apple.css" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          id="halla-gcc-fonts"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap"
        />
        {/* GCC theme: charcoal / off-white / champagne. Must load after marketing-apple.css. */}
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link id="halla-gcc-theme" rel="stylesheet" href="/halla-gcc-theme.css" />
        <link
          id="tabler-icons"
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.46.0/dist/tabler-icons.min.css"
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          id="halla-fonts"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&family=Cairo:wght@300;400;500;600;700;800;900&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        <MarketingProviders>{children}</MarketingProviders>
      </body>
    </html>
  );
}
