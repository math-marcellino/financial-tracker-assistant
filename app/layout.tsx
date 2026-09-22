import type { Metadata } from "next";
import { Inter, Space_Grotesk, Space_Mono } from "next/font/google";
import { Providers } from "@/app/providers";
import "./globals.css";

// Display. DESIGN.md names CohereText (proprietary) with Space Grotesk as the first
// documented fallback — the "almost monospaced in spirit" display voice.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Body / UI. DESIGN.md names Unica77 (proprietary) with Inter as the fallback.
const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Technical labels. DESIGN.md names CohereMono; its listed fallbacks aren't actually
// monospaced, so Space Mono is used instead — same superfamily as the display face.
const spaceMono = Space_Mono({
  variable: "--font-mono-label",
  subsets: ["latin"],
  weight: ["400"],
});

export const metadata: Metadata = {
  title: "Financial tracker",
  description: "Log income and expenses in plain language.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${spaceMono.variable} h-full antialiased`}
    >
      <body className="flex h-full flex-col overflow-clip">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
