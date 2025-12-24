import type { Metadata } from "next";
import { Newsreader, Space_Grotesk } from "next/font/google";

import "./globals.css";

const displayFont = Newsreader({
  subsets: ["latin"],
  variable: "--font-display",
});

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "ShelfSync",
  description: "Find library availability for your Goodreads shelves."
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${displayFont.variable} ${bodyFont.variable} bg-[var(--paper)] text-[var(--ink)] antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
