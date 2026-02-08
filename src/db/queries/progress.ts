// src/db/queries/progress.ts
// User progress and state query functions

import { getDatabase, DbUserProgress, DbUserGrammarState } from '../database';

// ============ User Progress ============

export async function getUserProgress(): Promise<DbUserProgress> {
    const db = await getDatabase();
    const row = await db.getFirstAsync<DbUserProgress>(
        'SELECT * FROM user_progress WHERE id = 1'
    );

    if (!row) {
        // Initialize if not exists
        await db.runAsync(
            `INSERT INTO user_progress (id, currentLessonId, currentGrammarIndex, currentLevel, streakDays)
       VALUES (1, 25, 0, 1, 0)`
        );
        return {
            id: 1,
            currentLessonId: 25,
            currentGrammarIndex: 0,
            currentLevel: 1,
            streakDays: 0,
            lastActiveDate: null,
        };
    }

    return row;
}

export async function updateUserProgress(updates: Partial<Omit<DbUserProgress, 'id'>>): Promise<void> {
    const db = await getDatabase();

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.currentLessonId !== undefined) {
        fields.push('currentLessonId = ?');
        values.push(updates.currentLessonId);
    }
    if (updates.currentGrammarIndex !== undefined) {
        fields.push('currentGrammarIndex = ?');
        values.push(updates.currentGrammarIndex);
    }
    if (updates.currentLevel !== undefined) {
        fields.push('currentLevel = ?');
        values.push(updates.currentLevel);
    }
    if (updates.streakDays !== undefined) {
        fields.push('streakDays = ?');
        values.push(updates.streakDays);
    }
    if (updates.lastActiveDate !== undefined) {
        fields.push('lastActiveDate = ?');
        values.push(updates.lastActiveDate);
    }

    if (fields.length === 0) return;

    await db.runAsync(
        `UPDATE user_progress SET ${fields.join(', ')} WHERE id = 1`,
        values
    );
}

// Unlock next lesson (increment lessonId)
export async function unlockNextLesson(): Promise<{ unlocked: boolean; newLessonId: number }> {
    const progress = await getUserProgress();
    const newLessonId = progress.currentLessonId + 1;

    await updateUserProgress({
        currentLessonId: newLessonId,
        currentGrammarIndex: 0 // Reset grammar index for new lesson
    });

    console.log(`[Unlock] New lesson unlocked: Lesson ${newLessonId}`);
    return { unlocked: true, newLessonId };
}

// ============ Grammar State ============

export async function getGrammarState(grammarId: number): Promise<DbUserGrammarState | null> {
    const db = await getDatabase();
    return db.getFirstAsync<DbUserGrammarState>(
        'SELECT * FROM user_grammar_state WHERE grammarId = ?',
        [grammarId]
    );
}

export async function getGrammarStates(grammarIds: number[]): Promise<DbUserGrammarState[]> {
    if (grammarIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = grammarIds.map(() => '?').join(',');
    return db.getAllAsync<DbUserGrammarState>(
        `SELECT * FROM user_grammar_state WHERE grammarId IN (${placeholders})`,
        grammarIds
    );
}

export async function upsertGrammarState(state: DbUserGrammarState): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO user_grammar_state 
     (grammarId, mastery, lastSeenAt, nextReviewAt, wrongCount7d, correctStreak)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [
            state.grammarId,
            state.mastery,
            state.lastSeenAt,
            state.nextReviewAt,
            state.wrongCount7d,
            state.correctStreak,
        ]
    );
}

export async function getGrammarStatesForReview(today: number, limit: number = 5): Promise<DbUserGrammarState[]> {
    const db = await getDatabase();
    return db.getAllAsync<DbUserGrammarState>(
        `SELECT * FROM user_grammar_state 
     WHERE nextReviewAt IS NOT NULL AND nextReviewAt <= ?
     ORDER BY wrongCount7d DESC, nextReviewAt ASC
     LIMIT ?`,
        [today, limit]
    );
}

// ============ Vocab State ============

export interface DbUserVocabState {
    vocabId: number;
    strength: number;
    lastSeenAt: number | null;
    nextReviewAt: number | null;
    isBlocking: number;
    wrongCount7d: number;
}

export async function getVocabState(vocabId: number): Promise<DbUserVocabState | null> {
    const db = await getDatabase();
    return db.getFirstAsync<DbUserVocabState>(
        'SELECT * FROM user_vocab_state WHERE vocabId = ?',
        [vocabId]
    );
}

export async function getVocabStates(vocabIds: number[]): Promise<DbUserVocabState[]> {
    if (vocabIds.length === 0) return [];

    const db = await getDatabase();
    const placeholders = vocabIds.map(() => '?').join(',');
    return db.getAllAsync<DbUserVocabState>(
        `SELECT * FROM user_vocab_state WHERE vocabId IN (${placeholders})`,
        vocabIds
    );
}

export async function upsertVocabState(state: DbUserVocabState): Promise<void> {
    const db = await getDatabase();
    await db.runAsync(
        `INSERT OR REPLACE INTO user_vocab_state 
     (vocabId, strength, lastSeenAt, nextReviewAt, isBlocking, wrongCount7d)
     VALUES (?, ?, ?, ?, ?, ?)`,
        [
            state.vocabId,
            state.strength,
            state.lastSeenAt,
            state.nextReviewAt,
            state.isBlocking,
            state.wrongCount7d,
        ]
    );
}

export async function getVocabForReview(today: number, limit: number = 10): Promise<DbUserVocabState[]> {
    const db = await getDatabase();
    return db.getAllAsync<DbUserVocabState>(
        `SELECT * FROM user_vocab_state 
     WHERE nextReviewAt IS NOT NULL AND nextReviewAt <= ?
     ORDER BY wrongCount7d DESC, nextReviewAt ASC
     LIMIT ?`,
        [today, limit]
    );
}

export async function getBlockingVocab(): Promise<DbUserVocabState[]> {
    const db = await getDatabase();
    return db.getAllAsync<DbUserVocabState>(
        'SELECT * FROM user_vocab_state WHERE isBlocking = 1'
    );
}
