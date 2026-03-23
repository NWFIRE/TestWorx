import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}", "../../packages/ui/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0F172A",
        ember: "rgb(var(--tenant-accent-rgb) / <alpha-value>)",
        mist: "#E2E8F0",
        slateblue: "rgb(var(--tenant-primary-rgb) / <alpha-value>)",
        paper: "#F8FAFC"
      },
      boxShadow: {
        panel: "0 20px 45px rgba(15, 23, 42, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

