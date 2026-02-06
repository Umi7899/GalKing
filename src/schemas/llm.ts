// src/schemas/llm.ts
// Zod schemas for LLM response validation

import { z } from 'zod';
import { DrillSchema } from './content';

// ============ mistake_explain Feature ============

export const ContrastExampleSchema = z.object({
    wrong: z.string(),
    correct: z.string(),
    explanation: z.string(),
});

export const MistakeExplainResponseSchema = z.object({
    why_wrong: z.string(),
    key_rule: z.string(),
    minimal_fix: z.string(),
    contrast: z.array(ContrastExampleSchema).min(2).max(3),
    next_drill: z.array(DrillSchema).max(2).optional(),
    confidence: z.number().min(0).max(1),
});

// ============ sentence_parse Feature ============

export const SegmentSchema = z.object({
    text: z.string(),
    role: z.enum(['主语', '谓语', '宾语', '修饰语', '助词', '助动词', '其他']),
    note: z.string().optional(),
});

export const OmissionSchema = z.object({
    type: z.enum(['subject', 'object', 'particle', 'copula']),
    inferredContent: z.string(),
    hint: z.string(),
});

export const SentenceParseKeyPointSchema = z.object({
    id: z.string(),
    labelZh: z.string(),
    explanation: z.string(),
});

export const SentenceParseResponseSchema = z.object({
    gloss_zh: z.string(),
    segments: z.array(SegmentSchema),
    omissions: z.array(OmissionSchema),
    key_points: z.array(SentenceParseKeyPointSchema),
    confidence: z.number().min(0).max(1),
});

// ============ generate_drills Feature ============

export const GenerateDrillsResponseSchema = z.object({
    drills: z.array(DrillSchema),
    confidence: z.number().min(0).max(1),
});

// ============ mastery_assess Feature ============

export const MasteryAdjustmentSchema = z.object({
    grammarId: z.number(),
    currentMastery: z.number(),
    suggestedDelta: z.number(),
    reason: z.string(),
});

export const TomorrowPlanSchema = z.object({
    focusGrammarIds: z.array(z.number()),
    reviewVocabIds: z.array(z.number()),
    suggestedLevel: z.number(),
    summary: z.string(),
});

export const MasteryAssessResponseSchema = z.object({
    mastery_adjustments: z.array(MasteryAdjustmentSchema),
    recommended_next_review: z.record(z.number(), z.string()), // grammarId -> ISO date
    level_recommendation: z.enum(['maintain', 'up', 'down']),
    tomorrow_plan: TomorrowPlanSchema,
    confidence: z.number().min(0).max(1),
});

// ============ Type Exports ============

export type ContrastExample = z.infer<typeof ContrastExampleSchema>;
export type MistakeExplainResponse = z.infer<typeof MistakeExplainResponseSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type Omission = z.infer<typeof OmissionSchema>;
export type SentenceParseKeyPoint = z.infer<typeof SentenceParseKeyPointSchema>;
export type SentenceParseResponse = z.infer<typeof SentenceParseResponseSchema>;
export type GenerateDrillsResponse = z.infer<typeof GenerateDrillsResponseSchema>;
export type MasteryAdjustment = z.infer<typeof MasteryAdjustmentSchema>;
export type TomorrowPlan = z.infer<typeof TomorrowPlanSchema>;
export type MasteryAssessResponse = z.infer<typeof MasteryAssessResponseSchema>;
