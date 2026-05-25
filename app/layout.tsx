import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { SwRegister } from "@/components/sw-register";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

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
    apple: "/logo-emblem.png",
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
        {children}
      </body>
    </html>
  );
}
