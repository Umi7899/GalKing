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
        if (result && result.grammar && result.grammar.total > 0) {
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

// ============ Enhanced Stats ============

export interface DailyActivity {
    date: string;
    completed: boolean;
    stars: number;
    durationMs: number;
}

export async function getActivityHeatmap(days: number = 84): Promise<DailyActivity[]> {
    const db = getDatabase();

    // Calculate cutoff date in JS to avoid SQLite date() timezone issues
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const sessions = await db.getAllAsync<DbSession>(
        `SELECT date, status, stars, startedAt, finishedAt
         FROM sessions
         WHERE date >= ?
         ORDER BY date ASC`,
        [cutoffStr]
    );

    const dateMap = new Map<string, DailyActivity>();

    for (const s of sessions) {
        const existing = dateMap.get(s.date);
        const duration = (s.finishedAt && s.startedAt) ? s.finishedAt - s.startedAt : 0;

        if (existing) {
            if (s.status === 'completed') existing.completed = true;
            existing.stars = Math.max(existing.stars, s.stars ?? 0);
            existing.durationMs += duration;
        } else {
            dateMap.set(s.date, {
                date: s.date,
                completed: s.status === 'completed',
                stars: s.stars ?? 0,
                durationMs: duration,
            });
        }
    }

    // Fill missing dates
    const result: DailyActivity[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        result.push(dateMap.get(dateStr) ?? { date: dateStr, completed: false, stars: 0, durationMs: 0 });
    }

    return result;
}

export interface AccuracyTrend {
    date: string;
    grammarAcc: number;
    vocabAcc: number;
    sentenceAcc: number;
}

export async function getAccuracyTrend(days: number = 14): Promise<AccuracyTrend[]> {
    const db = getDatabase();

    // Calculate cutoff date in JS to avoid SQLite date() timezone issues
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const sessions = await db.getAllAsync<DbSession>(
        `SELECT * FROM sessions
         WHERE status = 'completed' AND date >= ?
         ORDER BY date ASC`,
        [cutoffStr]
    );

    const dateMap = new Map<string, { gC: number; gT: number; vAcc: number; vN: number; sP: number; sT: number }>();

    for (const s of sessions) {
        const r = parseResult(s);
        if (!r) continue;

        const existing = dateMap.get(s.date) ?? { gC: 0, gT: 0, vAcc: 0, vN: 0, sP: 0, sT: 0 };
        existing.gC += (r.grammar?.correct ?? 0) + (r.transfer?.correct ?? 0);
        existing.gT += (r.grammar?.total ?? 0) + (r.transfer?.total ?? 0);
        existing.vAcc += r.vocab?.accuracy ?? 0;
        existing.vN += 1;
        existing.sP += r.sentence?.pass ?? 0;
        existing.sT += r.sentence?.total ?? 0;
        dateMap.set(s.date, existing);
    }

    const result: AccuracyTrend[] = [];
    const today = new Date();
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const data = dateMap.get(dateStr);
        if (data) {
            result.push({
                date: dateStr,
                grammarAcc: data.gT > 0 ? data.gC / data.gT : 0,
                vocabAcc: data.vN > 0 ? data.vAcc / data.vN : 0,
                sentenceAcc: data.sT > 0 ? data.sP / data.sT : 0,
            });
        }
    }

    return result;
}

export async function getTotalLearningTime(): Promise<number> {
    const db = getDatabase();

    // Primary: use finishedAt - startedAt from sessions table
    const row = await db.getFirstAsync<{ total: number }>(
        `SELECT COALESCE(SUM(finishedAt - startedAt), 0) as total
         FROM sessions WHERE status = 'completed' AND finishedAt IS NOT NULL AND startedAt IS NOT NULL`
    );
    const fromTable = row?.total ?? 0;

    if (fromTable > 0) return fromTable;

    // Fallback: sum elapsedMs from stepStateJson timing
    const sessions = await db.getAllAsync<{ stepStateJson: string }>(
        `SELECT stepStateJson FROM sessions WHERE status = 'completed' AND stepStateJson IS NOT NULL`
    );

    let total = 0;
    for (const s of sessions) {
        try {
            const state = JSON.parse(s.stepStateJson);
            if (state?.timing?.elapsedMs) {
                total += state.timing.elapsedMs;
            }
        } catch {}
    }

    return total;
}

// ============ Drill History ============

export async function getCompletedDrillIds(grammarId: number): Promise<Set<string>> {
    const db = getDatabase();
    const sessions = await db.getAllAsync<{ stepStateJson: string }>(
        `SELECT stepStateJson FROM sessions WHERE status = 'completed' AND plannedGrammarId = ?`,
        [grammarId]
    );

    const drillIds = new Set<string>();
    for (const s of sessions) {
        try {
            const state = JSON.parse(s.stepStateJson) as StepStateJson;
            for (const answer of [...state.plan.step1.answers, ...state.plan.step2.answers]) {
                drillIds.add(answer.questionId);
            }
        } catch {}
    }
    return drillIds;
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
