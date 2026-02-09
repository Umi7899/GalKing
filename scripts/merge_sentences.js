// Merge new sentence files into sentences.json
const fs = require('fs');
const path = require('path');

const TARGET = path.join(__dirname, '..', 'assets', 'data', 'sentences.json');
const NEW_FILES = [
    path.join(__dirname, 'new_sentences_25_32.json'),
    path.join(__dirname, 'new_sentences_33_40.json'),
    path.join(__dirname, 'new_sentences_41_48.json'),
];

// Load existing
const existing = JSON.parse(fs.readFileSync(TARGET, 'utf-8'));
console.log(`Existing sentences: ${existing.length}`);

const existingIds = new Set(existing.map(s => s.sentenceId));

// Load and merge new sentences
let added = 0;
for (const filePath of NEW_FILES) {
    if (!fs.existsSync(filePath)) {
        console.log(`  Skipping ${path.basename(filePath)}: not found`);
        continue;
    }
    const newSentences = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    console.log(`  ${path.basename(filePath)}: ${newSentences.length} sentences`);

    for (const s of newSentences) {
        // Validate required fields
        const missing = [];
        if (!s.sentenceId) missing.push('sentenceId');
        if (!s.text) missing.push('text');
        if (!s.lessonId) missing.push('lessonId');
        if (!s.grammarIds || s.grammarIds.length === 0) missing.push('grammarIds');
        if (!s.keyPoints || s.keyPoints.length === 0) missing.push('keyPoints');
        if (!s.tokens || s.tokens.length === 0) missing.push('tokens');
        if (missing.length > 0) {
            console.log(`    WARNING: s${s.sentenceId} missing: ${missing.join(', ')}`);
        }

        if (existingIds.has(s.sentenceId)) {
            console.log(`    SKIP duplicate: s${s.sentenceId}`);
            continue;
        }

        // Ensure required fields have defaults
        if (!s.styleTag) s.styleTag = 'textbook';
        if (!s.level) s.level = 2;
        if (!s.blockingVocabIds) s.blockingVocabIds = [];

        existing.push(s);
        existingIds.add(s.sentenceId);
        added++;
    }
}

// Sort by sentenceId
existing.sort((a, b) => a.sentenceId - b.sentenceId);

console.log(`\nAdded: ${added} new sentences`);
console.log(`Total: ${existing.length} sentences`);

// Coverage check
const lessonCoverage = {};
for (const s of existing) {
    if (!lessonCoverage[s.lessonId]) lessonCoverage[s.lessonId] = 0;
    lessonCoverage[s.lessonId]++;
}
console.log('\nSentences per lesson:');
Object.keys(lessonCoverage).sort((a, b) => a - b).forEach(l => {
    console.log(`  L${l}: ${lessonCoverage[l]} sentences`);
});

// Write
fs.writeFileSync(TARGET, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
console.log(`\nWritten to ${TARGET}`);
