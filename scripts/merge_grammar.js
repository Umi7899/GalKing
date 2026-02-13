// Script to extract grammar data from agent output files and merge into grammar_points.json
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(process.env.TEMP || '/tmp', 'claude', 'G--Android-Projects-GalKing', 'tasks');
const TARGET = path.join(__dirname, '..', 'assets', 'data', 'grammar_points.json');

const AGENT_IDS = ['ae60532', 'ab04155', 'ad2115e'];

// Fix unescaped double quotes inside JSON string values
// The agents sometimes wrote "quoted text" inside values like: "coreRule": "表示"又...又...""
function fixUnescapedQuotes(jsonStr) {
    // Strategy: Walk through character by character, track JSON structure
    const chars = [...jsonStr];
    const result = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < chars.length; i++) {
        const ch = chars[i];

        if (escaped) {
            result.push(ch);
            escaped = false;
            continue;
        }

        if (ch === '\\' && inString) {
            result.push(ch);
            escaped = true;
            continue;
        }

        if (ch === '"') {
            if (!inString) {
                // Opening a string
                inString = true;
                result.push(ch);
            } else {
                // Check if this quote ends the string or is an unescaped content quote
                // Look ahead: after a closing string quote, we expect: whitespace, comma, colon, }, ], or end
                let lookAhead = i + 1;
                while (lookAhead < chars.length && (chars[lookAhead] === ' ' || chars[lookAhead] === '\t')) {
                    lookAhead++;
                }
                const nextSignificant = lookAhead < chars.length ? chars[lookAhead] : '';

                if (nextSignificant === ',' || nextSignificant === ':' || nextSignificant === '}' ||
                    nextSignificant === ']' || nextSignificant === '\n' || nextSignificant === '\r' ||
                    nextSignificant === '' || nextSignificant === '/') {
                    // This is a real closing quote
                    inString = false;
                    result.push(ch);
                } else {
                    // This is an unescaped content quote - escape it
                    result.push('\\', '"');
                }
            }
        } else {
            result.push(ch);
        }
    }

    return result.join('');
}

function extractJsonArraysFromOutputFile(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    const results = [];

    for (const line of lines) {
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }

        if (obj.type !== 'assistant' || !obj.message?.content) continue;

        const contentArr = Array.isArray(obj.message.content) ? obj.message.content : [obj.message.content];

        for (const block of contentArr) {
            const text = typeof block === 'string' ? block : block.text;
            if (!text) continue;

            // Find all ```json ... ``` blocks
            const regex = /```json\s*\n([\s\S]*?)```/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                let jsonStr = match[1].trim();
                try {
                    const parsed = JSON.parse(jsonStr);
                    if (Array.isArray(parsed)) {
                        results.push(...parsed);
                    }
                } catch (e) {
                    // Try fixing unescaped quotes
                    try {
                        const fixed = fixUnescapedQuotes(jsonStr);
                        const parsed = JSON.parse(fixed);
                        if (Array.isArray(parsed)) {
                            console.log(`  Fixed and parsed JSON block (${parsed.length} items)`);
                            results.push(...parsed);
                        }
                    } catch (e2) {
                        console.log(`  Warning: Failed to parse JSON block even after fix: ${e2.message}`);
                        console.log(`  First 200 chars: ${jsonStr.substring(0, 200)}`);
                    }
                }
            }
        }
    }

    return results;
}

// Main
console.log('Reading existing grammar_points.json...');
const existing = JSON.parse(fs.readFileSync(TARGET, 'utf-8'));
console.log(`  Found ${existing.length} existing grammar points`);

// Extract from all agent outputs
const allNewData = [];
const supplementaryDrills = [];

for (const agentId of AGENT_IDS) {
    const filePath = path.join(OUTPUT_DIR, `${agentId}.output`);
    if (!fs.existsSync(filePath)) {
        console.log(`  Skipping ${agentId}: file not found`);
        continue;
    }

    console.log(`\nProcessing agent ${agentId}...`);
    const extracted = extractJsonArraysFromOutputFile(filePath);
    console.log(`  Extracted ${extracted.length} items`);

    for (const item of extracted) {
        if (item.grammarId && item.lessonId) {
            // Full grammar point
            allNewData.push(item);
        } else if (item.grammarId && item.drills && !item.lessonId) {
            // Supplementary drills only
            supplementaryDrills.push(item);
        }
    }
}

console.log(`\nTotal new/updated grammar points: ${allNewData.length}`);
console.log(`Supplementary drill entries: ${supplementaryDrills.length}`);

// Build a map of existing data
const grammarMap = new Map();
for (const gp of existing) {
    grammarMap.set(gp.grammarId, gp);
}

// Add/update with new data (full grammar points override existing)
for (const gp of allNewData) {
    grammarMap.set(gp.grammarId, gp);
}

// Apply supplementary drills to existing grammar points
for (const supp of supplementaryDrills) {
    const existing = grammarMap.get(supp.grammarId);
    if (existing) {
        existing.drills = supp.drills;
        console.log(`  Applied drills to grammarId ${supp.grammarId}`);
    }
}

// Sort by grammarId
const result = Array.from(grammarMap.values()).sort((a, b) => a.grammarId - b.grammarId);

console.log(`\nFinal count: ${result.length} grammar points`);

// Validate
const lessonCoverage = new Map();
for (const gp of result) {
    const count = lessonCoverage.get(gp.lessonId) || 0;
    lessonCoverage.set(gp.lessonId, count + 1);
}
console.log('\nLesson coverage:');
for (const [lessonId, count] of [...lessonCoverage.entries()].sort((a, b) => a[0] - b[0])) {
    const hasDrills = result.filter(g => g.lessonId === lessonId && g.drills.length > 0).length;
    console.log(`  Lesson ${lessonId}: ${count} grammar points, ${hasDrills} with drills`);
}

// Write result
fs.writeFileSync(TARGET, JSON.stringify(result, null, 2) + '\n', 'utf-8');
console.log(`\nWritten to ${TARGET}`);
