// src/screens/quick/DictationScreen.tsx
// Quick Access: Dictation Practice (听写练习)

import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, TextInput,
    KeyboardAvoidingView, Platform, ScrollView, Animated,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getUserProgress, getVocabForReview, upsertVocabState, getVocabState } from '../../db/queries/progress';
import { getVocabByIds, getSentencesByLesson } from '../../db/queries/content';
import type { Vocab, Sentence } from '../../schemas/content';
import { speak, stop } from '../../utils/tts';
import { computeVocabSM2Interval } from '../../engine/scorer';

interface DictationItem {
    type: 'vocab' | 'sentence';
    id: number;
    displayText: string; // What TTS reads
    answer: string;      // Expected user input (kana)
    hint: string;        // Meaning hint shown after answer
}

interface DictationResult {
    item: DictationItem;
    userInput: string;
    isCorrect: boolean;
    similarity: number;
}

export default function DictationScreen() {
    const navigation = useNavigation();

    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState<'intro' | 'playing' | 'result'>('intro');
    const [items, setItems] = useState<DictationItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [userInput, setUserInput] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [currentResult, setCurrentResult] = useState<{ isCorrect: boolean; similarity: number } | null>(null);
    const [results, setResults] = useState<DictationResult[]>([]);

    const inputRef = useRef<TextInput>(null);
    const feedbackAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadData();
        return () => { stop(); };
    }, []);

    const loadData = async () => {
        try {
            const progress = await getUserProgress();
            const allItems: DictationItem[] = [];

            // Phase 1: Vocab items (review-due preferred)
            const today = Date.now();
            const reviewVocab = await getVocabForReview(today, 8);
            let vocabIds = reviewVocab.map(v => v.vocabId);

            // If not enough review vocab, just use lesson vocab
            if (vocabIds.length < 5) {
                const { getVocabPack } = await import('../../db/queries/content');
                const pack = await getVocabPack(progress.currentLessonId);
                if (pack) {
                    const extraIds = pack.vocabIds.filter(id => !vocabIds.includes(id));
                    vocabIds = [...vocabIds, ...extraIds].slice(0, 8);
                }
            }

            const vocabItems = await getVocabByIds(vocabIds);
            const shuffledVocab = shuffleArray(vocabItems).slice(0, 5);

            for (const v of shuffledVocab) {
                allItems.push({
                    type: 'vocab',
                    id: v.vocabId,
                    displayText: v.reading,
                    answer: v.reading,
                    hint: v.meanings[0] || '',
                });
            }

            // Phase 2: Short sentences
            const sentences = await getSentencesByLesson(progress.currentLessonId);
            const shortSentences = sentences.filter(s => s.text.length <= 15);
            const shuffledSentences = shuffleArray(shortSentences).slice(0, 5);

            for (const s of shuffledSentences) {
                allItems.push({
                    type: 'sentence',
                    id: s.sentenceId,
                    displayText: s.text,
                    answer: s.text,
                    hint: s.keyPoints.map(kp => kp.labelZh).join('；') || '',
                });
            }

            setItems(allItems);
            setLoading(false);
        } catch (e) {
            console.error('[Dictation] Load failed:', e);
            setLoading(false);
        }
    };

    const shuffleArray = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const startDictation = () => {
        setStage('playing');
        setTimeout(() => playCurrent(), 300);
    };

    const playCurrent = (slow = false) => {
        if (items.length === 0) return;
        speak(items[currentIndex].displayText, { rate: slow ? 0.6 : 0.9 });
    };

    const handleSubmit = async () => {
        if (submitted || userInput.trim() === '') return;

        const item = items[currentIndex];
        const { match, score } = fuzzyMatch(userInput, item.answer);

        setCurrentResult({ isCorrect: match, similarity: score });
        setSubmitted(true);

        Animated.spring(feedbackAnim, { toValue: 1, useNativeDriver: true }).start();

        const newResult: DictationResult = {
            item,
            userInput: userInput.trim(),
            isCorrect: match,
            similarity: score,
        };
        setResults(prev => [...prev, newResult]);

        // Update vocab strength if it's a vocab item
        if (item.type === 'vocab') {
            try {
                const state = await getVocabState(item.id);
                const currentStrength = state?.strength ?? 0;
                const delta = match ? 2 : -2;
                const newStrength = Math.max(0, Math.min(100, currentStrength + delta));
                const nextDays = computeVocabSM2Interval(newStrength, match);
                const now = Date.now();

                await upsertVocabState({
                    vocabId: item.id,
                    strength: newStrength,
                    lastSeenAt: now,
                    nextReviewAt: now + nextDays * 24 * 60 * 60 * 1000,
                    isBlocking: state?.isBlocking ?? 0,
                    wrongCount7d: match ? (state?.wrongCount7d ?? 0) : (state?.wrongCount7d ?? 0) + 1,
                });
            } catch (e) {
                console.warn('[Dictation] Failed to update vocab state:', e);
            }
        }
    };

    const handleNext = () => {
        if (currentIndex + 1 >= items.length) {
            setStage('result');
            return;
        }

        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setUserInput('');
        setSubmitted(false);
        setCurrentResult(null);
        feedbackAnim.setValue(0);

        setTimeout(() => {
            speak(items[nextIndex].displayText, { rate: 0.9 });
            inputRef.current?.focus();
        }, 300);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>加载中...</Text>
            </View>
        );
    }

    if (items.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.emptyText}>暂无可用的听写内容</Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>返回</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Intro
    if (stage === 'intro') {
        return (
            <View style={styles.container}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>

                <View style={styles.introContent}>
                    <Text style={styles.introEmoji}>✍️</Text>
                    <Text style={styles.introTitle}>听写练习</Text>
                    <Text style={styles.introSubtitle}>ディクテーション</Text>
                    <Text style={styles.introDesc}>
                        听一个词或短句，输入你听到的内容。{'\n'}
                        支持假名和汉字输入。
                    </Text>
                    <Text style={styles.introCount}>已准备 {items.length} 道题</Text>

                    <TouchableOpacity style={styles.startButton} onPress={startDictation}>
                        <Text style={styles.startButtonText}>开始</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Result
    if (stage === 'result') {
        const correctCount = results.filter(r => r.isCorrect).length;
        const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

        return (
            <View style={styles.container}>
                <ScrollView contentContainerStyle={styles.resultContent}>
                    <Text style={styles.resultEmoji}>
                        {accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪'}
                    </Text>
                    <Text style={styles.resultTitle}>听写完成！</Text>
                    <Text style={styles.resultAccuracy}>{accuracy}%</Text>
                    <Text style={styles.resultLabel}>正确率</Text>

                    {/* Detail list */}
                    <View style={styles.resultList}>
                        {results.map((r, i) => (
                            <View key={i} style={[styles.resultItem, r.isCorrect ? styles.resultItemCorrect : styles.resultItemWrong]}>
                                <Text style={styles.resultItemEmoji}>{r.isCorrect ? '✓' : '✗'}</Text>
                                <View style={styles.resultItemContent}>
                                    <Text style={styles.resultItemAnswer}>{r.item.answer}</Text>
                                    {!r.isCorrect && (
                                        <Text style={styles.resultItemUser}>你的输入：{r.userInput}</Text>
                                    )}
                                </View>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity style={styles.finishButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.finishButtonText}>完成</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Playing
    const currentItem = items[currentIndex];

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>
                    {currentItem.type === 'vocab' ? '词汇' : '句子'} {currentIndex + 1}/{items.length}
                </Text>
                <Text style={styles.headerScore}>
                    {results.filter(r => r.isCorrect).length}/{results.length}
                </Text>
            </View>

            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / items.length) * 100}%` }]} />
            </View>

            <ScrollView contentContainerStyle={styles.playContent}>
                {/* Audio controls */}
                <View style={styles.audioCard}>
                    <TouchableOpacity style={styles.playButton} onPress={() => playCurrent()}>
                        <Text style={styles.playButtonEmoji}>🔊</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.slowButton} onPress={() => playCurrent(true)}>
                        <Text style={styles.slowButtonText}>🐢 慢速</Text>
                    </TouchableOpacity>

                    {currentItem.hint.length > 0 && (
                        <Text style={styles.hintText}>提示：{currentItem.hint}</Text>
                    )}
                </View>

                {/* Input */}
                <TextInput
                    ref={inputRef}
                    style={[
                        styles.textInput,
                        submitted && currentResult?.isCorrect && styles.textInputCorrect,
                        submitted && !currentResult?.isCorrect && styles.textInputWrong,
                    ]}
                    value={userInput}
                    onChangeText={setUserInput}
                    placeholder="输入你听到的内容..."
                    placeholderTextColor="#555"
                    editable={!submitted}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSubmit}
                />

                {/* Feedback */}
                {submitted && currentResult && (
                    <Animated.View style={[styles.feedbackCard, { opacity: feedbackAnim }]}>
                        <Text style={styles.feedbackEmoji}>
                            {currentResult.isCorrect ? '✅' : '❌'}
                        </Text>
                        <Text style={styles.feedbackTitle}>
                            {currentResult.isCorrect ? '正确！' : '还差一点...'}
                        </Text>
                        {!currentResult.isCorrect && (
                            <View style={styles.comparisonContainer}>
                                <Text style={styles.comparisonLabel}>正确答案：</Text>
                                <Text style={styles.comparisonAnswer}>{currentItem.answer}</Text>
                                <Text style={styles.comparisonLabel}>你的输入：</Text>
                                <Text style={styles.comparisonUser}>{userInput}</Text>
                                <Text style={styles.similarityText}>
                                    相似度：{Math.round(currentResult.similarity * 100)}%
                                </Text>
                            </View>
                        )}
                    </Animated.View>
                )}

                {/* Action buttons */}
                {!submitted ? (
                    <TouchableOpacity
                        style={[styles.submitButton, userInput.trim() === '' && styles.submitButtonDisabled]}
                        onPress={handleSubmit}
                        disabled={userInput.trim() === ''}
                    >
                        <Text style={styles.submitButtonText}>提交</Text>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
                        <Text style={styles.nextButtonText}>
                            {currentIndex + 1 >= items.length ? '查看结果' : '下一题'}
                        </Text>
                    </TouchableOpacity>
                )}
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ============ Fuzzy Matching ============

function fuzzyMatch(userInput: string, correctAnswer: string): { match: boolean; score: number } {
    const normalize = (s: string) =>
        s.trim()
            .replace(/\s+/g, '')
            .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

    const a = normalize(userInput);
    const b = normalize(correctAnswer);

    if (a === b) return { match: true, score: 1.0 };

    const distance = levenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return { match: true, score: 1.0 };

    const similarity = 1 - distance / maxLen;
    return { match: similarity >= 0.8, score: similarity };
}

function levenshtein(a: string, b: string): number {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dp[i][j] = Math.min(
                dp[i - 1][j] + 1,
                dp[i][j - 1] + 1,
                dp[i - 1][j - 1] + cost
            );
        }
    }

    return dp[m][n];
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
    emptyText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 100,
        fontSize: 16,
    },
    backButton: {
        alignSelf: 'center',
        marginTop: 20,
        paddingHorizontal: 24,
        paddingVertical: 12,
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
    },
    backButtonText: {
        color: '#9C27B0',
        fontSize: 16,
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
    // Intro
    introContent: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    introEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    introTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    introSubtitle: {
        fontSize: 16,
        color: '#9C27B0',
        marginBottom: 24,
    },
    introDesc: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 16,
        paddingHorizontal: 20,
    },
    introCount: {
        fontSize: 14,
        color: '#666',
        marginBottom: 40,
    },
    startButton: {
        backgroundColor: '#9C27B0',
        paddingHorizontal: 48,
        paddingVertical: 16,
        borderRadius: 24,
    },
    startButtonText: {
        color: '#fff',
        fontSize: 20,
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
        color: '#9C27B0',
        fontWeight: '600',
    },
    headerScore: {
        fontSize: 14,
        color: '#888',
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginBottom: 24,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#9C27B0',
        borderRadius: 2,
    },
    // Playing
    playContent: {
        paddingBottom: 40,
    },
    audioCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 20,
        padding: 24,
        alignItems: 'center',
        marginBottom: 24,
    },
    playButton: {
        marginBottom: 12,
    },
    playButtonEmoji: {
        fontSize: 48,
    },
    slowButton: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: '#333',
        borderRadius: 16,
        marginBottom: 12,
    },
    slowButtonText: {
        color: '#aaa',
        fontSize: 14,
    },
    hintText: {
        color: '#666',
        fontSize: 13,
        fontStyle: 'italic',
    },
    textInput: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        fontSize: 20,
        color: '#fff',
        textAlign: 'center',
        borderWidth: 2,
        borderColor: '#333',
        marginBottom: 16,
    },
    textInputCorrect: {
        borderColor: '#4CAF50',
    },
    textInputWrong: {
        borderColor: '#F44336',
    },
    feedbackCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
        marginBottom: 16,
    },
    feedbackEmoji: {
        fontSize: 36,
        marginBottom: 8,
    },
    feedbackTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 12,
    },
    comparisonContainer: {
        alignItems: 'center',
        gap: 4,
    },
    comparisonLabel: {
        fontSize: 12,
        color: '#666',
        marginTop: 8,
    },
    comparisonAnswer: {
        fontSize: 18,
        color: '#4CAF50',
        fontWeight: '600',
    },
    comparisonUser: {
        fontSize: 18,
        color: '#F44336',
    },
    similarityText: {
        fontSize: 12,
        color: '#888',
        marginTop: 8,
    },
    submitButton: {
        backgroundColor: '#9C27B0',
        paddingVertical: 16,
        borderRadius: 20,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        opacity: 0.5,
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    nextButton: {
        backgroundColor: '#9C27B0',
        paddingVertical: 16,
        borderRadius: 20,
        alignItems: 'center',
    },
    nextButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Result
    resultContent: {
        alignItems: 'center',
        paddingTop: 20,
        paddingBottom: 40,
    },
    resultEmoji: {
        fontSize: 64,
        marginBottom: 16,
    },
    resultTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    resultAccuracy: {
        fontSize: 64,
        fontWeight: 'bold',
        color: '#9C27B0',
    },
    resultLabel: {
        fontSize: 14,
        color: '#888',
        marginBottom: 24,
    },
    resultList: {
        width: '100%',
        gap: 8,
        marginBottom: 32,
    },
    resultItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 14,
        borderLeftWidth: 4,
    },
    resultItemCorrect: {
        borderLeftColor: '#4CAF50',
    },
    resultItemWrong: {
        borderLeftColor: '#F44336',
    },
    resultItemEmoji: {
        fontSize: 18,
        marginRight: 12,
        color: '#fff',
    },
    resultItemContent: {
        flex: 1,
    },
    resultItemAnswer: {
        fontSize: 16,
        color: '#fff',
    },
    resultItemUser: {
        fontSize: 13,
        color: '#F44336',
        marginTop: 2,
    },
    finishButton: {
        backgroundColor: '#9C27B0',
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
