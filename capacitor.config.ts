import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = process.env.CAPACITOR_SERVER_URL?.trim() || "https://www.tradeworx.net/app/tech";

const config: CapacitorConfig = {
  appId: "net.tradeworx.technician",
  appName: "TradeWorx Technician",
  webDir: "apps/web/.next",
  bundledWebRuntime: false,
  server: {
    url: serverUrl,
    cleartext: false,
    allowNavigation: ["tradeworx.net", "*.tradeworx.net"]
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#08111F",
      showSpinner: false
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#FFFFFF"
    }
  },
  ios: {
    contentInset: "always"
  }
};

export default config;
