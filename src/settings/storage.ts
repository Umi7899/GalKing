// src/settings/storage.ts
// Settings storage using AsyncStorage

import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ Types ============

export type LLMProvider = 'deepseek' | 'openai' | 'custom';

export interface LLMSettings {
    provider: LLMProvider;
    apiKey: string;
    customEndpoint?: string;  // For custom provider
    modelName?: string;       // Override default model
}

export interface NotificationSettings {
    enabled: boolean;
    hour: number;
    minute: number;
}

// ============ Storage Keys ============

const KEYS = {
    LLM_SETTINGS: '@galking/llm_settings',
    NOTIFICATION_SETTINGS: '@galking/notification_settings',
    ONBOARDING_COMPLETE: '@galking/onboarding_complete',
};

// ============ Provider Configs ============

export const PROVIDER_CONFIGS: Record<LLMProvider, {
    name: string;
    endpoint: string;
    defaultModel: string;
    placeholder: string;
}> = {
    deepseek: {
        name: 'DeepSeek',
        endpoint: 'https://api.deepseek.com/v1/chat/completions',
        defaultModel: 'deepseek-chat',
        placeholder: 'sk-...',
    },
    openai: {
        name: 'OpenAI',
        endpoint: 'https://api.openai.com/v1/chat/completions',
        defaultModel: 'gpt-4o-mini',
        placeholder: 'sk-...',
    },
    custom: {
        name: '自定义',
        endpoint: '',  // User must provide
        defaultModel: '',
        placeholder: 'your-api-key',
    },
};

// ============ Settings Functions ============

export async function getLLMSettings(): Promise<LLMSettings | null> {
    try {
        const json = await AsyncStorage.getItem(KEYS.LLM_SETTINGS);
        if (!json) return null;
        return JSON.parse(json);
    } catch (e) {
        console.error('[Settings] Load error:', e);
        return null;
    }
}

export async function saveLLMSettings(settings: LLMSettings): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.LLM_SETTINGS, JSON.stringify(settings));
    } catch (e) {
        console.error('[Settings] Save error:', e);
        throw e;
    }
}

export async function clearLLMSettings(): Promise<void> {
    try {
        await AsyncStorage.removeItem(KEYS.LLM_SETTINGS);
    } catch (e) {
        console.error('[Settings] Clear error:', e);
    }
}

// ============ Helpers ============

export function getEndpointForProvider(settings: LLMSettings): string {
    if (settings.provider === 'custom') {
        return settings.customEndpoint || '';
    }
    return PROVIDER_CONFIGS[settings.provider].endpoint;
}

export function getModelForProvider(settings: LLMSettings): string {
    if (settings.modelName) {
        return settings.modelName;
    }
    return PROVIDER_CONFIGS[settings.provider].defaultModel;
}

// ============ Notification Settings ============

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
    enabled: false,
    hour: 20,
    minute: 0,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
    try {
        const json = await AsyncStorage.getItem(KEYS.NOTIFICATION_SETTINGS);
        if (!json) return DEFAULT_NOTIFICATION_SETTINGS;
        return { ...DEFAULT_NOTIFICATION_SETTINGS, ...JSON.parse(json) };
    } catch (e) {
        console.error('[Settings] Notification load error:', e);
        return DEFAULT_NOTIFICATION_SETTINGS;
    }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
    try {
        await AsyncStorage.setItem(KEYS.NOTIFICATION_SETTINGS, JSON.stringify(settings));
    } catch (e) {
        console.error('[Settings] Notification save error:', e);
        throw e;
    }
}

// ============ Onboarding ============

export async function isOnboardingComplete(): Promise<boolean> {
    try {
        const value = await AsyncStorage.getItem(KEYS.ONBOARDING_COMPLETE);
        return value === 'true';
    } catch {
        return false;
    }
}

export async function setOnboardingComplete(): Promise<void> {
    await AsyncStorage.setItem(KEYS.ONBOARDING_COMPLETE, 'true');
}
