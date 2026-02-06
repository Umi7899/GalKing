// src/db/queries/content.ts
// Content query functions for all content tables

import { getDatabase } from '../database';
import type { Lesson, GrammarPoint, Vocab, VocabPack, Sentence, Drill } from '../../schemas/content';

// ============ Lessons ============

export async function getLesson(lessonId: number): Promise<Lesson | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM lessons WHERE lessonId = ?',
        [lessonId]
    );

    if (!row) return null;

    return {
        lessonId: row.lessonId,
        title: row.title,
        goal: row.goal,
        orderIndex: row.orderIndex,
        grammarIds: JSON.parse(row.grammarIdsJson || '[]'),
        vocabPackIds: JSON.parse(row.vocabPackIdsJson || '[]'),
        tags: JSON.parse(row.tagsJson || '[]'),
    };
}

export async function getAllLessons(): Promise<Lesson[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<any>('SELECT * FROM lessons ORDER BY lessonId');

    return rows.map(row => ({
        lessonId: row.lessonId,
        title: row.title,
        goal: row.goal,
        orderIndex: row.orderIndex,
        grammarIds: JSON.parse(row.grammarIdsJson || '[]'),
        vocabPackIds: JSON.parse(row.vocabPackIdsJson || '[]'),
        tags: JSON.parse(row.tagsJson || '[]'),
    }));
}

// ============ Grammar Points ============

export async function getGrammarPoint(grammarId: number): Promise<GrammarPoint | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM grammar_points WHERE grammarId = ?',
        [grammarId]
    );

    if (!row) return null;

    return parseGrammarRow(row);
}

export async function getGrammarPointsByLesson(lessonId: number): Promise<GrammarPoint[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM grammar_points WHERE lessonId = ? ORDER BY grammarId',
        [lessonId]
    );

    return rows.map(parseGrammarRow);
}

function parseGrammarRow(row: any): GrammarPoint {
    return {
        grammarId: row.grammarId,
        lessonId: row.lessonId,
        name: row.name,
        coreRule: row.coreRule,
        structure: row.structure || '',
        mnemonic: row.mnemonic || '',
        examples: JSON.parse(row.examplesJson || '[]'),
        counterExamples: JSON.parse(row.counterExamplesJson || '[]'),
        drills: JSON.parse(row.drillsJson || '[]'),
        level: row.level || 1,
        tags: JSON.parse(row.tagsJson || '[]'),
    };
}

// ============ Vocab ============

export async function getVocab(vocabId: number): Promise<Vocab | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM vocab WHERE vocabId = ?',
        [vocabId]
    );

    if (!row) return null;

    return parseVocabRow(row);
}

export async function getVocabByIds(vocabIds: number[]): Promise<Vocab[]> {
    if (vocabIds.length === 0) return [];

    const db = getDatabase();
    const placeholders = vocabIds.map(() => '?').join(',');
    const rows = await db.getAllAsync<any>(
        `SELECT * FROM vocab WHERE vocabId IN (${placeholders})`,
        vocabIds
    );

    return rows.map(parseVocabRow);
}

export async function getAllVocab(): Promise<Vocab[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<any>('SELECT * FROM vocab ORDER BY vocabId');

    return rows.map(parseVocabRow);
}

function parseVocabRow(row: any): Vocab {
    return {
        vocabId: row.vocabId,
        surface: row.surface,
        reading: row.reading,
        meanings: JSON.parse(row.meaningsJson || '[]'),
        level: row.level || 1,
        tags: JSON.parse(row.tagsJson || '[]'),
    };
}

// ============ Vocab Packs ============

export async function getVocabPack(packId: number): Promise<VocabPack | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM vocab_packs WHERE packId = ?',
        [packId]
    );

    if (!row) return null;

    return {
        packId: row.packId,
        name: row.name,
        type: row.type || 'lesson',
        lessonId: row.lessonId,
        vocabIds: JSON.parse(row.vocabIdsJson || '[]'),
        level: row.level || 1,
    };
}

export async function getVocabPacksByLesson(lessonId: number): Promise<VocabPack[]> {
    const db = getDatabase();
    const rows = await db.getAllAsync<any>(
        'SELECT * FROM vocab_packs WHERE lessonId = ? ORDER BY packId',
        [lessonId]
    );

    return rows.map(row => ({
        packId: row.packId,
        name: row.name,
        type: row.type || 'lesson',
        lessonId: row.lessonId,
        vocabIds: JSON.parse(row.vocabIdsJson || '[]'),
        level: row.level || 1,
    }));
}

// ============ Sentences ============

export async function getSentence(sentenceId: string | number): Promise<Sentence | null> {
    const db = getDatabase();
    const row = await db.getFirstAsync<any>(
        'SELECT * FROM sentences WHERE sentenceId = ?',
        [sentenceId]
    );

    if (!row) return null;

    return parseSentenceRow(row);
}

export async function getSentencesByGrammar(grammarId: number, styleTag?: string): Promise<Sentence[]> {
    const db = getDatabase();

    // Query sentences that have this grammarId in their grammarIds array
    // Since grammarIds is stored as JSON, we need to check if it contains the grammarId
    let query = 'SELECT * FROM sentences';
    const params: any[] = [];

    if (styleTag) {
        query += ' WHERE styleTag = ?';
        params.push(styleTag);
    }

    query += ' ORDER BY level, sentenceId';

    const rows = await db.getAllAsync<any>(query, params);

    // Filter by grammarId in grammarIds array
    return rows
        .map(parseSentenceRow)
        .filter(s => s.grammarIds.includes(grammarId));
}

function parseSentenceRow(row: any): Sentence {
    return {
        sentenceId: row.sentenceId,
        text: row.text,
        styleTag: row.styleTag,
        lessonId: row.lessonId,
        level: row.level || 1,
        grammarIds: JSON.parse(row.grammarIdsJson || '[]'),
        keyPoints: JSON.parse(row.keyPointsJson || '[]'),
        blockingVocabIds: JSON.parse(row.blockingVocabIdsJson || '[]'),
        tokens: row.tokensJson ? JSON.parse(row.tokensJson) : undefined,
    };
}
