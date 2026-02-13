// src/theme/ThemeContext.tsx
// React Context for theme tokens

import React, { createContext, useContext } from 'react';
import type { ThemeTokens } from './tokens';
import { darkTheme } from './dark';

const ThemeContext = createContext<ThemeTokens>(darkTheme);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = darkTheme;
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeTokens {
  return useContext(ThemeContext);
}

export function useColors() {
  return useContext(ThemeContext).colors;
}
