import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://usemocha.app"),
  title: "Mocha — The interview that adapts to you.",
  description:
    "Practice with an adaptive interview. Mocha listens to the answer you gave and asks the follow-up that decides it.",
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title: "Mocha — The interview that adapts to you.",
    description:
      "Practice with an adaptive interview. Mocha listens to the answer you gave and asks the follow-up that decides it.",
    url: "https://usemocha.app",
    siteName: "Mocha",
    type: "website",
    images: [
      {
        url: "/og/landing.png",
        width: 1200,
        height: 630,
        alt: "Mocha. The interview that adapts to you.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mocha — The interview that adapts to you.",
    description:
      "Practice with an adaptive interview. Mocha listens to the answer you gave and asks the follow-up that decides it.",
    images: ["/og/landing.png"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <body className={`${geist.className} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
