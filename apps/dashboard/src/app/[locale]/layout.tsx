import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Arabic, Noto_Sans_Devanagari } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { notFound } from "next/navigation";
import { routing } from "@/i18n/routing";
import { Providers } from "@/components/providers";
import "../globals.css";

const inter = Inter({ subsets: ["latin", "cyrillic"], variable: "--font-sans" });
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
});
const notoSansDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-devanagari",
});

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

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const dir = locale === "ar" ? "rtl" : "ltr";

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <head>
        <script>{themeInitScript}</script>
      </head>
      <body
        className={`${inter.variable} ${ibmPlexSansArabic.variable} ${notoSansDevanagari.variable} ${locale === "ar" ? "font-arabic" : "font-sans"} min-h-screen`}
        suppressHydrationWarning
      >
        <NextIntlClientProvider>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
