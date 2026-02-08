// src/screens/quick/ReviewQueueScreen.tsx
// Quick Access: SRS Review Queue (复习队列)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
    getAllReviewItems, getReviewCounts,
    upsertGrammarState, upsertVocabState,
    getGrammarState, getVocabState,
    type DbUserVocabState,
} from '../../db/queries/progress';
import { getGrammarPoint, getVocabByIds } from '../../db/queries/content';
import type { DbUserGrammarState } from '../../db/database';
import type { GrammarPoint, Vocab } from '../../schemas/content';
import { computeSM2Interval, computeVocabSM2Interval } from '../../engine/scorer';
import { speak } from '../../utils/tts';

interface ReviewCard {
    type: 'grammar' | 'vocab';
    id: number;
    front: string;
    frontSub?: string;
    back: string;
    backSub?: string;
    ttsText?: string;
}

type Stage = 'loading' | 'overview' | 'reviewing' | 'done';
type Rating = 'again' | 'good' | 'easy';

export default function ReviewQueueScreen() {
    const navigation = useNavigation();

    const [stage, setStage] = useState<Stage>('loading');
    const [grammarCount, setGrammarCount] = useState(0);
    const [vocabCount, setVocabCount] = useState(0);
    const [cards, setCards] = useState<ReviewCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [flipped, setFlipped] = useState(false);
    const [stats, setStats] = useState({ again: 0, good: 0, easy: 0 });

    const flipAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadReviewData();
    }, []);

    const loadReviewData = async () => {
        const today = Date.now();
        const counts = await getReviewCounts(today);
        setGrammarCount(counts.grammar);
        setVocabCount(counts.vocab);

        if (counts.grammar + counts.vocab === 0) {
            setStage('overview');
            return;
        }

        const { grammarItems, vocabItems } = await getAllReviewItems(today);
        const reviewCards: ReviewCard[] = [];

        // Build grammar cards
        for (const item of grammarItems) {
            const grammar = await getGrammarPoint(item.grammarId);
            if (grammar) {
                const drill = grammar.drills.length > 0
                    ? grammar.drills[Math.floor(Math.random() * grammar.drills.length)]
                    : null;
                reviewCards.push({
                    type: 'grammar',
                    id: item.grammarId,
                    front: grammar.name,
                    frontSub: drill ? drill.stem : undefined,
                    back: grammar.coreRule,
                    backSub: grammar.structure,
                    ttsText: drill?.stem,
                });
            }
        }

        // Build vocab cards
        if (vocabItems.length > 0) {
            const vocabs = await getVocabByIds(vocabItems.map(v => v.vocabId));
            const vocabMap = new Map(vocabs.map(v => [v.vocabId, v]));

            for (const item of vocabItems) {
                const vocab = vocabMap.get(item.vocabId);
                if (vocab) {
                    reviewCards.push({
                        type: 'vocab',
                        id: item.vocabId,
                        front: vocab.surface,
                        frontSub: vocab.reading,
                        back: vocab.meanings.join(', '),
                        ttsText: vocab.reading,
                    });
                }
            }
        }

        setCards(reviewCards);
        setStage('overview');
    };

    const startReview = () => {
        if (cards.length === 0) return;
        setStage('reviewing');
        setCurrentIndex(0);
        setFlipped(false);
        flipAnim.setValue(0);
    };

    const handleFlip = () => {
        if (flipped) return;
        setFlipped(true);
        Animated.spring(flipAnim, { toValue: 1, useNativeDriver: true }).start();

        // TTS on flip
        const card = cards[currentIndex];
        if (card.ttsText) {
            speak(card.ttsText);
        }
    };

    const handleRate = async (rating: Rating) => {
        const card = cards[currentIndex];
        const now = Date.now();

        if (card.type === 'grammar') {
            const state = await getGrammarState(card.id);
            const currentMastery = state?.mastery ?? 0;
            const currentStreak = state?.correctStreak ?? 0;

            let masteryDelta: number;
            let nextDays: number;
            let newStreak: number;

            switch (rating) {
                case 'again':
                    masteryDelta = -2;
                    nextDays = 1;
                    newStreak = 0;
                    break;
                case 'good':
                    masteryDelta = 2;
                    newStreak = currentStreak + 1;
                    nextDays = computeSM2Interval(currentMastery + 2, newStreak, true);
                    break;
                case 'easy':
                    masteryDelta = 4;
                    newStreak = currentStreak + 2;
                    nextDays = Math.round(computeSM2Interval(currentMastery + 4, newStreak, true) * 1.5);
                    break;
            }

            await upsertGrammarState({
                grammarId: card.id,
                mastery: Math.min(100, Math.max(0, currentMastery + masteryDelta)),
                lastSeenAt: now,
                nextReviewAt: now + nextDays * 24 * 60 * 60 * 1000,
                wrongCount7d: rating === 'again' ? (state?.wrongCount7d ?? 0) + 1 : state?.wrongCount7d ?? 0,
                correctStreak: newStreak,
            });
        } else {
            const state = await getVocabState(card.id);
            const currentStrength = state?.strength ?? 0;

            let strengthDelta: number;
            let nextDays: number;

            switch (rating) {
                case 'again':
                    strengthDelta = -2;
                    nextDays = 1;
                    break;
                case 'good':
                    strengthDelta = 2;
                    nextDays = computeVocabSM2Interval(currentStrength + 2, true);
                    break;
                case 'easy':
                    strengthDelta = 4;
                    nextDays = Math.round(computeVocabSM2Interval(currentStrength + 4, true) * 1.5);
                    break;
            }

            await upsertVocabState({
                vocabId: card.id,
                strength: Math.min(100, Math.max(0, currentStrength + strengthDelta)),
                lastSeenAt: now,
                nextReviewAt: now + nextDays * 24 * 60 * 60 * 1000,
                isBlocking: state?.isBlocking ?? 0,
                wrongCount7d: rating === 'again' ? (state?.wrongCount7d ?? 0) + 1 : state?.wrongCount7d ?? 0,
            });
        }

        // Update stats
        setStats(prev => ({ ...prev, [rating]: prev[rating] + 1 }));

        // Next card or done
        if (currentIndex + 1 >= cards.length) {
            setStage('done');
        } else {
            setCurrentIndex(prev => prev + 1);
            setFlipped(false);
            flipAnim.setValue(0);
        }
    };

    // Loading
    if (stage === 'loading') {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>加载中...</Text>
            </View>
        );
    }

    // Overview
    if (stage === 'overview') {
        const total = grammarCount + vocabCount;

        return (
            <View style={styles.container}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>

                <View style={styles.overviewContent}>
                    <Text style={styles.overviewEmoji}>🔄</Text>
                    <Text style={styles.overviewTitle}>复习队列</Text>
                    <Text style={styles.overviewSubtitle}>レビュー</Text>

                    {total === 0 ? (
                        <>
                            <Text style={styles.emptyMessage}>没有需要复习的内容！</Text>
                            <Text style={styles.emptySubMessage}>当有项目到期时再回来吧</Text>
                        </>
                    ) : (
                        <>
                            <View style={styles.countsRow}>
                                <View style={styles.countCard}>
                                    <Text style={styles.countNumber}>{grammarCount}</Text>
                                    <Text style={styles.countLabel}>语法</Text>
                                </View>
                                <View style={styles.countCard}>
                                    <Text style={styles.countNumber}>{vocabCount}</Text>
                                    <Text style={styles.countLabel}>词汇</Text>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.startButton} onPress={startReview}>
                                <Text style={styles.startButtonText}>开始复习 ({total})</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>
        );
    }

    // Done
    if (stage === 'done') {
        const total = stats.again + stats.good + stats.easy;

        return (
            <View style={styles.container}>
                <ScrollView contentContainerStyle={styles.doneContent}>
                    <Text style={styles.doneEmoji}>🎉</Text>
                    <Text style={styles.doneTitle}>复习完成！</Text>
                    <Text style={styles.doneTotal}>已复习 {total} 个项目</Text>

                    <View style={styles.doneStats}>
                        <View style={styles.doneStatItem}>
                            <Text style={[styles.doneStatNumber, { color: '#F44336' }]}>{stats.again}</Text>
                            <Text style={styles.doneStatLabel}>再来</Text>
                        </View>
                        <View style={styles.doneStatDivider} />
                        <View style={styles.doneStatItem}>
                            <Text style={[styles.doneStatNumber, { color: '#4CAF50' }]}>{stats.good}</Text>
                            <Text style={styles.doneStatLabel}>记住了</Text>
                        </View>
                        <View style={styles.doneStatDivider} />
                        <View style={styles.doneStatItem}>
                            <Text style={[styles.doneStatNumber, { color: '#00BCD4' }]}>{stats.easy}</Text>
                            <Text style={styles.doneStatLabel}>很简单</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.finishButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.finishButtonText}>完成</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Reviewing
    const card = cards[currentIndex];
    const revealAnim = flipAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>复习 {currentIndex + 1}/{cards.length}</Text>
                <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText}>
                        {card.type === 'grammar' ? '语法' : '词汇'}
                    </Text>
                </View>
            </View>

            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / cards.length) * 100}%` }]} />
            </View>

            <ScrollView contentContainerStyle={styles.reviewContent}>
                {/* Card */}
                <TouchableOpacity
                    style={styles.reviewCard}
                    onPress={handleFlip}
                    activeOpacity={0.9}
                    disabled={flipped}
                >
                    {/* Front — 始终可见 */}
                    <View style={styles.cardFace}>
                        <Text style={styles.cardFront}>{card.front}</Text>
                        {card.frontSub && (
                            <Text style={styles.cardFrontSub}>{card.frontSub}</Text>
                        )}
                        {!flipped && (
                            <Text style={styles.tapHint}>点击翻转</Text>
                        )}
                    </View>

                    {/* Back — 翻转后在下方展开 */}
                    {flipped && (
                        <Animated.View style={[styles.answerSection, { opacity: revealAnim }]}>
                            <View style={styles.answerDivider} />
                            <Text style={styles.cardBack}>{card.back}</Text>
                            {card.backSub && (
                                <Text style={styles.cardBackSub}>{card.backSub}</Text>
                            )}
                        </Animated.View>
                    )}
                </TouchableOpacity>

                {/* Rating buttons */}
                {flipped && (
                    <View style={styles.ratingRow}>
                        <TouchableOpacity
                            style={[styles.rateButton, styles.rateAgain]}
                            onPress={() => handleRate('again')}
                        >
                            <Text style={styles.rateButtonText}>再来</Text>
                            <Text style={styles.rateButtonSub}>1天</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.rateButton, styles.rateGood]}
                            onPress={() => handleRate('good')}
                        >
                            <Text style={styles.rateButtonText}>记住了</Text>
                            <Text style={styles.rateButtonSub}>正常</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.rateButton, styles.rateEasy]}
                            onPress={() => handleRate('easy')}
                        >
                            <Text style={styles.rateButtonText}>很简单</Text>
                            <Text style={styles.rateButtonSub}>1.5倍</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
        paddingHorizontal: 20,
        paddingTop: 60,
    },
    loadingText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 100,
    },
    closeButton: {
        position: 'absolute',
        top: 60,
        left: 20,
        zIndex: 10,
    },
    closeButtonText: {
        color: '#888',
        fontSize: 24,
        fontWeight: '300',
    },
    // Overview
    overviewContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    overviewEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    overviewTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    overviewSubtitle: {
        fontSize: 16,
        color: '#00BCD4',
        marginBottom: 32,
    },
    emptyMessage: {
        fontSize: 18,
        color: '#4CAF50',
        fontWeight: '600',
        marginBottom: 8,
    },
    emptySubMessage: {
        fontSize: 14,
        color: '#888',
    },
    countsRow: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 40,
    },
    countCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        width: 120,
    },
    countNumber: {
        fontSize: 36,
        fontWeight: 'bold',
        color: '#00BCD4',
    },
    countLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    startButton: {
        backgroundColor: '#00BCD4',
        paddingHorizontal: 40,
        paddingVertical: 16,
        borderRadius: 24,
    },
    startButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Header
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    headerTitle: {
        fontSize: 14,
        color: '#00BCD4',
        fontWeight: '600',
    },
    typeBadge: {
        backgroundColor: '#1A1A2E',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    typeBadgeText: {
        color: '#888',
        fontSize: 12,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginBottom: 24,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#00BCD4',
        borderRadius: 2,
    },
    // Reviewing
    reviewContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingBottom: 40,
    },
    reviewCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        padding: 40,
        minHeight: 260,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 32,
    },
    cardFace: {
        alignItems: 'center',
    },
    answerSection: {
        alignItems: 'center',
        width: '100%',
    },
    answerDivider: {
        width: '80%',
        height: 1,
        backgroundColor: '#333',
        marginVertical: 20,
    },
    cardFront: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#fff',
        textAlign: 'center',
        marginBottom: 8,
    },
    cardFrontSub: {
        fontSize: 16,
        color: '#888',
        textAlign: 'center',
        lineHeight: 24,
    },
    tapHint: {
        color: '#555',
        fontSize: 13,
        marginTop: 24,
    },
    cardBack: {
        fontSize: 20,
        color: '#00BCD4',
        textAlign: 'center',
        lineHeight: 30,
        marginBottom: 8,
    },
    cardBackSub: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
    ratingRow: {
        flexDirection: 'row',
        gap: 12,
    },
    rateButton: {
        flex: 1,
        borderRadius: 16,
        paddingVertical: 16,
        alignItems: 'center',
    },
    rateAgain: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        borderWidth: 1,
        borderColor: '#F44336',
    },
    rateGood: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        borderWidth: 1,
        borderColor: '#4CAF50',
    },
    rateEasy: {
        backgroundColor: 'rgba(0, 188, 212, 0.2)',
        borderWidth: 1,
        borderColor: '#00BCD4',
    },
    rateButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    rateButtonSub: {
        color: '#888',
        fontSize: 11,
        marginTop: 2,
    },
    // Done
    doneContent: {
        alignItems: 'center',
        paddingTop: 40,
        paddingBottom: 40,
    },
    doneEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    doneTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    doneTotal: {
        fontSize: 16,
        color: '#888',
        marginBottom: 32,
    },
    doneStats: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        marginBottom: 40,
    },
    doneStatItem: {
        flex: 1,
        alignItems: 'center',
    },
    doneStatNumber: {
        fontSize: 28,
        fontWeight: 'bold',
    },
    doneStatLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    doneStatDivider: {
        width: 1,
        height: 40,
        backgroundColor: '#333',
    },
    finishButton: {
        backgroundColor: '#00BCD4',
        paddingHorizontal: 48,
        paddingVertical: 16,
        borderRadius: 24,
    },
    finishButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
