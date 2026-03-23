import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#12211c",
        mist: "#f6f1e8",
        moss: "#0f8b6d",
        pine: "#11342d",
        sand: "#eadfcf",
        coral: "#be5c4b"
      },
      boxShadow: {
        soft: "0 22px 60px rgba(17, 52, 45, 0.14)"
      }
    }
  },
  plugins: []
};

export default config;
