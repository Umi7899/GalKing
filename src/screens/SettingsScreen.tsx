// src/screens/SettingsScreen.tsx
// Settings screen for LLM configuration

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Switch,
} from 'react-native';
import { useTheme } from '../theme';
import type { ColorTokens } from '../theme';
import {
    getLLMSettings,
    saveLLMSettings,
    getNotificationSettings,
    PROVIDER_CONFIGS,
    type LLMProvider,
    type LLMSettings,
    type NotificationSettings,
} from '../settings/storage';
import { testLLMConnection, clearSettingsCache } from '../llm/client';
import { toggleDailyReminder, updateReminderTime } from '../services/notifications';
import { resetAllProgress, seedTestData } from '../db/queries/admin';

const PROVIDERS: LLMProvider[] = ['deepseek', 'openai', 'custom'];

const createStyles = (c: ColorTokens) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: c.bg,
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
        color: c.textPrimary,
        marginBottom: 4,
    },
    headerSubtitle: {
        fontSize: 14,
        color: c.textMuted,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: c.textSecondary,
        marginBottom: 12,
    },
    providerButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    providerButton: {
        flex: 1,
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 14,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: 'transparent',
    },
    providerButtonActive: {
        borderColor: c.primary,
        backgroundColor: c.primaryAlpha10,
    },
    providerButtonText: {
        color: c.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
    providerButtonTextActive: {
        color: c.primary,
    },
    input: {
        backgroundColor: c.bgCard,
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: c.textPrimary,
        borderWidth: 1,
        borderColor: c.border,
    },
    hint: {
        fontSize: 12,
        color: c.textSubtle,
        marginTop: 8,
    },
    testResult: {
        padding: 16,
        borderRadius: 12,
        marginBottom: 24,
    },
    testResultOk: {
        backgroundColor: c.successAlpha20,
    },
    testResultError: {
        backgroundColor: c.errorAlpha20,
    },
    testResultText: {
        color: c.textPrimary,
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
        backgroundColor: c.border,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    testButtonText: {
        color: c.textPrimary,
        fontSize: 16,
        fontWeight: '600',
    },
    saveButton: {
        flex: 1,
        backgroundColor: c.primary,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    saveButtonDisabled: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: c.textPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
    infoCard: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 20,
        borderLeftWidth: 4,
        borderLeftColor: c.success,
    },
    infoTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: c.textPrimary,
        marginBottom: 12,
    },
    infoText: {
        fontSize: 14,
        color: c.textSecondary,
        lineHeight: 24,
    },
    infoNote: {
        fontSize: 12,
        color: c.textSubtle,
        marginTop: 12,
        fontStyle: 'italic',
    },
    dangerButton: {
        backgroundColor: c.errorAlpha10,
        borderWidth: 1,
        borderColor: c.errorLight,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    dangerButtonText: {
        color: c.errorLight,
        fontSize: 16,
        fontWeight: 'bold',
    },
    seedButton: {
        backgroundColor: c.cyanAlpha10,
        borderWidth: 1,
        borderColor: c.cyan,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
    },
    seedButtonText: {
        color: c.cyan,
        fontSize: 16,
        fontWeight: 'bold',
    },
    notifCard: {
        backgroundColor: c.bgCard,
        borderRadius: 16,
        padding: 20,
        marginBottom: 24,
    },
    notifRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    notifLabel: {
        fontSize: 16,
        color: c.textPrimary,
        fontWeight: '500',
    },
    notifSub: {
        fontSize: 12,
        color: c.textMuted,
        marginTop: 4,
    },
    timeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        gap: 8,
    },
    timeLabel: {
        fontSize: 14,
        color: c.textSecondary,
    },
    timePicker: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    timeBtn: {
        backgroundColor: c.bgInput,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 8,
        minWidth: 44,
        alignItems: 'center',
    },
    timeBtnText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: c.textPrimary,
    },
    timeColon: {
        fontSize: 18,
        fontWeight: 'bold',
        color: c.textMuted,
    },
    timeArrow: {
        backgroundColor: c.border,
        borderRadius: 6,
        width: 28,
        height: 28,
        justifyContent: 'center',
        alignItems: 'center',
    },
    timeArrowText: {
        fontSize: 14,
        color: c.textPrimary,
    },
});

export default function SettingsScreen() {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);

    const [provider, setProvider] = useState<LLMProvider>('deepseek');
    const [apiKey, setApiKey] = useState('');
    const [customEndpoint, setCustomEndpoint] = useState('');
    const [modelName, setModelName] = useState('');

    const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

    // Notification state
    const [notifEnabled, setNotifEnabled] = useState(false);
    const [notifHour, setNotifHour] = useState(20);
    const [notifMinute, setNotifMinute] = useState(0);

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
            // Load notification settings
            const notifSettings = await getNotificationSettings();
            setNotifEnabled(notifSettings.enabled);
            setNotifHour(notifSettings.hour);
            setNotifMinute(notifSettings.minute);
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

    const handleSeedTestData = useCallback(() => {
        Alert.alert(
            '🧪 注入测试数据',
            '将写入模拟数据用于测试新功能：\n\n• 设置进度到第28课\n• 注入语法/词汇掌握度（含到期复习项）\n• 创建已完成的训练会话\n\n已有数据会被覆盖。',
            [
                { text: '取消', style: 'cancel' },
                {
                    text: '确定注入',
                    onPress: async () => {
                        try {
                            setSaving(true);
                            const { summary } = await seedTestData();
                            Alert.alert('注入成功', summary);
                        } catch (e) {
                            Alert.alert('失败', '注入测试数据失败');
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
                    <ActivityIndicator size="large" color={colors.primary} />
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
                    placeholderTextColor={colors.textSubtle}
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
                        placeholderTextColor={colors.textSubtle}
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
                    placeholderTextColor={colors.textSubtle}
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
                        <ActivityIndicator size="small" color={colors.textPrimary} />
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
                        <ActivityIndicator size="small" color={colors.textPrimary} />
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

            {/* Notification Settings */}
            <View style={[styles.section, { marginTop: 24 }]}>
                <Text style={styles.sectionTitle}>通知设置</Text>
                <View style={styles.notifCard}>
                    <View style={styles.notifRow}>
                        <View>
                            <Text style={styles.notifLabel}>每日学习提醒</Text>
                            <Text style={styles.notifSub}>
                                {notifEnabled ? '已开启' : '关闭中'}
                            </Text>
                        </View>
                        <Switch
                            value={notifEnabled}
                            onValueChange={async (val) => {
                                try {
                                    await toggleDailyReminder(val);
                                    setNotifEnabled(val);
                                } catch (e: any) {
                                    if (e?.message === 'PERMISSION_DENIED') {
                                        Alert.alert('权限不足', '请在系统设置中允许通知权限');
                                    } else {
                                        Alert.alert('错误', '设置通知失败');
                                    }
                                }
                            }}
                            trackColor={{ false: colors.border, true: colors.primaryAlpha20 }}
                            thumbColor={notifEnabled ? colors.primary : colors.textMuted}
                        />
                    </View>

                    {notifEnabled && (
                        <View style={styles.timeRow}>
                            <Text style={styles.timeLabel}>提醒时间</Text>
                            <View style={{ flex: 1 }} />
                            <View style={styles.timePicker}>
                                <TouchableOpacity
                                    style={styles.timeArrow}
                                    onPress={async () => {
                                        const h = (notifHour + 23) % 24;
                                        setNotifHour(h);
                                        await updateReminderTime(h, notifMinute);
                                    }}
                                >
                                    <Text style={styles.timeArrowText}>-</Text>
                                </TouchableOpacity>
                                <View style={styles.timeBtn}>
                                    <Text style={styles.timeBtnText}>
                                        {notifHour.toString().padStart(2, '0')}
                                    </Text>
                                </View>
                                <Text style={styles.timeColon}>:</Text>
                                <View style={styles.timeBtn}>
                                    <Text style={styles.timeBtnText}>
                                        {notifMinute.toString().padStart(2, '0')}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={styles.timeArrow}
                                    onPress={async () => {
                                        const h = (notifHour + 1) % 24;
                                        setNotifHour(h);
                                        await updateReminderTime(h, notifMinute);
                                    }}
                                >
                                    <Text style={styles.timeArrowText}>+</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}
                </View>
            </View>

            {/* Danger Zone */}
            <View style={[styles.section, { marginTop: 40 }]}>
                <Text style={[styles.sectionTitle, { color: colors.errorLight }]}>⚠️ 数据管理</Text>

                <TouchableOpacity
                    style={styles.seedButton}
                    onPress={handleSeedTestData}
                    disabled={saving}
                >
                    <Text style={styles.seedButtonText}>
                        {saving ? '处理中...' : '🧪 注入测试数据'}
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.dangerButton, { marginTop: 12 }]}
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
