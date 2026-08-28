# StackQuest — MCQ Upgrade Agent Instructions

## Context

You are working on **StackQuest**, a quiz game that fetches questions from the Stack Overflow API,
caches them in PostgreSQL via Prisma, and serves them over REST and WebSockets.

The current MCQ system only generates one question type: a **tag-guessing MCQ** where
`correct_answer = question.tags[0]` and distractors are tags from other questions in the session pool.

Your job is to upgrade the MCQ system with better distractors and three new question types,
without breaking the existing REST or WebSocket flow.

---

## Files You Will Touch

| File | What to change |
|---|---|
| `backend/src/utils/questionFormatter.ts` | Add new MCQ type builders alongside existing `buildMCQ()` |
| `backend/src/services/question.service.ts` | Upgrade distractor selection using TF-IDF; generate variants at cache time |
| `backend/prisma/schema.prisma` | Add `variants Json?` column to `so_question_cache` table |
| `backend/src/services/so.service.ts` | No changes needed |
| `backend/src/socket/duel.socket.ts` | No changes needed — variants are pre-generated |

---

## Step 1 — Install Dependencies

```bash
npm install compromise natural node-html-markdown ml-distance
npm install -D @types/natural
```

| Package | Purpose |
|---|---|
| `compromise` | Noun/verb extraction from question titles for cloze MCQs |
| `natural` | TF-IDF scoring to find semantically similar questions for distractor pools |
| `node-html-markdown` | Clean HTML body replacement for the current regex stripper |
| `ml-distance` | Cosine similarity to validate distractor quality before saving |

---

## Step 2 — Update Prisma Schema

In `prisma/schema.prisma`, add a `variants` column to the `SoQuestionCache` model:

```prisma
model SoQuestionCache {
  // ... all existing fields stay unchanged ...

  variants  Json?   // NEW — stores pre-generated MCQ variants
}
```

Run migration:
```bash
npx prisma migrate dev --name add_variants_column
```

---

## Step 3 — Upgrade Distractor Selection in `question.service.ts`

Replace the existing distractor pool logic (tags from other questions) with a
**TF-IDF similarity scorer**. Add this function and call it from `cacheQuestions()`.

### 3a. Add the similarity scorer

```typescript
import { TfIdf } from 'natural';
import { cosine } from 'ml-distance';

/**
 * Given a question and a pool, returns 3–6 questions that are
 * topically related but not identical — ideal distractor sources.
 *
 * Strategy: skip the top 2 most similar (too close = giveaway),
 * take the next 6 (same topic, different answer = plausible wrong options).
 */
export function findDistractorQuestions(
  question: SoQuestionCache,
  pool: SoQuestionCache[]
): SoQuestionCache[] {
  const tfidf = new TfIdf();

  pool.forEach(q =>
    tfidf.addDocument(`${q.title} ${q.tags.join(' ')}`)
  );

  const scores: { q: SoQuestionCache; score: number }[] = [];

  tfidf.tfidfs(`${question.title} ${question.tags.join(' ')}`, (i, score) => {
    if (pool[i].id !== question.id) {
      scores.push({ q: pool[i], score });
    }
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(2, 8) // skip top 2 (too similar), use next 6
    .map(s => s.q);
}
```

### 3b. Generate all variants at cache time

Inside `cacheQuestions()`, after the `prisma.soQuestionCache.createMany(...)` call,
iterate over the newly inserted questions and update each row's `variants` column:

```typescript
import { buildTagMCQ, buildCloze, buildTrueFalse, buildAnswerMCQ } from '../utils/questionFormatter';

// After createMany:
for (const question of formattedList) {
  const distractorPool = findDistractorQuestions(question, formattedList);

  const variants = {
    mcq:    buildTagMCQ(question, distractorPool),
    cloze:  buildCloze(question, distractorPool),
    tf:     buildTrueFalse(question, distractorPool),
    answer: buildAnswerMCQ(question, distractorPool),
  };

  await prisma.soQuestionCache.update({
    where: { question_id: question.question_id },
    data: { variants },
  });
}
```

> **Why at cache time?** The duel socket broadcasts questions to both players at the same millisecond.
> Pre-generating means `broadcastQuestion()` just reads a DB column — no compute on the hot path.

---

## Step 4 — New Question Builders in `questionFormatter.ts`

Add these four builder functions. Keep the existing `formatQuestion()` and `buildMCQ()` functions
exactly as they are — these are additive.

### 4a. Existing builder — keep unchanged

```typescript
// buildTagMCQ — current implementation, no changes
// correct_answer = tags[0], distractors = tags from pool questions
export function buildTagMCQ(
  question: SoQuestionCache,
  pool: SoQuestionCache[]
): MCQVariant { /* existing logic */ }
```

### 4b. NEW — Cloze (fill-in-the-blank from title)

Extracts the most important noun phrase from the title using `compromise`, blanks it out,
and uses similar noun phrases from distractor pool titles as wrong options.

```typescript
import nlp from 'compromise';

export function buildCloze(
  question: SoQuestionCache,
  pool: SoQuestionCache[]
): MCQVariant | null {
  const doc = nlp(question.title);
  const nouns = doc.nouns().out('array') as string[];

  if (nouns.length === 0) return null; // fallback: skip this type

  const keyword = nouns[0]; // most prominent noun phrase
  const stem = question.title.replace(keyword, '_____');

  // Pull distractor keywords from pool question titles
  const distractors = pool
    .map(q => {
      const d = nlp(q.title);
      const ns = d.nouns().out('array') as string[];
      return ns[0] ?? null;
    })
    .filter((n): n is string => n !== null && n !== keyword)
    .slice(0, 3);

  if (distractors.length < 3) return null; // not enough pool variety

  const options = shuffle([keyword, ...distractors]);

  return {
    question_type: 'cloze',
    question_text: `Fill in the blank:\n\n"${stem}"`,
    options,
    correct_answer: keyword,
    time_limit: 20,
  };
}
```

### 4c. NEW — Answer Comprehension MCQ (uses `best_answer`)

The accepted answer body is already stored but unused in MCQ generation. This builder
picks the first clean sentence from the accepted answer as a prompt, asking the player
which tag/technology the answer is describing.

```typescript
import { NodeHtmlMarkdown } from 'node-html-markdown';

export function buildAnswerMCQ(
  question: SoQuestionCache,
  pool: SoQuestionCache[]
): MCQVariant | null {
  if (!question.best_answer) return null;

  // Strip HTML, take first meaningful sentence
  const markdown = NodeHtmlMarkdown.translate(question.best_answer);
  const plainText = markdown.replace(/```[\s\S]*?```/g, '[code block]');
  const firstSentence = plainText.split(/[.!?]/)[0]?.trim();

  if (!firstSentence || firstSentence.length < 30) return null;

  const correct = question.tags[0];
  const distractors = pool
    .map(q => q.tags[0])
    .filter(t => t && t !== correct)
    .slice(0, 3);

  if (distractors.length < 3) return null;

  const options = shuffle([correct, ...distractors]);

  return {
    question_type: 'answer_mcq',
    question_text: `Which technology does this answer describe?\n\n"${firstSentence}..."`,
    options,
    correct_answer: correct,
    time_limit: 25, // slightly more reading time
  };
}
```

### 4d. NEW — True / False (fast, great for duel speed rounds)

Takes the question title, swaps `tags[0]` with a distractor tag to create a false variant,
then randomly presents either the true or false version.

```typescript
export function buildTrueFalse(
  question: SoQuestionCache,
  pool: SoQuestionCache[]
): MCQVariant | null {
  const correctTag = question.tags[0];
  if (!correctTag) return null;

  const distractor = pool.find(q => !q.tags.includes(correctTag))?.tags[0];
  if (!distractor) return null;

  const isTrue = Math.random() > 0.5;

  const displayTag = isTrue ? correctTag : distractor;
  const stem = question.title.toLowerCase().includes(correctTag)
    ? question.title.replace(correctTag, displayTag)
    : `Is "${displayTag}" the primary technology in: "${question.title}"?`;

  return {
    question_type: 'true_false',
    question_text: stem,
    options: ['True', 'False'],
    correct_answer: isTrue ? 'True' : 'False',
    time_limit: 10, // fast round
  };
}
```

### 4e. Shared type definition

Add this interface at the top of `questionFormatter.ts`:

```typescript
export interface MCQVariant {
  question_type: 'mcq' | 'cloze' | 'answer_mcq' | 'true_false';
  question_text: string;
  options: string[];
  correct_answer: string;
  time_limit: number;
}
```

---

## Step 5 — Update `formatQuestion()` to Use Variants

In `questionFormatter.ts`, update `formatQuestion()` to read from the pre-generated
`variants` column when available, falling back to live generation only if the column is empty.

```typescript
export function formatQuestion(
  question: SoQuestionCache,
  type: 'mcq' | 'cloze' | 'answer_mcq' | 'true_false' = 'mcq',
  pool: SoQuestionCache[] = []
): MCQVariant {
  // Use pre-generated variant if available
  const stored = question.variants as Record<string, MCQVariant> | null;
  if (stored?.[type]) return stored[type];

  // Fallback: generate live (only happens before cacheQuestions has run variants)
  const distractorPool = findDistractorQuestions(question, pool);
  switch (type) {
    case 'cloze':      return buildCloze(question, distractorPool) ?? buildTagMCQ(question, pool);
    case 'answer_mcq': return buildAnswerMCQ(question, distractorPool) ?? buildTagMCQ(question, pool);
    case 'true_false': return buildTrueFalse(question, distractorPool) ?? buildTagMCQ(question, pool);
    default:           return buildTagMCQ(question, pool);
  }
}
```

---

## Step 6 — Expose Question Type in REST Response

In `game.controller.ts`, the `/api/game/question` endpoint currently hardcodes `'mcq'`.
Update it to accept an optional `question_type` query param:

```typescript
// GET /api/game/question?session_id=xxx&question_type=cloze
const questionType = (req.query.question_type as string) ?? 'mcq';
const formatted = formatQuestion(question, questionType as any, sessionPool);
```

The response shape is unchanged — only `question_type` and `options` values differ.

---

## Step 7 — Duel Mode: Variant per Round

In `duel.socket.ts`, inside `broadcastQuestion()`, optionally rotate question type by round number
so players experience variety across a multi-round duel:

```typescript
const typesByRound: MCQVariant['question_type'][] = ['mcq', 'cloze', 'true_false', 'answer_mcq', 'mcq'];
const questionType = typesByRound[roundNumber % typesByRound.length];
const payload = formatQuestion(roundQuestion, questionType);

namespace.to(`duel:${matchId}`).emit('duel:question', {
  ...payload,
  round: roundNumber,
});
```

---

## Quality Guard (Optional but Recommended)

Before saving a variant, validate it is not trivially easy or broken.
Add this check inside the `cacheQuestions` variant generation loop:

```typescript
import { cosine } from 'ml-distance';
import { TfIdf } from 'natural';

function isGoodDistractor(correct: string, distractor: string): boolean {
  // Reject if too identical (edit distance < 3) or empty
  if (!distractor || distractor === correct) return false;
  if (Math.abs(correct.length - distractor.length) < 2 &&
      correct.toLowerCase() === distractor.toLowerCase()) return false;
  return true;
}

// In variant generation:
const validDistractors = distractors.filter(d => isGoodDistractor(correct, d));
if (validDistractors.length < 3) return null; // skip this variant
```

---

## Summary of Changes

```
backend/
├── prisma/
│   └── schema.prisma              ← add variants Json? field
├── src/
│   ├── utils/
│   │   └── questionFormatter.ts   ← add buildCloze, buildAnswerMCQ, buildTrueFalse
│   └── services/
│       └── question.service.ts    ← add findDistractorQuestions(), generate variants in cacheQuestions()
```

REST and WebSocket interfaces are **backwards compatible** — existing `'mcq'` type behaviour
is unchanged. New types are opt-in via `question_type` param or duel round rotation.

---

## Do Not Change

- `so.service.ts` — SO API fetching and bulk answer ingestion is correct as-is
- `duel.socket.ts` answer evaluation and ELO logic — untouched
- `game.controller.ts` answer submission and scoring — untouched
- Existing `buildMCQ()` / `formatQuestion()` signatures — extend, do not replace
