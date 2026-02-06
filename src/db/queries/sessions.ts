// src/db/queries/sessions.ts
// Session query functions for training sessions

import { getDatabase, type DbSession } from '../database';
import type { StepStateJson, ResultJson } from '../../schemas/session';

// ============ Session CRUD ============

export async function createSession(
    date: string,
    plannedLessonId: number,
    plannedGrammarId: number,
    plannedLevel: number,
    stepState: StepStateJson
): Promise<number> {
    const db = getDatabase();
    const now = Date.now();

    const result = await db.runAsync(
        `INSERT INTO sessions (date, plannedLessonId, plannedGrammarId, plannedLevel, stepStateJson, startedAt, status)
     VALUES (?, ?, ?, ?, ?, ?, 'in_progress')`,
        [date, plannedLessonId, plannedGrammarId, plannedLevel, JSON.stringify(stepState), now]
    );

    return result.lastInsertRowId;
}

export async function getSession(sessionId: number): Promise<DbSession | null> {
    const db = getDatabase();
    return db.getFirstAsync<DbSession>('SELECT * FROM sessions WHERE sessionId = ?', [sessionId]);
}

export async function getTodaySession(date: string): Promise<DbSession | null> {
    const db = getDatabase();
    return db.getFirstAsync<DbSession>(
        `SELECT * FROM sessions WHERE date = ? AND status = 'in_progress' ORDER BY sessionId DESC LIMIT 1`,
        [date]
    );
}

export async function getTodayCompletedSession(date: string): Promise<DbSession | null> {
    const db = getDatabase();
    return db.getFirstAsync<DbSession>(
        `SELECT * FROM sessions WHERE date = ? AND status = 'completed' ORDER BY sessionId DESC LIMIT 1`,
        [date]
    );
}

export async function updateSessionState(
    sessionId: number,
    stepState: StepStateJson
): Promise<void> {
    const db = getDatabase();
    await db.runAsync(
        'UPDATE sessions SET stepStateJson = ? WHERE sessionId = ?',
        [JSON.stringify(stepState), sessionId]
    );
}

export async function completeSession(
    sessionId: number,
    result: ResultJson
): Promise<void> {
    const db = getDatabase();
    const now = Date.now();

    await db.runAsync(
        `UPDATE sessions SET 
      resultJson = ?, 
      finishedAt = ?, 
      status = 'completed',
      stars = ?
     WHERE sessionId = ?`,
        [JSON.stringify(result), now, result.stars, sessionId]
    );
}

// Update coach summary for AI persistence
export async function updateSessionCoach(
    sessionId: number,
    coachSummary: string
): Promise<void> {
    const db = getDatabase();

    // First get current resultJson
    const session = await getSession(sessionId);
    if (!session || !session.resultJson) return;

    try {
        const result = JSON.parse(session.resultJson) as ResultJson;
        result.coach.source = 'llm';
        result.coach.summary = coachSummary;

        await db.runAsync(
            'UPDATE sessions SET resultJson = ? WHERE sessionId = ?',
            [JSON.stringify(result), sessionId]
        );
    } catch (e) {
        console.error('Failed to update coach summary in DB:', e);
    }
}

// ============ Session Queries ============

export async function getRecentSessions(limit: number): Promise<DbSession[]> {
    const db = getDatabase();
    return db.getAllAsync<DbSession>(
        'SELECT * FROM sessions ORDER BY startedAt DESC LIMIT ?',
        [limit]
    );
}

export async function getSessionsByDate(date: string): Promise<DbSession[]> {
    const db = getDatabase();
    return db.getAllAsync<DbSession>(
        'SELECT * FROM sessions WHERE date = ? ORDER BY startedAt DESC',
        [date]
    );
}

// ============ Stats ============

export async function getSessionStats(): Promise<{
    totalSessions: number;
    totalStars: number;
    avgAccuracy: number;
    streakDays: number;
}> {
    const db = getDatabase();

    const sessionCount = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM sessions WHERE status = 'completed'`
    );

    const starsSum = await db.getFirstAsync<{ sum: number }>(
        `SELECT COALESCE(SUM(stars), 0) as sum FROM sessions WHERE status = 'completed'`
    );

    // Calculate average accuracy from results
    const sessions = await db.getAllAsync<DbSession>(
        `SELECT resultJson FROM sessions WHERE status = 'completed' AND resultJson IS NOT NULL`
    );

    let totalAccuracy = 0;
    let accuracyCount = 0;

    for (const session of sessions) {
        const result = parseResult(session);
        if (result && result.grammar.total > 0) {
            totalAccuracy += result.grammar.correct / result.grammar.total;
            accuracyCount++;
        }
    }

    // Calculate streak (consecutive days with completed sessions)
    const dates = await db.getAllAsync<{ date: string }>(
        `SELECT DISTINCT date FROM sessions WHERE status = 'completed' ORDER BY date DESC LIMIT 30`
    );

    let streak = 0;
    const today = new Date();
    const dateStrs = dates.map(d => d.date);

    for (let i = 0; i < 30; i++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - i);
        const dateStr = checkDate.toISOString().split('T')[0];

        if (dateStrs.includes(dateStr)) {
            streak++;
        } else if (i > 0) {
            break;
        }
    }

    return {
        totalSessions: sessionCount?.count ?? 0,
        totalStars: starsSum?.sum ?? 0,
        avgAccuracy: accuracyCount > 0 ? totalAccuracy / accuracyCount : 0,
        streakDays: streak,
    };
}

// ============ Helpers ============

export function parseStepState(session: DbSession | null): StepStateJson {
    if (!session?.stepStateJson) {
        throw new Error('No step state found');
    }
    return JSON.parse(session.stepStateJson);
}

export function parseResult(session: DbSession | null): ResultJson | null {
    if (!session?.resultJson) {
        return null;
    }
    try {
        return JSON.parse(session.resultJson);
    } catch {
        return null;
    }
}

export { DbSession };
