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

// ============ Storage Keys ============

const KEYS = {
    LLM_SETTINGS: '@galking/llm_settings',
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
