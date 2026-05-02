# 1. Backend Context

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


# 2. Backend README

# StackQuest Backend — Setup Guide

## Prerequisites

### 1. Install PostgreSQL (macOS)

**Option A: Homebrew (recommended)**
```bash
brew install postgresql@16
brew services start postgresql@16
echo 'export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Option B: Postgres.app (GUI)**
Download from: https://postgresapp.com/

---

### 2. Create the database

```bash
# Connect to PostgreSQL
psql postgres

# Inside psql:
CREATE USER stackquest_user WITH PASSWORD 'stackquest_pass';
CREATE DATABASE stackquest OWNER stackquest_user;
\q
```

---

### 3. Configure environment variables

Edit `backend/.env`:

```env
DATABASE_URL=postgresql://stackquest_user:stackquest_pass@localhost:5432/stackquest

JWT_SECRET=supersecret-at-least-32-chars-long-random-string
JWT_REFRESH_SECRET=another-refresh-secret-at-least-32-chars

# Get free HuggingFace token at: https://huggingface.co/settings/tokens
HUGGINGFACE_API_KEY=hf_your_token_here
```

---

### 4. Apply database schema with Prisma

```bash
cd backend

# Option A — push schema directly (no migration history, best for dev)
npm run db:push

# Option B — create a tracked migration (production-ready)
npm run db:migrate
```

Open the Prisma GUI to browse your data:
```bash
npm run db:studio
```

---

### 5. Start the dev server

```bash
npm run dev
```

Server starts at: http://localhost:3000
Swagger docs at:  http://localhost:3000/api/docs

---

## Prisma Commands

| Command | Description |
|---------|-------------|
| `npm run db:push` | Push schema changes without creating a migration file |
| `npm run db:migrate` | Create + apply a named migration |
| `npm run db:studio` | Open Prisma Studio (visual DB browser) |
| `npm run db:reset` | Drop + recreate DB and re-apply all migrations |
| `npm run db:generate` | Re-generate Prisma client after schema changes |

> **Schema lives at:** `prisma/schema.prisma`
> **Generated client at:** `generated/prisma/`

---

## API Quick Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Register with email + password |
| POST | /api/auth/login | No | Login, get JWT |
| POST | /api/auth/guest | No | Create guest session |
| POST | /api/auth/refresh | No | Refresh JWT |
| GET | /api/auth/me | ✅ | Get profile |
| POST | /api/game/session/start | ✅ | Start game session |
| GET | /api/game/question | ✅ | Get next question |
| POST | /api/game/evaluate | ✅ | Submit answer + get score |
| POST | /api/game/session/end | ✅ | Finalize session |
| GET | /api/game/daily | No | Daily challenge questions |
| GET | /api/scores/leaderboard | No | Global/weekly leaderboard |
| GET | /api/scores/me/stats | ✅ | My stats |
| GET | /api/scores/me/history | ✅ | My game history |
| GET | /api/categories | No | All tags with question counts |
| GET | /api/so/questions | No | SO questions (cached) |
| GET | /health | No | Health check |

## Game Modes

| Mode | player_choice values | Description |
|------|---------------------|-------------|
| `judge` | `"upvote"` or `"downvote"` | Was this question net positive? |
| `score_guesser` | `"0-10"`, `"10-100"`, `"100-500"`, `"500+"` | Guess vote score range |
| `answer_arena` | text in `player_answer` | Write your own answer |
| `multiple_choice` | one of the `options[]` | Pick the correct tag |
| `tag_guesser` | any tag string | Guess the primary tag |

## Example: Full Game Flow (curl)

```bash
# 1. Create guest session
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/guest \
  -H "Content-Type: application/json" | jq -r '.data.token')

# 2. Start game
SESSION_ID=$(curl -s -X POST http://localhost:3000/api/game/session/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"judge","tag":"javascript"}' | jq -r '.data.session_id')

# 3. Get a question
curl -s "http://localhost:3000/api/game/question?session_id=$SESSION_ID" \
  -H "Authorization: Bearer $TOKEN" | jq '.data.question.title'

# 4. Submit answer
curl -s -X POST http://localhost:3000/api/game/evaluate \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\",\"question_id\":12345,\"player_choice\":\"upvote\",\"time_taken_ms\":8000,\"question_snapshot\":{...}}"

# 5. End session
curl -s -X POST http://localhost:3000/api/game/session/end \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"session_id\":\"$SESSION_ID\"}"
```




# Unit tests (pure logic, no DB needed)
npx ts-node --compiler-options '{"module":"commonjs"}' src/utils/__tests__/run_tests.ts

# Integration tests (requires live DB)
npx ts-node --compiler-options '{"module":"commonjs"}' src/utils/__tests__/integration.test.ts


# 3. API Documentation

# StackQuest Backend API Documentation

Welcome to the StackQuest backend API documentation. This document details all features, REST endpoints, WebSocket events, data models, and game logic necessary for the frontend integration.

## Base URL
- **Local:** `http://localhost:3000` (or whichever port `.env` uses)
- **API Prefix:** `/api`
- **Swagger Docs:** `http://localhost:3000/api/docs`

---

## Security & Authentication

All protected endpoints require an `Authorization` header using the Bearer token scheme.

**Header Format:** `Authorization: Bearer <JWT_TOKEN>`

If a user session expires, a `/api/auth/refresh` endpoint is available using the `refreshToken`.

---

## 1. Authentication Endpoints

Base path: `/api/auth`

### Register
- **URL:** `/register`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123",
    "username": "coder123" // Optional (defaults to auto-generated)
  }
  ```
- **Response (201):**
  Returns user data along with `token` and `refreshToken`.

### Login
- **URL:** `/login`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "email": "user@example.com",
    "password": "password123"
  }
  ```
- **Response (200):**
  Returns user data, `token`, and `refreshToken`.

### Play as Guest
- **URL:** `/guest`
- **Method:** `POST`
- **Description:** Creates an anonymous guest session. No email required.
- **Response (201):**
  Returns auto-generated username, `token`, and `refreshToken`.

### Refresh Token
- **URL:** `/refresh`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "refreshToken": "your_refresh_token_here"
  }
  ```
- **Response (200):**
  Returns new `token` and `refreshToken`.

### Get Current User Profile
- **URL:** `/me`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):**
  Returns full user profile minus password hash.

### Update Profile
- **URL:** `/profile`
- **Method:** `PATCH`
- **Headers:** `Authorization: Bearer <token>`
- **Body (all optional):**
  ```json
  {
    "username": "new_name",
    "avatar_url": "https://example.com/avatar.png",
    "bio": "I love coding"
  }
  ```
- **Response (200):**
  Returns updated profile data.

---

## 2. Game Endpoints (Daily Challenge & Puzzle)

Base path: `/api/game`

### Start Daily Challenge
- **URL:** `/daily/start`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Response (201):** Returns a session snapshot with `session_id`.

### Get Daily Challenge Questions
- **URL:** `/daily/questions`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns a list of cached StackOverflow questions for the day.

### Start Puzzle Game
- **URL:** `/puzzle/start`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Body (optional):**
  ```json
  {
    "tag": "react", 
    "difficulty": "medium" // 'easy', 'medium', 'hard'
  }
  ```
- **Response (201):** Returns session snapshot with `session_id`.

### Get Next Question (Puzzle)
- **URL:** `/question`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Query Params:**
  - `session_id` (required): UUID
  - `difficulty` (optional): `easy`, `medium`, `hard`
- **Response (200):** Returns next question data.

### Submit Answer (Evaluate)
- **URL:** `/answer`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "session_id": "uuid",
    "question_id": 12345,
    "question_type": "mcq", // 'mcq', 'fill_in_blank', 'string_answer'
    "player_answer": "my answer", // required for string/fill in blank
    "player_choice": "tag1", // required for MCQ
    "time_taken_ms": 5000,
    "question_snapshot": { ... } // See GameController schema
  }
  ```
- **Response (200):** Returns evaluation result (correctness, score earned, XP, feedback).

### End Session
- **URL:** `/end`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  {
    "session_id": "uuid"
  }
  ```
- **Response (200):** Returns final session stats and triggers achievements calculation.

### Get Session Details
- **URL:** `/session/:id`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns full session info.

### Get Categories/Tags
- **URL:** `/categories`
- **Method:** `GET`
- **Response (200):** Returns category stats and available tags based on cached SO questions.

---

## 3. Duel System Endpoints

Base path: `/api/duel`

*(Note: Real-time gameplay for duels happens over WebSockets. These endpoints are for matchmaking state).*

### Create Duel
- **URL:** `/create`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Body (optional):**
  ```json
  { "tag": "javascript" }
  ```
- **Response (201):** Returns `DuelState` with `match_id`.

### Join Duel
- **URL:** `/:id/join`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns updated `DuelState`.

### Get Duel State
- **URL:** `/:id/state`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns current state, player info, and past round results.

### Get Duel Result
- **URL:** `/:id/result`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns final result after match finishes (winner, scores, ELO changes).

---

## 4. Friend System Endpoints

Base path: `/api/friends`

### Get Friends List
- **URL:** `/`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns list of accepted friends.

### Get Pending Requests
- **URL:** `/pending`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns incoming friend requests.

### Send Friend Request
- **URL:** `/request`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Body:**
  ```json
  { "username": "coder123" }
  ```
- **Response (201):** Success message.

### Accept Friend Request
- **URL:** `/:id/accept`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Success message.

### Reject Friend Request
- **URL:** `/:id/reject`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Success message.

### Remove Friend
- **URL:** `/:id`
- **Method:** `DELETE`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Success message.

### Block User
- **URL:** `/:id/block`
- **Method:** `POST`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Success message.

---

## 5. User Profiles & Search Endpoints

Base path: `/api/users`

### Get My Profile & Match History
- **URL:** `/me`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns full profile + recent 10 matches.

### Get Public Profile
- **URL:** `/:id/profile`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns public user stats.

### Get User Achievements
- **URL:** `/:id/achievements`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns list of achievements and their unlock status. (Omit ID to get own achievements).

### Search Users
- **URL:** `/search?q=username`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns matching users (min 2 characters in query).

---

## 6. Leaderboard & Stats Endpoints

Base path: `/api/scores`

### Get Leaderboard
- **URL:** `/leaderboard`
- **Method:** `GET`
- **Headers:** (Optional)
- **Query Params:**
  - `period`: `all_time` (default) or `weekly`
  - `mode`: `duel`, `daily_challenge`, `puzzle`
  - `tag`: specific tag filter
  - `limit`: number of results (default 20, max 100)
- **Response (200):** Returns ranked players.

### Get My Stats Overview
- **URL:** `/stats`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns aggregated game stats (total games, avg score, accuracy, ELO, league info).

### Get My Game History
- **URL:** `/history?limit=10&offset=0`
- **Method:** `GET`
- **Headers:** `Authorization: Bearer <token>`
- **Response (200):** Returns past single-player sessions.

### Save Guest Score to Leaderboard
- **URL:** `/guest`
- **Method:** `POST`
- **Body:**
  ```json
  {
    "username": "CoolGuest123",
    "score": 1500,
    "mode": "daily_challenge",
    "tag": null,
    "session_id": "uuid"
  }
  ```
- **Response (200):** Success message.

---

## 7. WebSockets: Real-Time Gameplay

### Connection Setup
Ensure you pass the JWT token during connection.
**Websocket Base URL:** `ws://localhost:3000`

```javascript
// Example connection
import { io } from "socket.io-client";

const duelSocket = io("http://localhost:3000/duel", {
  auth: { token: "YOUR_JWT_TOKEN" }
});

const dailySocket = io("http://localhost:3000/daily", {
  auth: { token: "YOUR_JWT_TOKEN" }
});
```

---

### Namespace: `/duel`

Manages 1v1 synchronized matches.

#### Client -> Server Events:
1. **`duel:join`**: Start the match flow.
   - **Payload:** `{ "match_id": "uuid" }`
2. **`duel:answer`**: Submit an answer for the current round.
   - **Payload:** `{ "round_number": 1, "answer": "react", "time_ms": 2500 }`

#### Server -> Client Events:
1. **`duel:state`**: Emitted when a player joins, giving current state payload.
2. **`duel:opponent_ready`**: Emitted when opponent joins room. `{ username, avatar_url }`
3. **`duel:question`**: A new round starts.
   - **Payload:** Contains `question_type`, `question_text`, `options` (if MCQ), and `time_limit`. Note: *The correct answer is intentionally omitted to prevent cheating.*
4. **`duel:timer`**: Ticks every second during a question. `{ round_number, seconds_remaining }`
5. **`duel:round_result`**: Fired when both answer or time runs out. Shows who was correct, the actual `correct_answer`, and updated scores.
6. **`duel:complete`**: Fired at the end of the final round. Contains final winner, ELO changes, and final score tally.
7. **`duel:error`**: Fired if something goes wrong.

---

### Namespace: `/daily`

Provides a streamlined, real-time feel for the daily challenge without polling REST APIs.

#### Client -> Server Events:
1. **`daily:join`**: Initiates the daily sequence. Needs no payload.
2. **`daily:submit`**: Submit answer.
   - **Payload:** `{ "question_number": 1, "answer": "python", "time_ms": 4000 }`

#### Server -> Client Events:
1. **`daily:question`**: A new question in the sequence. Contains time limits and options.
2. **`daily:timer`**: Ticks every second. `{ question_number, seconds_remaining }`
3. **`daily:result`**: Result for the submitted question. Includes `correct_answer`, `score_earned`, `xp_earned`, and `feedback`.
4. **`daily:complete`**: Fired when all questions finish. Contains `total_score`, `accuracy`, etc.
5. **`daily:error`**: Error messages.

---

## 8. Game Mechanics & Flow Reference

### Question Types
Every game mode cycles through three types of questions derived from StackOverflow data:
1. **`mcq` (Multiple Choice):** User selects from 4 generated tags/options.
2. **`fill_in_blank`:** User types a missing keyword/tag from the prompt.
3. **`string_answer`:** User types an answer; the backend evaluates text similarity using NLP heuristics against the accepted SO answer body.

### Ranking & ELO System (Duels)
- Users start with 1000 ELO.
- ELO changes on a win/loss using standard K-factor=32 mechanics.
- **Leagues:** Driven by XP earned (Bronze -> Silver -> Gold -> Platinum -> Diamond -> Master -> Legend).

### Achievements
Achievements are processed automatically when calling `/api/game/end` or finishing a websocket duel. If achievements unlock, they will be saved to the DB. The frontend can periodically check `/api/users/me` or `/api/users/:id/achievements` to detect newly unlocked badges.
