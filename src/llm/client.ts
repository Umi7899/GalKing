// src/llm/client.ts
// LLM Client with real API calls, caching, timeout, retry, and fallback

import { z } from 'zod';
import {
    generateCacheKey,
    getCachedResponse,
    setCachedResponse,
    cleanExpiredCache,
} from '../db/queries/cache';
import { getMeta } from '../db/database';
import {
    MistakeExplainResponseSchema,
    SentenceParseResponseSchema,
    GenerateDrillsResponseSchema,
    MasteryAssessResponseSchema,
    type MistakeExplainResponse,
    type SentenceParseResponse,
    type GenerateDrillsResponse,
    type MasteryAssessResponse,
    type ScenarioGenResponse,
    type ScenarioEvalResponse,
    type BlitzSummaryResponse,
    type LLMFeature,
    ScenarioGenResponseSchema,
    ScenarioEvalResponseSchema,
    BlitzSummaryResponseSchema,
} from '../schemas/llm';
import { getMockResponse } from './mock';
import {
    getLLMSettings,
    getEndpointForProvider,
    getModelForProvider,
    type LLMSettings
} from '../settings/storage';
import { PROMPTS } from './prompts';

// ============ Types ============

// LLMFeature imported from schemas

export interface LLMRequestOptions {
    feature: LLMFeature;
    payload: object;
    skipCache?: boolean;
    timeoutMs?: number;
}

export interface LLMResult<T> {
    ok: boolean;
    data?: T;
    error?: string;
    source: 'cache' | 'llm' | 'mock' | 'fallback';
}

// ============ Configuration ============

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_RETRIES = 1;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Settings cache (refreshed on demand)
let cachedSettings: LLMSettings | null = null;
let settingsLoadTime = 0;
const SETTINGS_CACHE_MS = 5000;

async function getSettings(): Promise<LLMSettings | null> {
    const now = Date.now();
    if (cachedSettings && now - settingsLoadTime < SETTINGS_CACHE_MS) {
        return cachedSettings;
    }
    cachedSettings = await getLLMSettings();
    settingsLoadTime = now;
    return cachedSettings;
}

export function clearSettingsCache(): void {
    cachedSettings = null;
    settingsLoadTime = 0;
}

export async function isLLMConfigured(): Promise<boolean> {
    const settings = await getSettings();
    if (!settings || !settings.apiKey) return false;
    if (settings.provider === 'custom' && !settings.customEndpoint) return false;
    return true;
}

export const isLLMAvailable = isLLMConfigured;
export const checkLLMAvailable = isLLMConfigured;

// ============ OpenAI-Compatible API Call ============

export interface ChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export async function callOpenAICompatibleAPI(
    endpoint: string,
    apiKey: string,
    model: string,
    messages: ChatMessage[],
    timeoutMs: number
): Promise<{ ok: boolean; content?: string; error?: string }> {
    // ... existing implementation ...
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                temperature: 0.7,
                max_tokens: 1024,
            }),
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.status === 401 || response.status === 403) {
            return { ok: false, error: 'API Key 无效，请检查设置' };
        }
        if (response.status === 429) {
            return { ok: false, error: '请求过于频繁，请稍后再试' };
        }
        if (response.status >= 500) {
            return { ok: false, error: `服务器错误: ${response.status}` };
        }
        if (!response.ok) {
            return { ok: false, error: `请求失败: ${response.status}` };
        }

        const json = await response.json();
        const content = json.choices?.[0]?.message?.content;

        if (!content) {
            return { ok: false, error: '响应格式错误' };
        }

        return { ok: true, content };
    } catch (e) {
        clearTimeout(timeoutId);
        if (e instanceof Error) {
            if (e.name === 'AbortError') {
                return { ok: false, error: '请求超时' };
            }
            return { ok: false, error: e.message };
        }
        return { ok: false, error: '网络错误' };
    }
}

export async function chatWithAI(messages: ChatMessage[]): Promise<{ ok: boolean; content?: string; error?: string }> {
    const settings = await getSettings();
    if (!settings || !settings.apiKey) {
        return { ok: false, error: '请先配置 AI 服务' };
    }

    const endpoint = getEndpointForProvider(settings);
    const model = getModelForProvider(settings);

    if (!endpoint) return { ok: false, error: '未配置 API 端点' };

    return callOpenAICompatibleAPI(
        endpoint,
        settings.apiKey,
        model,
        messages,
        DEFAULT_TIMEOUT_MS
    );
}

// ============ Parse JSON from LLM Response ============

function extractJSON(text: string): object | null {
    // Try to find JSON in markdown code block
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            return JSON.parse(codeBlockMatch[1].trim());
        } catch { }
    }

    // Try to parse entire response as JSON
    try {
        return JSON.parse(text.trim());
    } catch { }

    // Try to find JSON object in text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { }
    }

    return null;
}

// ============ Main Request Function ============

export async function llmRequest<T>(
    options: LLMRequestOptions,
    schema: z.ZodSchema<T>
): Promise<LLMResult<T>> {
    const { feature, payload, skipCache = false, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
    const datasetId = await getMeta('datasetId') ?? 'unknown';

    // 1. Check cache first (unless skipped)
    if (!skipCache) {
        const { cacheKey } = await generateCacheKey(feature, datasetId, null, payload);
        const cached = await getCachedResponse(cacheKey);

        if (cached) {
            try {
                const data = schema.parse(JSON.parse(cached.responseJson));
                return { ok: true, data, source: 'cache' };
            } catch (e) {
                console.warn('[LLM] Cache parse failed:', e);
            }
        }
    }

    // 2. Try real API if configured
    const settings = await getSettings();

    if (settings && settings.apiKey) {
        const endpoint = getEndpointForProvider(settings);
        const model = getModelForProvider(settings);

        if (endpoint) {
            // Build prompt from templates
            const prompt = PROMPTS[feature];
            if (prompt) {
                const messages: ChatMessage[] = [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.buildUserPrompt(payload) },
                ];

                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    const result = await callOpenAICompatibleAPI(
                        endpoint,
                        settings.apiKey,
                        model,
                        messages,
                        timeoutMs
                    );

                    if (result.ok && result.content) {
                        const jsonData = extractJSON(result.content);

                        if (jsonData) {
                            const parseResult = schema.safeParse(jsonData);

                            if (parseResult.success) {
                                // Cache successful response
                                const { cacheKey, payloadHash } = await generateCacheKey(
                                    feature, datasetId, settings.provider, payload
                                );
                                await setCachedResponse(
                                    cacheKey, feature, datasetId, settings.provider,
                                    payloadHash, jsonData, CACHE_TTL_MS
                                );

                                return { ok: true, data: parseResult.data, source: 'llm' };
                            }
                            console.warn('[LLM] Response validation failed:', parseResult.error);
                        } else {
                            console.warn('[LLM] Could not extract JSON from response');
                        }
                    }

                    if (result.error && attempt < MAX_RETRIES) {
                        console.log(`[LLM] Retrying (${attempt + 1}/${MAX_RETRIES})...`);
                        await new Promise(r => setTimeout(r, 1000));
                    } else if (result.error) {
                        console.error('[LLM] Request failed:', result.error);
                    }
                }
            }
        }
    }

    // 3. Fallback to mock
    console.log('[LLM] Using mock fallback');
    const mockResult = await getMockResponse(feature, payload);
    if (mockResult) {
        try {
            const data = schema.parse(mockResult);
            return { ok: true, data, source: 'mock' };
        } catch (e) {
            console.error('[LLM] Mock validation failed:', e);
        }
    }

    return { ok: false, error: 'LLM 请求失败', source: 'fallback' };
}

// ============ Connection Test ============

export async function testLLMConnection(): Promise<{ ok: boolean; error?: string; latencyMs?: number }> {
    const settings = await getSettings();

    if (!settings || !settings.apiKey) {
        return { ok: false, error: '请先配置 API Key' };
    }

    const endpoint = getEndpointForProvider(settings);
    const model = getModelForProvider(settings);

    if (!endpoint) {
        return { ok: false, error: '请配置 API 端点' };
    }

    const startTime = Date.now();
    const result = await callOpenAICompatibleAPI(
        endpoint,
        settings.apiKey,
        model,
        [{ role: 'user', content: 'Hello' }],
        10000
    );

    const latencyMs = Date.now() - startTime;

    if (result.ok) {
        return { ok: true, latencyMs };
    }
    return { ok: false, error: result.error, latencyMs };
}

// ============ Feature-Specific Functions ============

export interface MistakeExplainInput {
    grammarName: string;
    coreRule: string;
    question: {
        stem: string;
        options: { id: string; text: string }[];
        selectedId: string;
        correctId: string;
    };
}

export async function explainMistake(input: MistakeExplainInput, options?: { skipCache?: boolean }): Promise<LLMResult<MistakeExplainResponse>> {
    return llmRequest(
        { feature: 'mistake_explain', payload: input, skipCache: options?.skipCache },
        MistakeExplainResponseSchema
    );
}

export interface SentenceParseInput {
    sentence: string;
    styleTag: string;
    knownGrammarIds?: number[];
    knownVocabIds?: number[];
}

export async function parseSentence(input: SentenceParseInput, options?: { skipCache?: boolean }): Promise<LLMResult<SentenceParseResponse>> {
    return llmRequest(
        { feature: 'sentence_parse', payload: input, skipCache: options?.skipCache },
        SentenceParseResponseSchema
    );
}

export interface GenerateDrillsInput {
    grammarId: number;
    grammarName: string;
    coreRule: string;
    structure: string;
    difficultyHint: 'easy' | 'medium' | 'hard';
    count: number;
}

export async function generateDrills(input: GenerateDrillsInput): Promise<LLMResult<GenerateDrillsResponse>> {
    return llmRequest(
        { feature: 'generate_drills', payload: input },
        GenerateDrillsResponseSchema
    );
}

export interface MasteryAssessInput {
    recentStats: {
        grammarAccuracies: { grammarId: number; accuracy: number; sessionsCount: number }[];
        vocabAccuracies: { vocabId: number; accuracy: number }[];
        avgSessionAccuracy: number;
        streakDays: number;
    };
    currentProgress: {
        lessonId: number;
        grammarIndex: number;
        level: number;
    };
    // Short-term memory context
    memoryContext?: {
        previousSummary?: string; // Compressed/truncated
        totalTrainingDays: number;
        attendancePattern: 'perfect' | 'consistent' | 'irregular' | 'returning'; // AI reacts differently
        daysSinceLastSession: number;
    };
}

export async function assessMastery(input: MasteryAssessInput): Promise<LLMResult<MasteryAssessResponse>> {
    return llmRequest(
        { feature: 'mastery_assess', payload: input },
        MasteryAssessResponseSchema
    );
}

export async function generateScenario(lessonId: number = 1, level: number = 1): Promise<LLMResult<ScenarioGenResponse>> {
    return llmRequest(
        { feature: 'scenario_gen', payload: { lessonId, level } },
        ScenarioGenResponseSchema
    );
}

export interface ScenarioEvalInput {
    scene: string;
    goal: string;
    userResponse: string;
}

export async function evaluateScenario(input: ScenarioEvalInput): Promise<LLMResult<ScenarioEvalResponse>> {
    return llmRequest(
        { feature: 'scenario_eval', payload: input },
        ScenarioEvalResponseSchema
    );
}

export interface BlitzSummaryInput {
    score: number;
    streak: number;
    correctCount: number;
    wrongWords: string[];
}

export async function getBlitzSummary(input: BlitzSummaryInput): Promise<LLMResult<BlitzSummaryResponse>> {
    return llmRequest(
        { feature: 'vocab_blitz_summary', payload: input },
        BlitzSummaryResponseSchema
    );
}

// ============ Maintenance ============

export async function cleanCache(): Promise<number> {
    return cleanExpiredCache();
}
