import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Mocha — The interview that adapts to you.",
  description:
    "A design prototype for Mocha. Practice with adaptive AI interviews, get role-specific feedback, and turn every answer into measurable improvement.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={outfit.variable}>
      <body className={`${outfit.className} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
