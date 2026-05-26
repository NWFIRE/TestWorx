import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#07111F",
        ember: "rgb(var(--tenant-accent-rgb) / <alpha-value>)",
        mist: "#B9C7D8",
        line: "rgb(var(--line-rgb, 185 199 216) / <alpha-value>)",
        slateblue: "rgb(var(--tenant-primary-rgb) / <alpha-value>)",
        paper: "#E9EEF6",
        surface: "rgb(var(--surface-rgb, 255 255 255) / <alpha-value>)"
      },
      boxShadow: {
        panel: "0 24px 54px rgba(9, 18, 32, 0.13)",
        soft: "0 16px 36px rgba(9, 18, 32, 0.10)",
        crisp: "0 1px 0 rgba(255,255,255,0.8) inset, 0 18px 42px rgba(9,18,32,0.11)"
      }
    }
  },
  plugins: []
};

export default config;

