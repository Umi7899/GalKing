// src/components/AchievementToast.tsx
// Animated toast notification for achievement unlocks

import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { darkTheme } from '../theme/dark';
import type { AchievementDef } from '../engine/achievements';

interface Props {
  achievement: AchievementDef;
  onDismiss: () => void;
}

const c = darkTheme.colors;

export default function AchievementToast({ achievement, onDismiss }: Props) {
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);

  useEffect(() => {
    // Slide in
    translateY.value = withSpring(0, { damping: 15, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 300 });

    // Auto dismiss after 3s
    translateY.value = withDelay(3000,
      withTiming(-120, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      })
    );
    opacity.value = withDelay(3000, withTiming(0, { duration: 300 }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View style={[styles.container, animatedStyle]}>
      <View style={styles.content}>
        <Text style={styles.icon}>{achievement.icon}</Text>
        <View style={styles.textContainer}>
          <Text style={styles.label}>成就解锁！</Text>
          <Text style={styles.name}>{achievement.name}</Text>
          <Text style={styles.description}>{achievement.description}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.bgCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: c.gold,
    shadowColor: c.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    gap: 12,
  },
  icon: {
    fontSize: 36,
  },
  textContainer: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    color: c.gold,
    fontWeight: '600',
    marginBottom: 2,
  },
  name: {
    fontSize: 16,
    fontWeight: 'bold',
    color: c.textPrimary,
    marginBottom: 2,
  },
  description: {
    fontSize: 12,
    color: c.textMuted,
  },
});
