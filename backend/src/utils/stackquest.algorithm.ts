// =============================================================================
// StackQuest — Core Game Algorithm
// Version: 1.0.0
// Description: Handles answer evaluation, scoring, XP, leagues, levels & ELO.
// Drop this file into your backend/shared directory and import as needed.
// =============================================================================

// ---------------------------------------------------------------------------
// 1. TYPES & CONSTANTS
// ---------------------------------------------------------------------------

export type QuestionType = "mcq" | "fill_in_the_blank" | "string_answer";

export type League =
  | "Bronze"
  | "Silver"
  | "Gold"
  | "Platinum"
  | "Diamond"
  | "Master"
  | "Legend";

export type GameMode = "daily_challenge" | "puzzle" | "duel";

export interface EvaluationResult {
  isCorrect: boolean;
  similarityRatio: number; // 0.0 – 1.0
  method: "exact" | "substring" | "fuzzy" | "keyword_overlap" | "none";
  details: string;
}

export interface QuestionScoreResult {
  basePoints: number;
  timeBonus: number;
  streakMultiplier: number;
  totalScore: number;
  breakdown: string;
}

export interface XPResult {
  level: number;
  league: League;
  nextLeague: League | null;
  xpToNextLeague: number | null;
  progressPercent: number; // 0–100
}

export interface EloResult {
  myNewElo: number;
  opponentNewElo: number;
  myDelta: number;
  opponentDelta: number;
  expectedWinProbability: number; // 0.0 – 1.0
}

// ---------------------------------------------------------------------------
// CONSTANTS
// ---------------------------------------------------------------------------

/** ELO K-Factor — controls how quickly ratings change. */
const ELO_K_FACTOR = 32;

/** Starting ELO for all new duel players. */
const ELO_STARTING_RATING = 1000;

/** Maximum time per question in milliseconds for the time bonus calculation. */
const MAX_TIME_MS = 30_000;

/** Minimum character length for a string answer to be evaluated (not auto-zero). */
const STRING_ANSWER_MIN_CHARS = 10;

/** Levenshtein similarity threshold for fill-in-the-blank fuzzy matching. */
const FUZZY_THRESHOLD = 0.7;

/** Keyword overlap threshold for string answer evaluation. */
const KEYWORD_OVERLAP_THRESHOLD = 0.5;

/** XP awarded just for starting a game session. */
const XP_GAME_START = 5;

/** XP per correct answer for MCQ / fill-in-the-blank. */
const XP_PER_CORRECT = 10;

/** XP multiplier for string answers (similarity * this value). */
const XP_STRING_MULTIPLIER = 20;

const LEAGUE_THRESHOLDS: Record<League, number> = {
  Bronze:   0,
  Silver:   500,
  Gold:     1_500,
  Platinum: 3_000,
  Diamond:  5_000,
  Master:   8_000,
  Legend:   12_000,
};

const LEAGUE_ORDER: League[] = [
  "Bronze",
  "Silver",
  "Gold",
  "Platinum",
  "Diamond",
  "Master",
  "Legend",
];

// ---------------------------------------------------------------------------
// 2. ANSWER EVALUATION
// ---------------------------------------------------------------------------

/**
 * Master evaluation function. Routes to the correct evaluator based on
 * question type.
 *
 * @param questionType  - The type of question being evaluated.
 * @param playerAnswer  - Raw string submitted by the player.
 * @param correctAnswer - The reference / correct answer from the backend.
 * @returns             EvaluationResult with correctness, ratio, and method.
 *
 * @example
 * evaluateAnswer("mcq", "Python", "python");
 * // → { isCorrect: true, similarityRatio: 1, method: "exact", ... }
 */
export function evaluateAnswer(
  questionType: QuestionType,
  playerAnswer: string,
  correctAnswer: string
): EvaluationResult {
  switch (questionType) {
    case "mcq":
      return evaluateMCQ(playerAnswer, correctAnswer);
    case "fill_in_the_blank":
      return evaluateFillInTheBlank(playerAnswer, correctAnswer);
    case "string_answer":
      return evaluateStringAnswer(playerAnswer, correctAnswer);
  }
}

// --- MCQ -------------------------------------------------------------------

/**
 * Evaluates a Multiple Choice question answer.
 * Logic: trim + lowercase exact match only.
 */
function evaluateMCQ(
  playerAnswer: string,
  correctAnswer: string
): EvaluationResult {
  const p = playerAnswer.trim().toLowerCase();
  const c = correctAnswer.trim().toLowerCase();
  const isCorrect = p === c;

  return {
    isCorrect,
    similarityRatio: isCorrect ? 1 : 0,
    method: "exact",
    details: isCorrect
      ? `Exact match: "${p}" === "${c}".`
      : `No match: "${p}" !== "${c}".`,
  };
}

// --- Fill in the Blank -----------------------------------------------------

/**
 * Evaluates a fill-in-the-blank answer using a three-tier cascade:
 *   1. Exact (case-insensitive)
 *   2. Substring containment → similarity = 0.80
 *   3. Levenshtein fuzzy match → threshold ≥ 0.70
 */
function evaluateFillInTheBlank(
  playerAnswer: string,
  correctAnswer: string
): EvaluationResult {
  const p = playerAnswer.trim().toLowerCase();
  const c = correctAnswer.trim().toLowerCase();

  // Tier 1 — exact
  if (p === c) {
    return {
      isCorrect: true,
      similarityRatio: 1.0,
      method: "exact",
      details: "Case-insensitive exact match.",
    };
  }

  // Tier 2 — substring
  if (c.includes(p) || p.includes(c)) {
    return {
      isCorrect: true,
      similarityRatio: 0.8,
      method: "substring",
      details: `Substring match: one string contains the other. Assigned similarity 0.80.`,
    };
  }

  // Tier 3 — fuzzy (Levenshtein)
  const ratio = levenshteinSimilarity(p, c);
  const isCorrect = ratio >= FUZZY_THRESHOLD;

  return {
    isCorrect,
    similarityRatio: ratio,
    method: "fuzzy",
    details: `Levenshtein similarity: ${(ratio * 100).toFixed(1)}%. Threshold: ${
      FUZZY_THRESHOLD * 100
    }%. ${isCorrect ? "Passes." : "Fails — too many character edits required."}`,
  };
}

// --- String / Free Text ----------------------------------------------------

/**
 * Evaluates a free-text string answer via bag-of-words keyword intersection.
 *
 * Formula:  ratio = |Intersection(playerWords, refWords)| / |refWords|
 * Threshold: ≥ 0.50 to be marked correct.
 * Guard:     Answers under 10 characters score 0 immediately.
 */
function evaluateStringAnswer(
  playerAnswer: string,
  correctAnswer: string
): EvaluationResult {
  if (playerAnswer.trim().length < STRING_ANSWER_MIN_CHARS) {
    return {
      isCorrect: false,
      similarityRatio: 0,
      method: "none",
      details: `Answer is under ${STRING_ANSWER_MIN_CHARS} characters — automatically scores 0.`,
    };
  }

  const playerWords = tokenize(playerAnswer);
  const refWords = tokenize(correctAnswer);

  if (refWords.length === 0) {
    return {
      isCorrect: false,
      similarityRatio: 0,
      method: "none",
      details: "Reference answer is empty — cannot evaluate.",
    };
  }

  const playerSet = new Set(playerWords);
  const matchingWords = refWords.filter((w) => playerSet.has(w));
  const ratio = matchingWords.length / refWords.length;
  const isCorrect = ratio >= KEYWORD_OVERLAP_THRESHOLD;

  return {
    isCorrect,
    similarityRatio: ratio,
    method: "keyword_overlap",
    details: `Keyword overlap: ${matchingWords.length} of ${refWords.length} reference words matched. Ratio: ${(
      ratio * 100
    ).toFixed(1)}%. Threshold: ${KEYWORD_OVERLAP_THRESHOLD * 100}%. ${
      isCorrect ? "Passes." : "Fails — insufficient keyword coverage."
    }`,
  };
}

// ---------------------------------------------------------------------------
// 3. SCORING
// ---------------------------------------------------------------------------

/**
 * Calculates the total score for a single answered question.
 *
 * Formula: (basePoints + timeBonus) × streakMultiplier
 *
 * @param questionType    - Type of question answered.
 * @param isCorrect       - Whether the answer was marked correct.
 * @param timeTakenMs     - Milliseconds the player took to answer (0–30000).
 * @param currentStreak   - Number of consecutive correct answers before this one.
 * @param similarityRatio - Only needed for "string_answer" type (0.0 – 1.0).
 * @returns               QuestionScoreResult with full breakdown.
 *
 * @example
 * calculateQuestionScore("mcq", true, 8000, 6);
 * // → { basePoints: 20, timeBonus: 7, streakMultiplier: 2, totalScore: 54, ... }
 */
export function calculateQuestionScore(
  questionType: QuestionType,
  isCorrect: boolean,
  timeTakenMs: number,
  currentStreak: number,
  similarityRatio = 0
): QuestionScoreResult {
  if (!isCorrect) {
    return {
      basePoints: 0,
      timeBonus: 0,
      streakMultiplier: 1,
      totalScore: 0,
      breakdown: "Incorrect answer — no points awarded.",
    };
  }

  const basePoints = getBasePoints(questionType, similarityRatio);
  const timeBonus = calculateTimeBonus(timeTakenMs);
  const streakMultiplier = getStreakMultiplier(currentStreak);
  const totalScore = Math.round((basePoints + timeBonus) * streakMultiplier);

  return {
    basePoints,
    timeBonus,
    streakMultiplier,
    totalScore,
    breakdown: `(${basePoints} base + ${timeBonus} time bonus) × ${streakMultiplier}x streak = ${totalScore} pts`,
  };
}

/**
 * Returns base points for a question type.
 * For string answers, scales with similarity tier.
 */
function getBasePoints(
  questionType: QuestionType,
  similarityRatio: number
): number {
  switch (questionType) {
    case "mcq":
      return 20;
    case "fill_in_the_blank":
      return 25;
    case "string_answer":
      if (similarityRatio >= 0.85) return 60;
      if (similarityRatio >= 0.70) return 40;
      if (similarityRatio >= 0.50) return 25;
      if (similarityRatio >= 0.30) return 10;
      return 0;
  }
}

/**
 * Calculates time bonus out of 10 points based on speed.
 * Faster answer → higher bonus. At 30s or beyond → 0 bonus.
 *
 * Formula: Math.round(10 × max(0, 1 − (timeTakenMs / 30000)))
 */
function calculateTimeBonus(timeTakenMs: number): number {
  const clamped = Math.max(0, Math.min(timeTakenMs, MAX_TIME_MS));
  return Math.round(10 * Math.max(0, 1 - clamped / MAX_TIME_MS));
}

/**
 * Returns the streak multiplier for a given consecutive-correct-answer count.
 *
 * streak ≥ 13 → 5x
 * streak ≥ 10 → 3x
 * streak ≥  5 → 2x
 * streak  < 5 → 1x
 */
export function getStreakMultiplier(streak: number): number {
  if (streak >= 13) return 5;
  if (streak >= 10) return 3;
  if (streak >= 5)  return 2;
  return 1;
}

// ---------------------------------------------------------------------------
// 4. XP, LEVELS & LEAGUES (Solo modes only)
// ---------------------------------------------------------------------------

/**
 * Calculates XP earned from a single answer event.
 *
 * - MCQ / fill-in-the-blank correct: +10 XP
 * - String answer: similarity × 20 XP
 *
 * @param questionType    - Type of question.
 * @param isCorrect       - Whether the answer was correct.
 * @param similarityRatio - Similarity ratio for string answers (0.0 – 1.0).
 * @returns               XP earned for this answer.
 */
export function calculateAnswerXP(
  questionType: QuestionType,
  isCorrect: boolean,
  similarityRatio = 0
): number {
  if (!isCorrect) return 0;
  if (questionType === "string_answer") {
    return Math.round(similarityRatio * XP_STRING_MULTIPLIER);
  }
  return XP_PER_CORRECT;
}

/**
 * XP awarded at the start of any game session (regardless of performance).
 */
export function getSessionStartXP(): number {
  return XP_GAME_START;
}

/**
 * Calculates level, league, and progression from total cumulative XP.
 *
 * Level formula: floor(sqrt(totalXP / 100)) + 1
 *
 * @param totalXP - The player's total accumulated XP.
 * @returns       XPResult with level, league, and next-league progress.
 *
 * @example
 * calculateXPProgression(2200);
 * // → { level: 5, league: "Gold", nextLeague: "Platinum", xpToNextLeague: 800, progressPercent: 46 }
 */
export function calculateXPProgression(totalXP: number): XPResult {
  const xp = Math.max(0, totalXP);
  const level = Math.floor(Math.sqrt(xp / 100)) + 1;

  let currentLeague: League = "Bronze";
  for (const league of LEAGUE_ORDER) {
    if (xp >= LEAGUE_THRESHOLDS[league]) {
      currentLeague = league;
    }
  }

  const currentIndex = LEAGUE_ORDER.indexOf(currentLeague);
  const nextLeague: League | null =
    currentIndex < LEAGUE_ORDER.length - 1
      ? LEAGUE_ORDER[currentIndex + 1]
      : null;

  let xpToNextLeague: number | null = null;
  let progressPercent = 100;

  if (nextLeague) {
    const currentMin = LEAGUE_THRESHOLDS[currentLeague];
    const nextMin = LEAGUE_THRESHOLDS[nextLeague];
    xpToNextLeague = nextMin - xp;
    progressPercent = Math.round(((xp - currentMin) / (nextMin - currentMin)) * 100);
  }

  return {
    level,
    league: currentLeague,
    nextLeague,
    xpToNextLeague,
    progressPercent: Math.min(100, Math.max(0, progressPercent)),
  };
}

// ---------------------------------------------------------------------------
// 5. ELO RATING (Duel mode only)
// ---------------------------------------------------------------------------

/**
 * Calculates new ELO ratings for both players after a duel.
 *
 * Standard chess ELO formula:
 *   Expected = 1 / (1 + 10^((OpponentELO − PlayerELO) / 400))
 *   Δ ELO    = K × (Actual − Expected)   where K = 32
 *
 * @param myElo       - Current ELO of the local player.
 * @param opponentElo - Current ELO of the opponent.
 * @param didWin      - true if the local player won.
 * @returns           EloResult with new ratings and delta for both players.
 *
 * @example
 * calculateElo(1200, 1000, true);
 * // → { myNewElo: 1208, opponentNewElo: 992, myDelta: +8, ... }
 */
export function calculateElo(
  myElo: number,
  opponentElo: number,
  didWin: boolean
): EloResult {
  const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
  const actual = didWin ? 1 : 0;
  const myDelta = Math.round(ELO_K_FACTOR * (actual - expected));
  const opponentDelta = -myDelta; // zero-sum

  return {
    myNewElo: myElo + myDelta,
    opponentNewElo: opponentElo + opponentDelta,
    myDelta,
    opponentDelta,
    expectedWinProbability: expected,
  };
}

/**
 * Returns the default starting ELO for a new player entering duel mode.
 */
export function getStartingElo(): number {
  return ELO_STARTING_RATING;
}

// ---------------------------------------------------------------------------
// 6. SESSION MANAGER (in-memory, mirrors backend session logic)
// ---------------------------------------------------------------------------

export interface SessionState {
  sessionId: string;
  gameMode: GameMode;
  currentStreak: number;
  totalScore: number;
  totalXP: number;
  questionsAnswered: number;
  correctAnswers: number;
  startedAt: number; // Unix ms
}

/**
 * Creates a new in-memory game session.
 *
 * @param sessionId - Unique identifier for this session (e.g. UUID).
 * @param gameMode  - The mode being played.
 * @returns         A fresh SessionState.
 */
export function createSession(
  sessionId: string,
  gameMode: GameMode
): SessionState {
  return {
    sessionId,
    gameMode,
    currentStreak: 0,
    totalScore: 0,
    totalXP: XP_GAME_START, // 5 XP awarded just for starting
    questionsAnswered: 0,
    correctAnswers: 0,
    startedAt: Date.now(),
  };
}

/**
 * Processes a single answer submission and mutates (returns updated) session.
 *
 * This is the single function your API route should call after evaluation.
 * It handles score, XP, and streak bookkeeping in one place.
 *
 * @param session         - Current session state.
 * @param questionType    - Type of question just answered.
 * @param evalResult      - Result from evaluateAnswer().
 * @param timeTakenMs     - Time the player took on this question.
 * @returns               Updated SessionState + the question score breakdown.
 */
export function processAnswer(
  session: SessionState,
  questionType: QuestionType,
  evalResult: EvaluationResult,
  timeTakenMs: number
): { updatedSession: SessionState; scoreResult: QuestionScoreResult } {
  const scoreResult = calculateQuestionScore(
    questionType,
    evalResult.isCorrect,
    timeTakenMs,
    session.currentStreak,
    evalResult.similarityRatio
  );

  const xpEarned = calculateAnswerXP(
    questionType,
    evalResult.isCorrect,
    evalResult.similarityRatio
  );

  const updatedSession: SessionState = {
    ...session,
    questionsAnswered: session.questionsAnswered + 1,
    correctAnswers: evalResult.isCorrect
      ? session.correctAnswers + 1
      : session.correctAnswers,
    currentStreak: evalResult.isCorrect ? session.currentStreak + 1 : 0,
    totalScore: session.totalScore + scoreResult.totalScore,
    totalXP: session.totalXP + xpEarned,
  };

  return { updatedSession, scoreResult };
}

// ---------------------------------------------------------------------------
// 7. UTILITY FUNCTIONS
// ---------------------------------------------------------------------------

/**
 * Computes the Levenshtein edit distance between two strings.
 * Used internally by fill-in-the-blank fuzzy evaluation.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Allocate DP table
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Converts Levenshtein distance to a normalised 0–1 similarity ratio.
 * ratio = 1 − (distance / max(len_a, len_b))
 */
function levenshteinSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshteinDistance(a, b) / maxLen;
}

/**
 * Tokenises a string into a lowercase, punctuation-free array of unique words.
 * Used by the string-answer keyword-overlap evaluator.
 */
function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
    ),
  ];
}

// ---------------------------------------------------------------------------
// 8. QUICK USAGE REFERENCE
// ---------------------------------------------------------------------------
//
// ─── Evaluate an answer ───────────────────────────────────────────────────
//
//   import { evaluateAnswer, calculateQuestionScore, processAnswer,
//            calculateXPProgression, calculateElo, createSession } from "./stackquest.algorithm";
//
//   const eval = evaluateAnswer("fill_in_the_blank", "Pythn", "Python");
//   // → { isCorrect: true, similarityRatio: 0.83, method: "fuzzy", ... }
//
// ─── Score a question ────────────────────────────────────────────────────
//
//   const score = calculateQuestionScore("mcq", true, 8000, 6);
//   // → { basePoints: 20, timeBonus: 7, streakMultiplier: 2, totalScore: 54 }
//
// ─── Run a full session ───────────────────────────────────────────────────
//
//   let session = createSession("uuid-123", "puzzle");
//   const evalResult = evaluateAnswer("mcq", "Python", "python");
//   const { updatedSession, scoreResult } = processAnswer(session, "mcq", evalResult, 8000);
//
// ─── XP & League ─────────────────────────────────────────────────────────
//
//   const progression = calculateXPProgression(2200);
//   // → { level: 5, league: "Gold", nextLeague: "Platinum", xpToNextLeague: 800 }
//
// ─── ELO after a duel ────────────────────────────────────────────────────
//
//   const elo = calculateElo(1200, 1000, true);
//   // → { myNewElo: 1208, opponentNewElo: 992, myDelta: 8, opponentDelta: -8 }
//
// ─────────────────────────────────────────────────────────────────────────
