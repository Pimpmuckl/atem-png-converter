import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class", // Enable class-based dark mode
  content: [
    // Paths relative to the root directory, pointing into 'app/src'
    "./app/src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/src/app/**/*.{js,ts,jsx,tsx,mdx}", 
  ],
  theme: {
    extend: {
      // You can add dark theme color extensions here later if needed
    },
  },
  plugins: [],
};
export default config;
