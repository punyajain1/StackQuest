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
import nlp from 'compromise';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import { TfIdf } from 'natural';

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

// ─── MCQ types & validation ──────────────────────────────────────────────────

export interface MCQVariant {
  question_type: 'mcq' | 'cloze' | 'answer_mcq' | 'true_false';
  question_text: string;
  options: string[];
  correct_answer: string;
  time_limit: number;
}

function isGoodDistractor(correct: string, distractor: string): boolean {
  if (!distractor || distractor.trim() === '') return false;
  const c = correct.toLowerCase().trim();
  const d = distractor.toLowerCase().trim();
  if (c === d) return false;
  if (Math.abs(c.length - d.length) < 2 && (c.includes(d) || d.includes(c))) return false;
  return true;
}

/**
 * Given a question and a pool, returns 3–6 questions that are
 * topically related but not identical — ideal distractor sources.
 *
 * Strategy: skip the top 2 most similar (too close = giveaway),
 * take the next 6 (same topic, different answer = plausible wrong options).
 */
export function findDistractorQuestions(
  question: any,
  pool: any[]
): any[] {
  if (!pool || pool.length === 0) return [];
  const tfidf = new TfIdf();

  pool.forEach(q =>
    tfidf.addDocument(`${q.title} ${q.tags.join(' ')}`)
  );

  const scores: { q: any; score: number }[] = [];
  const qId = question.questionId ?? question.question_id;

  tfidf.tfidfs(`${question.title} ${question.tags.join(' ')}`, (i, score) => {
    const pId = pool[i].questionId ?? pool[i].question_id;
    if (pId !== qId) {
      scores.push({ q: pool[i], score });
    }
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(2, 8) // skip top 2 (too similar), use next 6
    .map(s => s.q);
}

// ─── MCQ builders ─────────────────────────────────────────────────────────────

/**
 * Builds an MCQ question from a SO question.
 */
export function buildTagMCQ(
  question: SoQuestion,
  pool: SoQuestion[]
): MCQVariant {
  const correct = question.tags[0] ?? 'unknown';

  // Gather unique distractor tags from the pool, not overlapping with this question's tags
  const distractors: string[] = [];
  const seen = new Set(question.tags);
  seen.add(correct);

  for (const q of pool) {
    for (const tag of q.tags) {
      if (!seen.has(tag) && isGoodDistractor(correct, tag)) {
        distractors.push(tag);
        seen.add(tag);
      }
    }
    if (distractors.length >= 3) break;
  }

  // Pad if not enough distractors
  const fallbacks = ['python', 'javascript', 'c++', 'java', 'rust', 'go', 'php', 'ruby'];
  for (const f of fallbacks) {
    if (!seen.has(f) && isGoodDistractor(correct, f)) { distractors.push(f); seen.add(f); }
    if (distractors.length >= 3) break;
  }

  const options = shuffle([correct, ...distractors.slice(0, 3)]);

  const decodedTitle = decodeEntities(question.title);
  const bodyExcerpt = excerptBody(question.body, 350);
  const questionText = bodyExcerpt
    ? `Which technology tag best describes this question?\n\nTitle: ${decodedTitle}\n\n${bodyExcerpt}`
    : `Which technology tag best describes this question?\n\nTitle: ${decodedTitle}`;

  return {
    question_type: 'mcq',
    question_text: questionText,
    options,
    correct_answer: correct,
    time_limit: 20,
  };
}

export function buildMCQ(question: SoQuestion, pool: SoQuestion[]): GameQuestion {
  const variant = buildTagMCQ(question, pool);
  return {
    question,
    question_type: 'mcq',
    options: variant.options,
    time_limit: variant.time_limit,
    question_text: variant.question_text,
    correct_answer: variant.correct_answer,
    hint: `Tags on this question: ${question.tags.slice(0, 2).join(', ')}`,
  };
}

// ─── Cloze Builder ────────────────────────────────────────────────────────────

export function buildCloze(
  question: SoQuestion,
  pool: SoQuestion[]
): MCQVariant | null {
  const doc = nlp(question.title);
  const nouns = doc.nouns().out('array') as string[];

  if (nouns.length === 0) return null; // fallback

  const keyword = nouns[0];
  const stem = question.title.replace(keyword, '_____');

  const distractors = pool
    .map(q => {
      const d = nlp(q.title);
      const ns = d.nouns().out('array') as string[];
      return ns[0] ?? null;
    })
    .filter((n): n is string => n !== null && isGoodDistractor(keyword, n));

  const uniqueDistractors = Array.from(new Set(distractors));

  // Pad if not enough distractors
  const fallbacks = ['function', 'class', 'object', 'variable', 'array', 'string', 'promise', 'loop'];
  for (const f of fallbacks) {
    if (uniqueDistractors.length < 3 && isGoodDistractor(keyword, f) && !uniqueDistractors.includes(f)) {
      uniqueDistractors.push(f);
    }
  }

  if (uniqueDistractors.length < 3) return null;

  const options = shuffle([keyword, ...uniqueDistractors.slice(0, 3)]);

  return {
    question_type: 'cloze',
    question_text: `Fill in the blank:\n\n"${stem}"`,
    options,
    correct_answer: keyword,
    time_limit: 20,
  };
}

// ─── Answer Comprehension MCQ ──────────────────────────────────────────────────

export function buildAnswerMCQ(
  question: SoQuestion,
  pool: SoQuestion[]
): MCQVariant | null {
  const body = question.top_answer_body ?? (question as any).topAnswerBody;
  if (!body) return null;

  const markdown = NodeHtmlMarkdown.translate(body);
  const plainText = markdown.replace(/```[\s\S]*?```/g, '[code block]');
  const firstSentence = plainText.split(/[.!?]/)[0]?.trim();

  if (!firstSentence || firstSentence.length < 30) return null;

  const correct = question.tags[0];
  const distractors = pool
    .map(q => q.tags[0])
    .filter(t => t && isGoodDistractor(correct, t));

  const uniqueDistractors = Array.from(new Set(distractors));

  // Pad if not enough distractors
  const fallbacks = ['python', 'javascript', 'c++', 'java', 'rust', 'go', 'php', 'ruby'];
  for (const f of fallbacks) {
    if (uniqueDistractors.length < 3 && isGoodDistractor(correct, f) && !uniqueDistractors.includes(f)) {
      uniqueDistractors.push(f);
    }
  }

  if (uniqueDistractors.length < 3) return null;

  const options = shuffle([correct, ...uniqueDistractors.slice(0, 3)]);

  return {
    question_type: 'answer_mcq',
    question_text: `Which technology does this answer describe?\n\n"${firstSentence}..."`,
    options,
    correct_answer: correct,
    time_limit: 25,
  };
}

// ─── True / False Builder ─────────────────────────────────────────────────────

export function buildTrueFalse(
  question: SoQuestion,
  pool: SoQuestion[]
): MCQVariant | null {
  const correctTag = question.tags[0];
  if (!correctTag) return null;

  const distractor = pool.find(q => !q.tags.includes(correctTag))?.tags[0];
  if (!distractor) return null;

  const isTrue = Math.random() > 0.5;
  const displayTag = isTrue ? correctTag : distractor;
  const stem = question.title.toLowerCase().includes(correctTag.toLowerCase())
    ? question.title.replace(new RegExp(escapeRegex(correctTag), 'gi'), displayTag)
    : `Is "${displayTag}" the primary technology in: "${question.title}"?`;

  return {
    question_type: 'true_false',
    question_text: stem,
    options: ['True', 'False'],
    correct_answer: isTrue ? 'True' : 'False',
    time_limit: 10,
  };
}

// ─── Fill-in-blank builder ────────────────────────────────────────────────────

/**
 * Builds a fill-in-blank question from a SO question title.
 */
export function buildFillInBlank(question: SoQuestion): GameQuestion {
  const title = decodeEntities(question.title);

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
 */
export function buildStringAnswer(question: SoQuestion): GameQuestion {
  const decodedTitle = decodeEntities(question.title);
  const bodyExcerpt = excerptBody(question.body, 500);

  const questionText = bodyExcerpt
    ? `${decodedTitle}\n\n${bodyExcerpt}`
    : decodedTitle;

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
 */
export function formatQuestion(
  question: SoQuestion,
  type: QuestionType | 'cloze' | 'answer_mcq' | 'true_false',
  pool: SoQuestion[] = []
): GameQuestion {
  // Use pre-generated variant if available
  const stored = (question as any).variants as Record<string, MCQVariant> | null;
  const key = type === 'true_false' ? (stored?.true_false ? 'true_false' : 'tf') : 
              (type === 'answer_mcq' ? (stored?.answer_mcq ? 'answer_mcq' : 'answer') : type);
  if (stored?.[key]) {
    const sVar = stored[key];
    return {
      question,
      question_type: sVar.question_type as any,
      question_text: sVar.question_text,
      options: sVar.options,
      correct_answer: sVar.correct_answer,
      time_limit: sVar.time_limit,
      hint: type === 'mcq' ? `Tags on this question: ${question.tags.slice(0, 2).join(', ')}` : undefined,
    };
  }

  // Fallback: generate live (only happens before cacheQuestions has run variants)
  const distractorPool = findDistractorQuestions(question, pool);
  let variant: MCQVariant | null = null;
  switch (type) {
    case 'cloze':
      variant = buildCloze(question, distractorPool);
      break;
    case 'answer_mcq':
      variant = buildAnswerMCQ(question, distractorPool);
      break;
    case 'true_false':
      variant = buildTrueFalse(question, distractorPool);
      break;
    case 'mcq':
      variant = buildTagMCQ(question, distractorPool.length > 0 ? distractorPool : pool);
      break;
  }

  if (variant) {
    return {
      question,
      question_type: variant.question_type as any,
      question_text: variant.question_text,
      options: variant.options,
      correct_answer: variant.correct_answer,
      time_limit: variant.time_limit,
      hint: type === 'mcq' ? `Tags on this question: ${question.tags.slice(0, 2).join(', ')}` : undefined,
    };
  }

  // Final fallback
  if (type === 'fill_in_blank') return buildFillInBlank(question);
  if (type === 'string_answer') return buildStringAnswer(question);
  return buildMCQ(question, pool);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
