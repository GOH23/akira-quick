import type { Metadata } from "next";

import "./globals.css";
import BackgroundPattern from "./ui/BackgroundPattern";
import { LocaleProvider } from "../i18n/LocaleProvider";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Akira Quick - AI MMD Animation Generator from Video & Text",
  description: "Transform videos into MMD animations with AI. Motion capture, text-to-pose generation, and MMD export. Create professional animations automatically.",
  keywords: "AI animation, MMD generator, video motion capture, text to animation, AI character animation, motion tracking, MMD model, character animation, artificial intelligence animation, video to animation, text to pose, AI motion capture, MMD export, automatic animation",
  openGraph: {
    title: "Akira Quick - AI MMD Animation Generator",
    description: "Revolutionary AI tool for creating MMD animations. Upload video or describe pose with text - get ready animation!",
    type: "website",
    images: [
      {
        url: "/i.webp",
        width: 1200,
        height: 630,
        alt: "Akira Quick - AI MMD Animation Generator"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Akira Quick - AI MMD Animation Generator",
    description: "Create MMD animations from video and text with AI. Motion capture, pose generation, MMD export.",

  },
  icons: {
    icon: "/i.webp",
    shortcut: "/i.webp",
    apple: "/i.webp"
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>

      <body className="bg-[#0a0a0a80] text-white min-h-screen">
        <Script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js" strategy="beforeInteractive" crossOrigin="anonymous"></Script>
        <LocaleProvider>
          <BackgroundPattern />
          <div className="backdrop-blur-none transition-all duration-300 relative">
            {children}
          </div>
        </LocaleProvider>

      </body>
    </html>
  );
}
