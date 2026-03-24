import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata = {
  title: {
    default: "Direct Cheers | ライブの感動を、スマホのウォレットへ",
    template: "%s | Direct Cheers",
  },
  description: "会場のQRコードから応援を贈り、ライブ演出をハックする。応援の証はシリアル入りのデジタルカードとして、あなたのスマホのウォレットに直接届きます。",
  metadataBase: new URL("https://direct-cheers.com"), // 本番ドメインに合わせて変更してください
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
    <html lang="en" suppressHydrationWarning>
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
