import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        ember: "rgb(var(--tenant-accent-rgb) / <alpha-value>)",
        mist: "#CBD5E1",
        line: "rgb(var(--line-rgb, 203 215 230) / <alpha-value>)",
        slateblue: "rgb(var(--tenant-primary-rgb) / <alpha-value>)",
        paper: "#F3F6FB",
        surface: "rgb(var(--surface-rgb, 255 255 255) / <alpha-value>)"
      },
      boxShadow: {
        panel: "0 22px 48px rgba(15, 23, 42, 0.08)",
        soft: "0 14px 34px rgba(15, 23, 42, 0.06)"
      }
    }
  },
  plugins: []
};

export default config;

