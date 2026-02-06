// src/schemas/session.ts
// Zod schemas for session state and results

import { z } from 'zod';

// ============ Step State Schemas ============

export const AnswerRecordSchema = z.object({
    questionId: z.string(),
    selectedId: z.string(),
    correctId: z.string(),
    isCorrect: z.boolean(),
    timeMs: z.number(),
});

export const Step1StateSchema = z.object({
    questionIds: z.array(z.string()),
    currentIndex: z.number(),
    answers: z.array(AnswerRecordSchema),
});

export const Step2StateSchema = z.object({
    questionIds: z.array(z.string()),
    currentIndex: z.number(),
    answers: z.array(AnswerRecordSchema),
});

export const Step3StateSchema = z.object({
    packId: z.number(),
    items: z.array(z.number()),
    currentIndex: z.number(),
    correct: z.number(),
    wrong: z.number(),
    avgRtMs: z.number(),
    answers: z.array(AnswerRecordSchema).optional(),
});

export const SentenceSubmissionSchema = z.object({
    sentenceId: z.number(),
    checkedKeyPointIds: z.array(z.string()),
    hitCount: z.number(),
    totalCount: z.number(),
    passed: z.boolean(),
});

export const Step4StateSchema = z.object({
    sentenceIds: z.array(z.number()),
    currentIndex: z.number(),
    submissions: z.array(SentenceSubmissionSchema),
});

export const PlanSchema = z.object({
    date: z.string(),
    lessonId: z.number(),
    grammarId: z.number(),
    level: z.number(),
    step1: Step1StateSchema,
    step2: Step2StateSchema,
    step3: Step3StateSchema,
    step4: Step4StateSchema,
});

export const TimingSchema = z.object({
    startedAt: z.number(),
    elapsedMs: z.number(),
});

export const StepStateJsonSchema = z.object({
    currentStep: z.number().min(1).max(5),
    plan: PlanSchema,
    timing: TimingSchema,
});

// ============ Result Schemas ============

export const GrammarResultSchema = z.object({
    correct: z.number(),
    total: z.number(),
    topMistakeGrammarId: z.number().nullable(),
});

export const TransferResultSchema = z.object({
    correct: z.number(),
    total: z.number(),
});

export const VocabResultSchema = z.object({
    accuracy: z.number(),
    avgRtMs: z.number(),
    newBlockingCount: z.number(),
});

export const SentenceResultSchema = z.object({
    pass: z.number(),
    total: z.number(),
    keyPointHitRate: z.number(),
});

export const CoachResultSchema = z.object({
    source: z.enum(['offline', 'llm']),
    summary: z.string(),
});

export const ResultJsonSchema = z.object({
    stars: z.number().min(0).max(5),
    grammar: GrammarResultSchema,
    transfer: TransferResultSchema,
    vocab: VocabResultSchema,
    sentence: SentenceResultSchema,
    levelChange: z.enum(['pause', 'up', 'down']),
    coach: CoachResultSchema,
});

// ============ Type Exports ============

export type AnswerRecord = z.infer<typeof AnswerRecordSchema>;
export type Step1State = z.infer<typeof Step1StateSchema>;
export type Step2State = z.infer<typeof Step2StateSchema>;
export type Step3State = z.infer<typeof Step3StateSchema>;
export type Step4State = z.infer<typeof Step4StateSchema>;
export type SentenceSubmission = z.infer<typeof SentenceSubmissionSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Timing = z.infer<typeof TimingSchema>;
export type StepStateJson = z.infer<typeof StepStateJsonSchema>;
export type GrammarResult = z.infer<typeof GrammarResultSchema>;
export type TransferResult = z.infer<typeof TransferResultSchema>;
export type VocabResult = z.infer<typeof VocabResultSchema>;
export type SentenceResult = z.infer<typeof SentenceResultSchema>;
export type CoachResult = z.infer<typeof CoachResultSchema>;
export type ResultJson = z.infer<typeof ResultJsonSchema>;
