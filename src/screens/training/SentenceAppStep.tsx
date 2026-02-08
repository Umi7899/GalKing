// src/screens/training/SentenceAppStep.tsx
// Step 4: Sentence Application (句子应用)

import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Animated, ActivityIndicator } from 'react-native';
import type { Sentence } from '../../schemas/content';
import type { SentenceParseResponse } from '../../schemas/llm';
import { speak } from '../../utils/tts';

interface Props {
    sentence: Sentence;
    onSubmit: (checkedKeyPointIds: string[]) => Promise<{ passed: boolean; hitRate: number }>;
    onContinue: () => void;
    submitPending?: boolean;
    stepProgress: { current: number; total: number };
    onAIParse?: () => void;
    onRegenerate?: () => void;
    aiParsing?: boolean;
    aiParseResult?: SentenceParseResponse | null;
}

export default function SentenceAppStep({
    sentence,
    onSubmit,
    onContinue,
    submitPending = false,
    stepProgress,
    onAIParse,
    onRegenerate,
    aiParsing = false,
    aiParseResult
}: Props) {
    const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
    const [submitted, setSubmitted] = useState(false);
    const [submitResult, setSubmitResult] = useState<{ passed: boolean; hitRate: number } | null>(null);
    const feedbackAnim = useRef(new Animated.Value(0)).current;
    const [localSubmitting, setLocalSubmitting] = useState(false);
    const progressTotal = Math.max(stepProgress.total, 1);
    const progressCurrent = Math.min(stepProgress.current + 1, progressTotal);

    // Reset state when sentence changes (moving to next question)
    useEffect(() => {
        setCheckedIds(new Set());
        setSubmitted(false);
        setSubmitResult(null);
        feedbackAnim.setValue(0);
        setLocalSubmitting(false);
    }, [sentence.sentenceId]);

    useEffect(() => {
        if (submitted) {
            Animated.spring(feedbackAnim, {
                toValue: 1,
                useNativeDriver: true,
            }).start();
        }
    }, [submitted]);

    const toggleKeyPoint = (id: string) => {
        if (submitted) return;

        const newChecked = new Set(checkedIds);
        if (newChecked.has(id)) {
            newChecked.delete(id);
        } else {
            newChecked.add(id);
        }
        setCheckedIds(newChecked);
    };

    const handleSubmit = async () => {
        if (localSubmitting) return;
        setSubmitted(true);
        setLocalSubmitting(true);
        try {
            const result = await onSubmit(Array.from(checkedIds));
            setSubmitResult(result);
        } finally {
            setLocalSubmitting(false);
        }
    };

    const fallbackHitRate = sentence.keyPoints.length > 0
        ? checkedIds.size / sentence.keyPoints.length
        : 0;
    const fallbackPassed = checkedIds.size >= 3 || fallbackHitRate >= 0.7;
    const isGoodResult = submitResult?.passed ?? fallbackPassed;
    const isSubmitBusy = submitPending || localSubmitting;

    const [showParseModal, setShowParseModal] = useState(false);

    useEffect(() => {
        if (aiParseResult) {
            setShowParseModal(true);
        }
    }, [aiParseResult]);

    // ... render details ...

    return (
        <View style={styles.container}>
            {/* ... existing content ... */}
            <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
                {/* ... existing header, progress, etc ... */}

                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.stepLabel}>句子应用</Text>
                    <Text style={styles.stepProgress}>{progressCurrent} / {progressTotal}</Text>
                </View>

                {/* Progress */}
                <View style={styles.progressBar}>
                    <View style={[styles.progressFill, { width: `${(progressCurrent / progressTotal) * 100}%` }]} />
                </View>

                {/* Style tag */}
                <View style={styles.styleTag}>
                    <Text style={styles.styleTagText}>💬 {sentence.styleTag.toUpperCase()} 风格</Text>
                </View>

                {/* Sentence card */}
                <View style={styles.sentenceCard}>
                    <Text style={styles.sentenceText}>{sentence.text}</Text>
                    <TouchableOpacity
                        style={styles.speakerButton}
                        onPress={() => speak(sentence.text)}
                        activeOpacity={0.8}
                    >
                        <Text style={styles.speakerButtonText}>🔊 朗读例句</Text>
                    </TouchableOpacity>

                    {/* Tokens display (if available) */}
                    {sentence.tokens && (
                        <View style={styles.tokensContainer}>
                            {sentence.tokens.map((token, index) => (
                                <Text key={index} style={styles.token}>{token}</Text>
                            ))}
                        </View>
                    )}
                </View>

                {/* Instructions */}
                <Text style={styles.instructions}>
                    勾选你理解了的语法要点：
                </Text>

                {/* Key points checklist */}
                <View style={styles.keyPointsList}>
                    {sentence.keyPoints.map((kp) => (
                        <TouchableOpacity
                            key={kp.id}
                            style={[
                                styles.keyPointItem,
                                checkedIds.has(kp.id) && styles.keyPointItemChecked,
                            ]}
                            onPress={() => toggleKeyPoint(kp.id)}
                            disabled={submitted}
                        >
                            <View style={[
                                styles.checkbox,
                                checkedIds.has(kp.id) && styles.checkboxChecked,
                            ]}>
                                {checkedIds.has(kp.id) && <Text style={styles.checkmark}>✓</Text>}
                            </View>
                            <View style={styles.keyPointContent}>
                                <Text style={styles.keyPointLabel}>{kp.labelZh}</Text>
                                {kp.hint && <Text style={styles.keyPointHint}>{kp.hint}</Text>}
                            </View>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Submit button */}
                {!submitted && (
                    <TouchableOpacity
                        style={[
                            styles.submitButton,
                            (checkedIds.size === 0 || isSubmitBusy) && styles.submitButtonDisabled,
                        ]}
                        onPress={handleSubmit}
                        disabled={checkedIds.size === 0 || isSubmitBusy}
                    >
                        <Text style={styles.submitButtonText}>{isSubmitBusy ? '处理中...' : '确认理解'}</Text>
                    </TouchableOpacity>
                )}
            </ScrollView>

            {/* Floating Modal Feedback */}
            <Modal
                visible={submitted && !showParseModal}
                transparent={true}
                animationType="fade"
            >
                <View style={styles.modalOverlay}>
                    <Animated.View style={[
                        styles.modalContent,
                        isGoodResult ? styles.modalGood : styles.modalNormal,
                        {
                            opacity: feedbackAnim,
                            transform: [{ scale: feedbackAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
                        },
                    ]}>
                        <Text style={styles.feedbackEmoji}>
                            {isGoodResult ? '🎉' : '📝'}
                        </Text>
                        <Text style={styles.feedbackTitle}>
                            {isGoodResult ? '很好！' : '继续加油'}
                        </Text>
                        <Text style={styles.feedbackText}>
                            {isGoodResult
                                ? '你理解了主要语法要点！'
                                : '多关注语法细节，会越来越好的～'}
                        </Text>
                        <Text style={styles.checkedCount}>
                            勾选了 {checkedIds.size} / {sentence.keyPoints.length} 个要点
                        </Text>

                        {/* AI Button */}
                        {onAIParse && (
                            <TouchableOpacity
                                style={[styles.aiButton, aiParsing && styles.aiButtonDisabled]}
                                onPress={onAIParse}
                                disabled={aiParsing}
                            >
                                {aiParsing ? (
                                    <View style={styles.aiLoadingContainer}>
                                        <ActivityIndicator size="small" color="#fff" />
                                        <Text style={styles.aiButtonText}> 分析中...</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.aiButtonText}>🤖 语法分析</Text>
                                )}
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={[styles.continueButton, isSubmitBusy && styles.continueButtonDisabled]}
                            onPress={onContinue}
                            disabled={isSubmitBusy}
                        >
                            <Text style={styles.continueButtonText}>
                                {isSubmitBusy ? '处理中...' : '继续 →'}
                            </Text>
                        </TouchableOpacity>
                    </Animated.View>
                </View>
            </Modal>

            {/* AI Result Modal */}
            <Modal
                visible={showParseModal}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.parseModalContainer}>
                    <View style={styles.parseHeader}>
                        <Text style={styles.parseTitle}>🤖 语法分析</Text>
                        <TouchableOpacity onPress={() => setShowParseModal(false)} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>关闭</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.parseContent}>
                        {aiParseResult && (
                            <>
                                {/* Translation */}
                                <View style={styles.parseSection}>
                                    <Text style={styles.sectionLabel}>翻译</Text>
                                    <Text style={styles.translationText}>{aiParseResult.gloss_zh}</Text>
                                </View>

                                {/* Structure */}
                                <View style={styles.parseSection}>
                                    <Text style={styles.sectionLabel}>结构分解</Text>
                                    <View style={styles.segmentsContainer}>
                                        {aiParseResult.segments.map((seg, i) => (
                                            <View key={i} style={styles.segmentItem}>
                                                <Text style={styles.segmentText}>{seg.text}</Text>
                                                <Text style={styles.segmentRole}>{seg.role}</Text>
                                                {seg.note && <Text style={styles.segmentNote}>{seg.note}</Text>}
                                            </View>
                                        ))}
                                    </View>
                                </View>

                                {/* Key Points */}
                                <View style={styles.parseSection}>
                                    <Text style={styles.sectionLabel}>核心语法</Text>
                                    {aiParseResult.key_points.map((kp, i) => (
                                        <View key={i} style={styles.kpItem}>
                                            <Text style={styles.kpLabel}>• {kp.labelZh}</Text>
                                            <Text style={styles.kpExplanation}>{kp.explanation}</Text>
                                        </View>
                                    ))}
                                </View>

                                {onRegenerate && (
                                    <TouchableOpacity
                                        style={styles.regenBtn}
                                        onPress={onRegenerate}
                                        disabled={aiParsing}
                                    >
                                        <Text style={styles.regenBtnText}>
                                            {aiParsing ? '🔄 分析中...' : '🔄 重新生成'}
                                        </Text>
                                    </TouchableOpacity>
                                )}

                                <View style={{ height: 40 }} />
                            </>
                        )}
                    </ScrollView>
                </View>
            </Modal>
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
    content: {
        paddingBottom: 40,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    stepLabel: {
        fontSize: 14,
        color: '#9C27B0',
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
        backgroundColor: '#9C27B0',
        borderRadius: 2,
    },
    styleTag: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(156, 39, 176, 0.2)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
        marginBottom: 16,
    },
    styleTagText: {
        color: '#9C27B0',
        fontSize: 12,
        fontWeight: '600',
    },
    sentenceCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 20,
        padding: 24,
        marginBottom: 24,
    },
    sentenceText: {
        fontSize: 22,
        color: '#fff',
        lineHeight: 36,
        textAlign: 'center',
    },
    speakerButton: {
        flexDirection: 'row',
        alignSelf: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(156, 39, 176, 0.15)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 14,
        marginTop: 12,
    },
    speakerButtonText: {
        color: '#C8A7D8',
        fontSize: 12,
        fontWeight: '600',
    },
    tokensContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        marginTop: 16,
        gap: 4,
    },
    token: {
        backgroundColor: '#333',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        color: '#aaa',
        fontSize: 12,
    },
    instructions: {
        fontSize: 14,
        color: '#888',
        marginBottom: 16,
    },
    keyPointsList: {
        gap: 12,
        marginBottom: 24,
    },
    keyPointItem: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
        borderColor: 'transparent',
    },
    keyPointItemChecked: {
        borderColor: '#9C27B0',
        backgroundColor: 'rgba(156, 39, 176, 0.1)',
    },
    checkbox: {
        width: 24,
        height: 24,
        borderRadius: 6,
        borderWidth: 2,
        borderColor: '#555',
        marginRight: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkboxChecked: {
        backgroundColor: '#9C27B0',
        borderColor: '#9C27B0',
    },
    checkmark: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    keyPointContent: {
        flex: 1,
    },
    keyPointLabel: {
        fontSize: 16,
        color: '#fff',
        marginBottom: 4,
    },
    keyPointHint: {
        fontSize: 13,
        color: '#888',
    },
    submitButton: {
        backgroundColor: '#9C27B0',
        borderRadius: 16,
        padding: 18,
        alignItems: 'center',
    },
    submitButtonDisabled: {
        backgroundColor: '#333',
    },
    submitButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
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
    modalGood: {
        borderWidth: 2,
        borderColor: '#4CAF50',
    },
    modalNormal: {
        borderWidth: 2,
        borderColor: '#9C27B0',
    },
    feedbackEmoji: {
        fontSize: 48,
        marginBottom: 16,
    },
    feedbackTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 8,
    },
    feedbackText: {
        fontSize: 16,
        color: '#aaa',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 8,
    },
    checkedCount: {
        fontSize: 14,
        color: '#888',
        marginBottom: 24,
    },
    continueButton: {
        backgroundColor: '#9C27B0',
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 24,
    },
    continueButtonDisabled: {
        backgroundColor: '#5A3760',
    },
    continueButtonText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // AI Button styles
    aiButton: {
        backgroundColor: '#333',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
        marginBottom: 16,
    },
    aiButtonDisabled: {
        opacity: 0.7,
        backgroundColor: '#444',
    },
    aiLoadingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    aiButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 16,
    },
    // Parse Modal Styles
    parseModalContainer: {
        flex: 1,
        backgroundColor: '#1A1A2E',
    },
    parseHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#333',
        marginTop: 20,
    },
    parseTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#fff',
    },
    closeButton: {
        padding: 8,
    },
    closeButtonText: {
        color: '#FF6B9D',
        fontSize: 16,
        fontWeight: '600',
    },
    parseContent: {
        flex: 1,
        padding: 20,
    },
    parseSection: {
        marginBottom: 24,
        backgroundColor: '#252538',
        borderRadius: 16,
        padding: 16,
    },
    sectionLabel: {
        fontSize: 14,
        color: '#888',
        fontWeight: '600',
        marginBottom: 12,
        textTransform: 'uppercase',
    },
    translationText: {
        fontSize: 18,
        color: '#fff',
        lineHeight: 28,
        fontStyle: 'italic',
    },
    segmentsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    segmentItem: {
        backgroundColor: '#1A1A2E',
        borderRadius: 8,
        padding: 8,
        borderWidth: 1,
        borderColor: '#444',
    },
    segmentText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    segmentRole: {
        color: '#FF6B9D',
        fontSize: 12,
    },
    segmentNote: {
        color: '#aaa',
        fontSize: 10,
        marginTop: 2,
    },
    kpItem: {
        marginBottom: 12,
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.1)',
    },
    kpLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#FF6B9D',
        marginBottom: 4,
    },
    kpExplanation: {
        fontSize: 15,
        color: '#ccc',
        lineHeight: 22,
    },
    regenBtn: {
        marginTop: 20,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#9C27B0',
        borderRadius: 12,
        borderStyle: 'dashed',
        backgroundColor: 'rgba(156, 39, 176, 0.1)',
    },
    regenBtnText: {
        color: '#9C27B0',
        fontSize: 14,
        fontWeight: '600',
    },
});
