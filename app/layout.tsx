import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

// 🔥 元のソースの title, description, metadataBase を維持しつつ、OGP設定を完全統合
export const metadata: Metadata = {
  metadataBase: new URL("https://direct-cheers.com"),
  title: {
    default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
    template: "%s | Direct Cheers",
  },
  description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はシリアル入りのデジタルカードとして、あなたのスマホのウォレットに直接届きます。",
  
  // 🔥 SNS（Open Graph）用設定：LINEやDiscordでの見栄えを支配する
  openGraph: {
    title: {
      default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
      template: "%s | Direct Cheers",
    },
    description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はあなたのウォレットへ。",
    url: defaultUrl,
    siteName: "Direct Cheers",
    locale: "ja_JP",
    type: "website",
    images: [
      {
        url: "/ogp-main.png", // 💡 public/ogp-main.png を参照
        width: 1200,
        height: 630,
        alt: "Direct Cheers Service Preview",
      },
    ],
  },
  
  // 🔥 X (Twitter) 用設定：タイムラインで画像を大きく表示させる
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
    // 💡 日本語サイトとして正しく認識させるため lang="ja" に変更
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