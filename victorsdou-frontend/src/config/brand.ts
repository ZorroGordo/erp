/**
 * White-label brand configuration
 * ─────────────────────────────────────────────────────
 * To deploy this ERP for a different client, update only
 * this file + tailwind.config.js (the `brand` color block).
 * All UI references the tokens below — no hard-coded names.
 */

export const brand = {
  /** Short name shown in sidebar and browser tab */
  name: 'VictorOS',

  /** Full name shown on the login screen */
  fullName: 'Victorsdou ERP',

  /** Tagline shown under the logo on login */
  tagline: 'Panadería artesanal · Sistema de gestión',

  /** Locale used for dates, currency formatting, etc. */
  locale: 'es-PE',

  /** ISO 4217 currency code */
  currency: 'PEN',

  /** Currency symbol displayed in tables */
  currencySymbol: 'S/',

  /** Country tax authority label */
  taxAuthority: 'SUNAT',

  /** E-invoice provider integration name */
  invoiceProvider: 'Nubefact',

  /** Emoji or icon fallback used before a real SVG logo is added */
  logoEmoji: '🌿',

  /**
   * Hex values mirror the Tailwind `brand` scale in tailwind.config.js
   * Use these when you need inline styles (e.g. chart colors).
   */
  colors: {
    50:  '#f8f3ec',
    100: '#ede6d9',
    200: '#e1dac9',
    300: '#cdc4b1',
    400: '#8ba57f',
    500: '#5c7552',
    600: '#4b6842',
    700: '#31452a',
    800: '#263820',
    900: '#1a2b17',
  },
} as const;

export type Brand = typeof brand;
