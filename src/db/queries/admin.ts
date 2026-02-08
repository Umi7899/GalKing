// src/db/queries/admin.ts
// Administrative queries (reset, maintenance, test data seeding)

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
        SET currentLessonId = 25,
            currentGrammarIndex = 0,
            currentLevel = 1,
            streakDays = 0,
            lastActiveDate = NULL
        WHERE id = 1
    `);

    console.log('[Admin] All progress reset successfully');
}

/**
 * 注入测试数据：模拟用户已学到第28课，拥有不同掌握度的语法/词汇数据，
 * 以及到期需要复习的项目和一条已完成的训练记录。
 * 用于测试 P1 新功能（SRS复习队列、听力选择、听写练习、AI出题）。
 */
export async function seedTestData(): Promise<{ summary: string }> {
    const db = getDatabase();

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date().toISOString().split('T')[0];

    // ========== 1. 设置用户进度：当前在第27课最后一个语法点 ==========
    // 数据集中只有25-27课的语法点存在，28课的语法点不存在
    await db.runAsync(`
        UPDATE user_progress
        SET currentLessonId = 27,
            currentGrammarIndex = 2,
            currentLevel = 2,
            streakDays = 5,
            lastActiveDate = ?
        WHERE id = 1
    `, [today]);

    // ========== 2. 写入语法掌握度（25-27课，共9个语法点） ==========
    // 课程25: grammarId 2501,2502,2503
    // 课程26: grammarId 2601,2602,2603
    // 课程27: grammarId 2701,2702,2703（当前课程）

    const grammarStates = [
        // Lesson 25 — 高掌握度，部分到期复习
        { id: 2501, mastery: 85, streak: 4, nextReview: now - 2 * DAY, wrongCount: 0 },  // 到期
        { id: 2502, mastery: 70, streak: 3, nextReview: now - 5 * DAY, wrongCount: 1 },  // 逾期
        { id: 2503, mastery: 90, streak: 5, nextReview: now + 3 * DAY, wrongCount: 0 },  // 未到期

        // Lesson 26 — 中等掌握度
        { id: 2601, mastery: 55, streak: 2, nextReview: now - 1 * DAY, wrongCount: 2 },  // 到期
        { id: 2602, mastery: 40, streak: 1, nextReview: now - 4 * DAY, wrongCount: 3 },  // 逾期（薄弱）
        { id: 2603, mastery: 65, streak: 2, nextReview: now + 1 * DAY, wrongCount: 1 },  // 未到期

        // Lesson 27 — 低掌握度（当前课程）
        { id: 2701, mastery: 30, streak: 0, nextReview: now - 1 * DAY, wrongCount: 4 },  // 到期（薄弱）
        { id: 2702, mastery: 20, streak: 0, nextReview: now - 3 * DAY, wrongCount: 5 },  // 逾期（很薄弱）
        { id: 2703, mastery: 50, streak: 1, nextReview: now, wrongCount: 2 },             // 刚到期
    ];

    for (const g of grammarStates) {
        await db.runAsync(
            `INSERT OR REPLACE INTO user_grammar_state
            (grammarId, mastery, lastSeenAt, nextReviewAt, wrongCount7d, correctStreak)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [g.id, g.mastery, now - DAY, g.nextReview, g.wrongCount, g.streak]
        );
    }

    // ========== 3. 写入词汇掌握度（25-27课的词汇） ==========
    // 每课约10个词汇: 25001-25010, 26001-26010, 27001-27010
    const vocabStates: Array<{ id: number; strength: number; nextReview: number; blocking: number; wrongCount: number }> = [];

    // Lesson 25 词汇 — 高强度
    for (let i = 25001; i <= 25010; i++) {
        const strength = 60 + Math.floor(Math.random() * 30); // 60-89
        const overdue = i <= 25004; // 前4个到期
        vocabStates.push({
            id: i,
            strength,
            nextReview: overdue ? now - Math.floor(Math.random() * 3) * DAY : now + 5 * DAY,
            blocking: 0,
            wrongCount: overdue ? 1 : 0,
        });
    }

    // Lesson 26 词汇 — 中等强度
    for (let i = 26001; i <= 26006; i++) {
        const strength = 30 + Math.floor(Math.random() * 30); // 30-59
        vocabStates.push({
            id: i,
            strength,
            nextReview: i <= 26003 ? now - 2 * DAY : now + 2 * DAY,
            blocking: i === 26002 ? 1 : 0, // 标一个为阻塞词
            wrongCount: i <= 26003 ? 2 : 0,
        });
    }

    // Lesson 27 词汇 — 低强度
    for (let i = 27001; i <= 27006; i++) {
        const strength = 10 + Math.floor(Math.random() * 20); // 10-29
        vocabStates.push({
            id: i,
            strength,
            nextReview: now - 1 * DAY, // 全部到期
            blocking: i === 27001 ? 1 : 0,
            wrongCount: 3,
        });
    }

    for (const v of vocabStates) {
        await db.runAsync(
            `INSERT OR REPLACE INTO user_vocab_state
            (vocabId, strength, lastSeenAt, nextReviewAt, isBlocking, wrongCount7d)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [v.id, v.strength, now - DAY, v.nextReview, v.blocking, v.wrongCount]
        );
    }

    // ========== 4. 创建已完成的训练会话 ==========
    const stepState = JSON.stringify({
        step1: {
            drills: ['d2501_1', 'd2501_2', 'd2502_1'],
            answers: [
                { drillId: 'd2501_1', selectedId: 'a', isCorrect: true, timeMs: 3500 },
                { drillId: 'd2501_2', selectedId: 'b', isCorrect: true, timeMs: 4200 },
                { drillId: 'd2502_1', selectedId: 'c', isCorrect: false, timeMs: 5100 },
            ],
        },
        step2: {
            drills: ['d2501_t1'],
            answers: [
                { drillId: 'd2501_t1', selectedId: 'a', isCorrect: true, timeMs: 6000 },
            ],
        },
        step3: { vocabCorrect: 4, vocabTotal: 6 },
        step4: { sentenceCorrect: 2, sentenceTotal: 3 },
        step5: { completed: true },
    });

    const resultJson = JSON.stringify({
        stars: 2,
        grammar: { correct: 2, total: 3, topMistakeGrammarId: null },
        transfer: { correct: 1, total: 2 },
        vocab: { accuracy: 0.67, avgRtMs: 3200, newBlockingCount: 0 },
        sentence: { pass: 2, total: 3, keyPointHitRate: 0.75 },
        levelChange: 'pause',
        coach: { source: 'offline', summary: '语法掌握不错，注意反例辨识。' },
    });

    // 之前的会话（昨天的）
    await db.runAsync(
        `INSERT OR REPLACE INTO sessions
        (date, plannedLessonId, plannedGrammarId, plannedLevel, stepStateJson, resultJson, startedAt, finishedAt, status, stars)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', 2)`,
        [
            new Date(now - DAY).toISOString().split('T')[0],
            27, 2701, 2,
            stepState, resultJson,
            now - DAY - 120000, now - DAY,
        ]
    );

    // ========== 5. 为句子补充 keyPoints 中文翻译（听力选择需要） ==========
    // 数据集中大部分句子缺少 keyPoints，导致听力选择无法使用
    const sentenceTranslations: Array<{ id: number; zhLabel: string }> = [
        { id: 2501, zhLabel: '这是明天会议要用的资料' },
        { id: 2502, zhLabel: '那是森先生拍的照片' },
        { id: 2601, zhLabel: '骑自行车带人很危险' },
        { id: 2602, zhLabel: '我喜欢画画' },
        { id: 2701, zhLabel: '去日本的时候，坐的船' },
        { id: 2702, zhLabel: '一边喝茶一边聊天' },
    ];

    for (const st of sentenceTranslations) {
        const keyPointsJson = JSON.stringify([
            { id: `kp_${st.id}_zh`, labelZh: st.zhLabel, hint: '' }
        ]);
        await db.runAsync(
            `UPDATE sentences SET keyPointsJson = ? WHERE sentenceId = ?`,
            [keyPointsJson, st.id]
        );
    }

    // 统计注入数据
    const grammarDueCount = grammarStates.filter(g => g.nextReview <= now).length;
    const vocabDueCount = vocabStates.filter(v => v.nextReview <= now).length;

    const summary = [
        `用户进度: 第27课, Lv.2, 连续5天`,
        `语法状态: ${grammarStates.length} 个 (${grammarDueCount} 个待复习)`,
        `词汇状态: ${vocabStates.length} 个 (${vocabDueCount} 个待复习)`,
        `句子翻译: ${sentenceTranslations.length} 个已补充`,
        `训练记录: 1 条已完成会话`,
    ].join('\n');

    console.log('[Admin] Test data seeded:\n' + summary);
    return { summary };
}
