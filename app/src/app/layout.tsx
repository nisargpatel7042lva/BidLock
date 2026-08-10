import type { Metadata } from "next";
import { Cormorant_Garamond, JetBrains_Mono, Outfit } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BidLock — Seal. Reveal. Converge.",
  description:
    "Groups reach a fair shared decision by sealing their honest input first, so no one anchors on anyone else, then converging together, live, on Solana.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${cormorant.variable} ${jetbrains.variable} ${outfit.variable}`}
    >
      <body style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
