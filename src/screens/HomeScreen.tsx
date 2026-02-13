// src/screens/HomeScreen.tsx
// Home/Today screen with training entry point

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';

import { initDatabase, importDataset, needsImport } from '../db/database';
import { getUserProgress, getReviewCounts } from '../db/queries/progress';
import { getLesson, getGrammarPoint } from '../db/queries/content';
import { getTodaySession, getTodayCompletedSession, parseResult } from '../db/queries/sessions';
import { getSessionStats } from '../db/queries/sessions';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>;

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
    },
    scrollContent: {
        padding: 20,
        paddingTop: 60,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: c.textMuted,
        fontSize: 16,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
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
        marginBottom: 24,
    },
    retryButton: {
        backgroundColor: c.primary,
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 24,
    },
    retryButtonText: {
        color: c.textPrimary,
        fontWeight: '600',
    },
    header: {
        marginBottom: 24,
    },
    greeting: {
        fontSize: 28,
        fontWeight: 'bold',
        color: c.textPrimary,
        marginBottom: 4,
    },
    date: {
        fontSize: 14,
        color: c.textMuted,
    },
    statsCard: {
        flexDirection: 'row',
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 20,
        marginBottom: 16,
    },
    statItem: {
        flex: 1,
        alignItems: 'center',
    },
    statValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: c.primary,
    },
    statLabel: {
        fontSize: 12,
        color: c.textMuted,
        marginTop: 4,
    },
    statDivider: {
        width: 1,
        backgroundColor: c.border,
        marginHorizontal: 20,
    },
    focusCard: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
        borderLeftWidth: 4,
        borderLeftColor: c.primary,
    },
    focusLabel: {
        fontSize: 12,
        color: c.textMuted,
        marginBottom: 8,
    },
    focusLesson: {
        fontSize: 18,
        fontWeight: 'bold',
        color: c.textPrimary,
        marginBottom: 4,
    },
    focusGrammar: {
        fontSize: 14,
        color: c.primary,
    },
    startButton: {
        backgroundColor: c.primary,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
        shadowColor: c.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
    },
    startButtonEmoji: {
        fontSize: 36,
        marginBottom: 8,
    },
    startButtonText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: c.textPrimary,
    },
    resumeHint: {
        fontSize: 12,
        color: c.textWhiteAlpha70,
        marginTop: 4,
    },
    completedCard: {
        backgroundColor: c.bgCard,
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 2,
        borderColor: c.success,
    },
    completedEmoji: {
        fontSize: 32,
        marginBottom: 8,
    },
    completedTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: c.success,
        marginBottom: 4,
    },
    completedText: {
        fontSize: 14,
        color: c.textMuted,
        marginBottom: 16,
    },
    reviewButton: {
        backgroundColor: c.border,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 16,
    },
    reviewButtonText: {
        color: c.textPrimary,
        fontWeight: '600',
    },
    quickActions: {
        marginTop: 8,
    },
    quickActionsTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textMuted,
        marginBottom: 12,
    },
    quickActionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 8,
    },
    quickActionButton: {
        width: '31%',
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        marginBottom: 4,
    },
    quickActionEmoji: {
        fontSize: 24,
        marginBottom: 8,
    },
    quickActionText: {
        fontSize: 12,
        color: c.textMuted,
    },
    reviewEntryCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: c.cyan,
    },
    reviewEntryLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    reviewEntryEmoji: {
        fontSize: 24,
    },
    reviewEntryTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.cyan,
    },
    reviewEntryCount: {
        fontSize: 12,
        color: c.textMuted,
        marginTop: 2,
    },
    reviewEntryArrow: {
        fontSize: 20,
        color: c.cyan,
    },
});

export default function HomeScreen() {
    const navigation = useNavigation<NavigationProp>();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // State
    const [lessonTitle, setLessonTitle] = useState('');
    const [grammarName, setGrammarName] = useState('');
    const [level, setLevel] = useState(1);
    const [streak, setStreak] = useState(0);
    const [hasIncomplete, setHasIncomplete] = useState(false);
    const [todayCompleted, setTodayCompleted] = useState(false);
    const [todayStars, setTodayStars] = useState(0);
    const [reviewCount, setReviewCount] = useState(0);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);

            // Reset states for refresh
            setTodayCompleted(false);
            setHasIncomplete(false);
            setTodayStars(0);

            // Initialize database
            await initDatabase();

            // Check and import dataset if needed
            if (await needsImport()) {
                console.log('[Home] Importing dataset...');
                const result = await importDataset();
                if (!result.success) {
                    throw new Error(result.error || 'Import failed');
                }
                console.log('[Home] Dataset imported successfully');
            }

            // Load progress
            const progress = await getUserProgress();
            setLevel(progress.currentLevel);
            setStreak(progress.streakDays);

            // Load current lesson and grammar
            const lesson = await getLesson(progress.currentLessonId);
            if (lesson) {
                setLessonTitle(lesson.title);

                if (lesson.grammarIds.length > progress.currentGrammarIndex) {
                    const grammarId = lesson.grammarIds[progress.currentGrammarIndex];
                    const grammar = await getGrammarPoint(grammarId);
                    if (grammar) {
                        setGrammarName(grammar.name);
                    }
                }
            }

            // Check for incomplete session
            const today = new Date().toISOString().split('T')[0];
            const incompleteSession = await getTodaySession(today);
            setHasIncomplete(!!incompleteSession);

            // Check for completed session
            const completedSession = await getTodayCompletedSession(today);
            if (completedSession) {
                setTodayCompleted(true);
                const result = parseResult(completedSession);
                if (result) {
                    setTodayStars(result.stars);
                }
            }

            // Load SRS review counts
            const { grammar: gCount, vocab: vCount } = await getReviewCounts(Date.now());
            setReviewCount(gCount + vCount);

        } catch (e) {
            console.error('[Home] Load error:', e);
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const handleStartTraining = () => {
        navigation.navigate('Training');
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                    <Text style={styles.loadingText}>正在加载...</Text>
                </View>
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.container}>
                <View style={styles.errorContainer}>
                    <Text style={styles.errorEmoji}>😿</Text>
                    <Text style={styles.errorTitle}>加载失败</Text>
                    <Text style={styles.errorText}>{error}</Text>
                    <TouchableOpacity style={styles.retryButton} onPress={loadData}>
                        <Text style={styles.retryButtonText}>重试</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.greeting}>おはよう！🌸</Text>
                    <Text style={styles.date}>{new Date().toLocaleDateString('zh-CN', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric'
                    })}</Text>
                </View>

                {/* Stats Card */}
                <View style={styles.statsCard}>
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>Lv.{level}</Text>
                        <Text style={styles.statLabel}>当前等级</Text>
                    </View>
                    <View style={styles.statDivider} />
                    <View style={styles.statItem}>
                        <Text style={styles.statValue}>🔥 {streak}</Text>
                        <Text style={styles.statLabel}>连续天数</Text>
                    </View>
                </View>

                {/* Today's Focus */}
                <View style={styles.focusCard}>
                    <Text style={styles.focusLabel}>今日学习目标</Text>
                    <Text style={styles.focusLesson}>{lessonTitle}</Text>
                    <Text style={styles.focusGrammar}>{grammarName}</Text>
                </View>

                {/* Training Button */}
                {todayCompleted ? (
                    <View style={styles.completedCard}>
                        <Text style={styles.completedEmoji}>{'⭐'.repeat(todayStars)}</Text>
                        <Text style={styles.completedTitle}>今日训练完成！</Text>
                        <Text style={styles.completedText}>明天继续加油哦～</Text>
                        <TouchableOpacity
                            style={styles.reviewButton}
                            onPress={() => navigation.navigate('Review')}
                        >
                            <Text style={styles.reviewButtonText}>📖 回看今日训练</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.startButton}
                        onPress={handleStartTraining}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.startButtonEmoji}>🎮</Text>
                        <Text style={styles.startButtonText}>
                            {hasIncomplete ? '继续训练' : '开始今日训练'}
                        </Text>
                        {hasIncomplete && (
                            <Text style={styles.resumeHint}>上次进度已保存</Text>
                        )}
                    </TouchableOpacity>
                )}

                {/* Review Entry Card */}
                {reviewCount > 0 && (
                    <TouchableOpacity
                        style={styles.reviewEntryCard}
                        onPress={() => navigation.navigate('ReviewQueue')}
                    >
                        <View style={styles.reviewEntryLeft}>
                            <Text style={styles.reviewEntryEmoji}>🔄</Text>
                            <View>
                                <Text style={styles.reviewEntryTitle}>待复习</Text>
                                <Text style={styles.reviewEntryCount}>{reviewCount} 个项目到期</Text>
                            </View>
                        </View>
                        <Text style={styles.reviewEntryArrow}>→</Text>
                    </TouchableOpacity>
                )}

                {/* Quick Actions */}
                <View style={styles.quickActions}>
                    <Text style={styles.quickActionsTitle}>快速入口</Text>
                    <View style={styles.quickActionsGrid}>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('GrammarCard')}
                        >
                            <Text style={styles.quickActionEmoji}>📖</Text>
                            <Text style={styles.quickActionText}>语法卡片</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('VocabChallenge')}
                        >
                            <Text style={styles.quickActionEmoji}>🎯</Text>
                            <Text style={styles.quickActionText}>词汇闯关</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('SentenceDojo')}
                        >
                            <Text style={styles.quickActionEmoji}>💬</Text>
                            <Text style={styles.quickActionText}>句子练习</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('ListeningQuiz')}
                        >
                            <Text style={styles.quickActionEmoji}>👂</Text>
                            <Text style={styles.quickActionText}>听力选择</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('Dictation')}
                        >
                            <Text style={styles.quickActionEmoji}>✍️</Text>
                            <Text style={styles.quickActionText}>听写练习</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.quickActionButton}
                            onPress={() => navigation.navigate('ReviewQueue')}
                        >
                            <Text style={styles.quickActionEmoji}>🔄</Text>
                            <Text style={styles.quickActionText}>复习队列</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </ScrollView>
        </View>
    );
}
