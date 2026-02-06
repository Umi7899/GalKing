// src/screens/StatsScreen.tsx
// Statistics and session history screen

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, ActivityIndicator, TouchableOpacity, Alert, Share } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { StatsStackParamList } from '../navigation/RootNavigator';
import { getSessionStats, getRecentSessions, parseResult } from '../db/queries/sessions';
import { resetAllProgress } from '../db/queries/admin';
import type { DbSession } from '../db/database';
import type { ResultJson } from '../schemas/session';

type NavigationProp = NativeStackNavigationProp<StatsStackParamList, 'StatsMain'>;
interface SessionItem {
    session: DbSession;
    result: ResultJson | null;
}

export default function StatsScreen() {
    const navigation = useNavigation<NavigationProp>();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({
        totalSessions: 0,
        totalStars: 0,
        avgAccuracy: 0,
        streakDays: 0,
    });
    const [sessions, setSessions] = useState<SessionItem[]>([]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const statsData = await getSessionStats();
            setStats(statsData);

            const recentSessions = await getRecentSessions(20);
            const sessionItems = recentSessions.map(session => ({
                session,
                result: parseResult(session),
            }));
            setSessions(sessionItems);
        } catch (e) {
            console.error('[Stats] Load error:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleReset = () => {
        Alert.alert(
            '⚠️ 清空记录',
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
                            loadData(); // Reload stats
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
                message: `【GalKing 每日日语点评】\n📅 ${item.session.date}\n⭐ 星级: ${item.result.stars}/5\n\n🌸 老师点评:\n${item.result.coach.summary}\n\n加油喵！`
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

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.headerTitle}>📊 学习统计</Text>
                <TouchableOpacity
                    style={styles.settingsButton}
                    onPress={() => navigation.navigate('Settings')}
                >
                    <Text style={styles.settingsButtonText}>⚙️ 设置</Text>
                </TouchableOpacity>
            </View>

            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{stats.totalSessions}</Text>
                    <Text style={styles.summaryLabel}>总训练次数</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>⭐{stats.totalStars}</Text>
                    <Text style={styles.summaryLabel}>获得星星</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>{(stats.avgAccuracy * 100).toFixed(0)}%</Text>
                    <Text style={styles.summaryLabel}>平均正确率</Text>
                </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryValue}>🔥{stats.streakDays}</Text>
                    <Text style={styles.summaryLabel}>连续天数</Text>
                </View>
            </View>

            {/* Session History */}
            <Text style={styles.sectionTitle}>训练记录</Text>

            {sessions.length === 0 ? (
                <View style={[styles.emptyContainer, { justifyContent: 'space-between', flex: 1, paddingBottom: 40 }]}>
                    <View style={{ alignItems: 'center' }}>
                        <Text style={styles.emptyEmoji}>📝</Text>
                        <Text style={styles.emptyText}>还没有训练记录</Text>
                        <Text style={styles.emptySubtext}>开始第一次训练吧！</Text>
                    </View>
                    <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                        <Text style={styles.resetButtonText}>🗑️ 清空所有记录</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <FlatList
                    data={sessions}
                    renderItem={({ item }) => (
                        <View style={styles.sessionCard}>
                            <View style={styles.sessionHeader}>
                                <Text style={styles.sessionDate}>{item.session.date}</Text>
                                <Text style={styles.sessionStars}>
                                    {'⭐'.repeat(item.result?.stars ?? 0)}
                                </Text>
                            </View>
                            {item.result && (
                                <View>
                                    <View style={styles.sessionStats}>
                                        <Text style={styles.sessionStat}>
                                            语法 {item.result.grammar.correct}/{item.result.grammar.total}
                                        </Text>
                                        <Text style={styles.sessionStat}>
                                            词汇 {(item.result.vocab.accuracy * 100).toFixed(0)}%
                                        </Text>
                                        <Text style={styles.sessionStat}>
                                            句子 {item.result.sentence.pass}/{item.result.sentence.total}
                                        </Text>
                                    </View>
                                    {item.result.coach?.summary && (
                                        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#333' }}>
                                            <Text style={{ color: '#FF6B9D', fontSize: 12, marginBottom: 4 }}>🌸 Sakura 点评:</Text>
                                            <Text style={{ color: '#CCC', fontSize: 12, lineHeight: 18 }} numberOfLines={3}>
                                                {item.result.coach.summary}
                                            </Text>
                                            <TouchableOpacity
                                                style={{ marginTop: 6, alignSelf: 'flex-end', padding: 4 }}
                                                onPress={() => handleExport(item)}
                                            >
                                                <Text style={{ color: '#4CAF50', fontSize: 12 }}>📤 导出/分享</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </View>
                            )}
                        </View>
                    )}
                    keyExtractor={(item) => String(item.session.sessionId)}
                    contentContainerStyle={styles.listContent}
                    ListFooterComponent={
                        <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
                            <Text style={styles.resetButtonText}>🗑️ 清空所有记录</Text>
                        </TouchableOpacity>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
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
        paddingHorizontal: 20,
        paddingBottom: 20,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
    },
    settingsButton: {
        backgroundColor: '#1A1A2E',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 16,
    },
    settingsButtonText: {
        color: '#FF6B9D',
        fontSize: 14,
        fontWeight: '600',
    },
    summaryContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        paddingHorizontal: 12,
        marginBottom: 24,
    },
    summaryCard: {
        width: '48%',
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 16,
        margin: '1%',
        alignItems: 'center',
    },
    summaryValue: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FF6B9D',
        marginBottom: 4,
    },
    summaryLabel: {
        fontSize: 12,
        color: '#888',
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#fff',
        paddingHorizontal: 20,
        marginBottom: 12,
    },
    listContent: {
        paddingHorizontal: 16,
        paddingBottom: 100,
    },
    sessionCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
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
        color: '#fff',
        fontWeight: '500',
    },
    sessionStars: {
        fontSize: 14,
    },
    sessionStats: {
        flexDirection: 'row',
        gap: 16,
    },
    sessionStat: {
        fontSize: 12,
        color: '#888',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 18,
        color: '#fff',
        marginBottom: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#888',
    },
    resetButton: {
        marginTop: 30,
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#FF4444',
        alignSelf: 'center',
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
    },
    resetButtonText: {
        color: '#FF4444',
        fontSize: 14,
        fontWeight: '600',
    },
});
