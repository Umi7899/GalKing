// src/screens/TrainingShell.tsx
// Training flow container for 5-step daily training

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { HomeStackParamList } from '../navigation/RootNavigator';

import { getOrCreateSession, type SessionManager } from '../engine/sessionStateMachine';
import { getDrillById } from '../engine/planGenerator';
import { getGrammarPoint, getSentence, getVocabByIds } from '../db/queries/content';
import { explainMistake, parseSentence, isLLMAvailable } from '../llm/client';
import type { Drill, GrammarPoint, Sentence, Vocab } from '../schemas/content';
import type { ResultJson } from '../schemas/session';
import type { SentenceParseResponse, MistakeExplainResponse } from '../schemas/llm';

// Step components
import GrammarDrillStep from './training/GrammarDrillStep';
import TransferStep from './training/TransferStep';
import VocabComboStep from './training/VocabComboStep';
import SentenceAppStep from './training/SentenceAppStep';
import SummaryStep from './training/SummaryStep';

type NavigationProp = NativeStackNavigationProp<HomeStackParamList, 'Training'>;

const STEP_LABELS = ['语法速通', '举一反三', '词汇连击', '句子应用', '今日总结'];

export default function TrainingShell() {
    const navigation = useNavigation<NavigationProp>();
    const [loading, setLoading] = useState(true);
    const [session, setSession] = useState<SessionManager | null>(null);
    const [currentStep, setCurrentStep] = useState(1);
    const [result, setResult] = useState<ResultJson | null>(null);

    // Step-specific data
    const [currentDrill, setCurrentDrill] = useState<Drill | null>(null);
    const [currentGrammar, setCurrentGrammar] = useState<GrammarPoint | null>(null);
    const [currentSentence, setCurrentSentence] = useState<Sentence | null>(null);
    const [vocabItems, setVocabItems] = useState<Vocab[]>([]);
    const [showExplanation, setShowExplanation] = useState(false);
    const [lastAnswer, setLastAnswer] = useState<{ isCorrect: boolean; explanation: string } | null>(null);
    const [isSubmittingSentence, setIsSubmittingSentence] = useState(false);

    // Initialize session
    useEffect(() => {
        initSession();
    }, []);

    const initSession = async () => {
        try {
            setLoading(true);
            const sess = await getOrCreateSession();
            setSession(sess);
            setCurrentStep(sess.getCurrentStep());

            // Load initial step data
            await loadStepData(sess, sess.getCurrentStep());
        } catch (e) {
            console.error('[Training] Init error:', e);
            Alert.alert('错误', '无法开始训练');
            navigation.goBack();
        } finally {
            setLoading(false);
        }
    };

    const loadStepData = async (sess: SessionManager, step: number) => {
        const plan = sess.getPlan();

        switch (step) {
            case 1:
            case 2: {
                const stepState = step === 1 ? plan.step1 : plan.step2;
                if (stepState.currentIndex < stepState.questionIds.length) {
                    const questionId = stepState.questionIds[stepState.currentIndex];
                    const drill = await getDrillById(questionId);
                    setCurrentDrill(drill);
                }
                const grammar = await getGrammarPoint(plan.grammarId);
                setCurrentGrammar(grammar);
                break;
            }
            case 3: {
                const vocabIds = plan.step3.items;
                const vocabs = await getVocabByIds(vocabIds);
                setVocabItems(vocabs);
                break;
            }
            case 4: {
                console.log('[Training] Loading Step 4 data...');
                console.log('[Training] Plan Step 4:', plan.step4);
                if (plan.step4.currentIndex < plan.step4.sentenceIds.length) {
                    const sentenceId = plan.step4.sentenceIds[plan.step4.currentIndex];
                    console.log('[Training] Fetching sentence:', sentenceId);
                    const sentence = await getSentence(sentenceId);
                    console.log('[Training] Sentence Loaded:', sentence);
                    setCurrentSentence(sentence);
                } else {
                    console.warn('[Training] Step 4 index out of bounds:', plan.step4.currentIndex, plan.step4.sentenceIds.length);
                    setCurrentSentence(null);
                }
                break;
            }
        }
    };

    // Track if there are more questions in current step
    const [canContinueInStep, setCanContinueInStep] = useState(true);

    const handleAnswer = async (selectedId: string, timeMs: number) => {
        if (!session) return;

        try {
            const result = await session.answerQuestion(selectedId, timeMs);
            setLastAnswer({ isCorrect: result.isCorrect, explanation: result.explanation });
            setShowExplanation(true);
            setCanContinueInStep(result.canContinue);
            await session.save();
            // Don't auto-advance - wait for user to click continue
        } catch (e) {
            console.error('[Training] Answer error:', e);
        }
    };

    // User clicks continue after seeing feedback
    const handleContinue = async () => {
        if (!session) return;

        if (!canContinueInStep) {
            // Move to next step
            await handleNextStep();
        } else {
            // Load next question in same step
            setShowExplanation(false);
            setLastAnswer(null);
            await loadStepData(session, currentStep);
        }
    };

    const handleSentenceSubmit = async (checkedIds: string[]): Promise<{ passed: boolean; hitRate: number }> => {
        if (!session) return { passed: false, hitRate: 0 };

        try {
            setIsSubmittingSentence(true);
            const result = await session.submitSentence(checkedIds);
            setCanContinueInStep(result.canContinue);
            await session.save();
            return { passed: result.passed, hitRate: result.hitRate };
        } catch (e) {
            console.error('[Training] Sentence submit error:', e);
            return { passed: false, hitRate: 0 };
        } finally {
            setIsSubmittingSentence(false);
        }
    };

    // Called when user clicks continue in SentenceAppStep
    const handleSentenceContinue = async () => {
        console.log('[Training] handleSentenceContinue called');
        if (!session) {
            console.log('[Training] No session, returning');
            return;
        }

        if (isSubmittingSentence) {
            console.log('[Training] Sentence is still submitting, ignoring continue click');
            return;
        }

        const step4 = session.getPlan().step4;
        const hasMoreSentences = step4.currentIndex < step4.sentenceIds.length;

        if (!hasMoreSentences) {
            console.log('[Training] Last sentence, calling handleNextStep');
            await handleNextStep();
        } else {
            console.log('[Training] More sentences, loading next');
            await loadStepData(session, currentStep);
        }
    };

    const handleNextStep = async () => {
        if (!session) return;

        try {
            const nextStep = currentStep + 1;

            if (nextStep >= 5) {
                // Step 5 is Summary - finish session and show results
                console.log('[Training] Finishing session, moving to step 5');
                const sessionResult = await session.finishSession();
                setResult(sessionResult);
                setCurrentStep(5);
            } else {
                await session.nextStep();
                setCurrentStep(nextStep);
                await loadStepData(session, nextStep);
                setShowExplanation(false);
                setLastAnswer(null);
            }
        } catch (e) {
            console.error('[Training] Next step error:', e);
            Alert.alert('错误', '进入下一步失败，请重试');
        }
    };

    const handleVocabComplete = async (correct: number, wrong: number, avgRtMs: number) => {
        if (!session) return;
        // Record vocab results before moving on
        console.log('[Training] Vocab complete:', { correct, wrong, avgRtMs });
        // Move to next step after a short delay
        await handleNextStep();
    };

    const [aiLoading, setAiLoading] = useState(false);
    const [aiParseResult, setAiParseResult] = useState<SentenceParseResponse | null>(null);
    const [aiExplainResult, setAiExplainResult] = useState<MistakeExplainResponse | null>(null);

    // Reset AI results when drill or step changes
    useEffect(() => {
        setAiExplainResult(null);
    }, [currentDrill?.drillId]);

    useEffect(() => {
        setAiParseResult(null);
    }, [currentSentence?.sentenceId]);


    const handleSentenceParse = async (forceRegenerate = false) => {
        if (!currentSentence) return;

        console.log('[Training] AI Sentence Parse requested, force:', forceRegenerate);

        if (!forceRegenerate && aiParseResult) return;

        const available = await isLLMAvailable();
        if (!available) {
            console.log('[Training] AI not available');
            Alert.alert('提示', '请先在统计页-设置中配置 AI 服务');
            return;
        }

        if (aiLoading) return;

        try {
            setAiLoading(true);
            console.log('[Training] Parsing sentence:', currentSentence.text);

            const result = await parseSentence({
                sentence: currentSentence.text,
                styleTag: currentSentence.styleTag,
            }, { skipCache: forceRegenerate });

            if (result.ok && result.data) {
                console.log('[Training] Sentence parsed successfully');
                setAiParseResult(result.data);
            } else {
                console.error('[Training] Parse failed:', result.error);
                Alert.alert('AI请求失败', result.error || '解析失败');
            }
        } catch (e) {
            console.error('[Training] Parse fatal error:', e);
            Alert.alert('错误', 'AI请求发生异常');
        } finally {
            setAiLoading(false);
        }
    };

    // ... existing initialization ...

    const handleAIExplain = async (forceRegenerate = false) => {
        if (!currentDrill || !currentGrammar || !lastAnswer) return;

        console.log('[Training] AI Explain requested, force:', forceRegenerate);

        if (!forceRegenerate && aiExplainResult) return;

        const available = await isLLMAvailable();
        if (!available) {
            console.log('[Training] AI not available');
            Alert.alert('提示', '请先在统计页-设置中配置 AI 服务');
            return;
        }

        if (aiLoading) return;

        try {
            setAiLoading(true);
            console.log('[Training] Sending AI request for grammar:', currentGrammar.name);

            const result = await explainMistake({
                grammarName: currentGrammar.name,
                coreRule: currentGrammar.coreRule,
                question: {
                    stem: currentDrill.stem,
                    options: currentDrill.options || [],
                    selectedId: lastAnswer.isCorrect ? currentDrill.correctId! : 'wrong',
                    correctId: currentDrill.correctId!,
                },
            }, { skipCache: forceRegenerate });

            console.log('[Training] AI response received:', result.ok);

            if (result.ok && result.data) {
                setAiExplainResult(result.data);
            } else {
                console.error('[Training] AI request failed:', result.error);
                Alert.alert('AI请求失败', result.error || '未知错误');
            }
        } catch (e) {
            console.error('[Training] AI Explain fatal error:', e);
            Alert.alert('错误', 'AI请求发生异常: ' + (e instanceof Error ? e.message : String(e)));
        } finally {
            setAiLoading(false);
        }
    };

    const handleFinish = () => {
        navigation.goBack();
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                    <Text style={styles.loadingText}>准备训练中...</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header with progress */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backButtonText}>✕</Text>
                </TouchableOpacity>
                <View style={styles.progressContainer}>
                    {STEP_LABELS.map((label, index) => (
                        <View key={index} style={styles.progressItem}>
                            <View style={[
                                styles.progressDot,
                                index + 1 === currentStep && styles.progressDotActive,
                                index + 1 < currentStep && styles.progressDotComplete,
                            ]}>
                                {index + 1 < currentStep && <Text style={styles.checkMark}>✓</Text>}
                            </View>
                            <Text style={[
                                styles.progressLabel,
                                index + 1 === currentStep && styles.progressLabelActive,
                            ]}>
                                {label}
                            </Text>
                        </View>
                    ))}
                </View>
            </View>

            {/* Step Content */}
            <View style={styles.content}>
                {currentStep === 1 && currentDrill && (
                    <GrammarDrillStep
                        drill={currentDrill}
                        grammar={currentGrammar}
                        showExplanation={showExplanation}
                        lastAnswer={lastAnswer}
                        onAnswer={handleAnswer}
                        onContinue={handleContinue}
                        onAIExplain={() => handleAIExplain(false)}
                        onRegenerateAIExplain={() => handleAIExplain(true)}
                        aiExplainResult={aiExplainResult}
                        aiLoading={aiLoading}
                        stepProgress={session?.getStepProgress() || { current: 0, total: 0 }}
                    />
                )}

                {currentStep === 2 && currentDrill && (
                    <TransferStep
                        drill={currentDrill}
                        grammar={currentGrammar}
                        showExplanation={showExplanation}
                        lastAnswer={lastAnswer}
                        onAnswer={handleAnswer}
                        onContinue={handleContinue}
                        stepProgress={session?.getStepProgress() || { current: 0, total: 0 }}
                    />
                )}

                {currentStep === 3 && (
                    <VocabComboStep
                        vocabItems={vocabItems}
                        onComplete={handleVocabComplete}
                        stepProgress={session?.getStepProgress() || { current: 0, total: 0 }}
                    />
                )}

                {currentStep === 4 && currentSentence && (
                    <SentenceAppStep
                        sentence={currentSentence}
                        onSubmit={handleSentenceSubmit}
                        onContinue={handleSentenceContinue}
                        submitPending={isSubmittingSentence}
                        stepProgress={session?.getStepProgress() || { current: 0, total: 0 }}
                        onAIParse={() => handleSentenceParse(false)}
                        onRegenerate={() => handleSentenceParse(true)}
                        aiParsing={aiLoading}
                        aiParseResult={aiParseResult}
                    />
                )}

                {currentStep === 4 && !currentSentence && !loading && (
                    <View style={styles.loadingContainer}>
                        <Text style={styles.loadingText}>句子练习已完成</Text>
                        <TouchableOpacity style={styles.fallbackContinueButton} onPress={handleSentenceContinue}>
                            <Text style={styles.fallbackContinueButtonText}>进入总结 →</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {currentStep === 5 && result && (
                    <SummaryStep
                        result={result}
                        onFinish={handleFinish}
                        sessionId={session?.sessionId || 0}
                    />
                )}

                {/* Loading state between questions */}
                {!currentDrill && currentStep <= 2 && !loading && (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="small" color="#FF6B9D" />
                    </View>
                )}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 16,
        color: '#888',
        fontSize: 16,
    },
    fallbackContinueButton: {
        marginTop: 16,
        backgroundColor: '#9C27B0',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 20,
    },
    fallbackContinueButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
    },
    backButton: {
        position: 'absolute',
        top: 50,
        left: 20,
        zIndex: 10,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#1A1A2E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    backButtonText: {
        fontSize: 18,
        color: '#888',
    },
    progressContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 8,
    },
    progressItem: {
        alignItems: 'center',
        marginHorizontal: 8,
    },
    progressDot: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    progressDotActive: {
        backgroundColor: '#FF6B9D',
    },
    progressDotComplete: {
        backgroundColor: '#4CAF50',
    },
    checkMark: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },
    progressLabel: {
        fontSize: 10,
        color: '#666',
        marginTop: 4,
    },
    progressLabelActive: {
        color: '#FF6B9D',
        fontWeight: '600',
    },
    content: {
        flex: 1,
        padding: 20,
    },
});
