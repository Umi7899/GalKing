// src/screens/ReviewScreen.tsx
// Review completed training session with preserved answers

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/RootNavigator';

import { getTodayCompletedSession, parseStepState, parseResult } from '../db/queries/sessions';
import { getDrillById } from '../engine/planGenerator';
import { getGrammarPoint, getSentence } from '../db/queries/content';
import type { Drill, GrammarPoint, Sentence } from '../schemas/content';
import type { StepStateJson, ResultJson } from '../schemas/session';
import { explainMistake, parseSentence } from '../llm/client';
import MistakeExplainModal from '../components/MistakeExplainModal';
import type { MistakeExplainResponse, SentenceParseResponse } from '../schemas/llm';
import { Modal } from 'react-native';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Training'>;

interface ReviewItem {
    type: 'grammar' | 'transfer' | 'sentence';
    stepNumber: number;
    questionNumber: number;
    drill?: Drill;
    grammar?: GrammarPoint;
    sentence?: Sentence;
    userAnswer?: string;
    isCorrect?: boolean;
    checkedPoints?: string[];
}

export default function ReviewScreen() {
    const navigation = useNavigation<NavigationProp>();
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<ReviewItem[]>([]);
    const [result, setResult] = useState<ResultJson | null>(null);
    const [currentIndex, setCurrentIndex] = useState(0);

    // AI States
    const [aiLoading, setAiLoading] = useState(false);
    const [mistakeModalVisible, setMistakeModalVisible] = useState(false);
    const [aiExplainResult, setAiExplainResult] = useState<MistakeExplainResponse | null>(null);
    const [aiParseResult, setAiParseResult] = useState<SentenceParseResponse | null>(null);
    const [showParseModal, setShowParseModal] = useState(false);

    // Coach Intro Screen
    const [showCoachIntro, setShowCoachIntro] = useState(true);

    useEffect(() => {
        // Reset AI states when question changes
        setAiExplainResult(null);
        setAiParseResult(null);
        setAiLoading(false);
    }, [currentIndex]);

    useEffect(() => {
        loadReviewData();
    }, []);

    const loadReviewData = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
            const session = await getTodayCompletedSession(today);

            if (!session) {
                navigation.goBack();
                return;
            }

            const stepState = parseStepState(session);
            const sessionResult = parseResult(session);
            setResult(sessionResult);

            const reviewItems: ReviewItem[] = [];

            // Load Step 1 (Grammar) items
            const step1 = stepState.plan.step1;
            for (let i = 0; i < step1.questionIds.length; i++) {
                const drill = await getDrillById(step1.questionIds[i]);
                const grammar = stepState.plan.grammarId
                    ? await getGrammarPoint(stepState.plan.grammarId)
                    : null;
                const answer = step1.answers[i];

                reviewItems.push({
                    type: 'grammar',
                    stepNumber: 1,
                    questionNumber: i + 1,
                    drill: drill || undefined,
                    grammar: grammar || undefined,
                    userAnswer: answer?.selectedId,
                    isCorrect: answer?.isCorrect,
                });
            }

            // Load Step 2 (Transfer) items
            const step2 = stepState.plan.step2;
            for (let i = 0; i < step2.questionIds.length; i++) {
                const drill = await getDrillById(step2.questionIds[i]);
                const grammar = stepState.plan.grammarId
                    ? await getGrammarPoint(stepState.plan.grammarId)
                    : null;
                const answer = step2.answers[i];

                reviewItems.push({
                    type: 'transfer',
                    stepNumber: 2,
                    questionNumber: i + 1,
                    drill: drill || undefined,
                    grammar: grammar || undefined,
                    userAnswer: answer?.selectedId,
                    isCorrect: answer?.isCorrect,
                });
            }

            // Load Step 4 (Sentence) items
            const step4 = stepState.plan.step4;
            for (let i = 0; i < step4.sentenceIds.length; i++) {
                const sentence = await getSentence(step4.sentenceIds[i]);
                const submission = step4.submissions[i];

                reviewItems.push({
                    type: 'sentence',
                    stepNumber: 4,
                    questionNumber: i + 1,
                    sentence: sentence || undefined,
                    checkedPoints: submission?.checkedKeyPointIds,
                });
            }

            setItems(reviewItems);
        } catch (e) {
            console.error('[Review] Load error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleBack = () => {
        navigation.goBack();
    };

    const handlePrev = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const handleNext = () => {
        if (currentIndex < items.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handleAIExplain = async (forceRegenerate = false) => {
        const currentItem = items[currentIndex];
        if (!currentItem.drill) return;

        setAiLoading(true);
        try {
            const correctAnswerText = currentItem.drill.options?.find(o => o.id === currentItem.drill?.correctId)?.text || '';
            const userAnswerText = currentItem.drill.options?.find(o => o.id === currentItem.userAnswer)?.text || '未作答';

            const result = await explainMistake({
                grammarName: currentItem.grammar?.name || '相关语法',
                coreRule: currentItem.grammar?.structure || '',
                question: {
                    stem: currentItem.drill.stem,
                    options: currentItem.drill.options || [],
                    selectedId: currentItem.userAnswer || '',
                    correctId: currentItem.drill.correctId || ''
                }
            }, { skipCache: forceRegenerate });

            if (result.ok && result.data) {
                setAiExplainResult(result.data);
                setMistakeModalVisible(true);
            } else {
                // Fallback handled by client or error alert
                setAiExplainResult(null);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    const handleSentenceParse = async (forceRegenerate = false) => {
        const currentItem = items[currentIndex];
        if (!currentItem.sentence) return;

        setAiLoading(true);
        if (!forceRegenerate) setShowParseModal(true); // Show modal immediately if loading or cached

        try {
            const result = await parseSentence({
                sentence: currentItem.sentence.text,
                styleTag: currentItem.sentence.styleTag,
            }, { skipCache: forceRegenerate });

            if (result.ok && result.data) {
                setAiParseResult(result.data);
                setShowParseModal(true);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAiLoading(false);
        }
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                    <Text style={styles.loadingText}>加载回顾数据...</Text>
                </View>
            </View>
        );
    }

    if (items.length === 0) {
        return (
            <View style={styles.container}>
                <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>没有可回顾的内容</Text>
                    <TouchableOpacity style={styles.backButton} onPress={handleBack}>
                        <Text style={styles.backButtonText}>返回</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    const renderCoachSummary = () => {
        if (!result?.coach?.summary) return null;
        return (
            <View style={[styles.reviewCard, { borderLeftColor: '#FF6B9D', borderLeftWidth: 4 }]}>
                <Text style={{ fontSize: 18, marginBottom: 8 }}>🌸 Sakura (JK)</Text>
                <Text style={{ color: '#DDD', lineHeight: 22 }}>
                    {result.coach.summary}
                </Text>
            </View>
        );
    };

    // Full-screen Coach Intro (shown before questions)
    const renderCoachIntroScreen = () => {
        if (!result?.coach?.summary) {
            // No summary, skip intro
            return null;
        }
        return (
            <View style={styles.container}>
                <View style={[styles.header, { justifyContent: 'center' }]}>
                    <Text style={styles.headerTitle}>🌸 今日の振り返り</Text>
                </View>
                <ScrollView style={styles.content} contentContainerStyle={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ fontSize: 48, marginBottom: 20 }}>🌸</Text>
                    <Text style={{ fontSize: 22, color: '#FF6B9D', marginBottom: 16, fontWeight: 'bold' }}>Sakura のメッセージ</Text>
                    <View style={{ backgroundColor: '#1A1A2E', borderRadius: 16, padding: 20, width: '100%', marginBottom: 24 }}>
                        <Text style={{ color: '#EEE', fontSize: 16, lineHeight: 26 }}>
                            {result.coach.summary}
                        </Text>
                    </View>
                    <View style={{ flexDirection: 'row', marginBottom: 16 }}>
                        <Text style={{ color: '#888' }}>⭐ {result.stars}/5   </Text>
                        <Text style={{ color: '#888' }}>🎯 {(result.grammar.correct / result.grammar.total * 100).toFixed(0)}%   </Text>
                    </View>
                </ScrollView>
                <View style={{ padding: 20, backgroundColor: '#0F0F1A' }}>
                    <TouchableOpacity
                        style={{ backgroundColor: '#FF6B9D', padding: 16, borderRadius: 12, alignItems: 'center' }}
                        onPress={() => setShowCoachIntro(false)}
                    >
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: 'bold' }}>→ 詳細を確認する</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={{ marginTop: 12, alignItems: 'center' }}
                        onPress={handleBack}
                    >
                        <Text style={{ color: '#888', fontSize: 14 }}>← ホームに戻る</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    };

    const currentItem = items[currentIndex];

    const renderDrillReview = () => {
        if (!currentItem.drill) return null;

        const stepLabel = currentItem.type === 'grammar' ? '语法速通' : '举一反三';
        const stepColor = currentItem.type === 'grammar' ? '#FF6B9D' : '#FFB800';

        return (
            <View style={styles.reviewCard}>
                <View style={styles.stepHeader}>
                    <Text style={[styles.stepLabel, { color: stepColor }]}>{stepLabel}</Text>
                    <Text style={styles.questionNum}>
                        第 {currentItem.questionNumber} 题
                    </Text>
                </View>

                {currentItem.grammar && (
                    <View style={[styles.grammarHint, { borderLeftColor: stepColor }]}>
                        <Text style={[styles.grammarName, { color: stepColor }]}>
                            {currentItem.grammar.name}
                        </Text>
                    </View>
                )}

                <View style={styles.questionCard}>
                    <Text style={styles.questionStem}>{currentItem.drill.stem}</Text>
                </View>

                <View style={styles.optionsContainer}>
                    {currentItem.drill.options?.map((option) => {
                        const isUserAnswer = option.id === currentItem.userAnswer;
                        const isCorrect = option.id === currentItem.drill?.correctId;

                        let optionStyle = styles.option;
                        if (isCorrect) {
                            optionStyle = [styles.option, styles.optionCorrect] as any;
                        } else if (isUserAnswer && !isCorrect) {
                            optionStyle = [styles.option, styles.optionWrong] as any;
                        }

                        return (
                            <View key={option.id} style={optionStyle}>
                                <View style={styles.optionIdBadge}>
                                    <Text style={styles.optionId}>{option.id.toUpperCase()}</Text>
                                </View>
                                <Text style={styles.optionText}>{option.text}</Text>
                                {isUserAnswer && (
                                    <Text style={styles.userMark}>
                                        {isCorrect ? '✓ 你的答案' : '✗ 你的答案'}
                                    </Text>
                                )}
                                {isCorrect && !isUserAnswer && (
                                    <Text style={styles.correctMark}>正确答案</Text>
                                )}
                            </View>
                        );
                    })}
                </View>

                <View style={[
                    styles.resultBadge,
                    currentItem.isCorrect ? styles.resultCorrect : styles.resultWrong
                ]}>
                    <Text style={styles.resultText}>
                        {currentItem.isCorrect ? '✅ 回答正确' : '❌ 回答错误'}
                    </Text>
                </View>

                <View style={styles.explanationCard}>
                    <Text style={styles.explanationLabel}>解析</Text>
                    <Text style={styles.explanationText}>{currentItem.drill.explanation}</Text>
                </View>

                <TouchableOpacity
                    style={styles.aiButton}
                    onPress={() => handleAIExplain(false)}
                    disabled={aiLoading}
                >
                    {aiLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.aiButtonText}>🤖 AI 详解</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    const renderSentenceReview = () => {
        if (!currentItem.sentence) return null;

        return (
            <View style={styles.reviewCard}>
                <View style={styles.stepHeader}>
                    <Text style={[styles.stepLabel, { color: '#9C27B0' }]}>句子应用</Text>
                    <Text style={styles.questionNum}>
                        第 {currentItem.questionNumber} 题
                    </Text>
                </View>

                <View style={styles.styleTag}>
                    <Text style={styles.styleTagText}>
                        💬 {currentItem.sentence.styleTag.toUpperCase()} 风格
                    </Text>
                </View>

                <View style={styles.sentenceCard}>
                    <Text style={styles.sentenceText}>{currentItem.sentence.text}</Text>
                </View>

                <Text style={styles.keyPointsTitle}>你勾选了以下语法要点：</Text>
                <View style={styles.keyPointsList}>
                    {currentItem.sentence.keyPoints.map((kp) => {
                        const isChecked = currentItem.checkedPoints?.includes(kp.id);
                        return (
                            <View
                                key={kp.id}
                                style={[
                                    styles.keyPointItem,
                                    isChecked && styles.keyPointItemChecked
                                ]}
                            >
                                <View style={[
                                    styles.checkbox,
                                    isChecked && styles.checkboxChecked
                                ]}>
                                    {isChecked && <Text style={styles.checkmark}>✓</Text>}
                                </View>
                                <Text style={styles.keyPointLabel}>{kp.labelZh}</Text>
                            </View>
                        );
                    })}
                </View>

                <TouchableOpacity
                    style={styles.aiButton}
                    onPress={() => handleSentenceParse(false)}
                    disabled={aiLoading}
                >
                    {aiLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.aiButtonText}>🤖 AI 语法分析</Text>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    // Show Coach Intro first if available
    if (showCoachIntro && result?.coach?.summary) {
        return renderCoachIntroScreen();
    }

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={handleBack}>
                    <Text style={styles.headerBack}>← 返回</Text>
                </TouchableOpacity>
                <Text style={styles.headerTitle}>📖 回看今日训练</Text>
                <Text style={styles.headerProgress}>
                    {currentIndex + 1} / {items.length}
                </Text>
            </View>

            {/* Progress Bar */}
            <View style={styles.progressBar}>
                <View style={[
                    styles.progressFill,
                    { width: `${((currentIndex + 1) / items.length) * 100}%` }
                ]} />
            </View>

            {/* Content */}
            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {currentIndex === 0 && renderCoachSummary()}
                {currentItem.type === 'sentence'
                    ? renderSentenceReview()
                    : renderDrillReview()
                }
            </ScrollView>

            {/* AI Modals */}
            <MistakeExplainModal
                visible={mistakeModalVisible}
                onClose={() => setMistakeModalVisible(false)}
                isRegenerating={aiLoading}
                data={aiExplainResult}
                onRegenerate={() => handleAIExplain(true)}
                contextParams={items[currentIndex].drill ? {
                    grammarName: items[currentIndex].grammar?.name || '未知语法',
                    question: items[currentIndex].drill!.stem,
                    userAnswer: items[currentIndex].userAnswer || '未作答'
                } : undefined}
            />

            <Modal
                visible={showParseModal}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setShowParseModal(false)}
            >
                <View style={styles.parseModalContainer}>
                    <View style={styles.parseHeader}>
                        <Text style={styles.parseTitle}>🤖 语法分析</Text>
                        <TouchableOpacity onPress={() => setShowParseModal(false)} style={styles.closeButton}>
                            <Text style={styles.closeButtonText}>关闭</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={styles.parseContent}>
                        {aiLoading && !aiParseResult ? (
                            <ActivityIndicator size="large" color="#FF6B9D" style={{ marginTop: 50 }} />
                        ) : aiParseResult ? (
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

                                <TouchableOpacity
                                    style={styles.regenBtn}
                                    onPress={() => handleSentenceParse(true)}
                                    disabled={aiLoading}
                                >
                                    <Text style={styles.regenBtnText}>
                                        {aiLoading ? '🔄 分析中...' : '🔄 重新生成'}
                                    </Text>
                                </TouchableOpacity>
                                <View style={{ height: 40 }} />
                            </>
                        ) : null}
                    </ScrollView>
                </View>
            </Modal>

            {/* Navigation */}
            <View style={styles.navigation}>
                <TouchableOpacity
                    style={[styles.navButton, currentIndex === 0 && styles.navButtonDisabled]}
                    onPress={handlePrev}
                    disabled={currentIndex === 0}
                >
                    <Text style={styles.navButtonText}>← 上一题</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.navButton, currentIndex === items.length - 1 && styles.navButtonDisabled]}
                    onPress={handleNext}
                    disabled={currentIndex === items.length - 1}
                >
                    <Text style={styles.navButtonText}>下一题 →</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0D0D1A',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#888',
        fontSize: 14,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyText: {
        color: '#888',
        fontSize: 16,
        marginBottom: 24,
    },
    backButton: {
        backgroundColor: '#333',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
    },
    backButtonText: {
        color: '#fff',
        fontSize: 16,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 50,
        paddingBottom: 16,
        backgroundColor: '#1A1A2E',
    },
    headerBack: {
        color: '#FF6B9D',
        fontSize: 16,
    },
    headerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    headerProgress: {
        color: '#888',
        fontSize: 14,
    },
    progressBar: {
        height: 4,
        backgroundColor: '#333',
    },
    progressFill: {
        height: '100%',
        backgroundColor: '#FF6B9D',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        paddingBottom: 100,
    },
    reviewCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 20,
        padding: 20,
    },
    stepHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    stepLabel: {
        fontSize: 14,
        fontWeight: '600',
    },
    questionNum: {
        color: '#888',
        fontSize: 12,
    },
    grammarHint: {
        borderLeftWidth: 3,
        paddingLeft: 12,
        marginBottom: 16,
    },
    grammarName: {
        fontSize: 16,
        fontWeight: '600',
    },
    questionCard: {
        backgroundColor: '#0D0D1A',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    questionStem: {
        color: '#fff',
        fontSize: 18,
        lineHeight: 28,
        textAlign: 'center',
    },
    optionsContainer: {
        gap: 10,
        marginBottom: 16,
    },
    option: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0D0D1A',
        borderRadius: 12,
        padding: 14,
        borderWidth: 2,
        borderColor: 'transparent',
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
        color: '#fff',
        fontSize: 15,
    },
    userMark: {
        color: '#FF6B9D',
        fontSize: 11,
        fontWeight: '600',
    },
    correctMark: {
        color: '#4CAF50',
        fontSize: 11,
        fontWeight: '600',
    },
    resultBadge: {
        alignSelf: 'center',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        marginBottom: 16,
    },
    resultCorrect: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
    },
    resultWrong: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
    },
    resultText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    explanationCard: {
        backgroundColor: '#0D0D1A',
        borderRadius: 12,
        padding: 16,
    },
    explanationLabel: {
        color: '#888',
        fontSize: 12,
        marginBottom: 8,
    },
    explanationText: {
        color: '#aaa',
        fontSize: 14,
        lineHeight: 22,
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
        backgroundColor: '#0D0D1A',
        borderRadius: 12,
        padding: 20,
        marginBottom: 16,
    },
    sentenceText: {
        color: '#fff',
        fontSize: 20,
        lineHeight: 32,
        textAlign: 'center',
    },
    keyPointsTitle: {
        color: '#888',
        fontSize: 14,
        marginBottom: 12,
    },
    keyPointsList: {
        gap: 10,
    },
    keyPointItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0D0D1A',
        borderRadius: 12,
        padding: 14,
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
    keyPointLabel: {
        color: '#fff',
        fontSize: 15,
        flex: 1,
    },
    navigation: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 16,
        backgroundColor: '#1A1A2E',
        borderTopWidth: 1,
        borderTopColor: '#333',
    },
    navButton: {
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 20,
    },
    navButtonDisabled: {
        backgroundColor: '#333',
    },
    navButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    aiButton: {
        marginTop: 16,
        backgroundColor: '#333',
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#444',
    },
    aiButtonText: {
        color: '#fff',
        fontWeight: '600',
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
