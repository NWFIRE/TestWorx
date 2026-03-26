import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TradeWorx",
    short_name: "TradeWorx",
    description: "Fire inspection operations platform for tradeworx.net",
    start_url: "/app",
    display: "standalone",
    background_color: "#08111F",
    theme_color: "#0B1730",
    icons: [
      {
        src: "/icon.svg",
        type: "image/svg+xml",
        sizes: "any"
      },
      {
        src: "/apple-icon",
        type: "image/png",
        sizes: "180x180",
        purpose: "any"
      }
    ]
  };
}
