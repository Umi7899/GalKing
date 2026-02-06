// src/llm/mock.ts
// Mock LLM responses for development

import type { LLMFeature } from './client';
import type {
    MistakeExplainResponse,
    SentenceParseResponse,
    GenerateDrillsResponse,
    MasteryAssessResponse,
} from '../schemas/llm';

export async function getMockResponse(
    feature: LLMFeature,
    payload: object
): Promise<object | null> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

    switch (feature) {
        case 'mistake_explain':
            return getMockMistakeExplain(payload);
        case 'sentence_parse':
            return getMockSentenceParse(payload);
        case 'generate_drills':
            return getMockGenerateDrills(payload);
        case 'mastery_assess':
            return getMockMasteryAssess(payload);
        default:
            return null;
    }
}

function getMockMistakeExplain(payload: any): MistakeExplainResponse {
    const grammarName = payload.grammarName ?? '语法点';

    return {
        why_wrong: `你选择了错误的选项。这道题考查的是「${grammarName}」的用法。你可能把它和其他类似的语法点混淆了。`,
        key_rule: payload.coreRule ?? '请记住这个语法的核心规则。',
        minimal_fix: '把你选的选项换成正确选项即可。注意区分相似语法的使用场景。',
        contrast: [
            {
                wrong: '× 错误用法示例',
                correct: '○ 正确用法示例',
                explanation: '两者的区别在于使用场景不同。',
            },
            {
                wrong: '× 另一个容易混淆的用法',
                correct: '○ 这种情况下应该这样说',
                explanation: '注意助词的搭配。',
            },
        ],
        confidence: 0.85,
    };
}

function getMockSentenceParse(payload: any): SentenceParseResponse {
    const sentence = payload.sentence ?? '例句';

    return {
        gloss_zh: '这是一个示例句子的中文翻译。',
        segments: [
            { text: sentence.slice(0, 3), role: 'subject', note: '主语部分' },
            { text: sentence.slice(3, 5) || 'は', role: 'particle' },
            { text: sentence.slice(5) || '述语', role: 'predicate', note: '谓语部分' },
        ],
        omissions: [
            {
                type: 'subject',
                inferredContent: '说话人自己',
                hint: '日语中主语常被省略',
            },
        ],
        key_points: [
            { id: 'kp_mock_1', labelZh: '语法要点1', explanation: '这个语法点表示...' },
            { id: 'kp_mock_2', labelZh: '语气词', explanation: '句末的语气词表达了...' },
        ],
        confidence: 0.82,
    };
}

function getMockGenerateDrills(payload: any): GenerateDrillsResponse {
    const grammarId = payload.grammarId ?? 100;

    return {
        drills: [
            {
                drillId: `ai_g${grammarId}_1`,
                type: 'choice',
                stem: 'AI生成的练习题：请选择正确的选项',
                options: [
                    { id: 'a', text: '选项A（正确）' },
                    { id: 'b', text: '选项B' },
                    { id: 'c', text: '选项C' },
                    { id: 'd', text: '选项D' },
                ],
                correctId: 'a',
                explanation: '这是AI生成的解释。',
                grammarId,
            },
        ],
        confidence: 0.78,
    };
}

function getMockMasteryAssess(payload: any): MasteryAssessResponse {
    return {
        mastery_adjustments: [
            {
                grammarId: 101,
                currentMastery: 65,
                suggestedDelta: 5,
                reason: '近期表现稳定，建议提高掌握度评估。',
            },
        ],
        recommended_next_review: {
            101: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        },
        level_recommendation: 'up',
        tomorrow_plan: {
            focusGrammarIds: [102],
            reviewVocabIds: [1001, 1002, 1003],
            suggestedLevel: (payload.currentProgress?.level ?? 1) + 1,
            summary: '明天建议继续学习新语法点，同时复习之前学过的词汇。保持现有的学习节奏，你的进步很稳定！',
        },
        confidence: 0.88,
    };
}
