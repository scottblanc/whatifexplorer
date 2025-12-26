import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Zone colors from design
        'zone-monetary': '#3B82F6',
        'zone-financial': '#8B5CF6',
        'zone-prices': '#F59E0B',
        'zone-real': '#10B981',
      },
    },
  },
  plugins: [],
};

export default config;
