/**
 * Socket event name constants — single source of truth for client + server.
 * Clients should import this enum or use the string values directly.
 */

// ─── Duel namespace: /duel ────────────────────────────────────────────────────

export const DUEL = {
  // Client → Server
  JOIN:       'duel:join',         // { match_id: string }
  ANSWER:     'duel:answer',       // { round_number: number, answer: string, time_ms: number }
  FIND_MATCH: 'duel:find_match',   // { league?: string }  — enters matchmaking queue
  CANCEL_FIND:'duel:cancel_find',  // {} — leaves matchmaking queue

  // Server → Client
  STATE:          'duel:state',          // DuelState snapshot
  QUESTION:       'duel:question',       // GameQuestion for this round
  ROUND_RESULT:   'duel:round_result',   // { round_number, player1_correct, player2_correct, correct_answer, scores }
  OPPONENT_READY: 'duel:opponent_ready', // { username, avatar_url }
  TIMER:          'duel:timer',          // { round_number, seconds_remaining }
  COMPLETE:       'duel:complete',       // DuelResult
  MATCH_FOUND:    'duel:match_found',    // { match_id, opponent: { username, elo, league, avatar_url } }
  QUEUE_STATUS:   'duel:queue_status',   // { position, league, searching: boolean }
  ERROR:          'duel:error',          // { message: string }
} as const;

// ─── Daily Challenge namespace: /daily ────────────────────────────────────────

export const DAILY = {
  // Client → Server
  JOIN:   'daily:join',    // {} (auth token in handshake)
  SUBMIT: 'daily:submit',  // { question_number: number, answer: string, time_ms: number }

  // Server → Client
  QUESTION: 'daily:question', // { question_number, total, ...GameQuestion }
  RESULT:   'daily:result',   // { correct, score_earned, xp_earned, feedback, correct_answer, snapshot }
  TIMER:    'daily:timer',    // { question_number, seconds_remaining }
  COMPLETE: 'daily:complete', // { total_score, correct_count, xp_earned, accuracy, rank }
  ERROR:    'daily:error',    // { message: string }
} as const;
