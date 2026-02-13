// src/screens/AchievementsScreen.tsx
// Achievement gallery screen

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    TouchableOpacity,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';
import { ACHIEVEMENTS, CATEGORY_LABELS, type AchievementCategory, type AchievementDef } from '../engine/achievements';
import { getUnlockedAchievements } from '../engine/achievementChecker';

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
    },
    scrollContent: {
        padding: 16,
        paddingTop: 60,
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: c.textPrimary,
    },
    backButton: {
        backgroundColor: c.bgCard,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
    },
    backButtonText: {
        color: c.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    progressCard: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 24,
    },
    progressText: {
        fontSize: 32,
        fontWeight: 'bold',
        color: c.gold,
        marginBottom: 4,
    },
    progressLabel: {
        fontSize: 14,
        color: c.textMuted,
    },
    progressBar: {
        width: '100%',
        height: 6,
        backgroundColor: c.border,
        borderRadius: 3,
        marginTop: 12,
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        backgroundColor: c.gold,
        borderRadius: 3,
    },
    categoryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textSecondary,
        marginBottom: 12,
        marginTop: 8,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    card: {
        width: '48%',
        backgroundColor: c.bgCard,
        borderRadius: 14,
        padding: 14,
        minHeight: 100,
    },
    cardUnlocked: {
        borderWidth: 1,
        borderColor: c.gold,
    },
    cardLocked: {
        opacity: 0.5,
    },
    cardIcon: {
        fontSize: 28,
        marginBottom: 6,
    },
    cardIconLocked: {
        fontSize: 28,
        marginBottom: 6,
    },
    cardName: {
        fontSize: 14,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 2,
    },
    cardDesc: {
        fontSize: 11,
        color: c.textMuted,
        lineHeight: 16,
    },
    cardDate: {
        fontSize: 10,
        color: c.textSubtle,
        marginTop: 6,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
});

export default function AchievementsScreen() {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [unlockedMap, setUnlockedMap] = useState<Map<string, number>>(new Map());

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const unlocked = await getUnlockedAchievements();
            const map = new Map<string, number>();
            for (const u of unlocked) {
                map.set(u.achievementId, u.unlockedAt);
            }
            setUnlockedMap(map);
        } catch (e) {
            console.error('[Achievements] Load error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    const total = ACHIEVEMENTS.length;
    const unlocked = unlockedMap.size;

    // Group by category
    const categories: AchievementCategory[] = ['streak', 'session', 'mastery', 'vocab', 'special'];
    const grouped = new Map<AchievementCategory, AchievementDef[]>();
    for (const cat of categories) {
        grouped.set(cat, ACHIEVEMENTS.filter(a => a.category === cat));
    }

    const formatDate = (ts: number) => {
        const d = new Date(ts);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>成就</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>返回</Text>
                </TouchableOpacity>
            </View>

            <View style={styles.progressCard}>
                <Text style={styles.progressText}>{unlocked}/{total}</Text>
                <Text style={styles.progressLabel}>已解锁</Text>
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(unlocked / total) * 100}%` }]} />
                </View>
            </View>

            {categories.map(cat => {
                const items = grouped.get(cat) ?? [];
                if (items.length === 0) return null;

                return (
                    <View key={cat}>
                        <Text style={styles.categoryTitle}>{CATEGORY_LABELS[cat]}</Text>
                        <View style={styles.grid}>
                            {items.map(ach => {
                                const isUnlocked = unlockedMap.has(ach.id);
                                const unlockedAt = unlockedMap.get(ach.id);

                                return (
                                    <View
                                        key={ach.id}
                                        style={[
                                            styles.card,
                                            isUnlocked ? styles.cardUnlocked : styles.cardLocked,
                                        ]}
                                    >
                                        <Text style={isUnlocked ? styles.cardIcon : styles.cardIconLocked}>
                                            {isUnlocked ? ach.icon : '🔒'}
                                        </Text>
                                        <Text style={styles.cardName}>{ach.name}</Text>
                                        <Text style={styles.cardDesc}>{ach.description}</Text>
                                        {isUnlocked && unlockedAt && (
                                            <Text style={styles.cardDate}>{formatDate(unlockedAt)}</Text>
                                        )}
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                );
            })}
        </ScrollView>
    );
}
