import type { Metadata } from "next";
import { NextIntlClientProvider } from "@/components/intl-provider";
import { getMessages } from "next-intl/server";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { routing } from "@/i18n/routing";
import { notFound } from "next/navigation";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Direct Cheers",
    template: "%s | Direct Cheers",
  },
  description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はシリアル入りのデジタルカードとして、あなたのスマホのウォレットに直接届きます。",
  openGraph: {
    title: {
      default: "Direct Cheers",
      template: "%s | Direct Cheers",
    },
    description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はあなたのウォレットへ。",
    url: siteUrl,
    siteName: "Direct Cheers",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Direct Cheers",
      template: "%s | Direct Cheers",
    },
    description: "ライブ演出をハックして、デジタルアセットを手に入れろ。",
  },
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as any)) {
    notFound();
  }

  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <ThemeProvider
        attribute="class"
        defaultTheme="dark"
        enableSystem={false}
        disableTransitionOnChange
      >
        {children}
        <Toaster position="bottom-center" richColors />
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
