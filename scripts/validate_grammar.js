const gp = require('../assets/data/grammar_points.json');
console.log('Total grammar points:', gp.length);

let issues = 0;
for (const g of gp) {
    const missing = [];
    if (!g.grammarId) missing.push('grammarId');
    if (!g.lessonId) missing.push('lessonId');
    if (!g.name) missing.push('name');
    if (!g.coreRule) missing.push('coreRule');
    if (!g.examples || g.examples.length === 0) missing.push('examples');
    if (!g.drills || g.drills.length === 0) missing.push('drills');
    if (missing.length > 0) {
        console.log('  g' + g.grammarId + ' missing:', missing.join(', '));
        issues++;
    }
    for (const d of (g.drills || [])) {
        if (d.grammarId !== g.grammarId) {
            console.log('  g' + g.grammarId + ' drill ' + d.drillId + ' has wrong grammarId:', d.grammarId);
            issues++;
        }
    }
}

const lessons = require('../assets/data/lessons.json');
const gpIds = new Set(gp.map(g => g.grammarId));
let missingFromGP = 0;
for (const l of lessons) {
    for (const gid of (l.grammarIds || [])) {
        if (!gpIds.has(gid)) {
            console.log('  Lesson ' + l.lessonId + ' references g' + gid + ' but not found in grammar_points.json');
            missingFromGP++;
        }
    }
}

console.log('\nIssues found:', issues);
console.log('Missing grammar points referenced by lessons:', missingFromGP);
console.log('\nAll grammar IDs:', gp.map(g => g.grammarId).join(', '));
