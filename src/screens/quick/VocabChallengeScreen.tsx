import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Animated, Dimensions, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getAllVocab, getVocab } from '../../db/queries/content';
import { getVocabStates, upsertVocabState, type DbUserVocabState } from '../../db/queries/progress';
import { getBlitzSummary } from '../../llm/client';
import type { Vocab } from '../../schemas/content';
import { speak } from '../../utils/tts';
import { useTheme } from '../../theme';
import type { ColorTokens } from '../../theme';

const GAME_DURATION = 60;
const VICTORY_COUNT = 30; // 30 correct answers to win

export default function VocabChallengeScreen() {
    const navigation = useNavigation();
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    // Game Data
    const [allVocab, setAllVocab] = useState<Vocab[]>([]);
    const [vocabStates, setVocabStates] = useState<Record<number, DbUserVocabState>>({});
    const [loading, setLoading] = useState(true);
    const [isPlaying, setIsPlaying] = useState(false);

    // Game State
    const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
    const [score, setScore] = useState(0);
    const [streak, setStreak] = useState(0);
    const [correctCount, setCorrectCount] = useState(0);
    const [wrongWords, setWrongWords] = useState<string[]>([]);

    const [currentQuestion, setCurrentQuestion] = useState<{
        target: Vocab;
        options: Vocab[];
        correctIndex: number;
    } | null>(null);

    // AI and End Game State
    const [gameResult, setGameResult] = useState<'win' | 'lose' | null>(null);
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);

    // Animations
    const timerAnim = useRef(new Animated.Value(1)).current;
    const streakScale = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isPlaying && timeLeft > 0 && !gameResult) {
            interval = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        finishGame('lose');
                        return 0;
                    }
                    return prev - 1;
                });
                Animated.timing(timerAnim, {
                    toValue: (timeLeft - 1) / GAME_DURATION,
                    duration: 1000,
                    useNativeDriver: false
                }).start();
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isPlaying, timeLeft, gameResult]);

    const loadData = async () => {
        try {
            const vocab = await getAllVocab();
            const states = await getVocabStates(vocab.map(v => v.vocabId));
            const stateMap: Record<number, DbUserVocabState> = {};
            states.forEach(s => stateMap[s.vocabId] = s);

            setAllVocab(vocab);
            setVocabStates(stateMap);
            setLoading(false);
        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    const startGame = () => {
        setScore(0);
        setStreak(0);
        setCorrectCount(0);
        setWrongWords([]);
        setTimeLeft(GAME_DURATION);
        setGameResult(null);
        setAiSummary(null);
        timerAnim.setValue(1);
        setIsPlaying(true);
        nextQuestion();
    };

    const finishGame = async (result: 'win' | 'lose') => {
        setIsPlaying(false);
        setGameResult(result);
        setLoadingSummary(true);

        // Call AI for summary
        try {
            const res = await getBlitzSummary({
                score,
                streak,
                correctCount,
                wrongWords: [...new Set(wrongWords)].slice(0, 5) // Limit to 5 unique wrong words
            });
            if (res.ok && res.data) {
                setAiSummary(res.data.comment);
            } else {
                setAiSummary(res.error || '老师正在忙...');
            }
        } catch (e) {
            setAiSummary('老师去喝茶了...');
        } finally {
            setLoadingSummary(false);
        }
    };

    const nextQuestion = () => {
        if (allVocab.length < 4) return;

        // Weighted Random Selection: Prefer lower strength
        // Weight = 11 - strength (0->11, 10->1)
        let totalWeight = 0;
        const weightedItems = allVocab.map(v => {
            const state = vocabStates[v.vocabId];
            const strength = state ? state.strength : 0;
            const weight = Math.max(1, 11 - strength);
            totalWeight += weight;
            return { v, weight };
        });

        let random = Math.random() * totalWeight;
        let target = allVocab[0];
        for (const item of weightedItems) {
            random -= item.weight;
            if (random <= 0) {
                target = item.v;
                break;
            }
        }

        // Pick 3 distractors (simple random for now)
        const options = [target];
        while (options.length < 4) {
            const d = allVocab[Math.floor(Math.random() * allVocab.length)];
            if (!options.find(o => o.vocabId === d.vocabId)) {
                options.push(d);
            }
        }

        // Shuffle options
        const shuffled = options.sort(() => Math.random() - 0.5);
        const correctIndex = shuffled.findIndex(o => o.vocabId === target.vocabId);

        setCurrentQuestion({
            target,
            options: shuffled,
            correctIndex
        });
    };

    useEffect(() => {
        if (currentQuestion?.target) {
            speak(currentQuestion.target.surface);
        }
    }, [currentQuestion]);

    const updateVocabMastery = async (vocabId: number, isCorrect: boolean) => {
        const currentState = vocabStates[vocabId] || {
            vocabId,
            strength: 0,
            lastSeenAt: 0,
            nextReviewAt: 0,
            isBlocking: 0,
            wrongCount7d: 0
        };

        const newState = { ...currentState };
        newState.lastSeenAt = Date.now();

        if (isCorrect) {
            newState.strength = Math.min(10, newState.strength + 1);
        } else {
            newState.strength = Math.max(0, newState.strength - 2);
            newState.wrongCount7d += 1;
        }

        // Optimistic update
        setVocabStates(prev => ({ ...prev, [vocabId]: newState }));

        // DB update (fire and forget)
        upsertVocabState(newState).catch(console.error);
    };

    const handleAnswer = (index: number) => {
        if (!currentQuestion) return;

        if (index === currentQuestion.correctIndex) {
            // Correct
            const multiplier = Math.min(5, 1 + Math.floor(streak / 5));
            setScore(s => s + 10 * multiplier);
            setStreak(s => s + 1);
            setCorrectCount(c => c + 1);
            // Dynamic Time Bonus: diminishing returns
            // 0-10: +2s, 11-20: +1s, 20+: +0.5s ? Or simpler: just +1s after 10.
            const bonus = correctCount < 10 ? 2 : 1;
            setTimeLeft(t => Math.min(GAME_DURATION, t + bonus));

            updateVocabMastery(currentQuestion.target.vocabId, true);

            // Streak animation
            Animated.sequence([
                Animated.timing(streakScale, { toValue: 1.5, duration: 100, useNativeDriver: true }),
                Animated.timing(streakScale, { toValue: 1, duration: 100, useNativeDriver: true })
            ]).start();

            // Check Victory
            if (correctCount + 1 >= VICTORY_COUNT) {
                finishGame('win');
                return;
            }

        } else {
            // Wrong
            setStreak(0);
            setTimeLeft(t => Math.max(0, t - 5)); // Penalty time
            setWrongWords(prev => [...prev, currentQuestion.target.surface]);
            updateVocabMastery(currentQuestion.target.vocabId, false);
        }
        nextQuestion();
    };

    if (loading) return <View style={styles.container} />;

    if (!isPlaying && !gameResult) {
        return (
            <View style={styles.containerCenter}>
                <Text style={styles.titleEmoji}>🎯</Text>
                <Text style={styles.gameTitle}>词汇大暴走</Text>
                <Text style={styles.gameDesc}>60秒极限挑战！</Text>
                <Text style={styles.gameDesc}>目标：完成 {VICTORY_COUNT} 个词汇</Text>
                <Text style={styles.gameDesc}>优先出现不熟练的单词</Text>

                <TouchableOpacity style={styles.startButton} onPress={startGame}>
                    <Text style={styles.startButtonText}>开始挑战</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>返回</Text>
                </TouchableOpacity>
            </View>
        );
    }

    if (gameResult) {
        return (
            <View style={styles.containerCenter}>
                <Text style={styles.titleEmoji}>{gameResult === 'win' ? '🎉' : '⏰'}</Text>
                <Text style={styles.gameTitle}>{gameResult === 'win' ? '挑战成功！' : '时间到！'}</Text>

                <View style={styles.resultStats}>
                    <Text style={styles.statText}>最终得分: {score}</Text>
                    <Text style={styles.statText}>最高连击: {streak}</Text>
                    <Text style={styles.statText}>答对数: {correctCount}/{VICTORY_COUNT}</Text>
                </View>

                {loadingSummary ? (
                    <View style={styles.summaryContainer}>
                        <ActivityIndicator color={colors.primary} />
                        <Text style={styles.summaryText}>樱花老师正在思考点评...</Text>
                    </View>
                ) : (
                    <View style={styles.summaryContainer}>
                        <Text style={styles.summaryLabel}>🌸 樱花老师的点评</Text>
                        <Text style={styles.summaryText}>{aiSummary}</Text>
                    </View>
                )}

                <TouchableOpacity style={styles.startButton} onPress={startGame}>
                    <Text style={styles.startButtonText}>再来一局</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>退出</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* HUD */}
            <View style={styles.hud}>
                <View style={styles.scoreContainer}>
                    <Text style={styles.scoreLabel}>GOAL: {correctCount}/{VICTORY_COUNT}</Text>
                    <Text style={styles.scoreValue}>{score}</Text>
                </View>
                <View style={styles.timerContainer}>
                    <Animated.View
                        style={[
                            styles.timerBar,
                            {
                                width: timerAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0%', '100%']
                                }),
                                backgroundColor: timeLeft < 10 ? colors.errorLight : colors.success
                            }
                        ]}
                    />
                    <Text style={styles.timerText}>{timeLeft}s</Text>
                </View>
            </View>

            {/* Streak */}
            {streak > 2 && (
                <Animated.View style={[styles.streakContainer, { transform: [{ scale: streakScale }] }]}>
                    <Text style={styles.streakText}>{streak} COMBO!</Text>
                </Animated.View>
            )}

            {/* Question */}
            <View style={styles.questionContainer}>
                <Text style={styles.questionWord}>{currentQuestion?.target.surface}</Text>
                <View style={styles.readingContainer}>
                    <Text style={styles.questionReading}>
                        {currentQuestion?.target.reading}
                    </Text>
                    {currentQuestion && vocabStates[currentQuestion.target.vocabId] && (
                        <View style={styles.masteryBadge}>
                            <Text style={styles.masteryText}>
                                Lv.{vocabStates[currentQuestion.target.vocabId].strength}
                            </Text>
                        </View>
                    )}
                </View>
            </View>

            {/* Options */}
            <View style={styles.optionsGrid}>
                {currentQuestion?.options.map((opt, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={styles.optionButton}
                        onPress={() => handleAnswer(idx)}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.optionText}>
                            {opt.meanings[0] || '???'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
        </View>
    );
}

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
        padding: 20,
    },
    containerCenter: {
        flex: 1,
        backgroundColor: c.bg,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    titleEmoji: {
        fontSize: 64,
        marginBottom: 20,
    },
    gameTitle: {
        fontSize: 32,
        color: c.textPrimary,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    gameDesc: {
        fontSize: 16,
        color: c.textMuted,
        marginBottom: 5,
    },
    resultStats: {
        marginVertical: 20,
        backgroundColor: '#232342',
        padding: 20,
        borderRadius: 16,
        width: '100%',
        alignItems: 'center',
    },
    statText: {
        color: c.textPrimary,
        fontSize: 18,
        marginBottom: 8,
    },
    summaryContainer: {
        width: '100%',
        backgroundColor: c.bgCard,
        padding: 20,
        borderRadius: 16,
        marginBottom: 30,
        minHeight: 100,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: c.primary,
    },
    summaryLabel: {
        color: c.primary,
        fontWeight: 'bold',
        marginBottom: 10,
        alignSelf: 'flex-start',
    },
    summaryText: {
        color: '#EEE',
        fontSize: 16,
        lineHeight: 24,
        textAlign: 'left',
        width: '100%',
    },
    startButton: {
        backgroundColor: c.primary,
        paddingHorizontal: 40,
        paddingVertical: 16,
        borderRadius: 30,
        marginTop: 10,
    },
    startButtonText: {
        color: c.textPrimary,
        fontSize: 20,
        fontWeight: 'bold',
    },
    backButton: {
        marginTop: 20,
    },
    backButtonText: {
        color: c.textSubtle,
        fontSize: 16,
    },
    hud: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 40,
    },
    scoreContainer: {
        alignItems: 'flex-start',
    },
    scoreLabel: {
        color: c.textMuted,
        fontSize: 12,
        fontWeight: 'bold',
    },
    scoreValue: {
        color: c.gold,
        fontSize: 24,
        fontWeight: 'bold',
    },
    timerContainer: {
        flex: 1,
        marginLeft: 20,
        height: 10,
        backgroundColor: c.border,
        borderRadius: 5,
        justifyContent: 'center',
    },
    timerBar: {
        height: '100%',
        borderRadius: 5,
    },
    timerText: {
        position: 'absolute',
        top: -20,
        right: 0,
        color: c.textPrimary,
        fontWeight: 'bold',
    },
    streakContainer: {
        position: 'absolute',
        top: 100,
        width: '100%',
        alignItems: 'center',
        zIndex: 10,
    },
    streakText: {
        color: '#FF4081',
        fontSize: 28,
        fontWeight: 'bold',
        fontStyle: 'italic',
        textShadowColor: 'rgba(255, 64, 129, 0.5)',
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 10,
    },
    questionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 40,
    },
    questionWord: {
        color: c.textPrimary,
        fontSize: 48,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    readingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
    },
    questionReading: {
        color: c.textSecondary,
        fontSize: 24,
        marginRight: 10,
    },
    masteryBadge: {
        backgroundColor: c.border,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    masteryText: {
        color: c.success,
        fontSize: 12,
        fontWeight: 'bold',
    },
    optionsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        gap: 16,
    },
    optionButton: {
        width: '47%',
        backgroundColor: '#232342',
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: c.border,
        marginBottom: 16,
    },
    optionText: {
        color: '#EEE',
        fontSize: 18,
        textAlign: 'center',
    },
});
