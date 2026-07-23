import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";
import { NativeDeeplinkListener } from "@/components/native-deeplink-listener";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Direct Cheers",
    startupImage: "/logo-emblem.png",
  },
  icons: {
    apple: "/icon-192.png",
  },
  other: {
    // Next.js 16のappleWebApp.capableはmobile-web-app-capableのみを出力するため、
    // iOSのスタンドアロン判定に必要なapple-mobile-web-app-capableを明示的に追加する
    "apple-mobile-web-app-capable": "yes",
  },
};

const geistSans = Geist({
  variable: "--font-geist-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" suppressHydrationWarning>
      <body className={`${geistSans.className} antialiased`}>
        <SwRegister />
        <NativeDeeplinkListener />
        {children}
      </body>
    </html>
  );
}
