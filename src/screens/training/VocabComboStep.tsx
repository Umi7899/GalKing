// src/screens/training/VocabComboStep.tsx
// Step 3: Vocab Combo (词汇连击)

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import type { Vocab } from '../../schemas/content';
import { speak } from '../../utils/tts';

export interface VocabAnswer {
    vocabId: number;
    isCorrect: boolean;
    timeMs: number;
}

interface Props {
    vocabItems: Vocab[];
    onComplete: (correct: number, wrong: number, avgRtMs: number, answers: VocabAnswer[]) => void;
    stepProgress: { current: number; total: number };
}

interface QuizItem {
    vocab: Vocab;
    options: string[];
    correctIndex: number;
}

export default function VocabComboStep({ vocabItems, onComplete, stepProgress }: Props) {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [quizItems, setQuizItems] = useState<QuizItem[]>([]);
    const [correct, setCorrect] = useState(0);
    const [wrong, setWrong] = useState(0);
    const [totalTime, setTotalTime] = useState(0);
    const [showFeedback, setShowFeedback] = useState(false);
    const [lastCorrect, setLastCorrect] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
    const answersRef = useRef<VocabAnswer[]>([]);

    const startTimeRef = useRef(Date.now());
    const comboRef = useRef(0);
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const comboAnim = useRef(new Animated.Value(0)).current;

    // Generate quiz items on mount
    useEffect(() => {
        const items = vocabItems.map(vocab => {
            const correctMeaning = vocab.meanings[0];
            const distractors = generateDistractors(vocab, vocabItems);
            const options = shuffleArray([correctMeaning, ...distractors]).slice(0, 3);
            const correctIndex = options.indexOf(correctMeaning);

            return { vocab, options, correctIndex };
        });
        setQuizItems(items);
    }, [vocabItems]);

    // Derived state for current item
    const currentItem = quizItems[currentIndex];

    // TTS Effect
    useEffect(() => {
        if (currentItem) {
            speak(currentItem.vocab.reading);
        }
    }, [currentItem?.vocab.vocabId]);

    const generateDistractors = (target: Vocab, all: Vocab[]): string[] => {
        const others = all.filter(v => v.vocabId !== target.vocabId);
        const shuffled = shuffleArray(others);
        return shuffled.slice(0, 2).map(v => v.meanings[0]);
    };

    const shuffleArray = <T,>(arr: T[]): T[] => {
        const copy = [...arr];
        for (let i = copy.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
    };

    const handleSelect = (index: number) => {
        if (showFeedback) return;

        const elapsed = Date.now() - startTimeRef.current;
        setTotalTime(prev => prev + elapsed);
        setSelectedIndex(index);

        const isCorrect = index === quizItems[currentIndex].correctIndex;
        setLastCorrect(isCorrect);

        // Record per-vocab answer
        answersRef.current.push({
            vocabId: quizItems[currentIndex].vocab.vocabId,
            isCorrect,
            timeMs: elapsed,
        });

        if (isCorrect) {
            setCorrect(prev => prev + 1);
            comboRef.current++;

            // Combo animation
            if (comboRef.current >= 3) {
                Animated.sequence([
                    Animated.spring(comboAnim, { toValue: 1, useNativeDriver: true }),
                    Animated.timing(comboAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
                ]).start();
            }

            // Scale animation
            Animated.sequence([
                Animated.spring(scaleAnim, { toValue: 1.1, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
            ]).start();
        } else {
            setWrong(prev => prev + 1);
            comboRef.current = 0;
        }

        setShowFeedback(true);

        // Auto advance
        setTimeout(() => {
            if (currentIndex + 1 >= quizItems.length) {
                const newCorrect = correct + (isCorrect ? 1 : 0);
                const newWrong = wrong + (isCorrect ? 0 : 1);
                const avgRtMs = (totalTime + elapsed) / quizItems.length;
                onComplete(newCorrect, newWrong, avgRtMs, answersRef.current);
            } else {
                setCurrentIndex(prev => prev + 1);
                setShowFeedback(false);
                setSelectedIndex(null);
                startTimeRef.current = Date.now();
            }
        }, 600);
    };

    if (quizItems.length === 0) {
        return <View style={styles.container}><Text style={styles.loadingText}>加载中...</Text></View>;
    }



    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.stepLabel}>词汇连击</Text>
                <View style={styles.scoreContainer}>
                    <Text style={styles.score}>✓ {correct}</Text>
                    <Text style={[styles.score, styles.scoreWrong]}>✗ {wrong}</Text>
                </View>
            </View>

            {/* Progress */}
            <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${((currentIndex + 1) / quizItems.length) * 100}%` }]} />
            </View>

            {/* Combo indicator */}
            {comboRef.current >= 3 && (
                <Animated.View style={[styles.comboIndicator, { opacity: comboAnim, transform: [{ scale: comboAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }] }]}>
                    <Text style={styles.comboText}>🔥 {comboRef.current} COMBO!</Text>
                </Animated.View>
            )}

            {/* Word card */}
            <Animated.View style={[styles.wordCard, { transform: [{ scale: scaleAnim }] }]}>
                <Text style={styles.wordSurface}>{currentItem.vocab.surface}</Text>
                <Text style={styles.wordReading}>{currentItem.vocab.reading}</Text>
            </Animated.View>

            {/* Options */}
            <View style={styles.optionsContainer}>
                {currentItem.options.map((option, index) => (
                    <TouchableOpacity
                        key={index}
                        style={[
                            styles.option,
                            showFeedback && index === currentItem.correctIndex && styles.optionCorrect,
                            showFeedback && selectedIndex === index && index !== currentItem.correctIndex && styles.optionWrong,
                        ]}
                        onPress={() => handleSelect(index)}
                        disabled={showFeedback}
                        activeOpacity={0.7}
                    >
                        <Text style={styles.optionText}>{option}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Progress counter */}
            <Text style={styles.counter}>{currentIndex + 1} / {quizItems.length}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    loadingText: {
        color: '#888',
        textAlign: 'center',
        marginTop: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    stepLabel: {
        fontSize: 14,
        color: '#00BCD4',
        fontWeight: '600',
    },
    scoreContainer: {
        flexDirection: 'row',
        gap: 16,
    },
    score: {
        fontSize: 16,
        color: '#4CAF50',
        fontWeight: 'bold',
    },
    scoreWrong: {
        color: '#F44336',
    },
    progressBar: {
        height: 6,
        backgroundColor: '#333',
        borderRadius: 3,
        marginBottom: 20,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#00BCD4',
        borderRadius: 3,
    },
    comboIndicator: {
        position: 'absolute',
        top: 60,
        alignSelf: 'center',
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 20,
        paddingVertical: 8,
        borderRadius: 20,
        zIndex: 10,
    },
    comboText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
    },
    wordCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        padding: 40,
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 20,
    },
    wordSurface: {
        fontSize: 48,
        color: '#fff',
        fontWeight: 'bold',
        marginBottom: 8,
    },
    wordReading: {
        fontSize: 18,
        color: '#888',
    },
    optionsContainer: {
        gap: 12,
    },
    option: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        alignItems: 'center',
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
    optionText: {
        fontSize: 18,
        color: '#fff',
    },
    counter: {
        textAlign: 'center',
        color: '#666',
        marginTop: 24,
        fontSize: 14,
    },
});
