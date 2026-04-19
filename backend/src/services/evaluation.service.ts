import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { AppError } from '../utils/AppError';
import type { EvaluationResult } from '../models/db.types';

interface HFFeatureExtractionResponse {
  error?: string;
  estimated_time?: number;
}

/**
 * Compute cosine similarity between two embedding vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Map similarity score to gameplay label and feedback.
 */
function scoreToLabel(sim: number): Omit<EvaluationResult, 'similarity'> {
  if (sim >= 0.85)
    return {
      points: 60,
      label: 'excellent',
      feedback: '🎯 Excellent! Your answer closely matches the accepted solution.',
    };
  if (sim >= 0.70)
    return {
      points: 40,
      label: 'great',
      feedback: '✅ Great! You captured the key concepts well.',
    };
  if (sim >= 0.50)
    return {
      points: 25,
      label: 'good',
      feedback: '👍 Good attempt! You got some important points.',
    };
  if (sim >= 0.30)
    return {
      points: 10,
      label: 'partial',
      feedback: '🤔 Partial credit. You were on the right track.',
    };
  return {
    points: 0,
    label: 'off',
    feedback: '❌ Your answer was quite different from the accepted solution.',
  };
}

class EvaluationService {
  private hfApiUrl: string;

  constructor() {
    this.hfApiUrl = `https://api-inference.huggingface.co/models/${env.HF_MODEL}`;
  }

  /**
   * Get sentence embeddings from HuggingFace Inference API.
   * Handles "model loading" responses with retry.
   */
  private async getEmbeddings(texts: string[]): Promise<number[][]> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        const response = await axios.post(
          this.hfApiUrl,
          { inputs: texts, options: { wait_for_model: true } },
          {
            headers: {
              Authorization: `Bearer ${env.HUGGINGFACE_API_KEY}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          }
        );

        const data = response.data as number[][] | HFFeatureExtractionResponse;

        // Model loading response
        if (!Array.isArray(data) && data.error) {
          const wait = (data.estimated_time ?? 20) * 1000;
          logger.info({ attempt, wait }, 'HF model loading, waiting...');
          await new Promise((r) => setTimeout(r, wait));
          attempt++;
          continue;
        }

        return data as number[][];
      } catch (err) {
        logger.error({ err, attempt }, 'HuggingFace embedding request failed');
        if (attempt === maxRetries - 1) {
          throw new AppError(
            'Answer evaluation service temporarily unavailable',
            503,
            'HF_UNAVAILABLE'
          );
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
        attempt++;
      }
    }

    throw new AppError('Failed to get embeddings after retries', 503, 'HF_RETRY_EXHAUSTED');
  }

  /**
   * Evaluate a player's answer against the reference (accepted SO answer).
   * Returns similarity score (0–1), points earned, label, and feedback.
   */
  async evaluateAnswer(
    playerAnswer: string,
    referenceAnswer: string
  ): Promise<EvaluationResult> {
    // Minimum length check
    if (playerAnswer.trim().length < 10) {
      return {
        similarity: 0,
        points: 0,
        label: 'off',
        feedback: '✍️ Your answer is too short to evaluate. Try to be more detailed.',
      };
    }

    // Truncate to avoid token limits
    const playerTrimmed = playerAnswer.slice(0, 512);
    const refTrimmed = referenceAnswer.slice(0, 512);

    const embeddings = await this.getEmbeddings([playerTrimmed, refTrimmed]);
    const similarity = cosineSimilarity(embeddings[0], embeddings[1]);
    const result = scoreToLabel(similarity);

    logger.debug({ similarity, label: result.label }, 'Answer evaluated');

    return { similarity, ...result };
  }

  /**
   * Keyword-based fallback evaluation (no API call).
   * Used when HuggingFace is unavailable.
   */
  evaluateAnswerFallback(
    playerAnswer: string,
    referenceAnswer: string
  ): EvaluationResult {
    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

    const playerWords = new Set(normalize(playerAnswer));
    const refWords = normalize(referenceAnswer);

    if (refWords.length === 0) {
      return { similarity: 0, points: 0, label: 'off', feedback: 'Unable to evaluate answer.' };
    }

    const intersection = refWords.filter((w) => playerWords.has(w));
    const similarity = intersection.length / refWords.length;
    return { similarity, ...scoreToLabel(similarity) };
  }
}

export const evaluationService = new EvaluationService();
