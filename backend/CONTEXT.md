# StackQuest Backend — Full Context Document

> **Last updated:** May 2026  
> Runtime: Node.js + TypeScript | Framework: Express 5 | DB: PostgreSQL (Neon) via Prisma | Realtime: Socket.io

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Directory Structure](#2-directory-structure)
3. [Environment Variables](#3-environment-variables)
4. [Database & Prisma](#4-database--prisma)
5. [Entry Points](#5-entry-points)
6. [Middleware Stack](#6-middleware-stack)
7. [Authentication System](#7-authentication-system)
8. [REST API — All Endpoints](#8-rest-api--all-endpoints)
9. [Game Modes — How They Work](#9-game-modes--how-they-work)
10. [Core Algorithm](#10-core-algorithm)
11. [Question Pipeline](#11-question-pipeline)
12. [Socket.io — Realtime Layer](#12-socketio--realtime-layer)
13. [Services Reference](#13-services-reference)
14. [Response Shapes](#14-response-shapes)
15. [Known Bugs & Notes](#15-known-bugs--notes)
16. [Running Tests](#16-running-tests)

---

## 1. Architecture Overview

```
Client (Mobile / Web)
       │
       ├── HTTPS REST  →  Express App (src/app.ts)
       │                       │
       │                  Middleware stack
       │                  Routes → Controllers → Services → Prisma → PostgreSQL
       │
       └── WebSocket   →  Socket.io Server (src/socket/socket.server.ts)
                               │
                          /duel namespace  → duel.socket.ts
                          /daily namespace → daily.socket.ts
```

**Key design decisions:**
- In-memory `Map<sessionId, ActiveSession>` holds live puzzle/daily session state. Persisted to DB only on `endSession`.
- Duel questions are pre-generated at match creation and stored in `duel_questions` table. The socket layer drives the realtime flow.
- The **stackquest.algorithm.ts** is the single source of truth for all scoring, XP, league, and ELO math.

---

## 2. Directory Structure

```
backend/
├── src/
│   ├── app.ts                  # Express app config (no server.listen here)
│   ├── server.ts               # Starts HTTP server + cron jobs
│   ├── config/
│   │   ├── env.ts              # Zod-validated env vars
│   │   └── prisma.ts           # Prisma client singleton
│   ├── controllers/            # Route handlers (thin — just parse + call service)
│   │   ├── auth.controller.ts
│   │   ├── game.controller.ts
│   │   ├── duel.controller.ts
│   │   ├── scores.controller.ts
│   │   ├── user.controller.ts
│   │   └── friend.controller.ts
│   ├── services/               # Business logic
│   │   ├── auth.service.ts
│   │   ├── game.service.ts     ← puzzle + daily session state machine
│   │   ├── duel.service.ts     ← duel match lifecycle + ELO
│   │   ├── question.service.ts ← question fetching + caching
│   │   ├── score.service.ts    ← leaderboard + user stats
│   │   ├── so.service.ts       ← Stack Overflow API client
│   │   ├── achievement.service.ts
│   │   ├── friend.service.ts
│   │   ├── evaluation.service.ts
│   │   └── matchmaking.service.ts
│   ├── routes/                 # Express routers
│   ├── middleware/
│   │   ├── auth.middleware.ts  # requireAuth / optionalAuth
│   │   ├── error.middleware.ts # Global error handler
│   │   ├── rateLimit.middleware.ts
│   │   └── validate.middleware.ts # Zod body/query validation
│   ├── socket/
│   │   ├── socket.server.ts    # Socket.io server + httpServer export
│   │   ├── duel.socket.ts      # Duel namespace handlers
│   │   ├── daily.socket.ts     # Daily challenge namespace handlers
│   │   └── events.ts           # DUEL.* / DAILY.* event name constants
│   ├── models/
│   │   └── db.types.ts         # App-level types (API shapes, not Prisma models)
│   ├── utils/
│   │   ├── stackquest.algorithm.ts  # ALL scoring/XP/ELO math
│   │   ├── questionFormatter.ts     # SO question → GameQuestion
│   │   ├── AppError.ts
│   │   ├── logger.ts           # pino logger
│   │   └── cache.ts
│   │   └── __tests__/
│   │       ├── run_tests.ts         # Unit tests (no DB)
│   │       └── integration.test.ts  # E2E tests (real DB)
│   └── jobs/                   # node-cron jobs
├── generated/prisma/           # Auto-generated Prisma client
├── prisma/schema.prisma
└── package.json
```

---

## 3. Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string (Neon) |
| `JWT_SECRET` | ✅ | — | ≥ 16 chars, signs access tokens (7d expiry) |
| `JWT_REFRESH_SECRET` | ✅ | — | ≥ 16 chars, signs refresh tokens (30d expiry) |
| `PORT` | — | `3000` | HTTP port |
| `NODE_ENV` | — | `development` | `development` / `production` / `test` |
| `SO_API_KEY` | — | `''` | Stack Overflow API key (higher rate limit) |
| `SO_API_BASE` | — | `https://api.stackexchange.com/2.3` | SO API base URL |
| `DUEL_ROUNDS` | — | `5` | Questions per duel match |
| `DUEL_TIME_LIMIT_SECS` | — | `30` | Seconds per duel round |
| `DAILY_QUESTION_COUNT` | — | `10` | Questions in daily challenge |
| `QUESTION_POOL_MIN` | — | `50` | Min questions in cache before refresh |
| `CACHE_TTL_SECONDS` | — | `86400` | Question cache TTL |

---

## 4. Database & Prisma

**Database:** PostgreSQL hosted on Neon (serverless, uses `@prisma/adapter-neon`).

### Key Tables

| Table | Purpose |
|---|---|
| `users` | User accounts (elo, xp, level, league, streaks, stats) |
| `game_sessions` | Completed puzzle / daily sessions |
| `question_answers` | Individual answer records per session |
| `so_question_cache` | Cached Stack Overflow questions |
| `daily_challenges` | Fixed 10-question set per UTC day |
| `duel_matches` | Match state (scores, ELO changes, winner) |
| `duel_questions` | Per-round questions pre-generated at match creation |
| `leaderboard_entries` | Score rows (linked to session via FK) |
| `achievements` | Achievement definitions |
| `user_achievements` | Unlocked achievements per user |
| `friendships` | Friend relationships |

### Prisma Usage
```ts
import { prisma } from '../config/prisma'; // singleton
// Always use Prisma types from:
import type { GameSession } from '../../generated/prisma';
// App-level API types from:
import type { UserProfile, DuelState } from '../models/db.types';
```

---

## 5. Entry Points

### `src/server.ts`
- Creates `httpServer` from `socket.server.ts`
- Registers socket namespaces (`/duel`, `/daily`)
- Starts cron jobs (question pool refresh)
- Calls `httpServer.listen(PORT)`

### `src/app.ts`
- Pure Express app (no listen call)
- Mounts: helmet, cors, body parsing, rate limiting, request logging
- Routes: `/api/auth`, `/api/game`, `/api/duel`, `/api/friends`, `/api/users`, `/api/scores`, `/api/so`
- Health check: `GET /health`
- Swagger docs: `GET /api/docs`

---

## 6. Middleware Stack

Every request goes through (in order):

```
helmet()          → Security headers
cors()            → Whitelist: localhost:5173, 3001, 19006 (dev)
express.json()    → Body parsing (10kb limit)
generalLimiter    → 100 req/15min per IP (on /api/ routes)
requestLogger     → pino debug log
[route handler]
  └── requireAuth → Verifies Bearer JWT, attaches req.user
  └── validate()  → Zod schema validation (body or query)
  └── controller  → calls service, returns JSON
errorHandler      → Formats all errors as { success: false, error: { message, statusCode } }
notFoundHandler   → Catches unmatched routes → 404
```

**Rate limiters:**
- `generalLimiter`: 100 req / 15 min
- `authLimiter`: 20 req / 15 min (register/login)
- `gameLimiter`: 60 req / min (answer submission)

---

## 7. Authentication System

### Token Flow
```
Register/Login → { user, token, refreshToken }
                         │
                  Bearer <token>  (7 days)
                  used in Authorization header for all protected routes
                         │
                  POST /api/auth/refresh + { refreshToken }
                  → new { token, refreshToken }  (30 days)
```

### JWT Payload (`UserPayload`)
```ts
{ id: string; username: string; email: string; is_guest: boolean }
```

### Guest Users
- `POST /api/auth/guest` creates a user with `isGuest: true`, no email/password
- Gets a real JWT — can play but has limited features
- Username auto-generated: `CuriousCoder4231`

### `requireAuth` vs `optionalAuth`
- `requireAuth` → 401 if no/invalid token
- `optionalAuth` → attaches user if token valid, proceeds anonymously if not (used on leaderboard)

---

## 8. REST API — All Endpoints

### Auth — `/api/auth`
| Method | Path | Auth | Body | Returns |
|---|---|---|---|---|
| POST | `/register` | — | `{ email, password, username? }` | `{ user, token, refreshToken }` |
| POST | `/login` | — | `{ email, password }` | `{ user, token, refreshToken }` |
| POST | `/guest` | — | — | `{ user, token, refreshToken }` |
| POST | `/refresh` | — | `{ refreshToken }` | `{ token, refreshToken }` |
| GET | `/me` | ✅ | — | User row (no passwordHash) |
| PATCH | `/profile` | ✅ | `{ username?, avatar_url?, bio? }` | Updated user row |

### Users — `/api/users`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/me` | ✅ | Full `UserProfile` with ELO, XP, league, stats |
| GET | `/search?q=` | ✅ | Search users by username |
| GET | `/:id/profile` | ✅ | Public `UserProfile` for any user |
| GET | `/:id/achievements` | ✅ | `AchievementInfo[]` |

> ⚠️ **Bug:** Passing a non-UUID `:id` causes Prisma to throw a 500 (UUID parse error) instead of a 400.

### Game — `/api/game`
| Method | Path | Auth | Body / Query | Description |
|---|---|---|---|---|
| POST | `/puzzle/start` | ✅ | `{ tag?, difficulty? }` | Start puzzle session → `SessionSnapshot` |
| POST | `/daily/start` | ✅ | — | Start daily challenge (once per day) → `SessionSnapshot` |
| GET | `/daily/questions` | ✅ | — | Raw daily question list |
| GET | `/question` | ✅ | `?session_id=&difficulty?` | Get next question → `GameQuestion` |
| POST | `/answer` | ✅ | See below | Evaluate answer → `{ correct, scoreEarned, xpEarned, feedback, snapshot }` |
| POST | `/end` | ✅ | `{ session_id }` | End session → final `GameSession` row |
| GET | `/session/:id` | ✅ | — | Fetch saved session |
| GET | `/categories` | — | — | Tag stats array |

**Answer body:**
```json
{
  "session_id": "uuid",
  "question_id": 12345,
  "question_type": "mcq | fill_in_blank | string_answer",
  "player_choice": "python",      // MCQ only
  "player_answer": "some text",   // fill_in_blank / string_answer
  "time_taken_ms": 5000,
  "question_snapshot": { ...SoQuestion fields... }
}
```

### Duel — `/api/duel`
| Method | Path | Auth | Body | Description |
|---|---|---|---|---|
| POST | `/create` | ✅ | `{ tag? }` | Create match → `DuelState` |
| POST | `/:id/join` | ✅ | — | Join waiting match → `DuelState` |
| GET | `/:id/state` | ✅ | — | Current `DuelState` |
| POST | `/:id/answer` | ✅ | `{ round_number, answer, time_ms }` | Submit answer for a round |
| GET | `/:id/result` | ✅ | — | `DuelResult` (only after completed) |

### Scores — `/api/scores`
| Method | Path | Auth | Query | Description |
|---|---|---|---|---|
| GET | `/leaderboard` | optional | `period, mode, tag, limit` | `LeaderboardEntry[]` |
| GET | `/stats` | ✅ | — | User aggregate stats |
| GET | `/history` | ✅ | `limit, offset` | Past `GameSession[]` |
| POST | `/guest` | — | — | Save guest score (needs real `session_id` FK) |

### Friends — `/api/friends`
Send/accept/decline friend requests, list friends, list pending requests.

---

## 9. Game Modes — How They Work

### Puzzle (infinite)
```
POST /game/puzzle/start
  → ActiveSession created in memory (Map)
  → GameSession row created in DB (empty)
  
GET /game/question?session_id=...
  → Fetches random question from SO cache
  → Formats it as GameQuestion (MCQ / fill_in_blank / string_answer)
  
POST /game/answer
  → evaluateAnswer() from algorithm
  → calculateQuestionScore() → score with streak multiplier
  → calculateAnswerXP()
  → Updates in-memory session (score, streak, xp)
  → Persists QuestionAnswer row
  
POST /game/end
  → Writes final score/accuracy/streak to GameSession
  → Updates user XP, level, maxStreak via calculateXPProgression()
  → Creates LeaderboardEntry
  → Clears from memory
```

### Daily Challenge
- Same flow as Puzzle but:
  - 10 pre-fixed questions per UTC day (stored in `daily_challenges` table)
  - Can only be played once per day (checked at start)
  - Questions served in order from `preloaded_questions` array in session

### Duel (via REST + Socket)
```
Player 1: POST /duel/create
  → DuelMatch row (status: 'waiting')
  → Pre-generates N DuelQuestion rows (correct answers stored server-side)

Player 2: POST /duel/:id/join
  → DuelMatch status → 'active'

Both connect via WebSocket to /duel namespace:
  socket.emit('duel:join', { match_id })
  → Server joins them to room `duel:{matchId}`
  → When both in room → broadcasts round 1 question (correct_answer NEVER sent)
  → Per-round countdown timer starts (setInterval, 1 tick/sec)

Player: socket.emit('duel:answer', { round_number, answer, time_ms })
  → duelService.submitAnswer() evaluates + saves
  → When both answered → clearRoundTimer → broadcastRoundResult
  → 2s delay → next question OR duel complete
  → On complete: calculateElo() → update both users → emit DuelResult

Timer expiry:
  → autoCompleteRound() → writes '' answer for non-responders → proceeds
```

---

## 10. Core Algorithm

**File:** `src/utils/stackquest.algorithm.ts` — pure functions, no side effects, no DB.

### Answer Evaluation — `evaluateAnswer(type, playerAnswer, correctAnswer)`

| Type | Strategy |
|---|---|
| `mcq` | Case-insensitive exact match only |
| `fill_in_the_blank` | 1) Exact 2) Substring (→ 0.8 ratio) 3) Levenshtein fuzzy (threshold ≥ 0.70) |
| `string_answer` | Keyword overlap: `|intersection| / |refWords|` ≥ 0.50. Auto-fails if < 10 chars. |

Returns `EvaluationResult { isCorrect, similarityRatio, method, details }`.

### Scoring — `calculateQuestionScore(type, isCorrect, timeTakenMs, streak, similarityRatio?)`

```
totalScore = (basePoints + timeBonus) × streakMultiplier

basePoints:
  mcq             → 20
  fill_in_blank   → 25
  string_answer   → 60 (≥0.85) / 40 (≥0.70) / 25 (≥0.50) / 10 (≥0.30)

timeBonus:
  Math.round(10 × max(0, 1 − timeTakenMs/30000))
  → 10pts at 0ms, 0pts at 30s+

streakMultiplier:
  streak ≥ 13 → 5x
  streak ≥ 10 → 3x
  streak ≥  5 → 2x
  streak  < 5 → 1x
```

### XP — `calculateAnswerXP(type, isCorrect, similarityRatio?)`
- MCQ / fill correct: **+10 XP**
- String answer correct: **`Math.round(similarityRatio × 20)` XP**
- Incorrect: **0 XP**
- Session start bonus: **+5 XP** (via `getSessionStartXP()`)

### Leagues & Levels — `calculateXPProgression(totalXP)`
```
Level = floor(sqrt(totalXP / 100)) + 1

League thresholds (cumulative XP):
  Bronze:   0
  Silver:   500
  Gold:     1,500
  Platinum: 3,000
  Diamond:  5,000
  Master:   8,000
  Legend:   12,000
```

### ELO — `calculateElo(myElo, opponentElo, didWin)`
Standard chess formula, K=32. Zero-sum (both deltas cancel).
Draw case handled separately with `actual = 0.5` (not in the exported function).

---

## 11. Question Pipeline

### Stack Overflow → Cache → Game

```
SO API (api.stackexchange.com/2.3)
  ↓  soService.fetchQuestionsWithAnswers()
  ↓  Fetches questions + top accepted answer body
  ↓
so_question_cache (PostgreSQL)
  ↓  questionService.getNextQuestion() / getDailyChallenge() / getQuestionsForDuel()
  ↓
questionFormatter.formatQuestion(question, type, pool)
  ↓
GameQuestion { question_text, correct_answer, options?, blank_text?, time_limit }
```

### Question Types Built By
| Type | Builder | Correct Answer |
|---|---|---|
| `mcq` | `buildMCQ()` | `tags[0]`, distractors from pool |
| `fill_in_blank` | `buildFillInBlank()` | Tag found in title, or tech keyword, or longest word |
| `string_answer` | `buildStringAnswer()` | Stripped `top_answer_body` |

### Daily Challenge Caching
- At first request each UTC day, picks 10 random answered questions with top answers
- Stores their IDs in `daily_challenges` table
- All subsequent requests return the same set

---

## 12. Socket.io — Realtime Layer

### Namespaces
| Namespace | File | Purpose |
|---|---|---|
| `/duel` | `duel.socket.ts` | 1v1 real-time match flow |
| `/daily` | `daily.socket.ts` | Real-time daily challenge with timer |

### Auth
Both namespaces require JWT in handshake:
```js
socket = io('/duel', { auth: { token: 'Bearer ...' } });
// or
headers: { authorization: 'Bearer ...' }
```

### Duel Socket Events

**Client → Server:**
| Event | Payload | Description |
|---|---|---|
| `duel:join` | `{ match_id }` | Join room, get state, start game if both present |
| `duel:answer` | `{ round_number, answer, time_ms }` | Submit answer for current round |

**Server → Client:**
| Event | Payload | Description |
|---|---|---|
| `duel:state` | `DuelState` | Full match snapshot |
| `duel:question` | `GameQuestion + round info` | Question for current round |
| `duel:timer` | `{ round_number, seconds_remaining }` | Every second |
| `duel:round_result` | `{ correct_answer, scores, correctness }` | After both answer / timeout |
| `duel:opponent_ready` | `{ username }` | When opponent joins room |
| `duel:complete` | `DuelResult` | Final result with ELO changes |
| `duel:answer_ack` | `{ round_number, correct, feedback }` | Personal answer confirmation |
| `duel:error` | `{ message }` | Error for this socket only |

### Daily Socket Events

**Client → Server:**
| Event | Payload |
|---|---|
| `daily:join` | `{}` |
| `daily:submit` | `{ question_number, answer, time_ms }` |

**Server → Client:**
| Event | Payload |
|---|---|
| `daily:question` | Question with number + total |
| `daily:result` | `{ correct, score_earned, xp_earned, feedback, snapshot }` |
| `daily:timer` | `{ question_number, seconds_remaining }` |
| `daily:complete` | Final score + rank |
| `daily:error` | `{ message }` |

### Connection Resilience
- `pingTimeout: 60000`, `pingInterval: 25000`
- `connectionStateRecovery`: clients can reconnect within 2 min without losing room state
- Round timers keyed as `${matchId}:${roundNumber}` in `Map` — cleared on answer or timeout

---

## 13. Services Reference

| Service | Responsibility |
|---|---|
| `AuthService` | Register, login, guest, JWT sign/verify, profile update |
| `GameService` | In-memory session state machine for puzzle + daily |
| `DuelService` | Match creation, joining, answer submission, ELO calculation, completion |
| `QuestionService` | Fetch from cache/SO API, daily set, category stats |
| `SoService` | Raw SO API HTTP client (axios), question + answer fetching |
| `ScoreService` | Leaderboard queries, user stats aggregation, guest score saving |
| `AchievementService` | Check and unlock achievements after game events |
| `FriendService` | Send/accept/decline/list friend requests |
| `EvaluationService` | (Legacy wrapper around algorithm evaluation) |
| `MatchmakingService` | Find waiting duel matches for quick join |

---

## 14. Response Shapes

### Success
```json
{ "success": true, "data": { ... } }
```

### Error
```json
{ "success": false, "error": { "message": "...", "statusCode": 400, "code": "OPTIONAL_CODE" } }
```

### `SessionSnapshot` (returned after each answer + on session start)
```ts
{
  session_id: string;
  score: number;
  streak: number;
  streak_multiplier: number;  // 1x / 2x / 3x / 5x based on streak
  questions_answered: number;
  correct_count: number;
  xp_earned: number;
}
```

### `DuelState`
```ts
{
  match_id: string;
  status: 'waiting' | 'active' | 'completed' | 'cancelled';
  player1: { user_id, username, avatar_url, elo, score };
  player2: DuelPlayerInfo | null;
  current_round: number;
  total_rounds: number;
  questions: DuelQuestionPayload[];  // NO correct_answer field
}
```

### `DuelResult`
```ts
{
  match_id: string;
  winner_id: string | null;  // null = draw
  player1: { user_id, username, score, correct_count, elo_change, new_elo };
  player2: { ... };
}
```

### Auth response (`register` / `login` / `guest`)
```ts
{
  user: { id, username, email, is_guest };
  token: string;          // access token (7d)
  refreshToken: string;   // refresh token (30d)
}
```

---

## 15. Known Bugs & Notes

| # | Location | Bug | Impact |
|---|---|---|---|
| 1 | `score.service.ts:34` `user.controller.ts` | Non-UUID `:id` in `/users/:id/profile` → Prisma throws UUID parse error → **500** instead of 400/404 | Low — only malformed requests |
| 2 | `score.service.ts` `saveGuestScore` | `session_id` is a FK to `game_sessions` — passing a random UUID that doesn't exist → **500 FK violation** | Medium — guest score endpoint effectively only works with a real completed session ID |
| 3 | In-memory session state | If the server restarts, all active puzzle/daily sessions are **lost** — users get 404 on next request | Medium — no persistence for in-flight sessions |
| 4 | `duel.socket.ts` `matchStateCache` | `matchStateCache` (in-memory Map) is never cleaned up after duel completion — **memory leak** for long-running servers | Low (small footprint per match) |

---

## 16. Running Tests

### Unit Tests (pure logic, no DB)
Tests: algorithm evaluation, scoring, XP/leagues, ELO, session manager, question formatter.
```bash
npx ts-node --compiler-options '{"module":"commonjs"}' src/utils/__tests__/run_tests.ts
```
**70 tests, 0 failures.**

### Integration Tests (requires live DB + .env)
Tests: full user journey from register → puzzle → leaderboard → duel → result.
```bash
npx ts-node --compiler-options '{"module":"commonjs"}' src/utils/__tests__/integration.test.ts
```
**45 tests, 0 failures.**

What's covered:
- Register, login, guest auth, token usage, profile update
- Full puzzle flow: start → get question → answer → double-submit guard → end → re-end guard
- Leaderboard (filtered), stats, history
- Full duel: create → join → self-join guard → answers → double-answer guard → complete all rounds → result → ELO zero-sum verified
- Error handling: invalid UUIDs, 404s, unauthorized routes

### TypeScript Check
```bash
npx tsc --noEmit
```
**0 errors.**
