import type { Metadata } from "next";
import "./globals.css";
import { GlobalBackButton } from "./global-back-button";

export const metadata: Metadata = {
  title: "TradeWorx",
  description: "Fire inspection operations platform for tradeworx.net",
  applicationName: "TradeWorx",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "TradeWorx"
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon", sizes: "180x180", type: "image/png" }]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <GlobalBackButton />
        {children}
      </body>
    </html>
  );
}

