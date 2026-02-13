// src/theme/dark.ts
// Dark theme token values (current default)

import type { ThemeTokens } from './tokens';

export const darkTheme: ThemeTokens = {
  colors: {
    bg: '#0F0F1A',
    bgCard: '#1A1A2E',
    bgCardAlt: '#151525',
    bgInput: '#252538',
    bgHover: '#2A2A3E',
    bgOverlay: 'rgba(0,0,0,0.6)',

    primary: '#FF6B9D',
    primaryAlpha10: 'rgba(255,107,157,0.1)',
    primaryAlpha20: 'rgba(255,107,157,0.2)',

    success: '#4CAF50',
    successLight: '#66BB6A',
    successAlpha10: 'rgba(76,175,80,0.1)',
    successAlpha15: 'rgba(76,175,80,0.15)',
    successAlpha20: 'rgba(76,175,80,0.2)',
    successAlpha30: 'rgba(76,175,80,0.3)',

    warning: '#FF9800',
    warningLight: '#FFB800',

    error: '#F44336',
    errorLight: '#FF5252',
    errorAlpha10: 'rgba(244,67,54,0.1)',
    errorAlpha15: 'rgba(244,67,54,0.15)',
    errorAlpha20: 'rgba(244,67,54,0.2)',
    errorBright: '#FF4444',

    accent: '#9C27B0',
    accentAlpha10: 'rgba(156,39,176,0.1)',
    accentAlpha15: 'rgba(156,39,176,0.15)',
    accentAlpha20: 'rgba(156,39,176,0.2)',

    cyan: '#00BCD4',
    cyanAlpha10: 'rgba(0,188,212,0.1)',
    cyanAlpha20: 'rgba(0,188,212,0.2)',

    gold: '#FFD700',
    blue: '#64B5F6',

    textPrimary: '#ffffff',
    textSecondary: '#aaaaaa',
    textMuted: '#888888',
    textSubtle: '#666666',
    textDim: '#555555',
    textWhiteAlpha70: 'rgba(255,255,255,0.7)',

    border: '#333333',
    borderSubtle: '#222222',
    borderInput: '#2A2A3E',
    divider: '#2A2A3E',

    heatmap0: '#1A1A2E',
    heatmap1: '#C8E6C9',
    heatmap2: '#A5D6A7',
    heatmap3: '#81C784',
    heatmap4: '#66BB6A',
    heatmap5: '#4CAF50',
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    safe: 60,
  },
  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    pill: 999,
  },
  typography: {
    heading1: { fontSize: 28, fontWeight: 'bold' },
    heading2: { fontSize: 22, fontWeight: 'bold' },
    heading3: { fontSize: 18, fontWeight: 'bold' },
    body: { fontSize: 16, fontWeight: 'normal' },
    bodySmall: { fontSize: 14, fontWeight: 'normal' },
    caption: { fontSize: 12, fontWeight: 'normal' },
    micro: { fontSize: 10, fontWeight: 'normal' },
    label: { fontSize: 14, fontWeight: '600' },
  },
};
