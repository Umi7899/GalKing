// src/screens/training/GrammarDrillStep.tsx
// Step 1: Grammar Speed Drill

import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, ActivityIndicator, ScrollView, Modal } from 'react-native';
import type { Drill, GrammarPoint } from '../../schemas/content';
import MistakeExplainModal from '../../components/MistakeExplainModal';
import type { MistakeExplainResponse } from '../../schemas/llm';

interface Props {
    drill: Drill;
    grammar: GrammarPoint | null;
    showExplanation: boolean;
    lastAnswer: { isCorrect: boolean; explanation: string } | null;
    onAnswer: (selectedId: string, timeMs: number) => void;
    onContinue: () => void;
    onAIExplain?: () => void;
    onRegenerateAIExplain?: () => void;
    aiExplainResult?: MistakeExplainResponse | null;
    aiLoading?: boolean;
    stepProgress: { current: number; total: number };
}

export default function GrammarDrillStep({
    drill,
    grammar,
    showExplanation,
    lastAnswer,
    onAnswer,
    onContinue,
    onAIExplain,
    onRegenerateAIExplain,
    aiExplainResult,
    aiLoading = false,
    stepProgress,
}: Props) {
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const startTimeRef = useRef(Date.now());
    const feedbackAnim = useRef(new Animated.Value(0)).current;
    const [modalVisible, setModalVisible] = useState(false);

    // Show modal when result arrives (if it wasn't visible)
    useEffect(() => {
        if (aiExplainResult) {
            setModalVisible(true);
        }
    }, [aiExplainResult]);

    // Reset modal on new drill
    useEffect(() => {
        setModalVisible(false);
    }, [drill.drillId]);

    useEffect(() => {
        startTimeRef.current = Date.now();
        setSelectedId(null);
    }, [drill.drillId]);

    useEffect(() => {
        if (showExplanation) {
            Animated.spring(feedbackAnim, {
                toValue: 1,
                useNativeDriver: true,
            }).start();
        } else {
            feedbackAnim.setValue(0);
        }
    }, [showExplanation]);

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
                {/* Progress indicator */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${((stepProgress.current + 1) / stepProgress.total) * 100}%` }]} />
                </View>

                {/* Grammar hint */}
                {grammar && (
                    <View style={styles.grammarHint}>
                        <Text style={styles.grammarName}>{grammar.name}</Text>
                    </View>
                )}

                {/* Question */}
                <View style={styles.questionCard}>
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
                            <Text style={styles.optionId}>{option.id.toUpperCase()}</Text>
                            <Text style={styles.optionText}>{option.text}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            {/* Floating Modal Feedback */}
            <Modal
                visible={showExplanation && lastAnswer !== null}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <Animated.View style={[
                        styles.modalContent,
                        lastAnswer?.isCorrect ? styles.modalCorrect : styles.modalWrong,
                        {
                            opacity: feedbackAnim,
                            transform: [{ scale: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                        },
                    ]}>
                        <Text style={styles.feedbackEmoji}>
                            {lastAnswer?.isCorrect ? '✅' : '❌'}
                        </Text>
                        <Text style={styles.feedbackText}>
                            {lastAnswer?.isCorrect ? '正确！' : '再想想...'}
                        </Text>
                        <Text style={styles.explanationText}>{lastAnswer?.explanation}</Text>

                        {!lastAnswer?.isCorrect && onAIExplain && (
                            <TouchableOpacity
                                style={[styles.aiButton, aiLoading && styles.aiButtonDisabled]}
                                onPress={() => {
                                    setModalVisible(true);
                                    if (onAIExplain && !aiExplainResult && !aiLoading) {
                                        onAIExplain();
                                    }
                                }}
                                disabled={aiLoading}
                            >
                                {aiLoading ? (
                                    <View style={styles.aiLoadingContainer}>
                                        <ActivityIndicator size="small" color="#fff" />
                                        <Text style={styles.aiButtonText}> 解析中...</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.aiButtonText}>🤖 AI解析</Text>
                                )}
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity style={styles.continueButton} onPress={onContinue}>
                            <Text style={styles.continueButtonText}>继续 →</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>

            <MistakeExplainModal
                visible={modalVisible}
                onClose={() => setModalVisible(false)}
                data={aiExplainResult || null}
                onRegenerate={onRegenerateAIExplain || (() => { })}
                isRegenerating={!!aiLoading && modalVisible}
                contextParams={{
                    grammarName: grammar?.name || '',
                    question: drill.stem,
                    userAnswer: drill.options?.find(o => o.id === selectedId)?.text || '用户选项',
                }}
            />
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
    progressBar: {
        height: 4,
        backgroundColor: '#333',
        borderRadius: 2,
        marginBottom: 20,
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FF6B9D',
        borderRadius: 2,
    },
    grammarHint: {
        marginBottom: 16,
    },
    grammarName: {
        fontSize: 14,
        color: '#FF6B9D',
        fontWeight: '600',
    },
    questionCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 24,
        marginBottom: 24,
    },
    questionStem: {
        fontSize: 20,
        color: '#fff',
        lineHeight: 32,
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
        borderColor: '#FF6B9D',
    },
    optionCorrect: {
        borderColor: '#4CAF50',
        backgroundColor: 'rgba(76, 175, 80, 0.1)',
    },
    optionWrong: {
        borderColor: '#F44336',
        backgroundColor: 'rgba(244, 67, 54, 0.1)',
    },
    optionId: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#333',
        color: '#fff',
        textAlign: 'center',
        lineHeight: 32,
        marginRight: 12,
        fontWeight: 'bold',
    },
    optionText: {
        flex: 1,
        fontSize: 16,
        color: '#fff',
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
        borderColor: '#F44336',
    },
    feedbackEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    feedbackText: {
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
        marginBottom: 16,
    },
    aiButton: {
        backgroundColor: '#333',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        marginBottom: 16,
    },
    aiButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    aiButtonDisabled: {
        opacity: 0.7,
        backgroundColor: '#444',
    },
    aiLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    continueButton: {
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 24,
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
});
