/**
 * questionFormatter.ts
 *
 * Converts raw Stack Overflow API data into game questions.
 *
 * SO API field mapping (based on official docs + live API testing):
 *  - question.title          → plain text, always present
 *  - question.body           → HTML (needs withbody/custom filter)
 *  - question.body_markdown  → raw markdown (needs custom filter only)
 *  - question.tags           → string[] e.g. ["javascript","arrays"]
 *  - question.score          → vote count (upvotes - downvotes)
 *  - answer.body             → HTML top answer
 *  - answer.body_markdown    → raw markdown (needs custom filter)
 *  - answer.score            → upvotes on this answer
 *  - answer.is_accepted      → boolean
 *  - answer.owner.display_name → answerer username
 *
 * Question generation strategy:
 *  - MCQ          → Uses tags[]: correct = tags[0], distractors from other questions
 *  - fill_in_blank → Replaces tags[0] in title with "___"
 *  - string_answer → Shows title + body excerpt, evaluates against top_answer_body
 */

import type { SoQuestion, GameQuestion, QuestionType } from '../models/db.types';

// ─── HTML → clean text ────────────────────────────────────────────────────────

/**
 * Converts SO HTML body to human-readable plain text for display.
 * Preserves inline code wrapped in backticks and code blocks as-is.
 */
export function stripHtml(html: string): string {
  if (!html) return '';
  return html
    // Code blocks → wrap with triple backticks
    .replace(/<pre[^>]*><code[^>]*>([\s\S]*?)<\/code><\/pre>/gi, (_, code) =>
      `\`\`\`\n${decodeEntities(code.trim())}\n\`\`\``)
    // Inline code → wrap with single backtick
    .replace(/<code>([\s\S]*?)<\/code>/gi, (_, code) => `\`${decodeEntities(code)}\``)
    // Block elements → newlines
    .replace(/<\/?(p|div|li|ul|ol|br|h[1-6]|blockquote)[^>]*>/gi, '\n')
    // Strip remaining HTML tags
    .replace(/<[^>]+>/g, '')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
    // Collapse whitespace but preserve intentional newlines
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

/** Get first N chars of a stripped body, ending at a sentence boundary. */
export function excerptBody(html: string, maxChars = 400): string {
  const text = stripHtml(html);
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf('.', maxChars);
  return (cut > 100 ? text.slice(0, cut + 1) : text.slice(0, maxChars)) + '…';
}

// ─── Question type config ─────────────────────────────────────────────────────

const TIME_LIMITS: Record<QuestionType, number> = {
  mcq: 20,           // seconds — fastest, just pick one
  fill_in_blank: 30, // a bit more thinking
  string_answer: 90, // free-form — needs time to type
};

// ─── MCQ builder ─────────────────────────────────────────────────────────────

/**
 * Builds an MCQ question from a SO question.
 *
 * Question text: "Which technology tag best describes this question?"
 * Body context:  First 400 chars of stripped question body
 * Correct answer: tags[0] (primary tag)
 * Distractors: tags from other unrelated questions in the pool
 */
export function buildMCQ(question: SoQuestion, pool: SoQuestion[]): GameQuestion {
  const correct = question.tags[0] ?? 'unknown';

  // Gather unique distractor tags from the pool, not overlapping with this question's tags
  const distractors: string[] = [];
  const seen = new Set(question.tags);
  seen.add(correct);

  for (const q of pool) {
    for (const tag of q.tags) {
      if (!seen.has(tag) && distractors.length < 3) {
        distractors.push(tag);
        seen.add(tag);
      }
    }
    if (distractors.length >= 3) break;
  }

  // Pad if not enough distractors
  const fallbacks = ['python', 'javascript', 'c++', 'java', 'rust', 'go', 'php', 'ruby'];
  for (const f of fallbacks) {
    if (!seen.has(f)) { distractors.push(f); seen.add(f); }
    if (distractors.length >= 3) break;
  }

  const options = shuffle([correct, ...distractors.slice(0, 3)]);

  const bodyExcerpt = excerptBody(question.body, 350);
  const questionText = bodyExcerpt
    ? `${question.title}\n\n${bodyExcerpt}`
    : question.title;

  return {
    question,
    question_type: 'mcq',
    options,
    time_limit: TIME_LIMITS.mcq,
    question_text: questionText,
    correct_answer: correct,
    hint: `Tags on this question: ${question.tags.slice(0, 2).join(', ')}`,
  };
}

// ─── Fill-in-blank builder ────────────────────────────────────────────────────

/**
 * Builds a fill-in-blank question from a SO question title.
 *
 * Strategy:
 *  1. Check if tags[0] appears as a word in the title → replace with "___"
 *  2. Otherwise find the most significant noun (longest word > 4 chars that
 *     is a technology/language keyword) → replace with "___"
 *  3. Fallback: replace last word in title
 *
 * Example:
 *  title: "How do I remove a specific value from an array in JavaScript?"
 *  tag:   "javascript"
 *  output: "How do I remove a specific value from an array in ___?"
 *  answer: "JavaScript"
 */
export function buildFillInBlank(question: SoQuestion): GameQuestion {
  const title = question.title;

  let correctAnswer = '';
  let blankText = '';

  // Strategy 1: tag[0] appears literally in title (case-insensitive)
  for (const tag of question.tags) {
    const regex = new RegExp(`\\b${escapeRegex(tag)}\\b`, 'i');
    if (regex.test(title)) {
      correctAnswer = title.match(regex)![0]; // preserve original casing
      blankText = title.replace(regex, '___');
      break;
    }
  }

  // Strategy 2: find a significant technical keyword in the title
  if (!correctAnswer) {
    const techKeywords = /\b(function|class|array|object|string|loop|async|promise|callback|closure|prototype|inherit|interface|generic|pointer|memory|thread|socket|request|response|module|import|export|type|enum|struct|trait|lambda|decorator|annotation|exception|error|null|undefined|boolean|integer|float|double)\b/i;
    const match = title.match(techKeywords);
    if (match) {
      correctAnswer = match[0];
      blankText = title.replace(match[0], '___');
    }
  }

  // Strategy 3: longest word > 4 chars that isn't a stop word
  if (!correctAnswer) {
    const stopWords = new Set(['what', 'which', 'when', 'where', 'have', 'this', 'that', 'from', 'with', 'will', 'does', 'using', 'does', 'should', 'would', 'could', 'cannot', 'between', 'without', 'after', 'before']);
    const words = title.split(/\s+/).filter(w => w.length > 4 && !stopWords.has(w.toLowerCase()));
    if (words.length > 0) {
      words.sort((a, b) => b.length - a.length);
      correctAnswer = words[0].replace(/[?!.,;:]$/, '');
      blankText = title.replace(correctAnswer, '___');
    }
  }

  // Ultimate fallback
  if (!correctAnswer) {
    const parts = title.split(' ');
    correctAnswer = parts[parts.length - 1].replace(/[?!.,;:]$/, '');
    blankText = parts.slice(0, -1).join(' ') + ' ___';
  }

  const bodyExcerpt = excerptBody(question.body, 250);
  const displayText = bodyExcerpt
    ? `Fill in the blank:\n\n${blankText}\n\nContext: ${bodyExcerpt}`
    : `Fill in the blank:\n\n${blankText}`;

  return {
    question,
    question_type: 'fill_in_blank',
    blank_text: blankText,
    time_limit: TIME_LIMITS.fill_in_blank,
    question_text: displayText,
    correct_answer: correctAnswer,
    hint: `Related to: ${question.tags.slice(0, 3).join(', ')}`,
  };
}

// ─── String Answer builder ────────────────────────────────────────────────────

/**
 * Builds a string-answer question from a SO question + top answer.
 *
 * Question text: title + body excerpt (first 500 chars, stripped HTML)
 * Hint: "Top answer by {author} has {score} upvotes"
 * correct_reference: stripped top_answer_body for keyword-overlap evaluation
 */
export function buildStringAnswer(question: SoQuestion): GameQuestion {
  const bodyExcerpt = excerptBody(question.body, 500);

  const questionText = bodyExcerpt
    ? `${question.title}\n\n${bodyExcerpt}`
    : question.title;

  // Correct answer is the top answer body (stripped) — used for evaluation
  const correctAnswer = question.top_answer_body
    ? stripHtml(question.top_answer_body)
    : question.body_markdown || stripHtml(question.body);

  const hint = question.top_answer_author
    ? `Hint: Top answer by ${question.top_answer_author} has ${question.top_answer_score ?? '?'} upvotes`
    : undefined;

  return {
    question,
    question_type: 'string_answer',
    time_limit: TIME_LIMITS.string_answer,
    question_text: questionText,
    correct_answer: correctAnswer,
    hint,
  };
}

// ─── Main formatter ───────────────────────────────────────────────────────────

/**
 * Format a SO question into a GameQuestion for any question type.
 * Pass pool[] for MCQ distractor generation.
 */
export function formatQuestion(
  question: SoQuestion,
  type: QuestionType,
  pool: SoQuestion[] = []
): GameQuestion {
  switch (type) {
    case 'mcq':          return buildMCQ(question, pool);
    case 'fill_in_blank': return buildFillInBlank(question);
    case 'string_answer': return buildStringAnswer(question);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
