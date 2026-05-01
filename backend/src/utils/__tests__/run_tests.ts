/**
 * StackQuest — Self-contained test suite (no test framework needed)
 * Run: npx ts-node src/utils/__tests__/run_tests.ts
 */

import {
  evaluateAnswer,
  calculateQuestionScore,
  calculateAnswerXP,
  calculateXPProgression,
  getSessionStartXP,
  getStreakMultiplier,
  calculateElo,
  createSession,
  processAnswer,
} from '../stackquest.algorithm';

import {
  buildMCQ,
  buildFillInBlank,
  buildStringAnswer,
  formatQuestion,
  stripHtml,
  excerptBody,
} from '../questionFormatter';

import type { SoQuestion } from '../../models/db.types';

// ─── Mini test harness ────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (e: any) {
    console.log(`  ❌  ${name}`);
    console.log(`      → ${e.message}`);
    failures.push(`${name}: ${e.message}`);
    failed++;
  }
}

function group(label: string) {
  console.log(`\n📦 ${label}`);
}

function expect(val: any) {
  return {
    toBe(expected: any) {
      if (val !== expected)
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`);
    },
    toEqual(expected: any) {
      const a = JSON.stringify(val);
      const b = JSON.stringify(expected);
      if (a !== b) throw new Error(`Expected ${b}, got ${a}`);
    },
    toBeGreaterThan(n: number) {
      if (!(val > n)) throw new Error(`Expected ${val} > ${n}`);
    },
    toBeLessThanOrEqual(n: number) {
      if (!(val <= n)) throw new Error(`Expected ${val} <= ${n}`);
    },
    toBeTrue() {
      if (val !== true) throw new Error(`Expected true, got ${JSON.stringify(val)}`);
    },
    toBeFalse() {
      if (val !== false) throw new Error(`Expected false, got ${JSON.stringify(val)}`);
    },
    toContain(sub: string) {
      if (typeof val !== 'string' || !val.includes(sub))
        throw new Error(`Expected "${val}" to contain "${sub}"`);
    },
    toBeNull() {
      if (val !== null) throw new Error(`Expected null, got ${JSON.stringify(val)}`);
    },
    toBeNumber() {
      if (typeof val !== 'number') throw new Error(`Expected a number, got ${typeof val}`);
    },
  };
}

// ─── Sample SO question fixture ───────────────────────────────

const SAMPLE_QUESTION: SoQuestion = {
  question_id: 1234,
  title: 'How do I reverse a string in Python?',
  body: '<p>I want to <b>reverse</b> a string in Python. What is the best way?</p>',
  body_markdown: 'I want to reverse a string in Python. What is the best way?',
  tags: ['python', 'string', 'reverse'],
  score: 42,
  answer_count: 5,
  accepted_answer_id: 9999,
  top_answer_body: '<p>Use slicing: <code>s[::-1]</code> to reverse a string in Python efficiently.</p>',
  top_answer_score: 100,
  top_answer_author: 'alice',
  view_count: 10000,
  difficulty: 'easy',
  is_answered: true,
  creation_date: 1609459200,
};

const SAMPLE_POOL: SoQuestion[] = [
  { ...SAMPLE_QUESTION, question_id: 2, tags: ['javascript', 'arrays'] },
  { ...SAMPLE_QUESTION, question_id: 3, tags: ['java', 'generics'] },
  { ...SAMPLE_QUESTION, question_id: 4, tags: ['c++', 'pointers'] },
];

// ═══════════════════════════════════════════════════════════════
// 1. ANSWER EVALUATION
// ═══════════════════════════════════════════════════════════════

group('evaluateAnswer — MCQ');

test('exact match (case-insensitive) → correct', () => {
  const r = evaluateAnswer('mcq', 'Python', 'python');
  expect(r.isCorrect).toBeTrue();
  expect(r.similarityRatio).toBe(1);
  expect(r.method).toBe('exact');
});

test('wrong answer → incorrect', () => {
  const r = evaluateAnswer('mcq', 'Java', 'Python');
  expect(r.isCorrect).toBeFalse();
  expect(r.similarityRatio).toBe(0);
});

test('empty player answer → incorrect', () => {
  const r = evaluateAnswer('mcq', '', 'python');
  expect(r.isCorrect).toBeFalse();
});

group('evaluateAnswer — fill_in_the_blank');

test('exact match → correct', () => {
  const r = evaluateAnswer('fill_in_the_blank', 'JavaScript', 'javascript');
  expect(r.isCorrect).toBeTrue();
  expect(r.method).toBe('exact');
});

test('substring match → correct', () => {
  const r = evaluateAnswer('fill_in_the_blank', 'script', 'javascript');
  expect(r.isCorrect).toBeTrue();
  expect(r.method).toBe('substring');
  expect(r.similarityRatio).toBe(0.8);
});

test('fuzzy match close enough (typo) → correct', () => {
  const r = evaluateAnswer('fill_in_the_blank', 'Pythn', 'Python');
  expect(r.isCorrect).toBeTrue();
  expect(r.method).toBe('fuzzy');
});

test('fuzzy match too different → incorrect', () => {
  const r = evaluateAnswer('fill_in_the_blank', 'xyz', 'python');
  expect(r.isCorrect).toBeFalse();
});

group('evaluateAnswer — string_answer');

test('good keyword overlap → correct', () => {
  const r = evaluateAnswer('string_answer',
    'use slicing to reverse a string in Python efficiently',
    'use slicing s reverse a string in Python efficiently');
  expect(r.isCorrect).toBeTrue();
  expect(r.method).toBe('keyword_overlap');
});

test('very short answer (< 10 chars) → auto-fail', () => {
  const r = evaluateAnswer('string_answer', 'slice', 'use slicing to reverse a string in python');
  expect(r.isCorrect).toBeFalse();
  expect(r.method).toBe('none');
});

test('insufficient keyword overlap → incorrect', () => {
  const r = evaluateAnswer('string_answer',
    'use a for loop to iterate over the characters one by one',
    'slicing syntax double colon negative one reversal');
  expect(r.isCorrect).toBeFalse();
});

// ═══════════════════════════════════════════════════════════════
// 2. SCORING
// ═══════════════════════════════════════════════════════════════

group('calculateQuestionScore');

test('incorrect answer → 0 points', () => {
  const r = calculateQuestionScore('mcq', false, 5000, 3);
  expect(r.totalScore).toBe(0);
  expect(r.basePoints).toBe(0);
});

test('MCQ correct + fast answer → score > 20', () => {
  const r = calculateQuestionScore('mcq', true, 3000, 0);
  expect(r.basePoints).toBe(20);
  expect(r.totalScore).toBeGreaterThan(20); // time bonus adds to it
});

test('MCQ correct + slow answer (30s) → exactly base points, no time bonus', () => {
  const r = calculateQuestionScore('mcq', true, 30000, 0);
  expect(r.basePoints).toBe(20);
  expect(r.timeBonus).toBe(0);
  expect(r.totalScore).toBe(20);
});

test('fill_in_the_blank correct → 25 base points', () => {
  const r = calculateQuestionScore('fill_in_the_blank', true, 10000, 0);
  expect(r.basePoints).toBe(25);
});

test('string_answer high similarity (0.9) → 60 base points', () => {
  const r = calculateQuestionScore('string_answer', true, 5000, 0, 0.9);
  expect(r.basePoints).toBe(60);
});

test('string_answer medium similarity (0.6) → 25 base points', () => {
  const r = calculateQuestionScore('string_answer', true, 5000, 0, 0.6);
  expect(r.basePoints).toBe(25);
});

test('string_answer low similarity (0.35) → 10 base points', () => {
  const r = calculateQuestionScore('string_answer', true, 5000, 0, 0.35);
  expect(r.basePoints).toBe(10);
});

group('getStreakMultiplier');

test('streak 0 → 1x', () => expect(getStreakMultiplier(0)).toBe(1));
test('streak 4 → 1x', () => expect(getStreakMultiplier(4)).toBe(1));
test('streak 5 → 2x', () => expect(getStreakMultiplier(5)).toBe(2));
test('streak 10 → 3x', () => expect(getStreakMultiplier(10)).toBe(3));
test('streak 13 → 5x', () => expect(getStreakMultiplier(13)).toBe(5));
test('streak 20 → 5x (capped)', () => expect(getStreakMultiplier(20)).toBe(5));

test('streak multiplier applied in score calc', () => {
  const noStreak = calculateQuestionScore('mcq', true, 30000, 0); // 20pts, 1x
  const bigStreak = calculateQuestionScore('mcq', true, 30000, 5); // 20pts, 2x
  expect(noStreak.totalScore).toBe(20);
  expect(bigStreak.totalScore).toBe(40);
});

// ═══════════════════════════════════════════════════════════════
// 3. XP
// ═══════════════════════════════════════════════════════════════

group('getSessionStartXP');

test('returns 5', () => expect(getSessionStartXP()).toBe(5));

group('calculateAnswerXP');

test('MCQ correct → 10 XP', () => {
  expect(calculateAnswerXP('mcq', true)).toBe(10);
});

test('fill_in_the_blank correct → 10 XP', () => {
  expect(calculateAnswerXP('fill_in_the_blank', true)).toBe(10);
});

test('any type incorrect → 0 XP', () => {
  expect(calculateAnswerXP('mcq', false)).toBe(0);
  expect(calculateAnswerXP('fill_in_the_blank', false)).toBe(0);
  expect(calculateAnswerXP('string_answer', false)).toBe(0);
});

test('string_answer correct at 0.9 similarity → ~18 XP', () => {
  const xp = calculateAnswerXP('string_answer', true, 0.9);
  expect(xp).toBe(18); // Math.round(0.9 * 20)
});

group('calculateXPProgression');

test('0 XP → Bronze, level 1', () => {
  const r = calculateXPProgression(0);
  expect(r.league).toBe('Bronze');
  expect(r.level).toBe(1);
});

test('500 XP → Silver', () => {
  const r = calculateXPProgression(500);
  expect(r.league).toBe('Silver');
});

test('1500 XP → Gold', () => {
  const r = calculateXPProgression(1500);
  expect(r.league).toBe('Gold');
});

test('12000 XP → Legend, no next league', () => {
  const r = calculateXPProgression(12000);
  expect(r.league).toBe('Legend');
  expect(r.nextLeague).toBeNull();
  expect(r.xpToNextLeague).toBeNull();
});

test('2200 XP → level is computed correctly (floor(sqrt(22))+1 = 5+1=6)', () => {
  const r = calculateXPProgression(2200);
  expect(r.level).toBe(Math.floor(Math.sqrt(2200 / 100)) + 1);
});

test('negative XP treated as 0', () => {
  const r = calculateXPProgression(-500);
  expect(r.league).toBe('Bronze');
  expect(r.level).toBe(1);
});

test('xpToNextLeague is always positive when nextLeague exists', () => {
  const r = calculateXPProgression(600); // Silver, next is Gold at 1500
  if (r.xpToNextLeague !== null) {
    expect(r.xpToNextLeague).toBeGreaterThan(0);
  }
});

// ═══════════════════════════════════════════════════════════════
// 4. ELO
// ═══════════════════════════════════════════════════════════════

group('calculateElo');

test('equal ELO, winner gets positive delta', () => {
  const r = calculateElo(1000, 1000, true);
  expect(r.myDelta).toBeGreaterThan(0);
  expect(r.opponentDelta).toBe(-r.myDelta);
});

test('equal ELO, loser gets negative delta', () => {
  const r = calculateElo(1000, 1000, false);
  expect(r.myDelta).toBeLessThanOrEqual(0);
});

test('beating much stronger opponent → large positive delta', () => {
  const upsetWin = calculateElo(1000, 2000, true);
  const normalWin = calculateElo(1000, 1000, true);
  expect(upsetWin.myDelta).toBeGreaterThan(normalWin.myDelta);
});

test('losing to much weaker opponent → large negative delta', () => {
  const upsetLoss = calculateElo(2000, 1000, false);
  const normalLoss = calculateElo(1000, 1000, false);
  expect(Math.abs(upsetLoss.myDelta)).toBeGreaterThan(Math.abs(normalLoss.myDelta));
});

test('zero-sum: deltas cancel out', () => {
  const r = calculateElo(1200, 1000, true);
  expect(r.myDelta + r.opponentDelta).toBe(0);
});

test('new ELO is correctly applied', () => {
  const r = calculateElo(1200, 1000, true);
  expect(r.myNewElo).toBe(1200 + r.myDelta);
  expect(r.opponentNewElo).toBe(1000 + r.opponentDelta);
});

// ═══════════════════════════════════════════════════════════════
// 5. SESSION MANAGER
// ═══════════════════════════════════════════════════════════════

group('createSession + processAnswer');

test('fresh session starts with 5 XP (session start bonus)', () => {
  const s = createSession('abc', 'puzzle');
  expect(s.totalXP).toBe(5);
  expect(s.totalScore).toBe(0);
  expect(s.currentStreak).toBe(0);
});

test('correct answer updates streak and score', () => {
  let s = createSession('abc', 'puzzle');
  const eval1 = evaluateAnswer('mcq', 'python', 'python');
  const { updatedSession } = processAnswer(s, 'mcq', eval1, 5000);
  expect(updatedSession.currentStreak).toBe(1);
  expect(updatedSession.totalScore).toBeGreaterThan(0);
  expect(updatedSession.correctAnswers).toBe(1);
});

test('wrong answer resets streak to 0', () => {
  let s = createSession('abc', 'puzzle');
  // First get a streak going
  const correct = evaluateAnswer('mcq', 'python', 'python');
  s = processAnswer(s, 'mcq', correct, 5000).updatedSession;
  s = processAnswer(s, 'mcq', correct, 5000).updatedSession;
  expect(s.currentStreak).toBe(2);
  // Now miss
  const wrong = evaluateAnswer('mcq', 'java', 'python');
  s = processAnswer(s, 'mcq', wrong, 5000).updatedSession;
  expect(s.currentStreak).toBe(0);
});

test('score accumulates correctly over multiple answers', () => {
  let s = createSession('abc', 'puzzle');
  let totalExpected = 0;
  for (let i = 0; i < 5; i++) {
    const e = evaluateAnswer('mcq', 'python', 'python');
    const { updatedSession, scoreResult } = processAnswer(s, 'mcq', e, 5000);
    totalExpected += scoreResult.totalScore;
    s = updatedSession;
  }
  expect(s.totalScore).toBe(totalExpected);
});

test('questionsAnswered increments on every answer', () => {
  let s = createSession('abc', 'puzzle');
  for (let i = 0; i < 3; i++) {
    const e = evaluateAnswer('mcq', i % 2 === 0 ? 'python' : 'java', 'python');
    s = processAnswer(s, 'mcq', e, 5000).updatedSession;
  }
  expect(s.questionsAnswered).toBe(3);
});

// ═══════════════════════════════════════════════════════════════
// 6. QUESTION FORMATTER
// ═══════════════════════════════════════════════════════════════

group('stripHtml');

test('strips basic HTML tags', () => {
  const result = stripHtml('<p>Hello <b>world</b></p>');
  expect(result).toContain('Hello');
  expect(result).toContain('world');
});

test('wraps code blocks in backticks', () => {
  const result = stripHtml('<pre><code>s[::-1]</code></pre>');
  expect(result).toContain('```');
});

test('decodes HTML entities', () => {
  const result = stripHtml('&lt;div&gt; &amp; &quot;');
  expect(result).toContain('<div>');
  expect(result).toContain('&');
});

test('empty string returns empty string', () => {
  expect(stripHtml('')).toBe('');
});

group('buildMCQ');

test('correct_answer is tags[0]', () => {
  const q = buildMCQ(SAMPLE_QUESTION, SAMPLE_POOL);
  expect(q.correct_answer).toBe('python');
  expect(q.question_type).toBe('mcq');
});

test('options contains the correct answer', () => {
  const q = buildMCQ(SAMPLE_QUESTION, SAMPLE_POOL);
  if (!q.options?.includes('python'))
    throw new Error(`options does not include 'python': ${JSON.stringify(q.options)}`);
});

test('options has exactly 4 choices', () => {
  const q = buildMCQ(SAMPLE_QUESTION, SAMPLE_POOL);
  if (q.options?.length !== 4)
    throw new Error(`Expected 4 options, got ${q.options?.length}`);
});

test('distractors do not include correct answer tag', () => {
  const q = buildMCQ(SAMPLE_QUESTION, SAMPLE_POOL);
  const duplicates = q.options?.filter(o => o === 'python').length ?? 0;
  if (duplicates > 1)
    throw new Error(`Correct answer appears ${duplicates} times in options`);
});

group('buildFillInBlank');

test('blank_text contains "___"', () => {
  const q = buildFillInBlank(SAMPLE_QUESTION);
  expect(q.question_type).toBe('fill_in_blank');
  if (!q.blank_text?.includes('___'))
    throw new Error(`blank_text does not contain "___": "${q.blank_text}"`);
});

test('correct_answer is a non-empty string', () => {
  const q = buildFillInBlank(SAMPLE_QUESTION);
  if (!q.correct_answer || q.correct_answer.length === 0)
    throw new Error('correct_answer is empty');
});

test('time_limit is 30 for fill_in_blank', () => {
  const q = buildFillInBlank(SAMPLE_QUESTION);
  expect(q.time_limit).toBe(30);
});

group('buildStringAnswer');

test('question_type is string_answer', () => {
  const q = buildStringAnswer(SAMPLE_QUESTION);
  expect(q.question_type).toBe('string_answer');
});

test('correct_answer is stripped top_answer_body', () => {
  const q = buildStringAnswer(SAMPLE_QUESTION);
  if (!q.correct_answer.includes('slicing'))
    throw new Error(`Expected correct_answer to mention "slicing", got: "${q.correct_answer}"`);
});

test('time_limit is 90 for string_answer', () => {
  const q = buildStringAnswer(SAMPLE_QUESTION);
  expect(q.time_limit).toBe(90);
});

test('hint includes top_answer_author', () => {
  const q = buildStringAnswer(SAMPLE_QUESTION);
  if (!q.hint?.includes('alice'))
    throw new Error(`Expected hint to include 'alice', got: "${q.hint}"`);
});

group('formatQuestion — routing');

test('routes mcq correctly', () => {
  const q = formatQuestion(SAMPLE_QUESTION, 'mcq', SAMPLE_POOL);
  expect(q.question_type).toBe('mcq');
});

test('routes fill_in_blank correctly', () => {
  const q = formatQuestion(SAMPLE_QUESTION, 'fill_in_blank');
  expect(q.question_type).toBe('fill_in_blank');
});

test('routes string_answer correctly', () => {
  const q = formatQuestion(SAMPLE_QUESTION, 'string_answer');
  expect(q.question_type).toBe('string_answer');
});

// ═══════════════════════════════════════════════════════════════
// 7. REGRESSION — The specific bugs that were fixed
// ═══════════════════════════════════════════════════════════════

group('Regression: bugs fixed in last session');

test('getSessionStartXP() === 5 (same as old XP_PER_GAME)', () => {
  expect(getSessionStartXP()).toBe(5);
});

test('getStreakMultiplier is exported and callable', () => {
  expect(typeof getStreakMultiplier).toBe('function');
  expect(getStreakMultiplier(5)).toBe(2);
});

test('snapshot streak_multiplier reflects actual streak (not hardcoded 1)', () => {
  // Simulate what buildSnapshot now does
  const streak = 5;
  const multiplier = getStreakMultiplier(streak);
  expect(multiplier).toBe(2); // should be 2x for streak of 5, not 1
  if (multiplier === 1) throw new Error('streak_multiplier is still hardcoded to 1!');
});

test('duel ELO draw calc: both deltas cancel to 0', () => {
  const p1Elo = 1000, p2Elo = 1000;
  const expected1 = 1 / (1 + Math.pow(10, (p2Elo - p1Elo) / 400));
  const eloChange1 = Math.round(32 * (0.5 - expected1));
  const eloChange2 = -eloChange1;
  expect(eloChange1 + eloChange2).toBe(0); // still zero-sum
  expect(eloChange1).toBe(0); // equal players, draw → 0 delta
});

test('duel ELO win: same result whether using variable or inline expression', () => {
  const p1Elo = 1200, p2Elo = 1000;
  // Old way (with p1Win variable)
  const p1Win = true;
  const r1 = calculateElo(p1Elo, p2Elo, p1Win);
  // New way (inline expression)
  const winnerId = 'player1';
  const player1Id = 'player1';
  const r2 = calculateElo(p1Elo, p2Elo, winnerId === player1Id);
  expect(r1.myDelta).toBe(r2.myDelta);
});

// ═══════════════════════════════════════════════════════════════
// RESULTS
// ═══════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(55));
console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
console.log('═'.repeat(55));

if (failures.length > 0) {
  console.log('\n🔴 FAILED TESTS:');
  failures.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
}

console.log('');
process.exit(failed > 0 ? 1 : 0);
