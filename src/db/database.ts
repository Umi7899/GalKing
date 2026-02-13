// src/db/database.ts
// SQLite Database Manager with import functionality

import * as SQLite from 'expo-sqlite';
import { ALL_CREATE_STATEMENTS } from './schema';
import {
    ManifestSchema,
    LessonsDatasetSchema,
    GrammarPointsDatasetSchema,
    VocabDatasetSchema,
    VocabPacksDatasetSchema,
    SentencesDatasetSchema,
    type Lesson,
    type GrammarPoint,
    type Vocab,
    type VocabPack,
    type Sentence,
} from '../schemas/content';

const DB_NAME = 'galking.db';

let db: SQLite.SQLiteDatabase | null = null;

// ============ Database Initialization ============

export function getDatabase(): SQLite.SQLiteDatabase {
    if (!db) {
        throw new Error('Database not initialized. Call initDatabase() first.');
    }
    return db;
}

export async function initDatabase(): Promise<void> {
    if (!db) {
        db = await SQLite.openDatabaseAsync(DB_NAME);
    }

    // Execute all table creation statements
    for (const statement of ALL_CREATE_STATEMENTS) {
        await db.execAsync(statement);
    }

    // Migrations
    try {
        await db.execAsync('ALTER TABLE user_progress ADD COLUMN maxStreakDays INTEGER NOT NULL DEFAULT 0');
    } catch (_) {
        // Column already exists, ignore
    }

    // Migration: import fun vocab if not yet imported
    try {
        const funVocabCheck = await db.getFirstAsync<{ count: number }>(
            "SELECT COUNT(*) as count FROM vocab WHERE vocabId >= 90001"
        );
        if ((funVocabCheck?.count ?? 0) === 0) {
            const funVocabJson = require('../../assets/data/fun_vocab.json');
            const funVocab = VocabDatasetSchema.parse(funVocabJson);
            for (const v of funVocab) {
                await db.runAsync(
                    `INSERT OR IGNORE INTO vocab (vocabId, surface, reading, meaningsJson, level, tagsJson)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [v.vocabId, v.surface, v.reading, JSON.stringify(v.meanings), v.level, JSON.stringify(v.tags)]
                );
            }
            console.log(`[DB] Migration: imported ${funVocab.length} fun vocab items`);
        }
    } catch (e) {
        console.warn('[DB] Fun vocab migration failed:', e);
    }

    console.log('[DB] All tables created successfully');
}

// ============ Meta Operations ============

export async function getMeta(key: string): Promise<string | null> {
    const database = await getDatabase();
    const result = await database.getFirstAsync<{ value: string }>(
        'SELECT value FROM meta WHERE key = ?',
        [key]
    );
    return result?.value ?? null;
}

export async function setMeta(key: string, value: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
        'INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)',
        [key, value]
    );
}

// ============ Dataset Import ============

export async function needsImport(): Promise<boolean> {
    const currentDatasetId = await getMeta('datasetId');
    return currentDatasetId === null;
}

export async function importDataset(): Promise<{ success: boolean; error?: string }> {
    try {
        const database = await getDatabase();

        // Load manifest
        const manifestJson = require('../../assets/data/manifest.json');
        const manifest = ManifestSchema.parse(manifestJson);

        // Check if already imported
        const existingDatasetId = await getMeta('datasetId');
        if (existingDatasetId === manifest.datasetId) {
            console.log('[DB] Dataset already imported, skipping');
            return { success: true };
        }

        console.log('[DB] Starting dataset import:', manifest.datasetId);

        // Load and validate all datasets
        const lessonsJson = require('../../assets/data/lessons.json');
        const grammarPointsJson = require('../../assets/data/grammar_points.json');
        const vocabJson = require('../../assets/data/vocab.json');
        const vocabPacksJson = require('../../assets/data/vocab_packs.json');
        const sentencesJson = require('../../assets/data/sentences.json');

        const lessons = LessonsDatasetSchema.parse(lessonsJson);
        const grammarPoints = GrammarPointsDatasetSchema.parse(grammarPointsJson);
        const vocab = VocabDatasetSchema.parse(vocabJson);
        const vocabPacks = VocabPacksDatasetSchema.parse(vocabPacksJson);
        const sentences = SentencesDatasetSchema.parse(sentencesJson);

        console.log('[DB] All datasets validated');

        // Clear existing content tables
        await database.execAsync('DELETE FROM lessons');
        await database.execAsync('DELETE FROM grammar_points');
        await database.execAsync('DELETE FROM vocab');
        await database.execAsync('DELETE FROM vocab_packs');
        await database.execAsync('DELETE FROM sentences');

        // Import lessons
        for (const lesson of lessons) {
            await database.runAsync(
                `INSERT INTO lessons (lessonId, title, goal, orderIndex, grammarIdsJson, vocabPackIdsJson, tagsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    lesson.lessonId,
                    lesson.title,
                    lesson.goal,
                    lesson.orderIndex,
                    JSON.stringify(lesson.grammarIds),
                    JSON.stringify(lesson.vocabPackIds),
                    JSON.stringify(lesson.tags),
                ]
            );
        }
        console.log(`[DB] Imported ${lessons.length} lessons`);

        // Import grammar points
        for (const gp of grammarPoints) {
            await database.runAsync(
                `INSERT INTO grammar_points (grammarId, lessonId, name, coreRule, structure, mnemonic, examplesJson, counterExamplesJson, drillsJson, level, tagsJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    gp.grammarId,
                    gp.lessonId,
                    gp.name,
                    gp.coreRule,
                    gp.structure,
                    gp.mnemonic,
                    JSON.stringify(gp.examples),
                    JSON.stringify(gp.counterExamples),
                    JSON.stringify(gp.drills),
                    gp.level,
                    JSON.stringify(gp.tags),
                ]
            );
        }
        console.log(`[DB] Imported ${grammarPoints.length} grammar points`);

        // Import vocab
        for (const v of vocab) {
            await database.runAsync(
                `INSERT INTO vocab (vocabId, surface, reading, meaningsJson, level, tagsJson)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    v.vocabId,
                    v.surface,
                    v.reading,
                    JSON.stringify(v.meanings),
                    v.level,
                    JSON.stringify(v.tags),
                ]
            );
        }
        console.log(`[DB] Imported ${vocab.length} vocab items`);

        // Import fun vocab (separate file for easy editing)
        const funVocabJson = require('../../assets/data/fun_vocab.json');
        const funVocab = VocabDatasetSchema.parse(funVocabJson);
        for (const v of funVocab) {
            await database.runAsync(
                `INSERT INTO vocab (vocabId, surface, reading, meaningsJson, level, tagsJson)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    v.vocabId,
                    v.surface,
                    v.reading,
                    JSON.stringify(v.meanings),
                    v.level,
                    JSON.stringify(v.tags),
                ]
            );
        }
        console.log(`[DB] Imported ${funVocab.length} fun vocab items`);

        // Import vocab packs
        for (const pack of vocabPacks) {
            await database.runAsync(
                `INSERT INTO vocab_packs (packId, name, type, lessonId, vocabIdsJson, level)
         VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    pack.packId,
                    pack.name,
                    pack.type,
                    pack.lessonId,
                    JSON.stringify(pack.vocabIds),
                    pack.level,
                ]
            );
        }
        console.log(`[DB] Imported ${vocabPacks.length} vocab packs`);

        // Import sentences
        for (const s of sentences) {
            await database.runAsync(
                `INSERT INTO sentences (sentenceId, text, styleTag, lessonId, level, grammarIdsJson, keyPointsJson, blockingVocabIdsJson, tokensJson)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    s.sentenceId,
                    s.text,
                    s.styleTag,
                    s.lessonId,
                    s.level,
                    JSON.stringify(s.grammarIds),
                    JSON.stringify(s.keyPoints),
                    JSON.stringify(s.blockingVocabIds),
                    s.tokens ? JSON.stringify(s.tokens) : null,
                ]
            );
        }
        console.log(`[DB] Imported ${sentences.length} sentences`);

        // Save meta info
        await setMeta('datasetId', manifest.datasetId);
        await setMeta('datasetVersion', manifest.version);
        await setMeta('importedAt', new Date().toISOString());

        // Initialize user_progress if not exists
        const userProgress = await database.getFirstAsync(
            'SELECT id FROM user_progress WHERE id = 1'
        );
        if (!userProgress) {
            await database.runAsync(
                `INSERT INTO user_progress (id, currentLessonId, currentGrammarIndex, currentLevel, streakDays)
         VALUES (1, 25, 0, 1, 0)`
            );
            console.log('[DB] Initialized user progress');
        }

        console.log('[DB] Dataset import completed successfully');
        return { success: true };
    } catch (error) {
        console.error('[DB] Import failed:', error);
        return { success: false, error: String(error) };
    }
}

// ============ Type Helpers ============

export interface DbLesson {
    lessonId: number;
    title: string;
    goal: string;
    orderIndex: number;
    grammarIdsJson: string;
    vocabPackIdsJson: string;
    tagsJson: string;
}

export interface DbGrammarPoint {
    grammarId: number;
    lessonId: number;
    name: string;
    coreRule: string;
    structure: string;
    mnemonic: string;
    examplesJson: string;
    counterExamplesJson: string;
    drillsJson: string;
    level: number;
    tagsJson: string;
}

export interface DbVocab {
    vocabId: number;
    surface: string;
    reading: string;
    meaningsJson: string;
    level: number;
    tagsJson: string;
}

export interface DbUserProgress {
    id: number;
    currentLessonId: number;
    currentGrammarIndex: number;
    currentLevel: number;
    streakDays: number;
    lastActiveDate: string | null;
    maxStreakDays: number;
}

export interface DbUserGrammarState {
    grammarId: number;
    mastery: number;
    lastSeenAt: number | null;
    nextReviewAt: number | null;
    wrongCount7d: number;
    correctStreak: number;
}

export interface DbSession {
    sessionId: number;
    date: string;
    plannedLessonId: number;
    plannedGrammarId: number;
    plannedLevel: number;
    stepStateJson: string;
    resultJson: string | null;
    startedAt: number;
    finishedAt: number | null;
    status: 'in_progress' | 'completed';
    stars: number | null;
}
