import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

// VercelのプレビューURLまたは本番URLを取得
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://direct-cheers.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
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
    images: [
      {
        url: "/ogp-main.png", // public/ogp-main.png を参照
        width: 1200,
        height: 630,
        alt: "Direct Cheers Service Preview",
      },
    ],
  },
  
  twitter: {
    card: "summary_large_image",
    title: {
      default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
      template: "%s | Direct Cheers",
    },
    description: "ライブ演出をハックして、デジタルアセットを手に入れろ。",
    images: ["/ogp-main.png"], 
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
        </ThemeProvider>
      </body>
    </html>
  );
}