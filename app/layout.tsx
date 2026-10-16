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

const title = "Mocha | Adaptive AI Interview Simulator";
const description =
  "Prepare for consulting, banking, tech, and more with Mocha. Practice realistic AI interviews, receive adaptive follow-up questions, and improve with personalized feedback.";

export const metadata: Metadata = {
  metadataBase: new URL("https://usemocha.app"),
  title,
  description,
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.png", type: "image/png", sizes: "256x256" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
  openGraph: {
    title,
    description,
    url: "https://usemocha.app/",
    siteName: "Mocha",
    type: "website",
    images: [
      {
        url: "/og/landing.png",
        width: 1200,
        height: 630,
        alt: title,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
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
