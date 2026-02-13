// src/engine/achievementChecker.ts
// Achievement unlock detection and persistence

import { getDatabase } from '../db/database';
import { getUserProgress } from '../db/queries/progress';
import { ACHIEVEMENTS, type AchievementDef } from './achievements';
import { MASTERY_THRESHOLD } from './constants';

export interface UnlockResult {
  newlyUnlocked: AchievementDef[];
}

export async function checkAndUnlockAchievements(): Promise<UnlockResult> {
  const db = getDatabase();
  const progress = await getUserProgress();
  const newlyUnlocked: AchievementDef[] = [];
  const now = Date.now();

  // Get already-unlocked set
  const existing = await db.getAllAsync<{ achievementId: string }>(
    'SELECT achievementId FROM user_achievements'
  );
  const unlockedSet = new Set(existing.map(e => e.achievementId));

  // Gather stats
  const sessionCount = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sessions WHERE status = 'completed'"
  );
  const totalSessions = sessionCount?.count ?? 0;

  const has5Stars = await db.getFirstAsync<{ count: number }>(
    "SELECT COUNT(*) as count FROM sessions WHERE status = 'completed' AND stars = 5"
  );

  const masteredGrammar = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_grammar_state WHERE mastery >= ' + MASTERY_THRESHOLD
  );

  const seenVocab = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_vocab_state WHERE lastSeenAt IS NOT NULL'
  );

  // Check first lesson completion (all grammar in lesson 25 mastered)
  const firstLessonGrammar = await db.getFirstAsync<{ total: number; mastered: number }>(
    `SELECT COUNT(*) as total,
     SUM(CASE WHEN ugs.mastery >= ${MASTERY_THRESHOLD} THEN 1 ELSE 0 END) as mastered
     FROM grammar_points gp
     LEFT JOIN user_grammar_state ugs ON gp.grammarId = ugs.grammarId
     WHERE gp.lessonId = 25`
  );

  const streakForCheck = Math.max(progress.streakDays, progress.maxStreakDays ?? 0);

  for (const ach of ACHIEVEMENTS) {
    if (unlockedSet.has(ach.id)) continue;

    let shouldUnlock = false;

    switch (ach.id) {
      case 'streak_3':   shouldUnlock = streakForCheck >= 3; break;
      case 'streak_7':   shouldUnlock = streakForCheck >= 7; break;
      case 'streak_14':  shouldUnlock = streakForCheck >= 14; break;
      case 'streak_30':  shouldUnlock = streakForCheck >= 30; break;
      case 'streak_60':  shouldUnlock = streakForCheck >= 60; break;
      case 'streak_100': shouldUnlock = streakForCheck >= 100; break;

      case 'stars_first5':  shouldUnlock = (has5Stars?.count ?? 0) > 0; break;
      case 'sessions_10':   shouldUnlock = totalSessions >= 10; break;
      case 'sessions_50':   shouldUnlock = totalSessions >= 50; break;
      case 'sessions_100':  shouldUnlock = totalSessions >= 100; break;

      case 'grammar_first': shouldUnlock = (masteredGrammar?.count ?? 0) >= 1; break;
      case 'grammar_10':    shouldUnlock = (masteredGrammar?.count ?? 0) >= 10; break;
      case 'grammar_30':    shouldUnlock = (masteredGrammar?.count ?? 0) >= 30; break;
      case 'lesson_first':
        shouldUnlock = firstLessonGrammar != null
          && firstLessonGrammar.total > 0
          && firstLessonGrammar.mastered === firstLessonGrammar.total;
        break;

      case 'vocab_50':  shouldUnlock = (seenVocab?.count ?? 0) >= 50; break;
      case 'vocab_100': shouldUnlock = (seenVocab?.count ?? 0) >= 100; break;
      case 'vocab_200': shouldUnlock = (seenVocab?.count ?? 0) >= 200; break;

      case 'level_5':  shouldUnlock = progress.currentLevel >= 5; break;
      case 'level_10': shouldUnlock = progress.currentLevel >= 10; break;
      // first_review is tracked at call site
    }

    if (shouldUnlock) {
      await db.runAsync(
        'INSERT OR IGNORE INTO user_achievements (achievementId, category, unlockedAt) VALUES (?, ?, ?)',
        [ach.id, ach.category, now]
      );
      newlyUnlocked.push(ach);
    }
  }

  // Update maxStreakDays
  if (progress.streakDays > (progress.maxStreakDays ?? 0)) {
    await db.runAsync(
      'UPDATE user_progress SET maxStreakDays = ? WHERE id = 1',
      [progress.streakDays]
    );
  }

  return { newlyUnlocked };
}

export async function getUnlockedAchievements(): Promise<Array<{
  achievementId: string;
  category: string;
  unlockedAt: number;
}>> {
  const db = getDatabase();
  return db.getAllAsync(
    'SELECT * FROM user_achievements ORDER BY unlockedAt DESC'
  );
}

export async function getUnlockedCount(): Promise<number> {
  const db = getDatabase();
  const result = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) as count FROM user_achievements'
  );
  return result?.count ?? 0;
}

export async function unlockSpecialAchievement(id: string): Promise<AchievementDef | null> {
  const db = getDatabase();
  const existing = await db.getFirstAsync<{ achievementId: string }>(
    'SELECT achievementId FROM user_achievements WHERE achievementId = ?',
    [id]
  );
  if (existing) return null;

  const def = ACHIEVEMENTS.find(a => a.id === id);
  if (!def) return null;

  await db.runAsync(
    'INSERT OR IGNORE INTO user_achievements (achievementId, category, unlockedAt) VALUES (?, ?, ?)',
    [def.id, def.category, Date.now()]
  );
  return def;
}
