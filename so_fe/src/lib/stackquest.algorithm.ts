// StackQuest answer evaluation engine — mirrors backend validation schema.
// Three question types: mcq | fill_in_blank | string_answer.

export type QuestionType = "mcq" | "fill_in_blank" | "string_answer";

export interface Question {
  id: string;
  type: QuestionType;
  prompt: string;
  code?: string;
  language?: string;
  // mcq
  options?: string[];
  // canonical answer string (mcq: the correct option text; fill: target token; string: reference doc text)
  answer: string;
  // optional reference keywords for string_answer evaluation
  referenceKeywords?: string[];
  explanation?: string;
}

const norm = (s: string) => s.trim().toLowerCase();

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const x = norm(a), y = norm(b);
  if (!x && !y) return 1;
  const dist = levenshtein(x, y);
  return 1 - dist / Math.max(x.length, y.length);
}

export function tokenize(s: string): string[] {
  return norm(s)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function keywordOverlap(submission: string, reference: string[]): number {
  const subTokens = new Set(tokenize(submission));
  const refTokens = new Set(reference.flatMap(tokenize));
  if (refTokens.size === 0) return 0;
  let hit = 0;
  for (const t of refTokens) if (subTokens.has(t)) hit++;
  return hit / refTokens.size;
}

export interface EvaluationResult {
  correct: boolean;
  score: number; // 0..1 confidence
  reason: string;
}

export function evaluateAnswer(q: Question, submission: string): EvaluationResult {
  const sub = (submission ?? "").trim();
  if (q.type === "mcq") {
    const ok = norm(sub) === norm(q.answer);
    return { correct: ok, score: ok ? 1 : 0, reason: ok ? "exact match" : "wrong option" };
  }
  if (q.type === "fill_in_blank") {
    if (!sub) return { correct: false, score: 0, reason: "empty" };
    if (norm(sub) === norm(q.answer)) return { correct: true, score: 1, reason: "exact" };
    if (norm(q.answer).includes(norm(sub)) || norm(sub).includes(norm(q.answer)))
      return { correct: true, score: 0.9, reason: "substring" };
    const sim = levenshteinSimilarity(sub, q.answer);
    if (sim >= 0.7) return { correct: true, score: sim, reason: `levenshtein ${sim.toFixed(2)}` };
    return { correct: false, score: sim, reason: `levenshtein ${sim.toFixed(2)} < 0.70` };
  }
  // string_answer
  if (sub.length < 10) return { correct: false, score: 0, reason: "answer too short (<10 chars)" };
  const refKeywords = q.referenceKeywords ?? tokenize(q.answer);
  const overlap = keywordOverlap(sub, refKeywords);
  return {
    correct: overlap >= 0.5,
    score: overlap,
    reason: `keyword overlap ${(overlap * 100).toFixed(0)}%`,
  };
}
