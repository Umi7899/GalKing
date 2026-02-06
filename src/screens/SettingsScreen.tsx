// src/screens/SettingsScreen.tsx
// Settings screen for LLM configuration

import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
} from 'react-native';
import {
    getLLMSettings,
    saveLLMSettings,
    PROVIDER_CONFIGS,
    type LLMProvider,
    type LLMSettings,
} from '../settings/storage';
import { testLLMConnection, clearSettingsCache } from '../llm/client';
import { resetAllProgress } from '../db/queries/admin';

const PROVIDERS: LLMProvider[] = ['deepseek', 'openai', 'custom'];

export default function SettingsScreen() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [provider, setProvider] = useState<LLMProvider>('deepseek');
    const [apiKey, setApiKey] = useState('');
    const [customEndpoint, setCustomEndpoint] = useState('');
    const [modelName, setModelName] = useState('');

    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const settings = await getLLMSettings();
            if (settings) {
                setProvider(settings.provider);
                setApiKey(settings.apiKey);
                setCustomEndpoint(settings.customEndpoint || '');
                setModelName(settings.modelName || '');
            }
        } catch (e) {
            console.error('[Settings] Load error:', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!apiKey.trim()) {
            Alert.alert('提示', '请输入 API Key');
            return;
        }

        if (provider === 'custom' && !customEndpoint.trim()) {
            Alert.alert('提示', '自定义服务需要填写 API 端点');
            return;
        }

        setSaving(true);
        try {
            const settings: LLMSettings = {
                provider,
                apiKey: apiKey.trim(),
                customEndpoint: provider === 'custom' ? customEndpoint.trim() : undefined,
                modelName: modelName.trim() || undefined,
            };
            await saveLLMSettings(settings);
            clearSettingsCache();
            Alert.alert('成功', 'API 配置已保存');
            setTestResult(null);
        } catch (e) {
            Alert.alert('错误', '保存失败，请重试');
        } finally {
            setSaving(false);
        }
    };

    const handleResetProgress = useCallback(() => {
        Alert.alert(
            '⚠️ 高危操作',
            '确定要清空所有做题记录吗？\n\n• 将删除所有会话记录\n• 重置语法/词汇掌握度\n• 重置当前课程进度\n\n此操作**不会**清除 API Key。无法撤销！',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定清空',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setSaving(true);
                            await resetAllProgress();
                            Alert.alert('已重置', '所有学习记录已清空。');
                        } catch (e) {
                            Alert.alert('失败', '重置失败');
                            console.error(e);
                        } finally {
                            setSaving(false);
                        }
                    }
                }
            ]
        );
    }, []);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);

        // First save current settings
        try {
            const settings: LLMSettings = {
                provider,
                apiKey: apiKey.trim(),
                customEndpoint: provider === 'custom' ? customEndpoint.trim() : undefined,
                modelName: modelName.trim() || undefined,
            };
            await saveLLMSettings(settings);
            clearSettingsCache();
        } catch (e) {
            setTestResult({ ok: false, message: '保存设置失败' });
            setTesting(false);
            return;
        }

        // Test connection
        const result = await testLLMConnection();

        if (result.ok) {
            setTestResult({
                ok: true,
                message: `连接成功！延迟: ${result.latencyMs}ms`
            });
        } else {
            setTestResult({
                ok: false,
                message: result.error || '连接失败'
            });
        }
        setTesting(false);
    };

    if (loading) {
        return (
            <View style={styles.container}>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FF6B9D" />
                </View>
            </View>
        );
    }

    const providerConfig = PROVIDER_CONFIGS[provider];

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.content}>
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>⚙️ 设置</Text>
                <Text style={styles.headerSubtitle}>配置 AI 教练服务</Text>
            </View>

            {/* Provider Selection */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>AI 服务商</Text>
                <View style={styles.providerButtons}>
                    {PROVIDERS.map((p) => (
                        <TouchableOpacity
                            key={p}
                            style={[
                                styles.providerButton,
                                provider === p && styles.providerButtonActive,
                            ]}
                            onPress={() => {
                                setProvider(p);
                                setTestResult(null);
                            }}
                        >
                            <Text style={[
                                styles.providerButtonText,
                                provider === p && styles.providerButtonTextActive,
                            ]}>
                                {PROVIDER_CONFIGS[p].name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* API Key */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>API Key</Text>
                <TextInput
                    style={styles.input}
                    placeholder={providerConfig.placeholder}
                    placeholderTextColor="#666"
                    value={apiKey}
                    onChangeText={setApiKey}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <Text style={styles.hint}>
                    {provider === 'deepseek' && '在 platform.deepseek.com 获取'}
                    {provider === 'openai' && '在 platform.openai.com 获取'}
                    {provider === 'custom' && '填写你的 API Key'}
                </Text>
            </View>

            {/* Custom Endpoint */}
            {provider === 'custom' && (
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>API 端点</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="https://your-api.com/v1/chat/completions"
                        placeholderTextColor="#666"
                        value={customEndpoint}
                        onChangeText={setCustomEndpoint}
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>
            )}

            {/* Model Override */}
            <View style={styles.section}>
                <Text style={styles.sectionTitle}>模型名称（可选）</Text>
                <TextInput
                    style={styles.input}
                    placeholder={providerConfig.defaultModel || '使用默认模型'}
                    placeholderTextColor="#666"
                    value={modelName}
                    onChangeText={setModelName}
                    autoCapitalize="none"
                    autoCorrect={false}
                />
                <Text style={styles.hint}>
                    留空则使用默认模型：{providerConfig.defaultModel || '需手动指定'}
                </Text>
            </View>

            {/* Test Result */}
            {testResult && (
                <View style={[
                    styles.testResult,
                    testResult.ok ? styles.testResultOk : styles.testResultError,
                ]}>
                    <Text style={styles.testResultText}>
                        {testResult.ok ? '✅' : '❌'} {testResult.message}
                    </Text>
                </View>
            )}

            {/* Buttons */}
            <View style={styles.buttons}>
                <TouchableOpacity
                    style={styles.testButton}
                    onPress={handleTest}
                    disabled={testing || !apiKey}
                >
                    {testing ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.testButtonText}>测试连接</Text>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                    onPress={handleSave}
                    disabled={saving}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color="#fff" />
                    ) : (
                        <Text style={styles.saveButtonText}>保存配置</Text>
                    )}
                </TouchableOpacity>
            </View>

            {/* Info */}
            <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>💡 关于 AI 教练</Text>
                <Text style={styles.infoText}>
                    配置 API 后，以下功能将启用：{'\n'}
                    • 🤖 错题智能解析{'\n'}
                    • 📝 句子语法分析{'\n'}
                    • 🐱 每日个性化点评
                </Text>
                <Text style={styles.infoNote}>
                    提示：未配置 API 时将使用离线模式
                </Text>
            </View>

            {/* Danger Zone */}
            <View style={[styles.section, { marginTop: 40 }]}>
                <Text style={[styles.sectionTitle, { color: '#FF5252' }]}>⚠️ 数据管理</Text>
                <TouchableOpacity
                    style={styles.dangerButton}
                    onPress={handleResetProgress}
                    disabled={saving}
                >
                    <Text style={styles.dangerButtonText}>
                        {saving ? '处理中...' : '🗑️ 清空做题记录 (保留设置)'}
                    </Text>
                </TouchableOpacity>
            </View>
        </ScrollView>
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
    content: {
        padding: 20,
        paddingBottom: 40,
    },
    header: {
        marginBottom: 32,
        paddingTop: 40,
    },
    headerTitle: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: '#888',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#aaa',
        marginBottom: 12,
    },
    providerButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    providerButton: {
        flex: 1,
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    providerButtonActive: {
        borderColor: '#FF6B9D',
        backgroundColor: 'rgba(255, 107, 157, 0.1)',
    },
    providerButtonText: {
        color: '#888',
        fontSize: 14,
        fontWeight: '600',
    },
    providerButtonTextActive: {
        color: '#FF6B9D',
    },
    input: {
        backgroundColor: '#1A1A2E',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#fff',
        borderWidth: 1,
        borderColor: '#333',
    },
    hint: {
        fontSize: 12,
        color: '#666',
        marginTop: 8,
    },
    testResult: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    testResultOk: {
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
    },
    testResultError: {
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
    },
    testResultText: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
    },
    buttons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 32,
    },
    testButton: {
        flex: 1,
        backgroundColor: '#333',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    testButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
    },
    saveButton: {
        flex: 1,
        backgroundColor: '#FF6B9D',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    infoCard: {
        backgroundColor: '#1A1A2E',
        borderRadius: 16,
        padding: 20,
        borderLeftWidth: 4,
        borderLeftColor: '#4CAF50',
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#fff',
        marginBottom: 12,
    },
    infoText: {
        fontSize: 14,
        color: '#aaa',
        lineHeight: 24,
    },
    infoNote: {
        fontSize: 12,
        color: '#666',
        marginTop: 12,
        fontStyle: 'italic',
    },
    dangerButton: {
        backgroundColor: 'rgba(255, 82, 82, 0.1)',
        borderWidth: 1,
        borderColor: '#FF5252',
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    dangerButtonText: {
        color: '#FF5252',
        fontSize: 16,
        fontWeight: 'bold',
    },
});
