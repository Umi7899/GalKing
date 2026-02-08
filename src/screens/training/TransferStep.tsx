// src/screens/training/TransferStep.tsx
// Step 2: Transfer Practice (举一反三)

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Drill, GrammarPoint } from '../../schemas/content';
import { speak } from '../../utils/tts';

interface Props {
    drill: Drill;
    grammar: GrammarPoint | null;
    showExplanation: boolean;
    lastAnswer: { isCorrect: boolean; explanation: string } | null;
    onAnswer: (selectedId: string, timeMs: number) => void;
    onContinue: () => void;
    stepProgress: { current: number; total: number };
}

export default function TransferStep({
    drill,
    grammar,
    showExplanation,
    lastAnswer,
    onAnswer,
    onContinue,
    stepProgress,
}: Props) {
    const insets = useSafeAreaInsets();
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [isReviewing, setIsReviewing] = useState(false);
    const startTimeRef = useRef(Date.now());
    const feedbackAnim = useRef(new Animated.Value(0)).current;
    const progressTotal = Math.max(stepProgress.total, 1);
    const progressCurrent = Math.min(stepProgress.current + 1, progressTotal);

    useEffect(() => {
        startTimeRef.current = Date.now();
        setSelectedId(null);
        setIsReviewing(false);
    }, [drill.drillId]);

    useEffect(() => {
        if (showExplanation && !isReviewing) {
            Animated.spring(feedbackAnim, {
                toValue: 1,
                useNativeDriver: true,
            }).start();
        } else {
            feedbackAnim.setValue(0);
        }
    }, [showExplanation, isReviewing]);

    const handleSelect = (optionId: string) => {
        if (showExplanation) return;

        setSelectedId(optionId);
        const timeMs = Date.now() - startTimeRef.current;
        onAnswer(optionId, timeMs);
    };

    const getOptionStyle = (optionId: string) => {
        if (!showExplanation) {
            return selectedId === optionId ? styles.optionSelected : styles.option;
        }

        if (optionId === drill.correctId) {
            return [styles.option, styles.optionCorrect];
        }
        if (selectedId === optionId && optionId !== drill.correctId) {
            return [styles.option, styles.optionWrong];
        }
        return styles.option;
    };

    return (
        <View style={styles.container}>
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
                {/* Step indicator */}
                <View style={styles.stepIndicator}>
                    <Text style={styles.stepLabel}>举一反三</Text>
                    <Text style={styles.stepProgress}>{progressCurrent} / {progressTotal}</Text>
                </View>

                {/* Progress bar */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(progressCurrent / progressTotal) * 100}%` }]} />
                </View>

                {/* Grammar context */}
                {grammar && (
                    <View style={styles.contextCard}>
                        <Text style={styles.contextLabel}>运用语法</Text>
                        <Text style={styles.contextGrammar}>{grammar.name}</Text>
                        <Text style={styles.contextRule}>{grammar.coreRule}</Text>
                    </View>
                )}

                {/* Question */}
                <View style={styles.questionCard}>
                    {drill.drillId.startsWith('ai_') && (
                        <View style={styles.aiBadge}>
                            <Text style={styles.aiBadgeText}>AI</Text>
                        </View>
                    )}
                    <Text style={styles.questionStem}>{drill.stem}</Text>
                </View>

                {/* Options */}
                <View style={styles.optionsContainer}>
                    {drill.options?.map((option) => (
                        <TouchableOpacity
                            key={option.id}
                            style={getOptionStyle(option.id)}
                            onPress={() => handleSelect(option.id)}
                            disabled={showExplanation}
                            activeOpacity={0.7}
                        >
                            <View style={styles.optionIdBadge}>
                                <Text style={styles.optionId}>{option.id.toUpperCase()}</Text>
                            </View>
                            <Text style={styles.optionText}>{option.text}</Text>
                            {/[\u3040-\u30FF]/.test(option.text) && (
                                <TouchableOpacity
                                    style={styles.optionSpeakerButton}
                                    onPress={(event) => {
                                        event.stopPropagation();
                                        speak(option.text);
                                    }}
                                >
                                    <Ionicons name="volume-high" size={18} color="#FFB800" />
                                </TouchableOpacity>
                            )}
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Buttons (Visible only when Reviewing) */}
                {isReviewing && (
                    <View style={[styles.bottomButtonRow, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <TouchableOpacity
                            style={styles.showResultButton}
                            onPress={() => setIsReviewing(false)}
                        >
                            <Text style={styles.showResultButtonText}>📋 查看结果</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.bottomContinueButton} onPress={onContinue}>
                            <Text style={styles.bottomContinueButtonText}>下一题 →</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Floating Feedback Overlay */}
            {showExplanation && lastAnswer !== null && !isReviewing && (
                <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setIsReviewing(true)}
                    />
                    <Animated.View style={[
                        styles.modalContent,
                        lastAnswer?.isCorrect ? styles.modalCorrect : styles.modalWrong,
                        {
                            opacity: feedbackAnim,
                            transform: [{ scale: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                        },
                    ]} pointerEvents="box-none">
                        <Text style={styles.feedbackEmoji}>
                            {lastAnswer?.isCorrect ? '🎯' : '💭'}
                        </Text>
                        <Text style={styles.feedbackTitle}>
                            {lastAnswer?.isCorrect ? '举一反三成功！' : '再思考一下'}
                        </Text>
                        <Text style={styles.explanationText}>{lastAnswer?.explanation}</Text>

                        <View style={styles.modalButtonContainer}>
                            <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
                                <Text style={styles.continueButtonText}>继续 →</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.dismissHint}>点击空白处查看题目</Text>
                    </Animated.View>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: 40,
    },
    stepIndicator: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    stepLabel: {
        fontSize: 14,
        color: '#FFB800',
        fontWeight: '600',
    },
    stepProgress: {
        fontSize: 12,
        color: '#888',
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginBottom: 20,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FFB800',
        borderRadius: 2,
    },
    contextCard: {
        backgroundColor: 'rgba(255, 184, 0, 0.1)',
        borderRadius: 12,
        padding: 16,
        marginBottom: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#FFB800',
    },
    contextLabel: {
        fontSize: 11,
        color: '#888',
        marginBottom: 4,
    },
    contextGrammar: {
        fontSize: 16,
        color: '#FFB800',
        fontWeight: '600',
        marginBottom: 4,
    },
    contextRule: {
        fontSize: 13,
        color: '#aaa',
    },
    questionCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
        alignItems: 'center',
        position: 'relative' as const,
    },
    aiBadge: {
        position: 'absolute' as const,
        top: 8,
        right: 8,
        backgroundColor: '#00BCD4',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    aiBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold' as const,
    },
    questionStem: {
        fontSize: 18,
        color: '#fff',
        lineHeight: 28,
        textAlign: 'center',
    },
    optionsContainer: {
        gap: 12,
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
    optionSelected: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: '#FFB800',
    },
    optionCorrect: {
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
    },
    optionWrong: {
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
    },
    optionIdBadge: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    optionId: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
    },
    optionText: {
        flex: 1,
        fontSize: 15,
        color: '#fff',
    },
    optionSpeakerButton: {
        marginLeft: 8,
        padding: 6,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 184, 0, 0.12)',
    },
    // Modal styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        padding: 32,
        alignItems: 'center',
        width: '100%',
        maxWidth: 340,
    },
    modalCorrect: {
        borderWidth: 2,
        borderColor: '#4CAF50',
    },
    modalWrong: {
        borderWidth: 2,
        borderColor: '#FFB800',
    },
    feedbackEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    feedbackTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 12,
    },
    explanationText: {
        fontSize: 16,
        color: '#aaa',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 24,
    },
    continueButton: {
        backgroundColor: '#FFB800',
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 24,
    },
    continueButtonText: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold',
    },
    dismissHint: {
        color: '#666',
        fontSize: 12,
        marginTop: 16,
    },
    modalButtonContainer: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 8,
        justifyContent: 'center',
        width: '100%',
    },
    bottomButtonRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 32,
        marginBottom: 20,
    },
    showResultButton: {
        flex: 1,
        backgroundColor: '#333',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    showResultButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    bottomContinueButton: {
        flex: 1,
        backgroundColor: '#FFB800',
        paddingVertical: 16,
        borderRadius: 16,
        alignItems: 'center',
    },
    bottomContinueButtonText: {
        color: '#000',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
