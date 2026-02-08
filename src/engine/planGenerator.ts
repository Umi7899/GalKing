// src/engine/planGenerator.ts
// Daily Session Plan Generator (Section 5 Algorithm)

import { getLesson, getGrammarPoint, getVocabPack, getSentencesByGrammar, getSentencesByLesson } from '../db/queries/content';
import { getUserProgress, getGrammarState, getGrammarStatesForReview, getVocabForReview } from '../db/queries/progress';
import type { StepStateJson, Step1State, Step2State, Step3State, Step4State } from '../schemas/session';
import type { GrammarPoint, Drill } from '../schemas/content';

// ============ Main Plan Generator ============

export async function generateDailyPlan(): Promise<StepStateJson> {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // 1. Get current progress
    const progress = await getUserProgress();

    // 2. Determine today's grammar point
    const { grammarId, lessonId, grammarIndex } = await findCurrentGrammar(
        progress.currentLessonId,
        progress.currentGrammarIndex
    );

    // 3. Generate each step
    const step1 = await generateStep1(grammarId, progress.currentLevel);
    const step2 = await generateStep2(grammarId);
    const step3 = await generateStep3(lessonId, progress.currentLevel);
    const step4 = await generateStep4(grammarId, progress.currentLevel);

    return {
        currentStep: 1,
        plan: {
            date: today,
            lessonId,
            grammarId,
            level: progress.currentLevel,
            step1,
            step2,
            step3,
            step4,
        },
        timing: {
            startedAt: now,
            elapsedMs: 0,
        },
    };
}

// ============ Grammar Selection ============

async function findCurrentGrammar(
    currentLessonId: number,
    currentGrammarIndex: number
): Promise<{ grammarId: number; lessonId: number; grammarIndex: number }> {
    const lesson = await getLesson(currentLessonId);

    if (!lesson || lesson.grammarIds.length === 0) {
        // Fallback to first lesson
        const firstLesson = await getLesson(25);
        if (!firstLesson || firstLesson.grammarIds.length === 0) {
            throw new Error('No grammar points available');
        }
        return {
            grammarId: firstLesson.grammarIds[0],
            lessonId: 25,
            grammarIndex: 0,
        };
    }

    // Find first grammar with mastery < 80
    for (let i = currentGrammarIndex; i < lesson.grammarIds.length; i++) {
        const grammarId = lesson.grammarIds[i];
        const state = await getGrammarState(grammarId);

        if (!state || state.mastery < 80) {
            return { grammarId, lessonId: currentLessonId, grammarIndex: i };
        }
    }

    // All grammar in lesson complete, return first one for review
    return {
        grammarId: lesson.grammarIds[0],
        lessonId: currentLessonId,
        grammarIndex: 0,
    };
}

// ============ Step 1: Grammar Speed Drill ============

async function generateStep1(grammarId: number, level: number): Promise<Step1State> {
    const grammar = await getGrammarPoint(grammarId);
    if (!grammar) throw new Error(`Grammar ${grammarId} not found`);

    const questionIds: string[] = [];

    // 2 questions from current grammar drills
    const baseDrills = grammar.drills.slice(0, 2);
    baseDrills.forEach(drill => questionIds.push(drill.drillId));

    // 1 review question
    const reviewQuestion = await getReviewQuestion(grammarId);
    if (reviewQuestion) {
        questionIds.push(reviewQuestion);
    } else if (grammar.drills.length > 2) {
        // Use 3rd drill if no review available
        questionIds.push(grammar.drills[2].drillId);
    }

    return {
        questionIds,
        currentIndex: 0,
        answers: [],
    };
}

async function getReviewQuestion(excludeGrammarId: number): Promise<string | null> {
    const today = Date.now();

    // Try to get grammar review
    const grammarReviews = await getGrammarStatesForReview(today, 3);
    const eligibleGrammar = grammarReviews.find(g => g.grammarId !== excludeGrammarId);

    if (eligibleGrammar) {
        const grammar = await getGrammarPoint(eligibleGrammar.grammarId);
        if (grammar && grammar.drills.length > 0) {
            // Pick random drill from review grammar
            const drill = grammar.drills[Math.floor(Math.random() * grammar.drills.length)];
            return `rev_g${eligibleGrammar.grammarId}_${drill.drillId}`;
        }
    }

    // Try vocab review
    const vocabReviews = await getVocabForReview(today, 3);
    if (vocabReviews.length > 0) {
        const vocab = vocabReviews[0];
        return `rev_v${vocab.vocabId}_sense`;
    }

    return null;
}

// ============ Step 2: Transfer Practice ============

async function generateStep2(grammarId: number): Promise<Step2State> {
    const grammar = await getGrammarPoint(grammarId);
    if (!grammar) throw new Error(`Grammar ${grammarId} not found`);

    const questionIds: string[] = [];

    // Use remaining drills (index 2+) or generate transfer questions
    const transferDrills = grammar.drills.slice(2);

    if (transferDrills.length >= 2) {
        questionIds.push(transferDrills[0].drillId);
        questionIds.push(transferDrills[1].drillId);
    } else {
        // Generate placeholder transfer question IDs
        questionIds.push(`transfer_g${grammarId}_meaning`);
        questionIds.push(`transfer_g${grammarId}_counter`);
    }

    return {
        questionIds,
        currentIndex: 0,
        answers: [],
    };
}

// ============ Step 3: Vocab Combo ============

async function generateStep3(lessonId: number, level: number): Promise<Step3State> {
    const lesson = await getLesson(lessonId);
    if (!lesson || lesson.vocabPackIds.length === 0) {
        // Fallback
        return {
            packId: 501,
            items: [],
            currentIndex: 0,
            correct: 0,
            wrong: 0,
            avgRtMs: 0,
        };
    }

    const packId = lesson.vocabPackIds[0];
    const pack = await getVocabPack(packId);

    if (!pack) {
        return {
            packId,
            items: [],
            currentIndex: 0,
            correct: 0,
            wrong: 0,
            avgRtMs: 0,
        };
    }

    // Sample up to 12 items, prioritize review candidates
    const today = Date.now();
    const vocabReviews = await getVocabForReview(today, 6);
    const reviewIds = new Set(vocabReviews.map(v => v.vocabId));

    // Prioritize: review words first, then new words
    const prioritized = [
        ...pack.vocabIds.filter(id => reviewIds.has(id)),
        ...pack.vocabIds.filter(id => !reviewIds.has(id)),
    ];

    const items = prioritized.slice(0, 12);

    return {
        packId,
        items,
        currentIndex: 0,
        correct: 0,
        wrong: 0,
        avgRtMs: 0,
    };
}

// ============ Step 4: Sentence Application ============

async function generateStep4(grammarId: number, level: number): Promise<Step4State> {
    // 1. Try to get Gal-style sentences for this grammar
    let sentences = await getSentencesByGrammar(grammarId, 'gal');

    // 2. Fallback to Textbook-style if no Gal-style found
    if (sentences.length === 0) {
        console.log('[Plan] No Gal-style sentences found, falling back to textbook');
        sentences = await getSentencesByGrammar(grammarId, 'textbook');
    }

    // 3. Fallback to ANY sentence with this grammar
    if (sentences.length === 0) {
        console.log('[Plan] No textbook sentences found, falling back to any style');
        sentences = await getSentencesByGrammar(grammarId);
    }

    // 4. Ultimate Fallback: Any sentence from the same lesson (contextual approximation)
    if (sentences.length === 0) {
        console.log('[Plan] No grammar-matched sentences found, falling back to lesson approximation');
        const grammar = await getGrammarPoint(grammarId);
        if (grammar) {
            sentences = await getSentencesByLesson(grammar.lessonId);
            // Don't filter by grammar ID here, just take what we can get
        }
    }

    // Filter by level (±1) if we have enough candidates, otherwise ignore level
    let eligible = sentences.filter(s => Math.abs(s.level - level) <= 1);
    if (eligible.length === 0 && sentences.length > 0) {
        eligible = sentences;
    }

    // Select 1-2 sentences
    const selected = eligible.slice(0, 2);

    // FINAL SAFEGUARD: If still empty, use a hardcoded fallback or empty state that handles it gracefully
    if (selected.length === 0) {
        console.warn('[Plan] Step 4 generation failed: No sentences found for grammar', grammarId);
    }

    return {
        sentenceIds: selected.map(s => s.sentenceId),
        currentIndex: 0,
        submissions: [],
    };
}

// ============ Drill Lookup ============

export async function getDrillById(drillId: string): Promise<Drill | null> {
    // Parse drill ID format: g{grammarId}_q{n} or rev_g{gid}_{original} or transfer_g{gid}_{type}

    if (drillId.startsWith('rev_g')) {
        // Review drill: rev_g{grammarId}_{originalDrillId}
        const match = drillId.match(/^rev_g(\d+)_(.+)$/);
        if (match) {
            const grammarId = parseInt(match[1]);
            const originalId = match[2];
            const grammar = await getGrammarPoint(grammarId);
            const drill = grammar?.drills.find(d => d.drillId === originalId);
            return drill ? normalizeJudgeDrill(drill) : null;
        }
    }

    if (drillId.startsWith('transfer_g')) {
        // Transfer drill (generated)
        const match = drillId.match(/^transfer_g(\d+)_(.+)$/);
        if (match) {
            const grammarId = parseInt(match[1]);
            const type = match[2];
            return generateTransferDrill(grammarId, type);
        }
    }

    if (drillId.startsWith('rev_v')) {
        // Vocab sense drill
        const match = drillId.match(/^rev_v(\d+)_sense$/);
        if (match) {
            // This would generate a vocab meaning question
            // For now, return null (handled separately)
            return null;
        }
    }

    // Regular grammar drill: g{grammarId}_q{n}
    const match = drillId.match(/^g(\d+)_q(\d+)$/);
    if (match) {
        const grammarId = parseInt(match[1]);
        const grammar = await getGrammarPoint(grammarId);
        const drill = grammar?.drills.find(d => d.drillId === drillId);
        return drill ? normalizeJudgeDrill(drill) : null;
    }

    return null;
}

// Normalize judge-type drills to choice format with True/False options
function normalizeJudgeDrill(drill: Drill): Drill {
    if (drill.type === 'judge') {
        // Convert judge drill to choice format
        const isTrue = drill.correctAnswer === 'true';
        return {
            ...drill,
            type: 'choice',
            options: [
                { id: 'a', text: '○ 正确' },
                { id: 'b', text: '× 错误' },
            ],
            correctId: isTrue ? 'a' : 'b',
        };
    }
    return drill;
}

async function generateTransferDrill(grammarId: number, type: string): Promise<Drill | null> {
    const grammar = await getGrammarPoint(grammarId);
    if (!grammar) return null;

    if (type === 'meaning') {
        // Generate meaning selection drill
        return {
            drillId: `transfer_g${grammarId}_meaning`,
            type: 'choice',
            stem: `「${grammar.name}」的核心规则是什么？`,
            options: [
                { id: 'a', text: grammar.coreRule },
                { id: 'b', text: '表示动作的持续状态' },
                { id: 'c', text: '表示过去的经历' },
                { id: 'd', text: '表示将来的推测' },
            ],
            correctId: 'a',
            explanation: grammar.coreRule,
            grammarId,
        };
    }

    if (type === 'counter') {
        // Generate counter-example identification
        const counterExample = grammar.counterExamples[0];
        if (counterExample) {
            return {
                drillId: `transfer_g${grammarId}_counter`,
                type: 'choice',
                stem: '以下哪个句子是错误的用法？',
                options: [
                    { id: 'a', text: cleanOptionText(counterExample.jp) },
                    { id: 'b', text: cleanOptionText(grammar.examples[0]?.jp ?? '正确例句') },
                    { id: 'c', text: cleanOptionText(grammar.examples[1]?.jp ?? '另一正确例句') },
                    { id: 'd', text: cleanOptionText(grammar.examples[2]?.jp ?? '第三正确例句') },
                ],
                correctId: 'a',
                explanation: counterExample.zhHint,
                grammarId,
            };
        }
    }

    return null;
}

function cleanOptionText(text: string): string {
    return text.replace(/^[×○XOxo\s]+/, '').trim();
}
