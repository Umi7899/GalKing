import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, StyleSheet, Modal, ScrollView, TouchableOpacity,
    ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import type { MistakeExplainResponse } from '../schemas/llm';
import { chatWithAI, type ChatMessage } from '../llm/client';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';

interface Props {
    visible: boolean;
    onClose: () => void;
    data: MistakeExplainResponse | null;
    onRegenerate: () => void;
    isRegenerating: boolean;
    contextParams?: {
        grammarName: string;
        question: string;
        userAnswer: string;
    };
}

interface ChatItem {
    id: string;
    role: 'user' | 'assistant';
    content: string;
}

export default function MistakeExplainModal({
    visible, onClose, data, onRegenerate, isRegenerating, contextParams
}: Props) {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);

    const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis');
    const [chatHistory, setChatHistory] = useState<ChatItem[]>([]);
    const [input, setInput] = useState('');
    const [isChatLoading, setIsChatLoading] = useState(false);
    const scrollViewRef = useRef<ScrollView>(null);

    useEffect(() => {
        if (visible) {
            setActiveTab('analysis');
        }
    }, [visible, data]);

    const handleSend = async () => {
        if (!input.trim() || isChatLoading) return;

        const userMsg: ChatItem = { id: Date.now().toString(), role: 'user', content: input.trim() };
        setChatHistory(prev => [...prev, userMsg]);
        setInput('');
        setIsChatLoading(true);

        try {
            const systemContext = `Context:
Grammar: ${contextParams?.grammarName}
Question: ${contextParams?.question}
User Answer: ${contextParams?.userAnswer}
Previous Explanation: ${data?.why_wrong} / ${data?.key_rule}`;

            const messages: ChatMessage[] = [
                { role: 'system', content: `You are a helpful Japanese tutor. Answer the student's follow-up questions about the grammar mistake. Keep answers concise. \n${systemContext}` },
                ...chatHistory.map(c => ({ role: c.role, content: c.content })),
                { role: 'user', content: userMsg.content }
            ];

            const response = await chatWithAI(messages);

            if (response.ok && response.content) {
                const aiMsg: ChatItem = { id: (Date.now() + 1).toString(), role: 'assistant', content: response.content };
                setChatHistory(prev => [...prev, aiMsg]);
            } else {
                Alert.alert('发送失败', response.error || '未知错误');
            }
        } catch (e) {
            Alert.alert('错误', '网络异常');
        } finally {
            setIsChatLoading(false);
            setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        }
    };

    if (!data && !isRegenerating) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalContainer}
            >
                <View style={styles.modalContent}>
                    <View style={styles.header}>
                        <View style={styles.tabs}>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'analysis' && styles.activeTab]}
                                onPress={() => setActiveTab('analysis')}
                            >
                                <Text style={[styles.tabText, activeTab === 'analysis' && styles.activeTabText]}>错题解析</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
                                onPress={() => setActiveTab('chat')}
                            >
                                <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>💬 提问</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Text style={styles.closeBtnText}>关闭</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.body}>
                        {activeTab === 'analysis' ? (
                            <ScrollView style={styles.scrollView}>
                                {isRegenerating ? (
                                    <View style={styles.loadingContainer}>
                                        <ActivityIndicator size="large" color={colors.primary} />
                                        <Text style={styles.loadingText}>正在重新分析...</Text>
                                    </View>
                                ) : (data && (
                                    <>
                                        <View style={styles.section}>
                                            <Text style={styles.whyWrong}>{data.why_wrong}</Text>
                                        </View>

                                        <View style={styles.card}>
                                            <Text style={styles.label}>🔑 核心规则</Text>
                                            <Text style={styles.value}>{data.key_rule}</Text>
                                        </View>

                                        <View style={styles.card}>
                                            <Text style={styles.label}>🔧 如何修正</Text>
                                            <Text style={styles.value}>{data.minimal_fix}</Text>
                                        </View>

                                        {data.contrast && data.contrast.length > 0 && (
                                            <View style={styles.section}>
                                                <Text style={styles.label}>🆚 对比</Text>
                                                {data.contrast.map((item, i) => (
                                                    <View key={i} style={styles.contrastItem}>
                                                        <Text style={styles.wrongEx}>{item.wrong}</Text>
                                                        <Text style={styles.correctEx}>{item.correct}</Text>
                                                        <Text style={styles.explanation}>{item.explanation}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        <TouchableOpacity
                                            style={styles.regenBtn}
                                            onPress={onRegenerate}
                                            disabled={isRegenerating}
                                        >
                                            <Text style={styles.regenBtnText}>🔄 对结果不满意？重新分析</Text>
                                        </TouchableOpacity>
                                        <View style={{ height: 40 }} />
                                    </>
                                ))}
                            </ScrollView>
                        ) : (
                            <View style={styles.chatContainer}>
                                <ScrollView
                                    style={styles.chatList}
                                    ref={scrollViewRef}
                                    contentContainerStyle={styles.chatContent}
                                >
                                    {chatHistory.length === 0 && (
                                        <Text style={styles.emptyChat}>
                                            对解析有疑问？{'\n'}可以直接在这里向 AI 提问哦～
                                        </Text>
                                    )}
                                    {chatHistory.map(msg => (
                                        <View key={msg.id} style={[
                                            styles.bubble,
                                            msg.role === 'user' ? styles.userBubble : styles.aiBubble
                                        ]}>
                                            <Text style={styles.msgText}>{msg.content}</Text>
                                        </View>
                                    ))}
                                    {isChatLoading && (
                                        <View style={styles.aiBubble}>
                                            <ActivityIndicator size="small" color={colors.textPrimary} />
                                        </View>
                                    )}
                                </ScrollView>
                                <View style={styles.inputBar}>
                                    <TextInput
                                        style={styles.input}
                                        value={input}
                                        onChangeText={setInput}
                                        placeholder="输入问题..."
                                        placeholderTextColor={colors.textSubtle}
                                        onSubmitEditing={handleSend}
                                    />
                                    <TouchableOpacity
                                        style={[styles.sendBtn, (!input.trim() || isChatLoading) && styles.sendBtnDisabled]}
                                        onPress={handleSend}
                                        disabled={!input.trim() || isChatLoading}
                                    >
                                        <Text style={styles.sendBtnText}>发送</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const createStyles = (c: ColorTokens) => StyleSheet.create({
    modalContainer: { flex: 1, backgroundColor: c.bgOverlay, justifyContent: 'flex-end' },
    modalContent: { backgroundColor: c.bgCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, height: '85%', overflow: 'hidden' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.border },
    tabs: { flexDirection: 'row', gap: 20 },
    tab: { paddingVertical: 8 },
    activeTab: { borderBottomWidth: 2, borderBottomColor: c.primary },
    tabText: { color: c.textMuted, fontSize: 16, fontWeight: '600' },
    activeTabText: { color: c.primary },
    closeBtn: { padding: 8 },
    closeBtnText: { color: c.textMuted, fontSize: 14 },
    body: { flex: 1 },
    scrollView: { flex: 1, padding: 20 },
    loadingContainer: { marginTop: 100, alignItems: 'center' },
    loadingText: { color: c.textMuted, marginTop: 16 },
    section: { marginBottom: 24 },
    whyWrong: { fontSize: 18, color: c.textPrimary, lineHeight: 28 },
    card: { backgroundColor: c.bgInput, padding: 16, borderRadius: 12, marginBottom: 16 },
    label: { fontSize: 13, color: c.textMuted, fontWeight: 'bold', marginBottom: 8, textTransform: 'uppercase' },
    value: { fontSize: 16, color: '#eee', lineHeight: 24 },
    contrastItem: { backgroundColor: c.bgInput, padding: 12, borderRadius: 8, marginTop: 8 },
    wrongEx: { color: c.errorLight, fontSize: 15, marginBottom: 4 },
    correctEx: { color: c.success, fontSize: 15, marginBottom: 4, fontWeight: 'bold' },
    explanation: { color: c.textSecondary, fontSize: 13 },
    regenBtn: { padding: 16, alignItems: 'center', marginTop: 20, marginBottom: 40, borderWidth: 1, borderColor: '#444', borderRadius: 12, borderStyle: 'dashed' },
    regenBtnText: { color: c.textMuted, fontSize: 14 },
    chatContainer: { flex: 1 },
    chatList: { flex: 1 },
    chatContent: { padding: 20 },
    inputBar: { flexDirection: 'row', padding: 16, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: '#1E1E32', alignItems: 'center' },
    input: { flex: 1, backgroundColor: '#2A2A40', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: c.textPrimary, marginRight: 12 },
    sendBtn: { backgroundColor: c.primary, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    sendBtnDisabled: { backgroundColor: '#444' },
    sendBtnText: { color: c.textPrimary, fontWeight: '600' },
    bubble: { maxWidth: '80%', padding: 12, borderRadius: 16, marginBottom: 12 },
    userBubble: { alignSelf: 'flex-end', backgroundColor: c.primary, borderBottomRightRadius: 4 },
    aiBubble: { alignSelf: 'flex-start', backgroundColor: c.bgInput, borderBottomLeftRadius: 4 },
    msgText: { color: c.textPrimary, fontSize: 15, lineHeight: 22 },
    emptyChat: { textAlign: 'center', color: c.textSubtle, marginTop: 100, fontSize: 14 },
});
