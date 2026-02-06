// src/engine/scorer.ts
// Offline Scoring Engine (Section 6)

import type { AnswerRecord, SentenceSubmission, ResultJson } from '../schemas/session';
import type { KeyPoint } from '../schemas/content';

// ============ Grammar Mastery Calculation ============

export interface GrammarScoreUpdate {
    grammarId: number;
    masteryDelta: number;
    newWrongCount: number;
    correctStreak: number;
    nextReviewDays: number;
}

export function calculateGrammarUpdates(
    answers: AnswerRecord[],
    currentMastery: number,
    currentWrongCount: number,
    currentStreak: number
): GrammarScoreUpdate {
    let masteryDelta = 0;
    let wrongCount = currentWrongCount;
    let streak = currentStreak;

    for (const answer of answers) {
        if (answer.isCorrect) {
            masteryDelta += 3; // +3 for correct
            streak++;
        } else {
            masteryDelta -= 2; // -2 for wrong
            wrongCount++;
            streak = 0;
        }
    }

    // Clamp mastery to 0-100
    const newMastery = Math.max(0, Math.min(100, currentMastery + masteryDelta));

    // Calculate next review interval based on mastery
    let nextReviewDays: number;
    if (newMastery < 40) {
        nextReviewDays = 1;
    } else if (newMastery < 70) {
        nextReviewDays = 3;
    } else if (newMastery < 85) {
        nextReviewDays = 7;
    } else {
        nextReviewDays = 14;
    }

    // If any wrong answer, review sooner
    if (answers.some(a => !a.isCorrect)) {
        nextReviewDays = Math.min(nextReviewDays, 1);
    }

    return {
        grammarId: 0, // To be filled by caller
        masteryDelta,
        newWrongCount: wrongCount,
        correctStreak: streak,
        nextReviewDays,
    };
}

// ============ Vocab Strength Calculation ============

export interface VocabScoreUpdate {
    vocabId: number;
    strengthDelta: number;
    newWrongCount: number;
    nextReviewDays: number;
    shouldBlock: boolean;
}

export function calculateVocabUpdate(
    isCorrect: boolean,
    reactionTimeMs: number,
    currentStrength: number,
    currentWrongCount: number,
    fastThresholdMs: number = 3000
): VocabScoreUpdate {
    let strengthDelta = isCorrect ? 2 : -2;

    // Bonus for fast correct answer
    if (isCorrect && reactionTimeMs < fastThresholdMs) {
        strengthDelta += 1;
    }

    const newStrength = Math.max(0, Math.min(100, currentStrength + strengthDelta));
    const newWrongCount = isCorrect ? currentWrongCount : currentWrongCount + 1;

    // Calculate next review interval
    let nextReviewDays: number;
    if (newStrength < 30) {
        nextReviewDays = 1;
    } else if (newStrength < 60) {
        nextReviewDays = 2;
    } else if (newStrength < 80) {
        nextReviewDays = 5;
    } else {
        nextReviewDays = 10;
    }

    // Should block if wrong too many times
    const shouldBlock = newWrongCount >= 3;

    return {
        vocabId: 0, // To be filled by caller
        strengthDelta,
        newWrongCount,
        nextReviewDays,
        shouldBlock,
    };
}

// ============ Sentence KeyPoints Scoring ============

export interface SentenceScoreResult {
    hitRate: number;
    passed: boolean;
    grammarBonus: number; // +1 to mastery if passed
    reviewPenalty: boolean; // Bring forward review if failed
}

export function scoreSentenceSubmission(
    checkedIds: string[],
    keyPoints: KeyPoint[],
    minCoverageForPass: number = 3
): SentenceScoreResult {
    const expectedIds = new Set(keyPoints.map(kp => kp.id));
    const hitCount = checkedIds.filter(id => expectedIds.has(id)).length;
    const hitRate = keyPoints.length > 0 ? hitCount / keyPoints.length : 0;

    // Pass if coverage >= minCoverageForPass or hitRate >= 0.7
    const passed = hitCount >= minCoverageForPass || hitRate >= 0.7;

    return {
        hitRate,
        passed,
        grammarBonus: passed ? 1 : 0,
        reviewPenalty: !passed,
    };
}

// ============ Session Result Calculation ============

export interface SessionScoreInput {
    step1Answers: AnswerRecord[];
    step2Answers: AnswerRecord[];
    step3Correct: number;
    step3Total: number;
    step3AvgRtMs: number;
    step4Submissions: SentenceSubmission[];
    currentLevel: number;
    recentAccuracies: number[]; // Last 2 days
}

export function calculateSessionResult(input: SessionScoreInput): ResultJson {
    const {
        step1Answers,
        step2Answers,
        step3Correct,
        step3Total,
        step3AvgRtMs,
        step4Submissions,
        currentLevel,
        recentAccuracies,
    } = input;

    // Grammar stats
    const grammarCorrect = step1Answers.filter(a => a.isCorrect).length;
    const grammarTotal = step1Answers.length;
    const topMistake = step1Answers.find(a => !a.isCorrect);

    // Transfer stats
    const transferCorrect = step2Answers.filter(a => a.isCorrect).length;
    const transferTotal = step2Answers.length;

    // Vocab stats
    const vocabAccuracy = step3Total > 0 ? step3Correct / step3Total : 0;
    const newBlockingCount = 0; // Calculated separately

    // Sentence stats
    const sentencePass = step4Submissions.filter(s => s.passed).length;
    const sentenceTotal = step4Submissions.length;
    const avgKeyPointHitRate = sentenceTotal > 0
        ? step4Submissions.reduce((sum, s) => sum + (s.hitCount / s.totalCount), 0) / sentenceTotal
        : 0;

    // Calculate session accuracy for level adjustment
    const totalCorrect = grammarCorrect + transferCorrect + sentencePass;
    const totalQuestions = grammarTotal + transferTotal + sentenceTotal;
    const sessionAccuracy = totalQuestions > 0 ? totalCorrect / totalQuestions : 0;

    // Level change logic
    let levelChange: 'pause' | 'up' | 'down' = 'up';

    // Check if last 2 days had low accuracy
    if (recentAccuracies.length >= 2) {
        const recentLow = recentAccuracies.every(acc => acc < 0.6);
        if (recentLow && sessionAccuracy < 0.6) {
            levelChange = 'pause';
        }
    }

    // Calculate stars (0-5)
    const stars = calculateStars(sessionAccuracy, vocabAccuracy, avgKeyPointHitRate);

    // Generate offline coach summary
    const coachSummary = generateOfflineCoachSummary(
        stars,
        grammarCorrect,
        grammarTotal,
        vocabAccuracy,
        sentencePass,
        sentenceTotal
    );

    return {
        stars,
        grammar: {
            correct: grammarCorrect,
            total: grammarTotal,
            topMistakeGrammarId: topMistake ? extractGrammarId(topMistake.questionId) : null,
        },
        transfer: {
            correct: transferCorrect,
            total: transferTotal,
        },
        vocab: {
            accuracy: vocabAccuracy,
            avgRtMs: step3AvgRtMs,
            newBlockingCount,
        },
        sentence: {
            pass: sentencePass,
            total: sentenceTotal,
            keyPointHitRate: avgKeyPointHitRate,
        },
        levelChange,
        coach: {
            source: 'offline',
            summary: coachSummary,
        },
    };
}

function calculateStars(
    sessionAccuracy: number,
    vocabAccuracy: number,
    keyPointHitRate: number
): number {
    const avgScore = (sessionAccuracy + vocabAccuracy + keyPointHitRate) / 3;

    if (avgScore >= 0.95) return 5;
    if (avgScore >= 0.85) return 4;
    if (avgScore >= 0.70) return 3;
    if (avgScore >= 0.50) return 2;
    if (avgScore >= 0.30) return 1;
    return 0;
}

function extractGrammarId(questionId: string): number | null {
    const match = questionId.match(/g(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function generateOfflineCoachSummary(
    stars: number,
    grammarCorrect: number,
    grammarTotal: number,
    vocabAccuracy: number,
    sentencePass: number,
    sentenceTotal: number
): string {
    const parts: string[] = [];

    // Overall assessment
    if (stars >= 4) {
        parts.push('表现优秀！');
    } else if (stars >= 3) {
        parts.push('表现良好，继续加油！');
    } else if (stars >= 2) {
        parts.push('还需努力，明天继续复习今天的内容。');
    } else {
        parts.push('今天状态一般，建议回顾基础语法点。');
    }

    // Grammar feedback
    if (grammarTotal > 0) {
        const grammarRate = grammarCorrect / grammarTotal;
        if (grammarRate < 0.7) {
            parts.push('语法部分需要加强练习。');
        } else if (grammarRate === 1) {
            parts.push('语法全对，棒棒的！');
        }
    }

    // Vocab feedback
    if (vocabAccuracy < 0.7) {
        parts.push('词汇反应速度可以再快一些。');
    } else if (vocabAccuracy >= 0.9) {
        parts.push('词汇识别很流畅！');
    }

    // Sentence feedback
    if (sentenceTotal > 0 && sentencePass < sentenceTotal) {
        parts.push('句子理解还需加深，多关注关键语法点。');
    }

    return parts.join(' ');
}
