// src/schemas/content.ts
// Zod schemas for content data validation

import { z } from 'zod';

// ============ Basic Types ============

export const ExampleSchema = z.object({
    jp: z.string(),
    zhHint: z.string(),
});

export const DrillOptionSchema = z.object({
    id: z.string(),
    text: z.string(),
});

export const DrillSchema = z.object({
    drillId: z.string(),
    type: z.enum(['choice', 'fill', 'reorder', 'judge']),
    stem: z.string(),
    options: z.array(DrillOptionSchema).optional(),
    correctId: z.string().optional(),
    correctAnswer: z.string().optional(),
    explanation: z.string(),
    grammarId: z.number(),
});

export const KeyPointSchema = z.object({
    id: z.string(),
    labelZh: z.string(),
    expectedValueZh: z.string().optional(),
    hint: z.string().optional(),
});

// ============ Content Schemas ============

export const ManifestSchema = z.object({
    datasetId: z.string(),
    version: z.string(),
    createdAt: z.string(),
    fileHashes: z.record(z.string(), z.string()).optional(),
});

export const LessonSchema = z.object({
    lessonId: z.number(),
    title: z.string(),
    goal: z.string(),
    orderIndex: z.number(),
    grammarIds: z.array(z.number()),
    vocabPackIds: z.array(z.number()),
    tags: z.array(z.string()),
});

export const GrammarPointSchema = z.object({
    grammarId: z.number(),
    lessonId: z.number(),
    name: z.string(),
    coreRule: z.string(),
    structure: z.string(),
    mnemonic: z.string(),
    examples: z.array(ExampleSchema),
    counterExamples: z.array(ExampleSchema),
    drills: z.array(DrillSchema),
    level: z.number(),
    tags: z.array(z.string()),
});

export const VocabSchema = z.object({
    vocabId: z.number(),
    surface: z.string(),
    reading: z.string(),
    meanings: z.array(z.string()),
    level: z.number(),
    tags: z.array(z.string()),
});

export const VocabPackSchema = z.object({
    packId: z.number(),
    name: z.string(),
    type: z.enum(['lesson', 'gal', 'blocking', 'review']),
    lessonId: z.number().nullable(),
    vocabIds: z.array(z.number()),
    level: z.number(),
});

export const SentenceSchema = z.object({
    sentenceId: z.number(),
    text: z.string(),
    styleTag: z.string(),
    lessonId: z.number().nullable(),
    level: z.number(),
    grammarIds: z.array(z.number()),
    keyPoints: z.array(KeyPointSchema),
    blockingVocabIds: z.array(z.number()),
    tokens: z.array(z.string()).optional(),
});

// ============ Dataset Collection Schemas ============

export const LessonsDatasetSchema = z.array(LessonSchema);
export const GrammarPointsDatasetSchema = z.array(GrammarPointSchema);
export const VocabDatasetSchema = z.array(VocabSchema);
export const VocabPacksDatasetSchema = z.array(VocabPackSchema);
export const SentencesDatasetSchema = z.array(SentenceSchema);

// ============ Type Exports ============

export type Manifest = z.infer<typeof ManifestSchema>;
export type Lesson = z.infer<typeof LessonSchema>;
export type GrammarPoint = z.infer<typeof GrammarPointSchema>;
export type Vocab = z.infer<typeof VocabSchema>;
export type VocabPack = z.infer<typeof VocabPackSchema>;
export type Sentence = z.infer<typeof SentenceSchema>;
export type Drill = z.infer<typeof DrillSchema>;
export type KeyPoint = z.infer<typeof KeyPointSchema>;
export type Example = z.infer<typeof ExampleSchema>;
