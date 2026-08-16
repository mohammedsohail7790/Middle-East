import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import "../globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Halla AI – Smart • Seamless • Always",
  description:
    "Halla AI answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.hallaai.com"),
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('halla_theme')||localStorage.getItem('calliq_theme');document.documentElement.classList.remove('light','dark');document.documentElement.classList.add(t==='dark'?'dark':'light');}catch(e){document.documentElement.classList.add('light');}})();`;

export default function MarketingRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{themeInitScript}</script>
      </head>
      <body className={`${inter.variable} font-sans min-h-screen`} suppressHydrationWarning>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
