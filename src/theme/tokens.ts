// src/theme/tokens.ts
// Centralized design token type definitions

export interface ColorTokens {
  // Backgrounds
  bg: string;
  bgCard: string;
  bgCardAlt: string;
  bgInput: string;
  bgHover: string;
  bgOverlay: string;

  // Brand / Primary
  primary: string;
  primaryAlpha10: string;
  primaryAlpha20: string;

  // Semantic
  success: string;
  successLight: string;
  successAlpha10: string;
  successAlpha15: string;
  successAlpha20: string;
  successAlpha30: string;

  warning: string;
  warningLight: string;

  error: string;
  errorLight: string;
  errorAlpha10: string;
  errorAlpha15: string;
  errorAlpha20: string;
  errorBright: string;

  // Accent
  accent: string;
  accentAlpha10: string;
  accentAlpha15: string;
  accentAlpha20: string;

  cyan: string;
  cyanAlpha10: string;
  cyanAlpha20: string;

  gold: string;
  blue: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textSubtle: string;
  textDim: string;
  textWhiteAlpha70: string;

  // Border / Divider
  border: string;
  borderSubtle: string;
  borderInput: string;
  divider: string;

  // Heatmap
  heatmap0: string;
  heatmap1: string;
  heatmap2: string;
  heatmap3: string;
  heatmap4: string;
  heatmap5: string;
}

export interface SpacingTokens {
  xs: number;    // 4
  sm: number;    // 8
  md: number;    // 12
  lg: number;    // 16
  xl: number;    // 20
  xxl: number;   // 24
  xxxl: number;  // 32
  safe: number;  // 60
}

export interface RadiusTokens {
  sm: number;    // 8
  md: number;    // 12
  lg: number;    // 16
  xl: number;    // 20
  xxl: number;   // 24
  pill: number;  // 999
}

export interface TypographyTokens {
  heading1: { fontSize: number; fontWeight: 'bold' };
  heading2: { fontSize: number; fontWeight: 'bold' };
  heading3: { fontSize: number; fontWeight: 'bold' };
  body: { fontSize: number; fontWeight: 'normal' };
  bodySmall: { fontSize: number; fontWeight: 'normal' };
  caption: { fontSize: number; fontWeight: 'normal' };
  micro: { fontSize: number; fontWeight: 'normal' };
  label: { fontSize: number; fontWeight: '600' };
}

export interface ThemeTokens {
  colors: ColorTokens;
  spacing: SpacingTokens;
  radius: RadiusTokens;
  typography: TypographyTokens;
}
