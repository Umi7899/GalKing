// src/db/queries/admin.ts
// Administrative queries (reset, maintenance)

import { getDatabase } from '../database';

/**
 * Resets all user progress, learning history, and mastery data.
 * DOES NOT clear settings (API keys) or static content (lessons, grammar points).
 */
export async function resetAllProgress(): Promise<void> {
    const db = getDatabase();

    // 1. Clear Session History
    await db.runAsync('DELETE FROM sessions');

    // 2. Clear Grammar Mastery
    await db.runAsync('DELETE FROM user_grammar_state');

    // 3. Clear Vocab Mastery
    await db.runAsync('DELETE FROM user_vocab_state');

    // 4. Reset User Progress (Cursor)
    // We assume user_progress row with id=1 always exists (created on app start)
    await db.runAsync(`
        UPDATE user_progress 
        SET currentLessonId = 1, 
            currentGrammarIndex = 0, 
            currentLevel = 1, 
            streakDays = 0, 
            lastActiveDate = NULL
        WHERE id = 1
    `);

    console.log('[Admin] All progress reset successfully');
}
