import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { generateScenario, evaluateScenario, checkLLMAvailable } from '../../llm/client';
import type { ScenarioGenResponse, ScenarioEvalResponse } from '../../schemas/llm';
import { getUserProgress } from '../../db/queries/progress';

type Stage = 'intro' | 'gen' | 'input' | 'eval';

interface Scenario {
    scene: string;
    goal: string;
    hints?: string[];
}

interface Evaluation {
    score: number;
    is_natural: boolean;
    better_response: string;
    comment: string;
}

export default function SentenceDojoScreen() {
    const navigation = useNavigation();
    const [stage, setStage] = useState<Stage>('intro');
    const [scenario, setScenario] = useState<Scenario | null>(null);
    const [userInput, setUserInput] = useState('');
    const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    const startScenario = async () => {
        const available = await checkLLMAvailable();
        if (!available) {
            Alert.alert('需要联网', '此功能需要连接 AI 服务。请检查网络或设置。');
            return;
        }

        setStage('gen');
        setLoading(true);
        setLoadingText('正在生成场景...');

        try {
            const progress = await getUserProgress();
            const res = await generateScenario(progress.currentLessonId, progress.currentLevel);

            if (res.ok && res.data) {
                setScenario({
                    scene: res.data.scene,
                    goal: res.data.goal,
                    hints: res.data.hints
                });
                setStage('input');
            } else {
                Alert.alert('生成失败', res.error || 'AI 似乎在开小差，请重试。');
                setStage('intro');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('错误', '发生了未知错误');
            setStage('intro');
        } finally {
            setLoading(false);
        }
    };

    const submitAnswer = async () => {
        if (!userInput.trim()) return;

        setLoading(true);
        setLoadingText('樱花老师正在批改...');

        try {
            if (!scenario) return;
            const res = await evaluateScenario({
                scene: scenario.scene,
                goal: scenario.goal,
                userResponse: userInput
            });

            if (res.ok && res.data) {
                setEvaluation({
                    score: res.data.score,
                    is_natural: res.data.is_natural,
                    better_response: res.data.better_response || '无',
                    comment: res.data.comment
                });
                setStage('eval');
            } else {
                Alert.alert('评价失败', res.error || '请重试');
            }
        } catch (e) {
            console.error(e);
            Alert.alert('错误', '提交失败');
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStage('intro');
        setScenario(null);
        setUserInput('');
        setEvaluation(null);
    };

    const renderContent = () => {
        if (loading) {
            return (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                    <Text style={styles.loadingText}>{loadingText}</Text>
                </View>
            );
        }

        if (stage === 'intro') {
            return (
                <View style={styles.centerContainer}>
                    <Text style={styles.emoji}>🥋</Text>
                    <Text style={styles.title}>实战演练 Dojo</Text>
                    <Text style={styles.desc}>
                        AI 将为你设定一个生活场景。{'\n'}
                        请根据目标，用日语做出回应。
                    </Text>
                    <TouchableOpacity style={styles.btnPrimary} onPress={startScenario}>
                        <Text style={styles.btnText}>开始演练</Text>
                    </TouchableOpacity>
                </View>
            );
        }

        if (stage === 'input' && scenario) {
            return (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.card}>
                        <Text style={styles.label}>场景 Scene</Text>
                        <Text style={styles.sceneText}>{scenario.scene}</Text>

                        <View style={styles.divider} />

                        <Text style={styles.label}>目标 Goal</Text>
                        <Text style={styles.goalText}>{scenario.goal}</Text>

                        {scenario.hints && scenario.hints.length > 0 && (
                            <View style={styles.hintContainer}>
                                <Text style={styles.hintLabel}>提示词: </Text>
                                {scenario.hints.map((h, i) => (
                                    <Text key={i} style={styles.hintTag}>{h}</Text>
                                ))}
                            </View>
                        )}
                    </View>

                    <Text style={styles.inputLabel}>你的回答:</Text>
                    <TextInput
                        style={styles.input}
                        multiline
                        placeholder="请输入日语..."
                        placeholderTextColor="#666"
                        value={userInput}
                        onChangeText={setUserInput}
                    />

                    <TouchableOpacity style={styles.btnPrimary} onPress={submitAnswer}>
                        <Text style={styles.btnText}>提交 (Submit)</Text>
                    </TouchableOpacity>
                </ScrollView>
            );
        }

        if (stage === 'eval' && evaluation) {
            return (
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <View style={styles.scoreCard}>
                        <Text style={styles.scoreLabel}>自然度评分</Text>
                        <Text style={[styles.scoreValue, { color: evaluation.score >= 80 ? '#4CAF50' : '#FFC107' }]}>
                            {evaluation.score}
                        </Text>
                    </View>

                    <View style={styles.card}>
                        <Text style={styles.label}>🌸 樱花老师的点评</Text>
                        <Text style={styles.commentText}>{evaluation.comment}</Text>

                        <View style={styles.divider} />

                        <Text style={styles.label}>更加地道的表达</Text>
                        <Text style={styles.betterText}>{evaluation.better_response}</Text>
                    </View>

                    <TouchableOpacity style={styles.btnPrimary} onPress={startScenario}>
                        <Text style={styles.btnText}>下一个场景</Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={styles.btnSecondary} onPress={reset}>
                        <Text style={styles.btnSecondaryText}>返回首页</Text>
                    </TouchableOpacity>
                </ScrollView>
            );
        }

        return null;
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Text style={styles.backText}>← 退出</Text>
                </TouchableOpacity>
            </View>
            {renderContent()}
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0F0F1A',
    },
    header: {
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 10,
    },
    backButton: {
        padding: 8,
    },
    backText: {
        color: '#888',
        fontSize: 16,
    },
    centerContainer: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
    },
    scrollContent: {
        padding: 20,
        paddingBottom: 40,
    },
    emoji: {
        fontSize: 64,
        marginBottom: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#FFF',
        marginBottom: 16,
    },
    desc: {
        fontSize: 16,
        color: '#AAA',
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 40,
    },
    btnPrimary: {
        backgroundColor: '#FF6B9D',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 30,
        width: '100%',
        alignItems: 'center',
        marginBottom: 16,
    },
    btnText: {
        color: '#FFF',
        fontSize: 18,
        fontWeight: 'bold',
    },
    btnSecondary: {
        backgroundColor: 'transparent',
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 30,
        width: '100%',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#666',
    },
    btnSecondaryText: {
        color: '#CCC',
        fontSize: 16,
    },
    loadingText: {
        color: '#FFF',
        marginTop: 16,
        fontSize: 16,
    },
    card: {
        backgroundColor: '#232342',
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    label: {
        color: '#888',
        fontSize: 12,
        marginBottom: 8,
        fontWeight: 'bold',
    },
    sceneText: {
        color: '#FFF',
        fontSize: 18,
        lineHeight: 26,
    },
    goalText: {
        color: '#FFD700',
        fontSize: 18,
        fontWeight: 'bold',
    },
    divider: {
        height: 1,
        backgroundColor: '#333',
        marginVertical: 16,
    },
    hintContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 12,
        alignItems: 'center',
    },
    hintLabel: {
        color: '#666',
        marginRight: 8,
    },
    hintTag: {
        backgroundColor: '#333',
        color: '#CCC',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        fontSize: 12,
        marginRight: 6,
        marginBottom: 6,
    },
    inputLabel: {
        color: '#FFF',
        fontSize: 16,
        marginBottom: 12,
        marginLeft: 4,
    },
    input: {
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        color: '#FFF',
        fontSize: 18,
        minHeight: 120,
        marginBottom: 24,
        textAlignVertical: 'top',
        borderWidth: 1,
        borderColor: '#333',
    },
    scoreCard: {
        alignItems: 'center',
        marginBottom: 24,
    },
    scoreLabel: {
        color: '#888',
        fontSize: 14,
        marginBottom: 4,
    },
    scoreValue: {
        fontSize: 48,
        fontWeight: 'bold',
    },
    commentText: {
        color: '#FFF',
        fontSize: 16,
        lineHeight: 24,
    },
    betterText: {
        color: '#81D4FA',
        fontSize: 18,
        fontWeight: 'bold',
    }
});
