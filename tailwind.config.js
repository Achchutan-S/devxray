/**
 * Every colour is a semantic token backed by a CSS custom property (see src/index.css).
 * Components never name a raw palette colour, so light and dark both work natively
 * and neither theme needs override CSS.
 *
 * Tokens are stored as space-separated RGB channels so Tailwind's <alpha-value>
 * placeholder keeps working (`bg-surface/50`, `text-fg-muted/70`, ...).
 */
const token = (name) => `rgb(var(--dx-${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: token('canvas'),
        surface: {
          DEFAULT: token('surface'),
          raised: token('surface-raised'),
          sunken: token('surface-sunken'),
        },
        line: {
          DEFAULT: token('line'),
          strong: token('line-strong'),
        },
        fg: {
          DEFAULT: token('fg'),
          muted: token('fg-muted'),
          subtle: token('fg-subtle'),
        },
        accent: {
          DEFAULT: token('accent'),
          hover: token('accent-hover'),
          soft: token('accent-soft'),
          on: token('on-accent'),
        },
        danger: {
          DEFAULT: token('danger'),
          soft: token('danger-soft'),
        },
        warning: {
          DEFAULT: token('warning'),
          soft: token('warning-soft'),
        },
        success: {
          DEFAULT: token('success'),
          soft: token('success-soft'),
        },
        overlay: token('overlay'),
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      zIndex: {
        banner: '70',
      },
    },
  },
  plugins: [],
};
