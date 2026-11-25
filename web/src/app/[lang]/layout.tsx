import type { Metadata } from "next";
import { Fraunces, Geist } from "next/font/google";

import { Backdrop } from "@/components/backdrop";
import { LocaleProvider } from "@/components/locale";
import { ScrollMemory } from "@/components/scroll-memory";
import { SiteHeader } from "@/components/site-header";
import { dict, LOCALES } from "@/lib/i18n";
import { getLocale } from "@/lib/locale-server";

import "../globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-fraunces", subsets: ["latin"], weight: ["600", "700"] });

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const t = dict(await getLocale());
  return {
    title: t.meta.title,
    description: t.meta.description,
    alternates: { languages: { en: "/en", de: "/de" } },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  const lang = await getLocale();
  return (
    <html lang={lang} className={`${geistSans.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <Backdrop />
        <ScrollMemory />
        <LocaleProvider lang={lang}>
          <SiteHeader lang={lang} />
          <div className="page-body flex-1 pb-10">{children}</div>
        </LocaleProvider>
      </body>
    </html>
  );
}
