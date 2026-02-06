// src/screens/training/SummaryStep.tsx
// Step 5: Session Summary

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { assessMastery, checkLLMAvailable } from '../../llm/client';
import { getUserProgress, updateUserProgress, upsertGrammarState, getGrammarState, unlockNextLesson } from '../../db/queries/progress';
import { getRecentSessions, updateSessionCoach } from '../../db/queries/sessions';
import type { ResultJson } from '../../schemas/session';
import type { DbSession } from '../../db/database';
import type { MasteryAssessResponse } from '../../schemas/llm';

interface Props {
    result: ResultJson;
    onFinish: () => void;
    sessionId: number;
}

export default function SummaryStep({ result, onFinish, sessionId }: Props) {
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [unlockMessage, setUnlockMessage] = useState<string | null>(null);

    useEffect(() => {
        const loadAIAnalysis = async () => {
            if (result.coach.source === 'llm') return; // Already AI
            if (!await checkLLMAvailable()) return;

            setIsAiLoading(true);
            try {
                const progress = await getUserProgress();
                const sessions = await getRecentSessions(10);

                // Simple stats aggregation
                const grammarAccuracies = new Map<number, { correct: number; total: number }>();
                let totalAccuracy = 0;
                let count = 0;

                sessions.forEach(s => {
                    if (s.resultJson) {
                        try {
                            const r = JSON.parse(s.resultJson) as ResultJson;
                            totalAccuracy += (r.grammar.correct / Math.max(1, r.grammar.total));
                            count++;

                            // Mocking specific grammar stats correlation for now
                            // In real app, we'd query relation tables or parse deeper
                        } catch (e) { }
                    }
                });

                const avgAcc = count > 0 ? totalAccuracy / count : 0;

                // === Build Memory Context ===
                let previousSummary: string | undefined;
                let daysSinceLastSession = 0;
                let attendancePattern: 'perfect' | 'consistent' | 'irregular' | 'returning' = 'consistent';

                if (sessions.length > 0) {
                    // Find previous session's coach summary (skip current if exists)
                    const previousSession = sessions.find(s => s.sessionId !== sessionId);
                    if (previousSession?.resultJson) {
                        try {
                            const prevResult = JSON.parse(previousSession.resultJson) as ResultJson;
                            previousSummary = prevResult.coach?.summary;
                        } catch { }
                    }

                    // Calculate days since last session
                    const latestDate = new Date(sessions[0].date);
                    const today = new Date();
                    daysSinceLastSession = Math.floor((today.getTime() - latestDate.getTime()) / (1000 * 60 * 60 * 24));

                    // Determine attendance pattern
                    if (progress.streakDays >= 7) {
                        attendancePattern = 'perfect';
                    } else if (daysSinceLastSession > 7) {
                        attendancePattern = 'returning';
                    } else if (progress.streakDays < 3 && count > 5) {
                        attendancePattern = 'irregular';
                    } else {
                        attendancePattern = 'consistent';
                    }
                }

                const aiRes = await assessMastery({
                    recentStats: {
                        grammarAccuracies: [], // Populate if available
                        vocabAccuracies: [],
                        avgSessionAccuracy: avgAcc,
                        streakDays: progress.streakDays
                    },
                    currentProgress: {
                        lessonId: progress.currentLessonId,
                        grammarIndex: progress.currentGrammarIndex,
                        level: progress.currentLevel
                    },
                    memoryContext: {
                        previousSummary,
                        totalTrainingDays: count,
                        attendancePattern,
                        daysSinceLastSession
                    }
                });

                if (aiRes.ok && aiRes.data) {
                    const data = aiRes.data;
                    setAiSummary(data.tomorrow_plan.summary);

                    // === Apply AI Decisions ===
                    // 1. Mastery Adjustments
                    if (data.mastery_adjustments?.length > 0) {
                        for (const adj of data.mastery_adjustments) {
                            const state = await getGrammarState(adj.grammarId);
                            if (state) {
                                const newMastery = Math.max(0, Math.min(100, state.mastery + adj.suggestedDelta));
                                await upsertGrammarState({ ...state, mastery: newMastery });
                                console.log(`[AI] Adjusted grammar ${adj.grammarId}: ${adj.suggestedDelta}`);
                            }
                        }
                    }

                    // 2. Level Recommendation
                    if (data.level_recommendation !== 'maintain') {
                        let newLevel = progress.currentLevel;
                        if (data.level_recommendation === 'up') newLevel++;
                        if (data.level_recommendation === 'down') newLevel = Math.max(1, newLevel - 1);

                        if (newLevel !== progress.currentLevel) {
                            await updateUserProgress({ currentLevel: newLevel });
                            console.log(`[AI] Level changed: ${progress.currentLevel} -> ${newLevel}`);
                        }
                    }

                    // 3. Persist to DB
                    await updateSessionCoach(sessionId, data.tomorrow_plan.summary);

                    // 4. Check Unlock Condition (Option B: AI + Data)
                    if (data.level_recommendation === 'up' && sessions.length >= 3) {
                        // Check if last 3 sessions have >85% accuracy
                        const recent3 = sessions.slice(0, 3);
                        const allAbove85 = recent3.every(s => {
                            if (!s.resultJson) return false;
                            try {
                                const r = JSON.parse(s.resultJson) as ResultJson;
                                return (r.grammar.correct / Math.max(1, r.grammar.total)) >= 0.85;
                            } catch { return false; }
                        });

                        if (allAbove85) {
                            const { newLessonId } = await unlockNextLesson();
                            setUnlockMessage(`🎉 恍った！Lesson ${newLessonId} が解放された！`);
                            console.log(`[Unlock] Lesson ${newLessonId} unlocked!`);
                        }
                    }
                }
            } catch (e) {
                console.error('AI Coach Error:', e);
            } finally {
                setIsAiLoading(false);
            }
        };

        loadAIAnalysis();
    }, [result]);

    const renderStars = () => {
        return '⭐'.repeat(result.stars) + '☆'.repeat(5 - result.stars);
    };

    const getLevelChangeText = () => {
        switch (result.levelChange) {
            case 'up':
                return { text: '难度提升 ↑', color: '#4CAF50' };
            case 'down':
                return { text: '难度降低 ↓', color: '#FF9800' };
            default:
                return { text: '难度保持', color: '#888' };
        }
    };

    const levelChange = getLevelChangeText();

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Stars */}
            <View style={styles.starsContainer}>
                <Text style={styles.starsText}>{renderStars()}</Text>
                <Text style={styles.starsLabel}>今日成绩</Text>
            </View>

            {/* Stats Grid */}
            <View style={styles.statsGrid}>
                {/* Grammar */}
                <View style={styles.statCard}>
                    <Text style={styles.statEmoji}>📖</Text>
                    <Text style={styles.statTitle}>语法</Text>
                    <Text style={styles.statValue}>
                        {result.grammar.correct}/{result.grammar.total}
                    </Text>
                    <Text style={styles.statLabel}>
                        {((result.grammar.correct / result.grammar.total) * 100).toFixed(0)}%
                    </Text>
                </View>

                {/* Transfer */}
                <View style={styles.statCard}>
                    <Text style={styles.statEmoji}>🎯</Text>
                    <Text style={styles.statTitle}>举一反三</Text>
                    <Text style={styles.statValue}>
                        {result.transfer.correct}/{result.transfer.total}
                    </Text>
                    <Text style={styles.statLabel}>
                        {((result.transfer.correct / result.transfer.total) * 100).toFixed(0)}%
                    </Text>
                </View>

                {/* Vocab */}
                <View style={styles.statCard}>
                    <Text style={styles.statEmoji}>📝</Text>
                    <Text style={styles.statTitle}>词汇</Text>
                    <Text style={styles.statValue}>
                        {(result.vocab.accuracy * 100).toFixed(0)}%
                    </Text>
                    <Text style={styles.statLabel}>
                        {(result.vocab.avgRtMs / 1000).toFixed(1)}秒/词
                    </Text>
                </View>

                {/* Sentence */}
                <View style={styles.statCard}>
                    <Text style={styles.statEmoji}>💬</Text>
                    <Text style={styles.statTitle}>句子</Text>
                    <Text style={styles.statValue}>
                        {result.sentence.pass}/{result.sentence.total}
                    </Text>
                    <Text style={styles.statLabel}>
                        命中率{(result.sentence.keyPointHitRate * 100).toFixed(0)}%
                    </Text>
                </View>
            </View>

            {/* Level Change */}
            <View style={styles.levelChangeCard}>
                <Text style={[styles.levelChangeText, { color: levelChange.color }]}>
                    {levelChange.text}
                </Text>
            </View>

            {/* Unlock Notification */}
            {unlockMessage && (
                <View style={[styles.levelChangeCard, { backgroundColor: '#2E7D32', marginTop: 8 }]}>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold', textAlign: 'center' }}>
                        {unlockMessage}
                    </Text>
                </View>
            )}

            {/* Coach Summary */}
            <View style={styles.coachCard}>
                <View style={styles.coachHeader}>
                    <Text style={styles.coachEmoji}>🌸</Text>
                    <Text style={styles.coachTitle}>
                        {aiSummary ? 'Sakura (JK)' : '教练点评'}
                    </Text>
                    <Text style={styles.coachSource}>
                        {isAiLoading ? '思考中...' : (aiSummary ? '🤖 AI' : (result.coach.source === 'llm' ? '🤖 AI' : '📋 离线'))}
                    </Text>
                </View>
                {isAiLoading ? (
                    <View style={{ padding: 10 }}>
                        <ActivityIndicator color="#FF6B9D" />
                        <Text style={[styles.coachText, { textAlign: 'center', marginTop: 8, fontSize: 12, color: '#888' }]}>
                            正在分析你的表现喵...
                        </Text>
                    </View>
                ) : (
                    <Text style={styles.coachText}>{aiSummary || result.coach.summary}</Text>
                )}
            </View>

            {/* Finish Button */}
            <TouchableOpacity style={styles.finishButton} onPress={onFinish}>
                <Text style={styles.finishButtonText}>完成今日训练 ✓</Text>
            </TouchableOpacity>

            {/* Motivational */}
            <Text style={styles.motivational}>
                明日も頑張ろう！💪
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    content: {
        paddingBottom: 40,
    },
    starsContainer: {
        alignItems: 'center',
        marginBottom: 32,
    },
    starsText: {
        fontSize: 40,
        marginBottom: 8,
    },
    starsLabel: {
        fontSize: 16,
        color: '#888',
    },
    statsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 24,
    },
    statCard: {
        width: '48%',
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
    },
    statEmoji: {
        fontSize: 24,
        marginBottom: 8,
    },
    statTitle: {
        fontSize: 12,
        color: '#888',
        marginBottom: 4,
    },
    statValue: {
        fontSize: 24,
        color: '#fff',
        fontWeight: 'bold',
    },
    statLabel: {
        fontSize: 12,
        color: '#4CAF50',
        marginTop: 4,
    },
    levelChangeCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        marginBottom: 24,
    },
    levelChangeText: {
        fontSize: 18,
        fontWeight: '600',
    },
    coachCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        marginBottom: 32,
        borderLeftWidth: 4,
        borderLeftColor: '#FF6B9D',
    },
    coachHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    coachEmoji: {
        fontSize: 24,
        marginRight: 8,
    },
    coachTitle: {
        fontSize: 16,
        color: '#fff',
        fontWeight: '600',
        flex: 1,
    },
    coachSource: {
        fontSize: 12,
        color: '#888',
    },
    coachText: {
        fontSize: 15,
        color: '#ccc',
        lineHeight: 24,
    },
    finishButton: {
        backgroundColor: '#4CAF50',
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    finishButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    motivational: {
        textAlign: 'center',
        color: '#666',
        fontSize: 16,
    },
});
