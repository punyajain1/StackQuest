import { logger } from '../utils/logger';
import type { EvaluationResult } from '../models/db.types';

/**
 * Evaluation service — handles answer checking for all question types.
 * No external API dependencies (HuggingFace removed).
 */
class EvaluationService {
  /** Evaluate MCQ: simple equality check. */
  evaluateMCQ(playerChoice: string, correctAnswer: string): { correct: boolean } {
    return { correct: playerChoice.toLowerCase().trim() === correctAnswer.toLowerCase().trim() };
  }

  /** Evaluate fill-in-blank: exact or fuzzy match. */
  evaluateFillInBlank(playerAnswer: string, correctAnswer: string): { correct: boolean; similarity: number } {
    const player = playerAnswer.toLowerCase().trim();
    const correct = correctAnswer.toLowerCase().trim();

    // Exact match
    if (player === correct) return { correct: true, similarity: 1.0 };

    // Contains match (answer is within the player's response)
    if (player.includes(correct) || correct.includes(player)) {
      return { correct: true, similarity: 0.8 };
    }

    // Levenshtein-based fuzzy match for typos
    const distance = this.levenshtein(player, correct);
    const maxLen = Math.max(player.length, correct.length);
    const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;

    return { correct: similarity >= 0.7, similarity };
  }

  /** Evaluate string answer: keyword overlap scoring. */
  evaluateStringAnswer(playerAnswer: string, referenceAnswer: string): EvaluationResult {
    if (playerAnswer.trim().length < 10) {
      return { similarity: 0, points: 0, label: 'off', feedback: '✍️ Your answer is too short to evaluate.' };
    }

    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const playerWords = new Set(normalize(playerAnswer));
    const refWords = normalize(referenceAnswer);

    if (refWords.length === 0) {
      return { similarity: 0, points: 0, label: 'off', feedback: 'Unable to evaluate answer.' };
    }

    const intersection = refWords.filter((w) => playerWords.has(w));
    const similarity = intersection.length / refWords.length;

    logger.debug({ similarity }, 'String answer evaluated');
    return { similarity, ...this.scoreToLabel(similarity) };
  }

  private scoreToLabel(sim: number): Omit<EvaluationResult, 'similarity'> {
    if (sim >= 0.85) return { points: 60, label: 'excellent', feedback: '🎯 Excellent! Your answer closely matches the solution.' };
    if (sim >= 0.70) return { points: 40, label: 'great', feedback: '✅ Great! You captured the key concepts.' };
    if (sim >= 0.50) return { points: 25, label: 'good', feedback: '👍 Good attempt! You got some important points.' };
    if (sim >= 0.30) return { points: 10, label: 'partial', feedback: '🤔 Partial credit. You were on the right track.' };
    return { points: 0, label: 'off', feedback: '❌ Your answer was quite different from the solution.' };
  }

  private levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
      const row = Array(n + 1).fill(0);
      row[0] = i;
      return row;
    });
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
    return dp[m][n];
  }
}

export const evaluationService = new EvaluationService();
