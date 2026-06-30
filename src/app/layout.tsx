import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ButtonPressSwap } from "@/components/button-press-swap";
import { SPLICE_TAGLINE } from "@/components/splice-brand";
import { PRODUCTION_APP_ORIGIN } from "@/lib/app-url";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(PRODUCTION_APP_ORIGIN),
  title: "Splice",
  description: `${SPLICE_TAGLINE} Club dinghy racing for sailors, admins, and race officers.`,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <ButtonPressSwap />
        {children}
      </body>
    </html>
  );
}
