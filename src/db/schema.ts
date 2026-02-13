// src/db/schema.ts
// SQLite Schema Definitions for GalKing

// ============ Content Tables ============

export const CREATE_META_TABLE = `
  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`;

export const CREATE_LESSONS_TABLE = `
  CREATE TABLE IF NOT EXISTS lessons (
    lessonId INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    goal TEXT NOT NULL,
    orderIndex INTEGER NOT NULL,
    grammarIdsJson TEXT NOT NULL,
    vocabPackIdsJson TEXT NOT NULL,
    tagsJson TEXT NOT NULL
  );
`;

export const CREATE_GRAMMAR_POINTS_TABLE = `
  CREATE TABLE IF NOT EXISTS grammar_points (
    grammarId INTEGER PRIMARY KEY,
    lessonId INTEGER NOT NULL,
    name TEXT NOT NULL,
    coreRule TEXT NOT NULL,
    structure TEXT NOT NULL,
    mnemonic TEXT NOT NULL,
    examplesJson TEXT NOT NULL,
    counterExamplesJson TEXT NOT NULL,
    drillsJson TEXT NOT NULL,
    level INTEGER NOT NULL,
    tagsJson TEXT NOT NULL
  );
`;

export const CREATE_VOCAB_TABLE = `
  CREATE TABLE IF NOT EXISTS vocab (
    vocabId INTEGER PRIMARY KEY,
    surface TEXT NOT NULL,
    reading TEXT NOT NULL,
    meaningsJson TEXT NOT NULL,
    level INTEGER NOT NULL,
    tagsJson TEXT NOT NULL
  );
`;

export const CREATE_VOCAB_PACKS_TABLE = `
  CREATE TABLE IF NOT EXISTS vocab_packs (
    packId INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    lessonId INTEGER,
    vocabIdsJson TEXT NOT NULL,
    level INTEGER NOT NULL
  );
`;

export const CREATE_SENTENCES_TABLE = `
  CREATE TABLE IF NOT EXISTS sentences (
    sentenceId INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    styleTag TEXT NOT NULL,
    lessonId INTEGER,
    level INTEGER NOT NULL,
    grammarIdsJson TEXT NOT NULL,
    keyPointsJson TEXT NOT NULL,
    blockingVocabIdsJson TEXT NOT NULL,
    tokensJson TEXT
  );
`;

// ============ User State Tables ============

export const CREATE_USER_PROGRESS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY CHECK(id=1),
    currentLessonId INTEGER NOT NULL DEFAULT 25,
    currentGrammarIndex INTEGER NOT NULL DEFAULT 0,
    currentLevel INTEGER NOT NULL DEFAULT 1,
    streakDays INTEGER NOT NULL DEFAULT 0,
    lastActiveDate TEXT
  );
`;

export const CREATE_USER_GRAMMAR_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_grammar_state (
    grammarId INTEGER PRIMARY KEY,
    mastery INTEGER NOT NULL DEFAULT 0,
    lastSeenAt INTEGER,
    nextReviewAt INTEGER,
    wrongCount7d INTEGER NOT NULL DEFAULT 0,
    correctStreak INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_USER_VOCAB_STATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_vocab_state (
    vocabId INTEGER PRIMARY KEY,
    strength INTEGER NOT NULL DEFAULT 0,
    lastSeenAt INTEGER,
    nextReviewAt INTEGER,
    isBlocking INTEGER NOT NULL DEFAULT 0,
    wrongCount7d INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_SESSIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS sessions (
    sessionId INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    plannedLessonId INTEGER NOT NULL,
    plannedGrammarId INTEGER NOT NULL,
    plannedLevel INTEGER NOT NULL,
    stepStateJson TEXT NOT NULL,
    resultJson TEXT,
    startedAt INTEGER NOT NULL,
    finishedAt INTEGER,
    status TEXT NOT NULL DEFAULT 'in_progress',
    stars INTEGER
  );
`;

export const CREATE_LLM_CACHE_TABLE = `
  CREATE TABLE IF NOT EXISTS llm_cache (
    cacheKey TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    datasetId TEXT NOT NULL,
    modelHint TEXT,
    payloadHash TEXT NOT NULL,
    responseJson TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    expireAt INTEGER NOT NULL,
    hitCount INTEGER NOT NULL DEFAULT 0
  );
`;

export const CREATE_USER_NOTES_TABLE = `
  CREATE TABLE IF NOT EXISTS user_notes (
    noteId INTEGER PRIMARY KEY,
    createdAt INTEGER NOT NULL,
    grammarId INTEGER,
    sentenceId INTEGER,
    content TEXT NOT NULL
  );
`;

export const CREATE_USER_ACHIEVEMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS user_achievements (
    achievementId TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    unlockedAt INTEGER NOT NULL
  );
`;

// All table creation statements in order
export const ALL_CREATE_STATEMENTS = [
  CREATE_META_TABLE,
  CREATE_LESSONS_TABLE,
  CREATE_GRAMMAR_POINTS_TABLE,
  CREATE_VOCAB_TABLE,
  CREATE_VOCAB_PACKS_TABLE,
  CREATE_SENTENCES_TABLE,
  CREATE_USER_PROGRESS_TABLE,
  CREATE_USER_GRAMMAR_STATE_TABLE,
  CREATE_USER_VOCAB_STATE_TABLE,
  CREATE_SESSIONS_TABLE,
  CREATE_LLM_CACHE_TABLE,
  CREATE_USER_NOTES_TABLE,
  CREATE_USER_ACHIEVEMENTS_TABLE,
];
