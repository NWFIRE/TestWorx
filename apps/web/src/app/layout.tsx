import type { Metadata } from "next";
import "./globals.css";
import { GlobalBackButton } from "./global-back-button";

export const metadata: Metadata = {
  title: "TradeWorx",
  description: "Fire inspection operations platform for tradeworx.net"
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

