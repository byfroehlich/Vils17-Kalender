import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Größere Basis-Schriftgrößen für bessere Lesbarkeit (Mama-freundlich)
        base: ["1.125rem", { lineHeight: "1.75rem" }], // 18px statt 16px
        lg: ["1.25rem", { lineHeight: "1.875rem" }],   // 20px
        xl: ["1.375rem", { lineHeight: "2rem" }],       // 22px
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],  // 28px
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        // Status-Farben für Reinigung und Wäsche
        status: {
          "cleaning-open": "#f97316",      // orange-500
          "cleaning-assigned": "#3b82f6",  // blue-500
          "cleaning-done": "#22c55e",      // green-500
          "laundry-open": "#ef4444",       // red-500
          "laundry-ordered": "#eab308",    // yellow-500
          "laundry-available": "#22c55e",  // green-500
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        // Minimum Touch-Target 48px
        "touch": "3rem",
      },
    },
  },
  plugins: [animate],
};

export default config;
