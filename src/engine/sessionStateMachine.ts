// src/engine/sessionStateMachine.ts
// Session State Machine for Training Flow

import {
    createSession,
    getSession,
    getTodaySession,
    updateSessionState,
    completeSession,
    parseStepState,
} from '../db/queries/sessions';
import { generateDailyPlan, getDrillById } from './planGenerator';
import {
    calculateGrammarUpdates,
    calculateVocabUpdate,
    scoreSentenceSubmission,
    calculateSessionResult,
    type GrammarScoreUpdate,
    type VocabScoreUpdate,
} from './scorer';
import { applySessionResults, getRecentAccuracies } from './progressManager';
import { getGrammarState, getVocabState } from '../db/queries/progress';
import { getSentence } from '../db/queries/content';
import type { StepStateJson, AnswerRecord, SentenceSubmission, ResultJson } from '../schemas/session';

// ============ Session Manager ============

export interface SessionManager {
    sessionId: number;
    state: StepStateJson;

    // Getters
    getCurrentStep(): number;
    getStepProgress(): { current: number; total: number };
    getPlan(): StepStateJson['plan'];

    // Actions
    answerQuestion(selectedId: string, timeMs: number): Promise<AnswerResult>;
    submitSentence(checkedKeyPointIds: string[]): Promise<SentenceResult>;
    updateVocabStats(correct: number, wrong: number, avgRtMs: number): Promise<void>;
    nextStep(): Promise<boolean>;
    finishSession(): Promise<ResultJson>;

    // Persistence
    save(): Promise<void>;
}

export interface AnswerResult {
    isCorrect: boolean;
    correctId: string;
    explanation: string;
    canContinue: boolean;
}

export interface SentenceResult {
    hitRate: number;
    passed: boolean;
    canContinue: boolean;
}

// ============ Session Factory ============

export async function getOrCreateSession(): Promise<SessionManager> {
    const today = new Date().toISOString().split('T')[0];

    // Check for existing incomplete session
    const existingSession = await getTodaySession(today);

    if (existingSession) {
        console.log('[Session] Resuming session:', existingSession.sessionId);
        const state = parseStepState(existingSession);
        return createSessionManager(existingSession.sessionId, state);
    }

    // Create new session
    console.log('[Session] Creating new session');
    const plan = await generateDailyPlan();
    const sessionId = await createSession(
        today,
        plan.plan.lessonId,
        plan.plan.grammarId,
        plan.plan.level,
        plan
    );

    return createSessionManager(sessionId, plan);
}

function createSessionManager(sessionId: number, initialState: StepStateJson): SessionManager {
    let state = { ...initialState };

    const manager: SessionManager = {
        sessionId,
        state,

        getCurrentStep() {
            return state.currentStep;
        },

        getStepProgress() {
            switch (state.currentStep) {
                case 1:
                    return { current: state.plan.step1.currentIndex, total: state.plan.step1.questionIds.length };
                case 2:
                    return { current: state.plan.step2.currentIndex, total: state.plan.step2.questionIds.length };
                case 3:
                    return { current: state.plan.step3.currentIndex, total: state.plan.step3.items.length };
                case 4:
                    return { current: state.plan.step4.currentIndex, total: state.plan.step4.sentenceIds.length };
                default:
                    return { current: 0, total: 0 };
            }
        },

        getPlan() {
            return state.plan;
        },

        async answerQuestion(selectedId: string, timeMs: number): Promise<AnswerResult> {
            const step = state.currentStep;

            if (step === 1) {
                return await handleStep1Answer(state, selectedId, timeMs);
            } else if (step === 2) {
                return await handleStep2Answer(state, selectedId, timeMs);
            } else if (step === 3) {
                return await handleStep3Answer(state, selectedId, timeMs);
            }

            throw new Error(`Cannot answer question in step ${step}`);
        },

        async submitSentence(checkedKeyPointIds: string[]): Promise<SentenceResult> {
            if (state.currentStep !== 4) {
                throw new Error('Not in sentence step');
            }

            return await handleStep4Submit(state, checkedKeyPointIds);
        },

        async updateVocabStats(correct: number, wrong: number, avgRtMs: number): Promise<void> {
            if (state.currentStep !== 3) return;
            state.plan.step3.correct = correct;
            state.plan.step3.wrong = wrong;
            state.plan.step3.avgRtMs = avgRtMs;
            await manager.save();
        },

        async nextStep(): Promise<boolean> {
            if (state.currentStep >= 5) {
                return false;
            }

            state.currentStep++;
            await manager.save();
            return true;
        },

        async finishSession(): Promise<ResultJson> {
            // Calculate result
            const recentAccuracies = await getRecentAccuracies(2);

            const result = calculateSessionResult({
                step1Answers: state.plan.step1.answers,
                step2Answers: state.plan.step2.answers,
                step3Correct: state.plan.step3.correct,
                step3Total: state.plan.step3.items.length,
                step3AvgRtMs: state.plan.step3.avgRtMs,
                step4Submissions: state.plan.step4.submissions,
                currentLevel: state.plan.level,
                recentAccuracies,
            });

            // Prepare grammar updates
            const grammarUpdates = new Map<number, GrammarScoreUpdate>();
            const allGrammarAnswers = [...state.plan.step1.answers, ...state.plan.step2.answers];

            // Group by grammar ID
            const grammarAnswerMap = new Map<number, AnswerRecord[]>();
            for (const answer of allGrammarAnswers) {
                const grammarId = extractGrammarId(answer.questionId);
                if (grammarId) {
                    if (!grammarAnswerMap.has(grammarId)) {
                        grammarAnswerMap.set(grammarId, []);
                    }
                    grammarAnswerMap.get(grammarId)!.push(answer);
                }
            }

            for (const [grammarId, answers] of grammarAnswerMap) {
                const currentState = await getGrammarState(grammarId);
                const update = calculateGrammarUpdates(
                    answers,
                    currentState?.mastery ?? 0,
                    currentState?.wrongCount7d ?? 0,
                    currentState?.correctStreak ?? 0
                );
                update.grammarId = grammarId;
                grammarUpdates.set(grammarId, update);
            }

            // Prepare vocab updates
            const vocabUpdates = new Map<number, VocabScoreUpdate>();
            if (state.plan.step3.answers) {
                for (const answer of state.plan.step3.answers) {
                    const vocabId = extractVocabId(answer.questionId);
                    if (vocabId) {
                        const currentState = await getVocabState(vocabId);
                        const update = calculateVocabUpdate(
                            answer.isCorrect,
                            answer.timeMs,
                            currentState?.strength ?? 0,
                            currentState?.wrongCount7d ?? 0
                        );
                        update.vocabId = vocabId;
                        vocabUpdates.set(vocabId, update);
                    }
                }
            }

            // Apply all updates
            await applySessionResults(result, grammarUpdates, vocabUpdates);

            // Mark session complete
            await completeSession(sessionId, result);

            return result;
        },

        async save(): Promise<void> {
            // Update elapsed time
            state.timing.elapsedMs = Date.now() - state.timing.startedAt;
            await updateSessionState(sessionId, state);
        },
    };

    return manager;
}

// ============ Step Handlers ============

async function handleStep1Answer(
    state: StepStateJson,
    selectedId: string,
    timeMs: number
): Promise<AnswerResult> {
    const step1 = state.plan.step1;
    const questionId = step1.questionIds[step1.currentIndex];

    const drill = await getDrillById(questionId);
    if (!drill) {
        throw new Error(`Drill not found: ${questionId}`);
    }

    const isCorrect = selectedId === drill.correctId;

    const answer: AnswerRecord = {
        questionId,
        selectedId,
        correctId: drill.correctId!,
        isCorrect,
        timeMs,
    };

    step1.answers.push(answer);
    step1.currentIndex++;

    const canContinue = step1.currentIndex < step1.questionIds.length;

    return {
        isCorrect,
        correctId: drill.correctId!,
        explanation: drill.explanation,
        canContinue,
    };
}

async function handleStep2Answer(
    state: StepStateJson,
    selectedId: string,
    timeMs: number
): Promise<AnswerResult> {
    const step2 = state.plan.step2;
    const questionId = step2.questionIds[step2.currentIndex];

    const drill = await getDrillById(questionId);
    if (!drill) {
        throw new Error(`Drill not found: ${questionId}`);
    }

    const isCorrect = selectedId === drill.correctId;

    const answer: AnswerRecord = {
        questionId,
        selectedId,
        correctId: drill.correctId!,
        isCorrect,
        timeMs,
    };

    step2.answers.push(answer);
    step2.currentIndex++;

    const canContinue = step2.currentIndex < step2.questionIds.length;

    return {
        isCorrect,
        correctId: drill.correctId!,
        explanation: drill.explanation,
        canContinue,
    };
}

async function handleStep3Answer(
    state: StepStateJson,
    selectedId: string,
    timeMs: number
): Promise<AnswerResult> {
    const step3 = state.plan.step3;
    const vocabId = step3.items[step3.currentIndex];

    // For vocab, correctId is the vocab meaning
    // selectedId should be compared against expected meaning
    // This is simplified - in real app, we'd have the options generated
    const isCorrect = selectedId === 'correct'; // Placeholder

    if (isCorrect) {
        step3.correct++;
    } else {
        step3.wrong++;
    }

    // Update average reaction time
    const totalAnswered = step3.correct + step3.wrong;
    step3.avgRtMs = ((step3.avgRtMs * (totalAnswered - 1)) + timeMs) / totalAnswered;

    // Track answer
    if (!step3.answers) step3.answers = [];
    step3.answers.push({
        questionId: `vocab_${vocabId}`,
        selectedId,
        correctId: 'correct',
        isCorrect,
        timeMs,
    });

    step3.currentIndex++;

    const canContinue = step3.currentIndex < step3.items.length;

    return {
        isCorrect,
        correctId: 'correct',
        explanation: isCorrect ? '正确！' : '再想想...',
        canContinue,
    };
}

async function handleStep4Submit(
    state: StepStateJson,
    checkedKeyPointIds: string[]
): Promise<SentenceResult> {
    const step4 = state.plan.step4;
    const sentenceId = step4.sentenceIds[step4.currentIndex];

    const sentence = await getSentence(sentenceId);
    if (!sentence) {
        throw new Error(`Sentence not found: ${sentenceId}`);
    }

    const scoreResult = scoreSentenceSubmission(checkedKeyPointIds, sentence.keyPoints);

    const submission: SentenceSubmission = {
        sentenceId,
        checkedKeyPointIds,
        hitCount: checkedKeyPointIds.filter(id =>
            sentence.keyPoints.some(kp => kp.id === id)
        ).length,
        totalCount: sentence.keyPoints.length,
        passed: scoreResult.passed,
    };

    step4.submissions.push(submission);
    step4.currentIndex++;

    const canContinue = step4.currentIndex < step4.sentenceIds.length;

    return {
        hitRate: scoreResult.hitRate,
        passed: scoreResult.passed,
        canContinue,
    };
}

// ============ Helpers ============

function extractGrammarId(questionId: string): number | null {
    const match = questionId.match(/g(\d+)/);
    return match ? parseInt(match[1]) : null;
}

function extractVocabId(questionId: string): number | null {
    const match = questionId.match(/vocab_(\d+)/);
    return match ? parseInt(match[1]) : null;
}
