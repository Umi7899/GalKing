// src/engine/progressManager.ts
// Progress Management and Unlock Logic

import {
    getUserProgress,
    updateUserProgress,
    getGrammarState,
    upsertGrammarState,
    getVocabState,
    upsertVocabState,
    type DbUserVocabState
} from '../db/queries/progress';
import { getLesson, getGrammarPointsForLesson } from '../db/queries/content';
import { getRecentSessions, parseResult } from '../db/queries/sessions';
import type { ResultJson } from '../schemas/session';
import type { GrammarScoreUpdate, VocabScoreUpdate } from './scorer';

// ============ Apply Session Results ============

export async function applySessionResults(
    result: ResultJson,
    grammarUpdates: Map<number, GrammarScoreUpdate>,
    vocabUpdates: Map<number, VocabScoreUpdate>
): Promise<void> {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // 1. Update grammar states
    for (const [grammarId, update] of grammarUpdates) {
        const current = await getGrammarState(grammarId);
        const currentMastery = current?.mastery ?? 0;
        const newMastery = Math.max(0, Math.min(100, currentMastery + update.masteryDelta));

        const nextReviewAt = now + update.nextReviewDays * 24 * 60 * 60 * 1000;

        await upsertGrammarState({
            grammarId,
            mastery: newMastery,
            lastSeenAt: now,
            nextReviewAt,
            wrongCount7d: update.newWrongCount,
            correctStreak: update.correctStreak,
        });
    }

    // 2. Update vocab states
    for (const [vocabId, update] of vocabUpdates) {
        const current = await getVocabState(vocabId);
        const currentStrength = current?.strength ?? 0;
        const newStrength = Math.max(0, Math.min(100, currentStrength + update.strengthDelta));

        const nextReviewAt = now + update.nextReviewDays * 24 * 60 * 60 * 1000;

        await upsertVocabState({
            vocabId,
            strength: newStrength,
            lastSeenAt: now,
            nextReviewAt,
            isBlocking: update.shouldBlock ? 1 : (current?.isBlocking ?? 0),
            wrongCount7d: update.newWrongCount,
        });
    }

    // 3. Update user progress
    const progress = await getUserProgress();

    // Update level based on result
    let newLevel = progress.currentLevel;
    if (result.levelChange === 'up') {
        newLevel = Math.min(progress.currentLevel + 1, 10);
    } else if (result.levelChange === 'down') {
        newLevel = Math.max(progress.currentLevel - 1, 1);
    }
    // 'pause' keeps the same level

    // Update streak
    let newStreak = progress.streakDays;
    if (progress.lastActiveDate !== today) {
        // Check if yesterday was active
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (progress.lastActiveDate === yesterdayStr) {
            newStreak++;
        } else {
            newStreak = 1; // Reset streak
        }
    }

    await updateUserProgress({
        currentLevel: newLevel,
        streakDays: newStreak,
        lastActiveDate: today,
    });

    // 4. Check for lesson/grammar progression
    await checkAndAdvanceProgress();
}

// ============ Progression Logic ============

export async function checkAndAdvanceProgress(): Promise<{
    advanced: boolean;
    newLessonId?: number;
    newGrammarIndex?: number;
}> {
    const progress = await getUserProgress();
    const lesson = await getLesson(progress.currentLessonId);

    if (!lesson) {
        return { advanced: false };
    }

    const grammarPoints = await getGrammarPointsForLesson(lesson.lessonId);

    // Check current grammar mastery
    if (progress.currentGrammarIndex < lesson.grammarIds.length) {
        const currentGrammarId = lesson.grammarIds[progress.currentGrammarIndex];
        const grammarState = await getGrammarState(currentGrammarId);

        // Unlock next grammar if mastery >= 80 or 2 consecutive days with >= 85% accuracy
        if (grammarState && grammarState.mastery >= 80) {
            const nextIndex = progress.currentGrammarIndex + 1;

            if (nextIndex < lesson.grammarIds.length) {
                // Advance to next grammar in lesson
                await updateUserProgress({ currentGrammarIndex: nextIndex });
                return { advanced: true, newGrammarIndex: nextIndex };
            } else {
                // Check if lesson is complete
                const lessonComplete = await checkLessonComplete(lesson.lessonId);
                if (lessonComplete) {
                    // Advance to next lesson
                    const nextLessonId = lesson.lessonId + 1;
                    const nextLesson = await getLesson(nextLessonId);

                    if (nextLesson && nextLesson.grammarIds.length > 0) {
                        await updateUserProgress({
                            currentLessonId: nextLessonId,
                            currentGrammarIndex: 0,
                        });
                        return { advanced: true, newLessonId: nextLessonId, newGrammarIndex: 0 };
                    }
                }
            }
        }
    }

    return { advanced: false };
}

async function checkLessonComplete(lessonId: number): Promise<boolean> {
    const lesson = await getLesson(lessonId);
    if (!lesson) return false;

    // Check all grammar mastery >= 80
    for (const grammarId of lesson.grammarIds) {
        const state = await getGrammarState(grammarId);
        if (!state || state.mastery < 80) {
            return false;
        }
    }

    // Check vocab pack accuracy >= 85 (from recent sessions)
    const recentSessions = await getRecentSessions(7);
    const lessonSessions = recentSessions.filter(s => s.plannedLessonId === lessonId);

    if (lessonSessions.length === 0) return false;

    const avgVocabAccuracy = lessonSessions.reduce((sum, s) => {
        const result = parseResult(s);
        return sum + (result?.vocab.accuracy ?? 0);
    }, 0) / lessonSessions.length;

    if (avgVocabAccuracy < 0.85) return false;

    // Check sentence pass rate >= 70
    const avgSentencePassRate = lessonSessions.reduce((sum, s) => {
        const result = parseResult(s);
        if (!result || result.sentence.total === 0) return sum;
        return sum + (result.sentence.pass / result.sentence.total);
    }, 0) / lessonSessions.length;

    return avgSentencePassRate >= 0.70;
}

// ============ Manual Progression ============

export async function jumpToLesson(lessonId: number): Promise<boolean> {
    const lesson = await getLesson(lessonId);
    if (!lesson || lesson.grammarIds.length === 0) {
        return false;
    }

    // Find first grammar with mastery < 80
    let startIndex = 0;
    for (let i = 0; i < lesson.grammarIds.length; i++) {
        const state = await getGrammarState(lesson.grammarIds[i]);
        if (!state || state.mastery < 80) {
            startIndex = i;
            break;
        }
    }

    await updateUserProgress({
        currentLessonId: lessonId,
        currentGrammarIndex: startIndex,
    });

    return true;
}

// ============ Stats Helpers ============

export async function getLessonProgress(lessonId: number): Promise<{
    grammarCount: number;
    masteredCount: number;
    avgMastery: number;
}> {
    const lesson = await getLesson(lessonId);
    if (!lesson) {
        return { grammarCount: 0, masteredCount: 0, avgMastery: 0 };
    }

    let totalMastery = 0;
    let masteredCount = 0;

    for (const grammarId of lesson.grammarIds) {
        const state = await getGrammarState(grammarId);
        const mastery = state?.mastery ?? 0;
        totalMastery += mastery;
        if (mastery >= 80) masteredCount++;
    }

    return {
        grammarCount: lesson.grammarIds.length,
        masteredCount,
        avgMastery: lesson.grammarIds.length > 0 ? totalMastery / lesson.grammarIds.length : 0,
    };
}

export async function getRecentAccuracies(days: number = 2): Promise<number[]> {
    const sessions = await getRecentSessions(days * 2);
    const accuracies: number[] = [];

    const today = new Date();
    for (let i = 0; i < days; i++) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() - i);
        const dateStr = targetDate.toISOString().split('T')[0];

        const daySessions = sessions.filter(s => s.date === dateStr);
        if (daySessions.length > 0) {
            const dayAccuracy = daySessions.reduce((sum, s) => {
                const result = parseResult(s);
                if (!result) return sum;
                const total = result.grammar.total + result.transfer.total;
                const correct = result.grammar.correct + result.transfer.correct;
                return sum + (total > 0 ? correct / total : 0);
            }, 0) / daySessions.length;

            accuracies.push(dayAccuracy);
        }
    }

    return accuracies;
}
