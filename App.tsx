// App.tsx
// Main application entry point

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import RootNavigator from './src/navigation/RootNavigator';
import { initDatabase } from './src/db/database';
import { initNotifications } from './src/services/notifications';
import { isOnboardingComplete, setOnboardingComplete } from './src/settings/storage';
import { updateUserProgress } from './src/db/queries/progress';
import { ThemeProvider } from './src/theme';
import { darkTheme } from './src/theme';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import OnboardingScreen from './src/screens/OnboardingScreen';

const c = darkTheme.colors;

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      console.log('[App] Initializing database...');
      await initDatabase();
      console.log('[App] Database initialized');
      // Initialize notifications (non-blocking)
      initNotifications().catch(e => console.warn('[App] Notification init error:', e));
      // Check onboarding
      const onboarded = await isOnboardingComplete();
      if (!onboarded) {
        setShowOnboarding(true);
      }
      setIsReady(true);
    } catch (e) {
      console.error('[App] Initialization error:', e);
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={c.bg} />
        <Text style={styles.errorEmoji}>😿</Text>
        <Text style={styles.errorTitle}>启动失败</Text>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!isReady) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={c.bg} />
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={styles.loadingText}>正在启动...</Text>
      </View>
    );
  }

  const handleOnboardingComplete = async (level?: number) => {
    if (level) {
      await updateUserProgress({ currentLevel: level });
    }
    await setOnboardingComplete();
    setShowOnboarding(false);
  };

  if (showOnboarding) {
    return (
      <ErrorBoundary>
        <StatusBar barStyle="light-content" backgroundColor={c.bg} />
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <StatusBar barStyle="light-content" backgroundColor={c.bg} />
        <RootNavigator />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.bg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: c.textMuted,
    fontSize: 16,
  },
  errorEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: c.textPrimary,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: c.textMuted,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
