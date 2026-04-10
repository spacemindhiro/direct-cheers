import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Direct Cheers",
  },
  title: {
    default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
    template: "%s | Direct Cheers",
  },
  description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はシリアル入りのデジタルカードとして、あなたのスマホのウォレットに直接届きます。",
  
  openGraph: {
    title: {
      default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
      template: "%s | Direct Cheers",
    },
    description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はあなたのウォレットへ。",
    url: siteUrl,
    siteName: "Direct Cheers",
    locale: "ja_JP",
    type: "website",
    // 💡 imagesプロパティをあえて削除。
    // app/opengraph-image.png がある場合、Next.jsが自動で最適なタグを生成します。
  },
  
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
      template: "%s | Direct Cheers",
    },
    description: "ライブ演出をハックして、デジタルアセットを手に入れろ。",
    // 💡 twitter用もファイルベース（app/twitter-image.png）に任せるため削除。
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
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="bottom-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}