// src/screens/quick/ListeningQuizScreen.tsx
// Quick Access: Listening Comprehension Quiz (听句选意)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getUserProgress } from '../../db/queries/progress';
import { getSentencesByLesson, getAllLessons } from '../../db/queries/content';
import type { Sentence } from '../../schemas/content';
import { speak, stop } from '../../utils/tts';

const QUIZ_COUNT = 10;

interface QuizQuestion {
    sentence: Sentence;
    correctTranslation: string;
    options: string[];
    correctIndex: number;
}

export default function ListeningQuizScreen() {
    const navigation = useNavigation();

    const [loading, setLoading] = useState(true);
    const [stage, setStage] = useState<'intro' | 'playing' | 'result'>('intro');
    const [questions, setQuestions] = useState<QuizQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [correct, setCorrect] = useState(0);
    const [wrong, setWrong] = useState(0);
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    const scaleAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        loadData();
        return () => { stop(); };
    }, []);

    const loadData = async () => {
        try {
            const progress = await getUserProgress();
            const lessons = await getAllLessons();
            const learnedLessons = lessons.filter(l => l.lessonId <= progress.currentLessonId);

            const allSentences: Sentence[] = [];
            for (const lesson of learnedLessons) {
                const sentences = await getSentencesByLesson(lesson.lessonId);
                allSentences.push(...sentences);
            }

            if (allSentences.length < 4) {
                setLoading(false);
                return;
            }

            // Shuffle and pick QUIZ_COUNT
            const shuffled = shuffleArray(allSentences);
            const selected = shuffled.slice(0, QUIZ_COUNT);

            // Generate questions
            const quizQuestions: QuizQuestion[] = selected.map(sentence => {
                const correctTranslation = generateTranslation(sentence);

                // Pick 3 distractors from other sentences
                const others = shuffled.filter(s => s.sentenceId !== sentence.sentenceId);
                const distractors = shuffleArray(others)
                    .slice(0, 3)
                    .map(s => generateTranslation(s));

                const options = shuffleArray([correctTranslation, ...distractors]);
                const correctIndex = options.indexOf(correctTranslation);

                return { sentence, correctTranslation, options, correctIndex };
            });

            setQuestions(quizQuestions);
            setLoading(false);
        } catch (e) {
            console.error('[ListeningQuiz] Load failed:', e);
            setLoading(false);
        }
    };

    const generateTranslation = (sentence: Sentence): string => {
        if (sentence.keyPoints.length > 0) {
            const translation = sentence.keyPoints.map(kp => kp.labelZh).join('；');
            // Only use keyPoints if it looks like a real sentence translation (>6 chars)
            // Short labels like "定语从句" are grammar concepts, not translations
            if (translation.length > 6) {
                return translation;
            }
        }
        return sentence.text;
    };

    const shuffleArray = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const startQuiz = () => {
        setStage('playing');
        playCurrentSentence();
    };

    const playCurrentSentence = (slow = false) => {
        if (questions.length === 0) return;
        const sentence = questions[currentIndex].sentence;
        setIsPlaying(true);
        speak(sentence.text, { rate: slow ? 0.6 : 0.9 }).finally(() => setIsPlaying(false));
    };

    const handleSelect = (index: number) => {
        if (showFeedback) return;

        setSelectedIndex(index);
        const isCorrect = index === questions[currentIndex].correctIndex;
        setLastCorrect(isCorrect);

        if (isCorrect) {
            setCorrect(prev => prev + 1);
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.05, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
            ]).start();
        } else {
            setWrong(prev => prev + 1);
        }

        setShowFeedback(true);
    };

    const handleNext = () => {
        if (currentIndex + 1 >= questions.length) {
            setStage('result');
            return;
        }

        const nextIndex = currentIndex + 1;
        setCurrentIndex(nextIndex);
        setShowFeedback(false);
        setSelectedIndex(null);

        // Auto play next sentence after a short delay
        setTimeout(() => {
            speak(questions[nextIndex].sentence.text, { rate: 0.9 });
        }, 300);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <Text style={styles.loadingText}>加载中...</Text>
            </View>
        );
    }

    if (questions.length === 0) {
        return (
            <View style={styles.container}>
                <Text style={styles.emptyText}>
                    句子数量不足，至少需要学习到2节课以上。{'\n'}
                    请先在「设置」中注入测试数据，或完成更多日常训练。
                </Text>
                <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonText}>返回</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Intro stage
    if (stage === 'intro') {
        return (
            <View style={styles.container}>
                <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>

                <View style={styles.introContent}>
                    <Text style={styles.introEmoji}>👂</Text>
                    <Text style={styles.introTitle}>听力选择</Text>
                    <Text style={styles.introSubtitle}>リスニング</Text>
                    <Text style={styles.introDesc}>
                        听一段日语句子，选择正确的含义。{'\n'}
                        可以用正常或慢速重播。
                    </Text>
                    <Text style={styles.introCount}>已准备 {questions.length} 道题</Text>

                    <TouchableOpacity style={styles.startButton} onPress={startQuiz}>
                        <Text style={styles.startButtonText}>开始</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // Result stage
    if (stage === 'result') {
        const total = correct + wrong;
        const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

        return (
            <View style={styles.container}>
                <ScrollView contentContainerStyle={styles.resultContent}>
                    <Text style={styles.resultEmoji}>
                        {accuracy >= 80 ? '🎉' : accuracy >= 50 ? '👍' : '💪'}
                    </Text>
                    <Text style={styles.resultTitle}>练习完成！</Text>
                    <Text style={styles.resultAccuracy}>{accuracy}%</Text>
                    <Text style={styles.resultLabel}>正确率</Text>

                    <View style={styles.resultStats}>
                        <View style={styles.resultStatItem}>
                            <Text style={styles.resultStatNumber}>{correct}</Text>
                            <Text style={styles.resultStatLabel}>正确</Text>
                        </View>
                        <View style={styles.resultStatDivider} />
                        <View style={styles.resultStatItem}>
                            <Text style={[styles.resultStatNumber, { color: '#F44336' }]}>{wrong}</Text>
                            <Text style={styles.resultStatLabel}>错误</Text>
                        </View>
                    </View>

                    <TouchableOpacity style={styles.finishButton} onPress={() => navigation.goBack()}>
                        <Text style={styles.finishButtonText}>完成</Text>
                    </TouchableOpacity>
                </ScrollView>
            </View>
        );
    }

    // Playing stage
    const currentQ = questions[currentIndex];

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={styles.closeButtonText}>x</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>听力 {currentIndex + 1}/{questions.length}</Text>
                <View style={styles.scoreContainer}>
                    <Text style={styles.scoreCorrect}>{correct}</Text>
                    <Text style={styles.scoreDivider}>/</Text>
                    <Text style={styles.scoreWrong}>{wrong}</Text>
                </View>
            </View>

            {/* Progress bar */}
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / questions.length) * 100}%` }]} />
            </View>

            <ScrollView contentContainerStyle={styles.playContent}>
                {/* Audio controls */}
                <Animated.View style={[styles.audioCard, { transform: [{ scale: scaleAnim }] }]}>
                    <TouchableOpacity
                        style={styles.playButton}
                        onPress={() => playCurrentSentence(false)}
                        disabled={isPlaying}
                    >
                        <Text style={styles.playButtonEmoji}>🔊</Text>
                        <Text style={styles.playButtonText}>播放</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.slowButton}
                        onPress={() => playCurrentSentence(true)}
                        disabled={isPlaying}
                    >
                        <Text style={styles.slowButtonText}>🐢 慢速</Text>
                    </TouchableOpacity>
                </Animated.View>

                {/* Show sentence text after answering */}
                {showFeedback && (
                    <View style={styles.revealCard}>
                        <Text style={styles.revealText}>{currentQ.sentence.text}</Text>
                        <Text style={styles.revealTranslation}>{currentQ.correctTranslation}</Text>
                    </View>
                )}

                {/* Options */}
                <View style={styles.optionsContainer}>
                    {currentQ.options.map((option, index) => (
                        <TouchableOpacity
                            key={index}
                            style={[
                                styles.option,
                                showFeedback && index === currentQ.correctIndex && styles.optionCorrect,
                                showFeedback && selectedIndex === index && index !== currentQ.correctIndex && styles.optionWrong,
                            ]}
                            onPress={() => handleSelect(index)}
                            disabled={showFeedback}
                            activeOpacity={0.7}
                        >
                            <Text style={styles.optionLabel}>{String.fromCharCode(65 + index)}</Text>
                            <Text style={styles.optionText}>{option}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Continue button */}
                {showFeedback && (
                    <TouchableOpacity style={styles.continueButton} onPress={handleNext}>
                        <Text style={styles.continueButtonText}>
                            {currentIndex + 1 >= questions.length ? '查看结果' : '下一题'}
                        </Text>
                    </TouchableOpacity>
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
    emptyText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 100,
        fontSize: 16,
        lineHeight: 24,
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
        color: '#00BCD4',
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
        color: '#00BCD4',
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
        backgroundColor: '#00BCD4',
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
        color: '#00BCD4',
        fontWeight: '600',
    },
    scoreContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    scoreCorrect: {
        color: '#4CAF50',
        fontSize: 16,
        fontWeight: 'bold',
    },
    scoreDivider: {
        color: '#444',
        fontSize: 14,
        marginHorizontal: 4,
    },
    scoreWrong: {
        color: '#F44336',
        fontSize: 16,
        fontWeight: 'bold',
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
    // Playing
    playContent: {
        paddingBottom: 40,
    },
    audioCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        marginBottom: 20,
    },
    playButton: {
        alignItems: 'center',
        marginBottom: 16,
    },
    playButtonEmoji: {
        fontSize: 48,
        marginBottom: 8,
    },
    playButtonText: {
        color: '#00BCD4',
        fontSize: 16,
        fontWeight: '600',
    },
    slowButton: {
        paddingHorizontal: 20,
        paddingVertical: 8,
        backgroundColor: '#333',
        borderRadius: 16,
    },
    slowButtonText: {
        color: '#aaa',
        fontSize: 14,
    },
    revealCard: {
        backgroundColor: 'rgba(0, 188, 212, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        borderLeftWidth: 3,
        borderLeftColor: '#00BCD4',
    },
    revealText: {
        color: '#fff',
        fontSize: 18,
        lineHeight: 28,
        marginBottom: 8,
    },
    revealTranslation: {
        color: '#00BCD4',
        fontSize: 14,
    },
    optionsContainer: {
        gap: 10,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    optionCorrect: {
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.15)',
    },
    optionWrong: {
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.15)',
    },
    optionLabel: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#333',
        color: '#fff',
        textAlign: 'center',
        lineHeight: 28,
        fontSize: 12,
        fontWeight: 'bold',
        marginRight: 12,
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        color: '#fff',
        lineHeight: 22,
    },
    continueButton: {
        backgroundColor: '#00BCD4',
        paddingVertical: 14,
        borderRadius: 20,
        alignItems: 'center',
        marginTop: 24,
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Result
    resultContent: {
        alignItems: 'center',
        paddingTop: 40,
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
        marginBottom: 16,
    },
    resultAccuracy: {
        fontSize: 64,
        fontWeight: 'bold',
        color: '#00BCD4',
    },
    resultLabel: {
        fontSize: 14,
        color: '#888',
        marginBottom: 32,
    },
    resultStats: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        marginBottom: 40,
    },
    resultStatItem: {
        flex: 1,
        alignItems: 'center',
    },
    resultStatNumber: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#4CAF50',
    },
    resultStatLabel: {
        fontSize: 12,
        color: '#888',
        marginTop: 4,
    },
    resultStatDivider: {
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
