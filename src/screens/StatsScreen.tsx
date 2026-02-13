// src/screens/StatsScreen.tsx
// Enhanced Statistics screen with heatmap, mastery rings, and accuracy trend

import React, { useState, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    TouchableOpacity,
    Alert,
    Share,
    ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StatsStackParamList } from '../navigation/RootNavigator';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';
import {
    getSessionStats,
    getRecentSessions,
    parseResult,
    getActivityHeatmap,
    getAccuracyTrend,
    getTotalLearningTime,
    type DailyActivity,
    type AccuracyTrend,
} from '../db/queries/sessions';
import { getMasteryOverview, type MasteryOverview } from '../db/queries/progress';
import { getUnlockedCount } from '../engine/achievementChecker';
import { ACHIEVEMENTS } from '../engine/achievements';
import { resetAllProgress } from '../db/queries/admin';
import type { DbSession } from '../db/database';
import type { ResultJson } from '../schemas/session';

type NavigationProp = NativeStackNavigationProp<StatsStackParamList, 'StatsMain'>;

interface SessionItem {
    session: DbSession;
    result: ResultJson | null;
}

// ============ Heatmap Styles ============

const createHeatStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        color: c.textSubtle,
        marginBottom: 12,
    },
    monthRow: {
        height: 16,
        position: 'relative',
        marginBottom: 4,
        marginLeft: 20,
    },
    monthLabel: {
        position: 'absolute',
        fontSize: 10,
        color: c.textSubtle,
    },
    grid: {
        flexDirection: 'row',
    },
    dayLabels: {
        marginRight: 4,
    },
    dayLabel: {
        fontSize: 9,
        color: c.textDim,
        height: 11,
        lineHeight: 11,
        textAlign: 'right',
        width: 14,
    },
    weekColumn: {
        marginRight: 2,
    },
    cell: {
        width: 11,
        height: 11,
        borderRadius: 2,
        marginBottom: 2,
    },
    cellToday: {
        borderWidth: 1,
        borderColor: c.primary,
    },
    legend: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        marginTop: 8,
        gap: 3,
    },
    legendCell: {
        width: 10,
        height: 10,
        borderRadius: 2,
    },
    legendText: {
        fontSize: 10,
        color: c.textDim,
        marginHorizontal: 2,
    },
});

// ============ Ring Styles ============

const createRingStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        alignItems: 'center',
        flex: 1,
    },
    ringOuter: {
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerLabel: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    },
    ringValue: {
        fontSize: 18,
        fontWeight: 'bold',
    },
    label: {
        fontSize: 14,
        color: c.textPrimary,
        marginTop: 8,
        fontWeight: '500',
    },
    detail: {
        fontSize: 11,
        color: c.textSubtle,
        marginTop: 2,
    },
});

// ============ Trend Styles ============

const createTrendStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 2,
    },
    subtitle: {
        fontSize: 12,
        color: c.textSubtle,
        marginBottom: 12,
    },
    empty: {
        color: c.textDim,
        fontSize: 14,
        textAlign: 'center',
        paddingVertical: 20,
    },
    legendRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 12,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    legendDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    legendText: {
        fontSize: 11,
        color: c.textMuted,
    },
    chartArea: {
        flexDirection: 'row',
        height: 120,
    },
    yAxis: {
        width: 36,
        justifyContent: 'space-between',
        paddingBottom: 16,
    },
    yLabel: {
        fontSize: 9,
        color: c.textDim,
        textAlign: 'right',
    },
    barsContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'flex-end',
        position: 'relative',
        paddingBottom: 16,
    },
    gridLine: {
        position: 'absolute',
        left: 0,
        right: 0,
        height: 1,
        backgroundColor: c.divider,
    },
    barGroup: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: 1,
        paddingHorizontal: 1,
    },
    bar: {
        width: 5,
        borderRadius: 2,
        minHeight: 2,
    },
    dateLabel: {
        position: 'absolute',
        bottom: -14,
        fontSize: 7,
        color: c.textDim,
        textAlign: 'center',
    },
});

// ============ Main Styles ============

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
    },
    scrollContent: {
        paddingHorizontal: 16,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 60,
        paddingHorizontal: 4,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: c.textPrimary,
    },
    settingsButton: {
        backgroundColor: c.bgCard,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
    },
    settingsButtonText: {
        color: c.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    summaryContainer: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 16,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: c.bgCard,
        borderRadius: 12,
        paddingVertical: 14,
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 22,
        fontWeight: 'bold',
        color: c.primary,
        marginBottom: 2,
    },
    summaryLabel: {
        fontSize: 11,
        color: c.textMuted,
    },
    timeCard: {
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    timeLabel: {
        fontSize: 14,
        color: c.textMuted,
    },
    timeValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: c.blue,
    },
    masterySection: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 16,
    },
    masteryRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
    },
    historySection: {
        marginTop: 4,
    },
    sessionCard: {
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 14,
        marginBottom: 8,
    },
    sessionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    sessionDate: {
        fontSize: 14,
        color: c.textPrimary,
        fontWeight: '500',
    },
    starsRow: {
        flexDirection: 'row',
        gap: 2,
    },
    starIcon: {
        fontSize: 14,
    },
    starFilled: {
        color: c.gold,
    },
    starEmpty: {
        color: c.border,
    },
    sessionStats: {
        flexDirection: 'row',
        gap: 12,
    },
    sessionStatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    statDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    sessionStat: {
        fontSize: 12,
        color: c.textMuted,
    },
    coachSection: {
        marginTop: 8,
        paddingTop: 8,
        borderTopWidth: 1,
        borderTopColor: c.divider,
    },
    coachLabel: {
        color: c.primary,
        fontSize: 12,
        marginBottom: 4,
    },
    coachText: {
        color: c.textSecondary,
        fontSize: 12,
        lineHeight: 18,
    },
    exportBtn: {
        marginTop: 6,
        alignSelf: 'flex-end',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: c.successAlpha15,
    },
    exportBtnText: {
        color: c.success,
        fontSize: 12,
    },
    showMoreBtn: {
        paddingVertical: 12,
        alignItems: 'center',
    },
    showMoreText: {
        color: c.primary,
        fontSize: 14,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 30,
    },
    emptyText: {
        fontSize: 16,
        color: c.textPrimary,
        marginBottom: 4,
    },
    emptySubtext: {
        fontSize: 13,
        color: c.textMuted,
    },
    resetButton: {
        marginTop: 20,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: c.errorBright,
        alignSelf: 'center',
        backgroundColor: c.errorAlpha10,
    },
    resetButtonText: {
        color: c.errorBright,
        fontSize: 14,
        fontWeight: '600',
    },
    achievementCard: {
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: c.gold,
    },
    achievementLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    achievementIcon: {
        fontSize: 28,
    },
    achievementTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
    },
    achievementSub: {
        fontSize: 12,
        color: c.gold,
        marginTop: 2,
    },
    achievementArrow: {
        fontSize: 18,
        color: c.textMuted,
    },
});

// ============ Heatmap Component ============

function ActivityHeatmap({ data }: { data: DailyActivity[] }) {
    const { colors } = useTheme();
    const heatStyles = useMemo(() => createHeatStyles(colors), [colors]);

    // Show last 12 weeks (84 days), 7 rows (Mon-Sun)
    const weeks: DailyActivity[][] = [];
    for (let i = 0; i < data.length; i += 7) {
        weeks.push(data.slice(i, i + 7));
    }

    const getColor = (item: DailyActivity) => {
        if (!item.completed && item.stars === 0) return colors.heatmap0;
        if (item.stars >= 5) return colors.heatmap5;
        if (item.stars >= 4) return colors.heatmap4;
        if (item.stars >= 3) return colors.heatmap3;
        if (item.stars >= 2) return colors.heatmap2;
        return colors.heatmap1;
    };

    // Legend colors array using theme tokens
    const legendColors = [
        colors.heatmap0,
        colors.heatmap1,
        colors.heatmap2,
        colors.heatmap3,
        colors.heatmap4,
        colors.heatmap5,
    ];

    // Month labels
    const monthLabels: { label: string; weekIdx: number }[] = [];
    let lastMonth = -1;
    weeks.forEach((week, idx) => {
        if (week.length > 0) {
            const d = new Date(week[0].date);
            if (d.getMonth() !== lastMonth) {
                lastMonth = d.getMonth();
                monthLabels.push({
                    label: d.toLocaleDateString('zh-CN', { month: 'short' }),
                    weekIdx: idx,
                });
            }
        }
    });

    return (
        <View style={heatStyles.container}>
            <Text style={heatStyles.title}>学习活跃度</Text>
            <Text style={heatStyles.subtitle}>过去 12 周</Text>

            {/* Month labels */}
            <View style={heatStyles.monthRow}>
                {monthLabels.map((m, i) => (
                    <Text
                        key={i}
                        style={[heatStyles.monthLabel, { left: 20 + m.weekIdx * 13 }]}
                    >
                        {m.label}
                    </Text>
                ))}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={heatStyles.grid}>
                    {/* Day labels */}
                    <View style={heatStyles.dayLabels}>
                        {['一', '', '三', '', '五', '', '日'].map((d, i) => (
                            <Text key={i} style={heatStyles.dayLabel}>{d}</Text>
                        ))}
                    </View>

                    {/* Weeks */}
                    {weeks.map((week, wi) => (
                        <View key={wi} style={heatStyles.weekColumn}>
                            {week.map((day, di) => (
                                <View
                                    key={di}
                                    style={[
                                        heatStyles.cell,
                                        { backgroundColor: getColor(day) },
                                        day.date === new Date().toISOString().split('T')[0] && heatStyles.cellToday,
                                    ]}
                                />
                            ))}
                        </View>
                    ))}
                </View>
            </ScrollView>

            {/* Legend */}
            <View style={heatStyles.legend}>
                <Text style={heatStyles.legendText}>少</Text>
                {legendColors.map((clr, i) => (
                    <View key={i} style={[heatStyles.legendCell, { backgroundColor: clr }]} />
                ))}
                <Text style={heatStyles.legendText}>多</Text>
            </View>
        </View>
    );
}

// ============ Mastery Ring Component ============
// Uses two clipped half-circles with corrected rotation offsets.
// CSS borders on a circle split at 45° diagonals, not at 0°/90° axes.
// Right half offset: -225° to align border seam with vertical clip edge.
// Left half offset: -135° for the same reason (mirrored).

function MasteryRing({
    label,
    value,
    total,
    mastered,
    color,
}: {
    label: string;
    value: number;
    total: number;
    mastered: number;
    color: string;
}) {
    const { colors } = useTheme();
    const ringStyles = useMemo(() => createRingStyles(colors), [colors]);

    const percentage = Math.round(value);
    const size = 84;
    const sw = 7;
    const half = size / 2;
    const deg = (percentage / 100) * 360;

    return (
        <View style={ringStyles.container}>
            <View style={[ringStyles.ringOuter, { width: size, height: size }]}>
                {/* Track */}
                <View style={{
                    position: 'absolute', width: size, height: size,
                    borderRadius: half, borderWidth: sw, borderColor: colors.border,
                }} />

                {/* Right half (0-50%) */}
                <View style={{
                    position: 'absolute', top: 0, left: half,
                    width: half, height: size, overflow: 'hidden',
                }}>
                    <View style={{
                        position: 'absolute', top: 0, left: -half,
                        width: size, height: size, borderRadius: half, borderWidth: sw,
                        borderTopColor: color,
                        borderRightColor: color,
                        borderBottomColor: 'transparent',
                        borderLeftColor: 'transparent',
                        transform: [{ rotate: `${-225 + Math.min(deg, 180)}deg` }],
                    }} />
                </View>

                {/* Left half (50-100%) */}
                {deg > 180 && (
                    <View style={{
                        position: 'absolute', top: 0, left: 0,
                        width: half, height: size, overflow: 'hidden',
                    }}>
                        <View style={{
                            position: 'absolute', top: 0, left: 0,
                            width: size, height: size, borderRadius: half, borderWidth: sw,
                            borderTopColor: color,
                            borderLeftColor: color,
                            borderBottomColor: 'transparent',
                            borderRightColor: 'transparent',
                            transform: [{ rotate: `${-135 + (deg - 180)}deg` }],
                        }} />
                    </View>
                )}

                {/* Center text */}
                <View style={ringStyles.centerLabel}>
                    <Text style={[ringStyles.ringValue, { color }]}>{percentage}%</Text>
                </View>
            </View>
            <Text style={ringStyles.label}>{label}</Text>
            <Text style={ringStyles.detail}>{mastered}/{total} 掌握</Text>
        </View>
    );
}

// ============ Accuracy Trend Component ============

function AccuracyTrendChart({ data }: { data: AccuracyTrend[] }) {
    const { colors } = useTheme();
    const trendStyles = useMemo(() => createTrendStyles(colors), [colors]);

    if (data.length === 0) {
        return (
            <View style={trendStyles.container}>
                <Text style={trendStyles.title}>正确率趋势</Text>
                <Text style={trendStyles.empty}>暂无数据，开始训练后显示</Text>
            </View>
        );
    }

    const barWidth = 100 / data.length;
    const maxBarPx = 88; // chartArea(120) - paddingBottom(16) - margin(16)

    return (
        <View style={trendStyles.container}>
            <Text style={trendStyles.title}>正确率趋势</Text>
            <Text style={trendStyles.subtitle}>近 {data.length} 天训练数据</Text>

            {/* Legend */}
            <View style={trendStyles.legendRow}>
                <View style={trendStyles.legendItem}>
                    <View style={[trendStyles.legendDot, { backgroundColor: colors.primary }]} />
                    <Text style={trendStyles.legendText}>语法</Text>
                </View>
                <View style={trendStyles.legendItem}>
                    <View style={[trendStyles.legendDot, { backgroundColor: colors.success }]} />
                    <Text style={trendStyles.legendText}>词汇</Text>
                </View>
                <View style={trendStyles.legendItem}>
                    <View style={[trendStyles.legendDot, { backgroundColor: colors.accent }]} />
                    <Text style={trendStyles.legendText}>句子</Text>
                </View>
            </View>

            {/* Chart area */}
            <View style={trendStyles.chartArea}>
                {/* Y-axis labels */}
                <View style={trendStyles.yAxis}>
                    <Text style={trendStyles.yLabel}>100%</Text>
                    <Text style={trendStyles.yLabel}>50%</Text>
                    <Text style={trendStyles.yLabel}>0%</Text>
                </View>

                {/* Bars */}
                <View style={trendStyles.barsContainer}>
                    {/* Grid lines */}
                    <View style={[trendStyles.gridLine, { bottom: '50%' }]} />
                    <View style={[trendStyles.gridLine, { bottom: '100%' }]} />

                    {data.map((item, idx) => (
                        <View key={idx} style={[trendStyles.barGroup, { width: `${barWidth}%` }]}>
                            {/* Grammar bar */}
                            <View
                                style={[
                                    trendStyles.bar,
                                    {
                                        height: Math.max(item.grammarAcc * maxBarPx, 2),
                                        backgroundColor: colors.primary,
                                    },
                                ]}
                            />
                            {/* Vocab bar */}
                            <View
                                style={[
                                    trendStyles.bar,
                                    {
                                        height: Math.max(item.vocabAcc * maxBarPx, 2),
                                        backgroundColor: colors.success,
                                    },
                                ]}
                            />
                            {/* Sentence bar */}
                            <View
                                style={[
                                    trendStyles.bar,
                                    {
                                        height: Math.max(item.sentenceAcc * maxBarPx, 2),
                                        backgroundColor: colors.accent,
                                    },
                                ]}
                            />
                            <Text style={trendStyles.dateLabel}>
                                {item.date.slice(5)}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// ============ Main Screen ============

export default function StatsScreen() {
    const navigation = useNavigation<NavigationProp>();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalSessions: 0,
        totalStars: 0,
        avgAccuracy: 0,
        streakDays: 0,
    });
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [heatmap, setHeatmap] = useState<DailyActivity[]>([]);
    const [mastery, setMastery] = useState<MasteryOverview | null>(null);
    const [trend, setTrend] = useState<AccuracyTrend[]>([]);
    const [totalTime, setTotalTime] = useState(0);
    const [achievementCount, setAchievementCount] = useState(0);
    const [showAllSessions, setShowAllSessions] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const [statsData, recentSessions, heatmapData, masteryData, trendData, timeData, achCount] =
                await Promise.all([
                    getSessionStats(),
                    getRecentSessions(20),
                    getActivityHeatmap(84),
                    getMasteryOverview(),
                    getAccuracyTrend(14),
                    getTotalLearningTime(),
                    getUnlockedCount(),
                ]);

            setStats(statsData);
            setSessions(recentSessions.map(session => ({
                session,
                result: parseResult(session),
            })));
            setHeatmap(heatmapData);
            setMastery(masteryData);
            setTrend(trendData);
            setTotalTime(timeData);
            setAchievementCount(achCount);
        } catch (e) {
            console.error('[Stats] Load error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleReset = () => {
        Alert.alert(
            '清空记录',
            '确定要清空所有做题记录吗？\nAPI 配置和离线内容将保留。\n此操作不可撤销。',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定清空',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            await resetAllProgress();
                            loadData();
                            Alert.alert('已清空', '所有做题记录已重置');
                        } catch (e) {
                            Alert.alert('错误', '重置失败');
                            console.error(e);
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleExport = async (item: SessionItem) => {
        if (!item.result?.coach?.summary) return;
        try {
            await Share.share({
                message: `【GalKing 每日日语点评】\n${item.session.date}\n星级: ${item.result.stars}/5\n\nSakura 点评:\n${item.result.coach.summary}\n\n加油！`
            });
        } catch (error) {
            Alert.alert('导出失败', (error as any).message);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [loadData])
    );

    const formatTime = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={colors.primary} />
                </View>
            </View>
        );
    }

    const displayedSessions = showAllSessions ? sessions : sessions.slice(0, 5);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>学习统计</Text>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Text style={styles.settingsButtonText}>设置</Text>
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{stats.totalSessions}</Text>
                    <Text style={styles.summaryLabel}>总训练</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.gold }]}>{stats.totalStars}</Text>
                    <Text style={styles.summaryLabel}>总星星</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.success }]}>
                        {(stats.avgAccuracy * 100).toFixed(0)}%
                    </Text>
                    <Text style={styles.summaryLabel}>正确率</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={[styles.summaryValue, { color: colors.warning }]}>{stats.streakDays}</Text>
                    <Text style={styles.summaryLabel}>连击天</Text>
                </View>
            </View>

            {/* Learning Time */}
            {totalTime > 0 && (
                <View style={styles.timeCard}>
                    <Text style={styles.timeLabel}>累计学习时长</Text>
                    <Text style={styles.timeValue}>{formatTime(totalTime)}</Text>
                </View>
            )}

            {/* Achievement Entry */}
            <TouchableOpacity
                style={styles.achievementCard}
                onPress={() => navigation.navigate('Achievements')}
            >
                <View style={styles.achievementLeft}>
                    <Text style={styles.achievementIcon}>🏆</Text>
                    <View>
                        <Text style={styles.achievementTitle}>成就徽章</Text>
                        <Text style={styles.achievementSub}>
                            已解锁 {achievementCount}/{ACHIEVEMENTS.length}
                        </Text>
                    </View>
                </View>
                <Text style={styles.achievementArrow}>→</Text>
            </TouchableOpacity>

            {/* Activity Heatmap */}
            <ActivityHeatmap data={heatmap} />

            {/* Mastery Overview */}
            {mastery && (mastery.grammarTotal > 0 || mastery.vocabTotal > 0) && (
                <View style={styles.masterySection}>
                    <Text style={styles.sectionTitle}>掌握度概览</Text>
                    <View style={styles.masteryRow}>
                        <MasteryRing
                            label="语法"
                            value={mastery.grammarAvg}
                            total={mastery.grammarTotal}
                            mastered={mastery.grammarMastered}
                            color={colors.primary}
                        />
                        <MasteryRing
                            label="词汇"
                            value={mastery.vocabAvg}
                            total={mastery.vocabTotal}
                            mastered={mastery.vocabMastered}
                            color={colors.success}
                        />
                    </View>
                </View>
            )}

            {/* Accuracy Trend */}
            <AccuracyTrendChart data={trend} />

            {/* Session History */}
            <View style={styles.historySection}>
                <Text style={styles.sectionTitle}>训练记录</Text>

                {sessions.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyText}>还没有训练记录</Text>
                        <Text style={styles.emptySubtext}>开始第一次训练吧！</Text>
                    </View>
                ) : (
                    <>
                        {displayedSessions.map((item) => (
                            <View key={item.session.sessionId} style={styles.sessionCard}>
                                <View style={styles.sessionHeader}>
                                    <Text style={styles.sessionDate}>{item.session.date}</Text>
                                    <View style={styles.starsRow}>
                                        {Array.from({ length: 5 }).map((_, i) => (
                                            <Text
                                                key={i}
                                                style={[
                                                    styles.starIcon,
                                                    i < (item.result?.stars ?? 0)
                                                        ? styles.starFilled
                                                        : styles.starEmpty,
                                                ]}
                                            >
                                                {'\u2605'}
                                            </Text>
                                        ))}
                                    </View>
                                </View>
                                {item.result && (
                                    <View>
                                        <View style={styles.sessionStats}>
                                            {item.result.grammar && (
                                            <View style={styles.sessionStatItem}>
                                                <View style={[styles.statDot, { backgroundColor: colors.primary }]} />
                                                <Text style={styles.sessionStat}>
                                                    语法 {item.result.grammar.correct}/{item.result.grammar.total}
                                                </Text>
                                            </View>
                                            )}
                                            {item.result.vocab && (
                                            <View style={styles.sessionStatItem}>
                                                <View style={[styles.statDot, { backgroundColor: colors.success }]} />
                                                <Text style={styles.sessionStat}>
                                                    词汇 {(item.result.vocab.accuracy * 100).toFixed(0)}%
                                                </Text>
                                            </View>
                                            )}
                                            {item.result.sentence && (
                                            <View style={styles.sessionStatItem}>
                                                <View style={[styles.statDot, { backgroundColor: colors.accent }]} />
                                                <Text style={styles.sessionStat}>
                                                    句子 {item.result.sentence.pass}/{item.result.sentence.total}
                                                </Text>
                                            </View>
                                            )}
                                        </View>
                                        {item.result.coach?.summary && (
                                            <View style={styles.coachSection}>
                                                <Text style={styles.coachLabel}>Sakura 点评:</Text>
                                                <Text style={styles.coachText} numberOfLines={3}>
                                                    {item.result.coach.summary}
                                                </Text>
                                                <TouchableOpacity
                                                    style={styles.exportBtn}
                                                    onPress={() => handleExport(item)}
                                                >
                                                    <Text style={styles.exportBtnText}>分享</Text>
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        ))}

                        {sessions.length > 5 && (
                            <TouchableOpacity
                                style={styles.showMoreBtn}
                                onPress={() => setShowAllSessions(!showAllSessions)}
                            >
                                <Text style={styles.showMoreText}>
                                    {showAllSessions ? '收起' : `查看全部 ${sessions.length} 条记录`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>

            {/* Reset Button */}
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                <Text style={styles.resetButtonText}>清空所有记录</Text>
            </TouchableOpacity>

            <View style={{ height: 100 }} />
        </ScrollView>
    );
}
