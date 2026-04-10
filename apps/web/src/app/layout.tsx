import type { Metadata } from "next";
import { auth } from "@/auth";
import { buildTenantBrandingCss, getTenantBrandingSettings } from "@testworx/lib";
import { cookies } from "next/headers";
import "./globals.css";
import { GlobalBackButton } from "./global-back-button";
import { ToastProvider } from "./toast-provider";

const BRAND_PRIMARY_COOKIE = "tradeworx_brand_primary";
const BRAND_ACCENT_COOKIE = "tradeworx_brand_accent";

function readColorCookie(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return /^#(?:[0-9a-fA-F]{3}){1,2}$/i.test(trimmed) ? trimmed : null;
}

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
    icon: [{ url: "/icon.png", sizes: "1024x1024", type: "image/png" }],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const session = await auth().catch(() => null);
  let theme: React.CSSProperties | undefined;

  if (session?.user?.tenantId) {
    try {
      const brandingSettings = await getTenantBrandingSettings({
        userId: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId
      });
      theme = buildTenantBrandingCss(brandingSettings.branding);
    } catch {
      theme = undefined;
    }
  }

  if (!theme) {
    const primaryColor = readColorCookie(cookieStore.get(BRAND_PRIMARY_COOKIE)?.value);
    const accentColor = readColorCookie(cookieStore.get(BRAND_ACCENT_COOKIE)?.value);
    if (primaryColor || accentColor) {
      theme = buildTenantBrandingCss({
        logoDataUrl: "",
        primaryColor: primaryColor ?? "#1E3A5F",
        accentColor: accentColor ?? "#C2410C",
        legalBusinessName: "",
        phone: "",
        email: "",
        website: "",
        addressLine1: "",
        addressLine2: "",
        city: "",
        state: "",
        postalCode: ""
      });
    }
  }

  return (
    <html lang="en">
      <body style={theme}>
        <ToastProvider>
          <GlobalBackButton />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

