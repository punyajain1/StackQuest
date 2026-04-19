# StackQuest — Complete Backend Reference

> Node.js / TypeScript / Express / Prisma ORM / PostgreSQL (Neon.tech) / HuggingFace
> API Base: `http://localhost:3000`  |  Swagger UI: `http://localhost:3000/api/docs`

---

## Table of Contents

1. [Architecture Overview](#architecture)
2. [File Tree](#file-tree)
3. [Environment Variables](#environment-variables)
4. [Database Schema](#database-schema)
5. [Authentication](#authentication)
6. [API Endpoints — All 20](#api-endpoints)
   - [Auth](#auth-endpoints) (5)
   - [Game](#game-endpoints) (5)
   - [Scores & Leaderboard](#scores-endpoints) (4)
   - [Categories](#categories-endpoint) (1)
   - [SO Proxy](#so-proxy-endpoints) (3)
   - [Utility](#utility-endpoints) (2)
7. [Scoring Engine](#scoring-engine)
8. [HuggingFace Answer Evaluation](#huggingface-evaluation)
9. [Question Pool System](#question-pool)
10. [Error Handling](#error-handling)
11. [Rate Limiting](#rate-limiting)
12. [Quickstart](#quickstart)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENT (Web / Mobile)                 │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
                        ▼
┌─────────────────────────────────────────────────────────┐
│                   Express.js API Server                  │
│                                                          │
│  Middleware stack (in order):                            │
│  1. Helmet (security headers)                            │
│  2. CORS                                                 │
│  3. JSON body parser (10kb limit)                        │
│  4. Global rate limiter (100 req/min/IP)                 │
│  5. Auth middleware (JWT verify on protected routes)     │
│  6. Zod request validation                               │
│  7. Route handler                                        │
│  8. Error handler (catches all thrown AppErrors)         │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │  /auth   │  │  /game   │  │ /scores  │  │  /so   │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │               Service Layer                       │   │
│  │  AuthService  GameService  ScoreService           │   │
│  │  QuestionService  EvaluationService  SOService    │   │
│  └───────────────────┬──────────────────────────────┘   │
│                      │                                   │
│  ┌───────────────────┼──────────────────────────────┐   │
│  │       Prisma ORM  │  + In-memory session Map      │   │
│  └───────────────────┼──────────────────────────────┘   │
└──────────────────────┼──────────────────────────────────┘
                       │
          ┌────────────┴──────────────┐
          ▼                           ▼
┌──────────────────┐       ┌──────────────────────┐
│  PostgreSQL DB   │       │  External APIs        │
│  (Neon.tech)     │       │  • Stack Overflow API │
│                  │       │  • HuggingFace API    │
│  6 tables:       │       └──────────────────────┘
│  users           │
│  game_sessions   │
│  question_answers│
│  so_question_cach│
│  leaderboard_entr│
│  daily_challenges│
└──────────────────┘
```

### Key Design Decisions

| Decision | Reason |
|----------|--------|
| **In-memory session state** | Game sessions need sub-ms reads for every answer. The `Map<sessionId, ActiveSession>` is cleared on session end. Session is also persisted to DB on start so FK constraints work. |
| **Client sends `question_snapshot` on evaluate** | Avoids an extra DB round-trip per answer. The full question is already on the client. |
| **HuggingFace with keyword fallback** | If HF API is down, keyword overlap scoring kicks in automatically — game never breaks. |
| **Strict Hourly Pre-caching** | To completely prevent rate limits on the free tier (300 req/day), the cron job is strictly hardcoded to run exactly once an hour, fetching exactly 1 page (100 questions) for the single most starving tag. |
| **Vectorized SO API Bulk Fetching** | After fetching questions, it instantly bulk-enriches all top answers via a single semicolon-separated API call (`/questions/1;2.../answers`). This means 100 fully-enriched questions cost only 2 API calls per hour. |
| **Prisma + Neon adapter** | Neon's serverless driver handles connection pooling — no need for PgBouncer. |

---

## 2. File Tree

```
backend/
├── prisma/
│   └── schema.prisma           # All DB models, enums, relations
├── prisma.config.ts            # Neon DATABASE_URL config (Prisma 7)
├── generated/
│   └── prisma/                 # Auto-generated Prisma client (gitignored)
├── migrations/
│   ├── *.sql                   # Legacy SQL files (reference only)
│   └── run.ts                  # Deprecated — use `npm run db:migrate`
├── src/
│   ├── server.ts               # Entry point: DB connect → HTTP listen → cron start
│   ├── app.ts                  # Express app: middleware, routes, Swagger
│   ├── config/
│   │   ├── env.ts              # Zod validation of all env vars (crashes if invalid)
│   │   ├── prisma.ts           # Prisma singleton with Neon adapter
│   │   └── database.ts         # Shim re-exporting from prisma.ts
│   ├── models/
│   │   └── db.types.ts         # TypeScript types not in Prisma schema
│   ├── services/
│   │   ├── auth.service.ts     # bcrypt hashing, JWT signing, guest creation
│   │   ├── game.service.ts     # Session state, scoring engine, DB persistence
│   │   ├── question.service.ts # Question pool (DB cache + SO API fallback)
│   │   ├── evaluation.service.ts # HuggingFace cosine similarity + fallback
│   │   ├── score.service.ts    # Leaderboard queries, user stats, groupBy
│   │   └── so.service.ts       # Stack Overflow API wrapper with LRU cache
│   ├── controllers/
│   │   ├── auth.controller.ts  # Register, login, guest, refresh, profile
│   │   ├── game.controller.ts  # Start, question, evaluate, end, daily
│   │   └── scores.controller.ts # Leaderboard, my stats, my history, guest save
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── game.routes.ts
│   │   ├── scores.routes.ts
│   │   ├── categories.routes.ts
│   │   └── so.routes.ts
│   ├── middleware/
│   │   ├── auth.middleware.ts  # requireAuth — verifies JWT, attaches req.user
│   │   ├── validate.middleware.ts # Zod schema validation factory
│   │   ├── rateLimit.middleware.ts # generalLimiter, authLimiter, gameLimiter
│   │   └── error.middleware.ts # errorHandler + notFoundHandler
│   ├── jobs/
│   │   └── questionFetcher.ts  # node-cron job: refresh SO question pool
│   └── utils/
│       ├── AppError.ts         # Custom error class with statusCode + code
│       ├── cache.ts            # In-memory LRU cache (for SO API responses)
│       └── logger.ts           # Pino logger (pretty in dev, JSON in prod)
├── nodemon.json
├── package.json
├── tsconfig.json
├── .env / .env.example
└── README.md
```

---

## 3. Environment Variables

All variables are validated with Zod at startup — the server **crashes immediately** with a descriptive error if any required variable is missing or malformed.

```env
# ── Server ─────────────────────────────────────────────────
PORT=3000
# Default: 3000. The HTTP port.

NODE_ENV=development
# Values: development | production | test
# Controls: log prettifying, CORS origins, error stack traces in responses

# ── Database ────────────────────────────────────────────────
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
# Required. Neon.tech connection string (or local postgres URL).
# Used by: @prisma/adapter-neon → PrismaNeon

# ── JWT ─────────────────────────────────────────────────────
JWT_SECRET=your-secret-at-least-16-chars
# Required. Min 16 chars. Signs access tokens (7d expiry by default).

JWT_EXPIRES_IN=7d
# Default: 7d. Format: ms-compatible string (1h, 7d, 30d).

JWT_REFRESH_SECRET=another-secret-at-least-16-chars
# Required. Different from JWT_SECRET. Signs refresh tokens.

JWT_REFRESH_EXPIRES_IN=30d
# Default: 30d.

# ── Stack Overflow API ───────────────────────────────────────
SO_API_KEY=
# Optional. Leave blank for free tier (300 req/day).
# Register at https://stackapps.com/ for 10,000 req/day.

SO_API_BASE=https://api.stackexchange.com/2.3
# Default — do not change unless testing against a mock.

SO_SITE=stackoverflow
# Default: stackoverflow. Could be serverfault, superuser, etc.

# ── HuggingFace ──────────────────────────────────────────────
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxx
# Required. Get free key at https://huggingface.co/settings/tokens

HF_MODEL=sentence-transformers/all-MiniLM-L6-v2
# Default. 384-dimension embedding model.
# Fast, free, good semantic similarity. Can swap for all-mpnet-base-v2 for higher accuracy.

# ── Question Pool Config ─────────────────────────────────────
QUESTION_POOL_MIN=50
# Default: 50. Minimum questions per tag in local DB.
# If a tag drops below this, the cron job fetches more.

QUESTION_POOL_REFRESH_HOURS=6
# Default: 6. How often the cron job runs (every N hours).

CACHE_TTL_SECONDS=86400
# Default: 86400 (24h). TTL for the in-memory SO API response cache.
```

---

## 4. Database Schema

### Tables Overview

```
users                   → Players (email/guest)
game_sessions           → One per game played
question_answers        → One per question answered within a session
so_question_cache       → Local copy of SO questions (avoids hitting SO API constantly)
leaderboard_entries     → Submitted scores (one per ended session)
daily_challenges        → 10 questions pinned per calendar day
```

### Enums

```sql
-- GameMode: which mode was played
'judge' | 'score_guesser' | 'answer_arena' | 'multiple_choice' | 'tag_guesser'

-- Difficulty: question difficulty tier
'easy' | 'medium' | 'hard'
```

### `users`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Auto-generated |
| `username` | TEXT UNIQUE | Auto-generated for guests |
| `email` | TEXT UNIQUE nullable | null for guests |
| `password_hash` | TEXT nullable | null for guests |
| `is_guest` | BOOLEAN | Default false |
| `xp` | INT | Lifetime XP. Increases on session end. |
| `level` | INT | `floor(sqrt(xp/100)) + 1` |
| `streak_record` | INT | Best streak ever across all sessions |
| `total_games` | INT | Incremented on session end |
| `created_at` | TIMESTAMPTZ | |
| `last_active` | TIMESTAMPTZ | Updated on login + session end |

### `game_sessions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | Assigned on session start, used as FK |
| `user_id` | UUID FK → users | Nullable (SET NULL if user deleted) |
| `mode` | GameMode ENUM | Mode chosen at session start |
| `tag` | TEXT nullable | e.g. "javascript", null = all tags |
| `score` | INT | Final score, written on session end |
| `accuracy` | FLOAT | correct_count / questions_count |
| `streak_peak` | INT | Highest streak reached in session |
| `questions_count` | INT | Total questions answered |
| `correct_count` | INT | Correct answers only |
| `duration_secs` | INT | Wall-clock time from start to end |
| `is_daily` | BOOLEAN | Was this a daily challenge session? |
| `daily_date` | DATE nullable | Which day's daily challenge |
| `xp_earned` | INT | XP awarded this session |
| `created_at` | TIMESTAMPTZ | When session started |

### `question_answers`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `session_id` | UUID FK → game_sessions | Cascade delete |
| `so_question_id` | INT | Stack Overflow question_id |
| `mode` | GameMode | |
| `player_answer` | TEXT nullable | Free text (answer_arena only) |
| `player_choice` | TEXT nullable | Selected option (all other modes) |
| `correct` | BOOLEAN | Whether the answer was correct |
| `score_earned` | INT | Points awarded this answer |
| `xp_earned` | INT | XP awarded this answer |
| `similarity_score` | FLOAT nullable | Cosine similarity 0–1 (answer_arena only) |
| `time_taken_ms` | INT | How long the player took |
| `created_at` | TIMESTAMPTZ | |

### `so_question_cache`

| Column | Type | Notes |
|--------|------|-------|
| `question_id` | INT PK | Stack Overflow question_id |
| `title` | TEXT | |
| `body` | TEXT | HTML body |
| `body_markdown` | TEXT | Markdown body (for rendering) |
| `tags` | TEXT[] | Array of SO tags |
| `score` | INT | SO vote score |
| `answer_count` | INT | |
| `accepted_answer_id` | INT nullable | |
| `top_answer_text` | TEXT nullable | Pre-fetched top answer markdown |
| `top_answer_score` | INT nullable | Top answer vote score |
| `view_count` | INT | |
| `difficulty` | Difficulty | `easy`(<10 score), `medium`(10-100), `hard`(>100) |
| `is_answered` | BOOLEAN | Has an accepted answer |
| `creation_date` | TIMESTAMPTZ | When SO question was created |
| `last_fetched` | TIMESTAMPTZ | When we last fetched from SO |

### `leaderboard_entries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users nullable | Null for pure guests |
| `session_id` | UUID FK → game_sessions | Cascade delete |
| `username` | TEXT | Snapshot at time of save |
| `score` | INT | |
| `mode` | GameMode | |
| `tag` | TEXT nullable | |
| `period_week` | TEXT | ISO week string e.g. `"2024-W17"` — used for weekly leaderboard |
| `created_at` | TIMESTAMPTZ | |

### `daily_challenges`

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `date` | DATE UNIQUE | One challenge per calendar day |
| `question_ids` | INT[] | 10 SO question IDs |
| `created_at` | TIMESTAMPTZ | |

---

## 5. Authentication

### Token Types

| Token | Expiry | Secret Env Var | Usage |
|-------|--------|----------------|-------|
| Access Token (JWT) | 7 days | `JWT_SECRET` | Sent in `Authorization: Bearer <token>` |
| Refresh Token (JWT) | 30 days | `JWT_REFRESH_SECRET` | Sent to `POST /auth/refresh` to get a new access token |

### JWT Payload Shape

```json
{
  "id": "uuid-string",
  "username": "DevNinja42",
  "email": "user@example.com",
  "is_guest": false,
  "iat": 1713500000,
  "exp": 1714104800
}
```

### Protected vs. Public Endpoints

| Endpoint | Auth Required |
|----------|--------------|
| `POST /auth/register` | ❌ Public |
| `POST /auth/login` | ❌ Public |
| `POST /auth/guest` | ❌ Public |
| `POST /auth/refresh` | ❌ Public |
| `GET /auth/me` | ✅ Bearer JWT |
| `POST /game/session/start` | ✅ Bearer JWT |
| `GET /game/question` | ✅ Bearer JWT |
| `POST /game/evaluate` | ✅ Bearer JWT |
| `POST /game/session/end` | ✅ Bearer JWT |
| `GET /game/session/:id` | ✅ Bearer JWT |
| `GET /game/daily` | ❌ Public |
| `GET /scores/leaderboard` | ❌ Public |
| `GET /scores/me/stats` | ✅ Bearer JWT |
| `GET /scores/me/history` | ✅ Bearer JWT |
| `POST /scores/guest` | ❌ Public |
| `GET /categories` | ❌ Public |
| `GET /so/questions` | ❌ Public |
| `GET /so/answers/:id` | ❌ Public |
| `GET /so/quota` | ❌ Public |
| `GET /health` | ❌ Public |

---

## 6. API Endpoints

### Standard Response Envelope

Every endpoint returns:

```json
// Success
{ "success": true, "data": { ... } }

// Error
{
  "success": false,
  "error": {
    "message": "Human readable message",
    "code": "MACHINE_CODE",
    "statusCode": 400
  }
}
```

---

## Auth Endpoints

---

### `POST /api/auth/register`

Create a new email account. Rate limited to **10 requests per 15 minutes per IP**.

**Request body:**
```json
{
  "email": "player@example.com",      // required, must be valid email
  "password": "mypassword123",        // required, min 8 characters
  "username": "DevNinja42"            // optional, 3–30 chars. Auto-generated if omitted.
}
```

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "DevNinja42",
      "email": "player@example.com",
      "is_guest": false
    },
    "token": "eyJhbGci....",
    "refreshToken": "eyJhbGci...."
  }
}
```

**Errors:**

| Status | Code | Reason |
|--------|------|--------|
| 409 | `EMAIL_TAKEN` | Email already registered |
| 409 | `USERNAME_TAKEN` | Username already taken |
| 400 | `VALIDATION_ERROR` | Email invalid / password too short |
| 429 | `AUTH_RATE_LIMIT` | Too many attempts |

---

### `POST /api/auth/login`

Login with email and password. Rate limited to **10 requests per 15 minutes per IP**.

**Request body:**
```json
{
  "email": "player@example.com",
  "password": "mypassword123"
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "username": "DevNinja42",
      "email": "player@example.com",
      "is_guest": false
    },
    "token": "eyJhbGci....",
    "refreshToken": "eyJhbGci...."
  }
}
```

**Errors:**

| Status | Code | Reason |
|--------|------|--------|
| 401 | `INVALID_CREDENTIALS` | Wrong email or password (same message to prevent enumeration) |
| 429 | `AUTH_RATE_LIMIT` | Too many attempts |

---

### `POST /api/auth/guest`

Create a guest session instantly (no email needed). A random username is auto-generated like `CleverNinja4291`. Guest accounts are real DB users — they accumulate score and can be leaderboard-listed. Rate limited to **10 requests per 15 minutes per IP**.

**Request body:** *(empty)*

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "7f3e8400-e29b-41d4-a716-112233445566",
      "username": "CleverNinja4291",
      "email": "",
      "is_guest": true
    },
    "token": "eyJhbGci....",
    "refreshToken": "eyJhbGci...."
  }
}
```

> **Client tip:** Store the `token` and `refreshToken` in localStorage immediately. Guest users have real JWT-protected sessions — if they lose the token they lose their game history.

---

### `POST /api/auth/refresh`

Exchange a refresh token for a new access token + refresh token pair.

**Request body:**
```json
{
  "refreshToken": "eyJhbGci...."
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGci....",
    "refreshToken": "eyJhbGci...."
  }
}
```

**Errors:**

| Status | Code | Reason |
|--------|------|--------|
| 401 | `INVALID_REFRESH_TOKEN` | Expired or tampered token |
| 401 | `USER_NOT_FOUND` | User was deleted |

---

### `GET /api/auth/me`

Get the current user's full profile. Requires valid JWT.

**Headers:** `Authorization: Bearer <token>`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-...",
    "username": "DevNinja42",
    "email": "player@example.com",
    "isGuest": false,
    "xp": 1250,
    "level": 4,
    "streakRecord": 12,
    "totalGames": 47,
    "createdAt": "2024-04-19T07:00:00.000Z",
    "lastActive": "2024-04-19T12:00:00.000Z"
  }
}
```

> Note: `passwordHash` is never returned — it's stripped before the response.

---

## Game Endpoints

---

### `POST /api/game/session/start`

Start a new game session. Creates an in-memory session state AND a DB row. Returns a `session_id` to use for all subsequent game calls.

**Headers:** `Authorization: Bearer <token>`

**Request body:**
```json
{
  "mode": "judge",           // required — one of the 5 game modes
  "tag": "javascript",       // optional — null means all tags mixed
  "is_daily": false          // optional — true = daily challenge session
}
```

**`mode` values:**

| Value | Description |
|-------|-------------|
| `judge` | Was this question net positive? Upvote or downvote? |
| `score_guesser` | Guess which score range the question falls in |
| `answer_arena` | Type your own answer, AI scores it against the accepted answer |
| `multiple_choice` | Pick the primary tag from 4 options |
| `tag_guesser` | Type any tag that applies to the question |

**Response `201`:**
```json
{
  "success": true,
  "data": {
    "session_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "score": 0,
    "streak": 0,
    "streak_multiplier": 1,
    "questions_answered": 0,
    "correct_count": 0,
    "xp_earned": 5
  }
}
```

> `xp_earned` starts at 5 — every game rewards at least 5 XP just for playing.

---

### `GET /api/game/question`

Get the next question for an active session. The backend tracks which questions have already been shown and never repeats them.

**Headers:** `Authorization: Bearer <token>`

**Query params:**

| Param | Type | Required | Description |
|-------|------|----------|-------------|
| `session_id` | UUID | ✅ | From `session/start` response |
| `difficulty` | `easy\|medium\|hard` | ❌ | Filter questions by difficulty |

**Request:**
```
GET /api/game/question?session_id=a1b2c3d4-e5f6-7890-abcd-ef1234567890&difficulty=medium
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "question": {
      "question_id": 11227809,
      "title": "Why does useEffect fire twice in React 18 StrictMode?",
      "body": "<p>I noticed my useEffect...</p>",
      "body_markdown": "I noticed my `useEffect`...\n\n```js\nuseEffect(() => {\n  fetchData();\n}, []);\n```",
      "tags": ["reactjs", "hooks", "react-hooks", "use-effect"],
      "score": 847,
      "answer_count": 12,
      "accepted_answer_id": 11228336,
      "top_answer_text": "In React 18, `StrictMode` intentionally invokes...",
      "top_answer_score": 1203,
      "view_count": 184920,
      "difficulty": "hard",
      "is_answered": true,
      "creation_date": 1614600000
    },
    "mode": "judge",
    "options": null,
    "timeLimit": 30
  }
}
```

**`options` field** — only populated for `multiple_choice` and `tag_guesser`:
```json
{
  "options": ["reactjs", "javascript", "typescript", "redux"],
  "timeLimit": 30
}
```

**`timeLimit` by mode:**

| Mode | timeLimit (seconds) |
|------|-------------------|
| `judge` | 30 |
| `score_guesser` | 30 |
| `multiple_choice` | 30 |
| `tag_guesser` | 30 |
| `answer_arena` | 120 |

> **Important:** Store the entire `question` object — you must send it back in the `evaluate` request as `question_snapshot`.

---

### `POST /api/game/evaluate`

Submit an answer and receive the result. This is the core game loop endpoint. Rate limited to **60 requests per minute per IP**.

**Headers:** `Authorization: Bearer <token>`

**Request body — by mode:**

#### `judge` mode:
```json
{
  "session_id": "a1b2c3d4-...",
  "question_id": 11227809,
  "player_choice": "upvote",          // "upvote" or "downvote"
  "time_taken_ms": 8500,
  "question_snapshot": { ...full question object from /game/question... }
}
```

#### `score_guesser` mode:
```json
{
  "session_id": "a1b2c3d4-...",
  "question_id": 11227809,
  "player_choice": "100-500",         // "0-10" | "10-100" | "100-500" | "500+"
  "time_taken_ms": 12000,
  "question_snapshot": { ... }
}
```

#### `answer_arena` mode:
```json
{
  "session_id": "a1b2c3d4-...",
  "question_id": 11227809,
  "player_answer": "In React 18, StrictMode mounts components twice to help detect side effects...",
  "time_taken_ms": 45000,
  "question_snapshot": { ... }
}
```

#### `multiple_choice` mode:
```json
{
  "session_id": "a1b2c3d4-...",
  "question_id": 11227809,
  "player_choice": "reactjs",         // must be one of the options[] returned
  "time_taken_ms": 6000,
  "question_snapshot": { ... }
}
```

#### `tag_guesser` mode:
```json
{
  "session_id": "a1b2c3d4-...",
  "question_id": 11227809,
  "player_choice": "hooks",           // any tag string — correct if it exists in question.tags
  "time_taken_ms": 9000,
  "question_snapshot": { ... }
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "correct": true,
    "scoreEarned": 40,
    "xpEarned": 10,
    "evaluationResult": null,           // null for all modes except answer_arena
    "snapshot": {
      "session_id": "a1b2c3d4-...",
      "score": 40,
      "streak": 1,
      "streak_multiplier": 1,
      "questions_answered": 1,
      "correct_count": 1,
      "xp_earned": 20
    }
  }
}
```

**For `answer_arena` mode, `evaluationResult` is populated:**
```json
{
  "evaluationResult": {
    "similarity": 0.78,
    "points": 40,
    "label": "great",
    "feedback": "✅ Great! You captured the key concepts well."
  }
}
```

**Errors:**

| Status | Code | Reason |
|--------|------|--------|
| 400 | `VALIDATION_ERROR` | Missing field, wrong type |
| 400 | `(message)` | `player_answer` and `player_choice` both missing |
| 400 | `(message)` | Question already answered in this session |
| 404 | `SESSION_NOT_FOUND` | Session doesn't exist or already ended |
| 429 | `GAME_RATE_LIMIT` | Submitting too fast (>60/min) |
| 503 | `HF_UNAVAILABLE` | HuggingFace API down (answer_arena) — triggers keyword fallback |

---

### `POST /api/game/session/end`

Finalize the session. Writes final stats to DB, updates user XP/level/streak record, creates leaderboard entry. Clears the in-memory session.

> **Call this!** If a client closes without calling this, the session stays in memory until server restart. Always call on game-over, quit, or app close.

**Headers:** `Authorization: Bearer <token>`

**Request body:**
```json
{
  "session_id": "a1b2c3d4-..."
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-...",
    "userId": "550e8400-...",
    "mode": "judge",
    "tag": "javascript",
    "score": 420,
    "accuracy": 0.733,
    "streakPeak": 7,
    "questionsCount": 15,
    "correctCount": 11,
    "durationSecs": 247,
    "isDaily": false,
    "xpEarned": 115,
    "createdAt": "2024-04-19T12:00:00.000Z"
  }
}
```

---

### `GET /api/game/session/:id`

Get a finalized session's stats (useful for showing results after the fact).

**Headers:** `Authorization: Bearer <token>`

**Response `200`:** Same shape as session/end response above.

**Errors:**

| Status | Code | Reason |
|--------|------|--------|
| 404 | `NOT_FOUND` | Session ID doesn't exist |

---

### `GET /api/game/daily`

Get today's 10 daily challenge questions. No authentication required. The same 10 questions are returned to all users for the calendar day.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "question_id": 123456,
      "title": "...",
      ...
    },
    // 9 more questions
  ]
}
```

> The daily set is created lazily on first request each day using `ORDER BY RANDOM() LIMIT 10` from the question cache.

---

## Scores Endpoints

---

### `GET /api/scores/leaderboard`

Get the global leaderboard. Public endpoint.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `period` | `all_time\|weekly` | `all_time` | Weekly resets each ISO week |
| `mode` | GameMode | — | Filter by specific mode |
| `tag` | string | — | Filter by specific tag |
| `limit` | number | `20` | Max `100` |

**Request:**
```
GET /api/scores/leaderboard?period=weekly&mode=judge&tag=javascript&limit=10
```

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "username": "Jon Skeet",
      "score": 9840,
      "mode": "judge",
      "tag": "javascript",
      "date": "2024-04-19"
    },
    {
      "rank": 2,
      "username": "CleverDev1234",
      "score": 7200,
      "mode": "judge",
      "tag": "javascript",
      "date": "2024-04-17"
    }
  ]
}
```

---

### `GET /api/scores/me/stats`

Get the authenticated user's aggregated statistics.

**Headers:** `Authorization: Bearer <token>`

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "total_games": 47,
    "total_score": 18420,
    "best_score": 840,
    "avg_score": 391.9,
    "accuracy": 0.697,
    "streak_record": 12,
    "xp": 1250,
    "level": 4,
    "favorite_mode": "judge",
    "favorite_tag": "javascript"
  }
}
```

**Level formula:** `level = floor(sqrt(xp / 100)) + 1`

| XP | Level |
|----|-------|
| 0 | 1 |
| 100 | 2 |
| 400 | 3 |
| 900 | 4 |
| 1600 | 5 |
| 10000 | 11 |

---

### `GET /api/scores/me/history`

Get the authenticated user's recent game sessions, newest first.

**Headers:** `Authorization: Bearer <token>`

**Query params:**

| Param | Type | Default | Max |
|-------|------|---------|-----|
| `limit` | number | `10` | `50` |
| `offset` | number | `0` | — |

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "mode": "answer_arena",
      "tag": "python",
      "score": 840,
      "accuracy": 0.8,
      "streakPeak": 10,
      "questionsCount": 20,
      "correctCount": 16,
      "durationSecs": 412,
      "xpEarned": 165,
      "createdAt": "2024-04-19T12:00:00.000Z"
    }
  ]
}
```

---

### `POST /api/scores/guest`

Save a guest score to the leaderboard without a JWT. Useful when a client played with a guest token but wants to submit to the board.

**Request body:**
```json
{
  "username": "CleverNinja4291",
  "score": 420,
  "mode": "judge",
  "tag": "javascript",
  "session_id": "a1b2c3d4-..."    // must be a real ended session UUID
}
```

**Response `200`:**
```json
{
  "success": true,
  "data": { "message": "Score saved to leaderboard" }
}
```

---

## Categories Endpoint

---

### `GET /api/categories`

Get all supported tags with their question counts and average SO vote score in the local cache. No authentication required.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "supported_tags": [
      "javascript", "python", "java", "c#", "c++", "php",
      "typescript", "react", "node.js", "css", "html",
      "sql", "mongodb", "docker", "git", "linux", "bash",
      "regex", "algorithms", "data-structures", "swift",
      "kotlin", "rust", "go", "ruby", "angular", "vue.js"
    ],
    "stats": [
      { "tag": "javascript", "count": 412, "avg_score": 284.7 },
      { "tag": "python",     "count": 398, "avg_score": 198.3 },
      { "tag": "react",      "count": 312, "avg_score": 156.1 }
    ]
  }
}
```

---

## SO Proxy Endpoints

These endpoints expose the cached Stack Overflow data. Responses are served from the local DB cache when available, falling back to live SO API.

---

### `GET /api/so/questions`

Get Stack Overflow questions, cached locally.

**Query params:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `tag` | string | — | Filter by tag |
| `page` | number | `1` | Pagination |
| `pagesize` | number | `30` | Max `50` |
| `sort` | string | `votes` | `votes\|activity\|creation` |

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "question_id": 11227809,
      "title": "Why does useEffect fire twice...",
      "tags": ["reactjs", "hooks"],
      "score": 847,
      ...
    }
  ]
}
```

---

### `GET /api/so/answers/:questionId`

Get answers for a specific question. Rate limited by general limiter.

**Response `200`:**
```json
{
  "success": true,
  "data": [
    {
      "answer_id": 11228336,
      "question_id": 11227809,
      "score": 1203,
      "is_accepted": true,
      "body_markdown": "In React 18, **StrictMode** intentionally...",
      "owner": {
        "display_name": "Dan Abramov",
        "reputation": 248000
      }
    }
  ]
}
```

---

### `GET /api/so/quota`

Check current Stack Overflow API quota usage.

**Response `200`:**
```json
{
  "success": true,
  "data": {
    "quota_max": 300,
    "quota_remaining": 248,
    "backoff": 0
  }
}
```

---

## Utility Endpoints

---

### `GET /health`

Health check. No auth, not rate-limited. Use for uptime monitoring.

**Response `200`:**
```json
{
  "status": "ok",
  "timestamp": "2024-04-19T12:00:00.000Z",
  "version": "1.0.0",
  "env": "development"
}
```

---

### `GET /api/docs`

Swagger UI — interactive API explorer. Available in development.

### `GET /api/docs.json`

Raw OpenAPI 3.0 JSON spec.

---

## 7. Scoring Engine

### Base Points per Mode

| Mode | Base Points | Time Bonus Max | Notes |
|------|------------|----------------|-------|
| `judge` | 10 | +10 | Fast answer rewards speed |
| `score_guesser` | 15 | +10 | |
| `answer_arena` | 0 | 0 | Scoring is purely similarity-based (0–60 pts) |
| `multiple_choice` | 20 | +10 | Most points for hardest decision |
| `tag_guesser` | 12 | +10 | |

### Time Bonus Formula (non-arena modes)

```
timeBonusFactor = max(0, 1 - timeTakenMs / 30000)
timeBonus = round(10 * timeBonusFactor)
```

Example: answer in 6 seconds → `1 - 6000/30000 = 0.8` → `+8 time bonus`

### Streak Multiplier

| Streak | Multiplier |
|--------|-----------|
| 0–4 | 1× |
| 5–9 | 2× |
| 10–12 | 3× |
| 13+ | 5× |

### Final Score Formula (non-arena modes)

```
scoreEarned = (basePoints + timeBonus) × streakMultiplier
```

Example: Correct judge answer in 5s with a 6-streak:
```
timeBonus = round(10 × (1 - 5000/30000)) = round(10 × 0.833) = 8
scoreEarned = (10 + 8) × 2 = 36
```

### XP Formula

```
// Per answer:
xpEarned = correct ? 10 : 0

// answer_arena:
xpEarned = round(similarity × 20)   // 0–20 based on quality

// Base XP per game (just for starting):
xpEarned += 5

// User level:
newLevel = floor(sqrt(totalXp / 100)) + 1
```

---

## 8. HuggingFace Answer Evaluation

Used exclusively in `answer_arena` mode.

### Pipeline

```
Player answer (string)
        │
        ▼
Length check (< 10 chars → 0 similarity, 'off' label)
        │
        ▼
Truncate to 512 chars
        │
        ▼
POST https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2
Body: { inputs: [playerAnswer, referenceAnswer] }
        │
        ▼
Returns: [[384-dim vector], [384-dim vector]]
        │
        ▼
Cosine similarity = dot(A,B) / (|A| × |B|)
        │
        ▼
Map similarity → label + points + feedback
```

### Similarity → Label Mapping

| Similarity | Label | Points | Feedback |
|-----------|-------|--------|---------|
| ≥ 0.85 | `excellent` | 60 | "🎯 Excellent! Your answer closely matches the accepted solution." |
| ≥ 0.70 | `great` | 40 | "✅ Great! You captured the key concepts well." |
| ≥ 0.50 | `good` | 25 | "👍 Good attempt! You got some important points." |
| ≥ 0.30 | `partial` | 10 | "🤔 Partial credit. You were on the right track." |
| < 0.30 | `off` | 0 | "❌ Your answer was quite different from the accepted solution." |

### Model Cold Start

The free HuggingFace tier puts models to sleep after inactivity. On the first call, the API returns:
```json
{ "error": "Model is loading", "estimated_time": 20 }
```
The service retries up to **3 times** with the suggested wait time before falling back to the **keyword overlap fallback**.

### Keyword Fallback

When HuggingFace is unavailable, a simpler evaluation runs:
```
normalizedPlayer = lowercase + strip punctuation + split words
normalizedRef = same
overlap = intersection(player_words, ref_words)
similarity = overlap.length / ref_words.length
```
Same label/points mapping applies.

---

## 9. Question Pool System

### Flow

```
App Start
   │
   ▼
Cron job starts (strictly every 1 hour, also runs immediately on startup)
   │
   ├─ Count questions in DB for all 27 supported tags
   ├─ Identify the single most 'starving' tag (count < QUESTION_POOL_MIN)
   │    If a starving tag exists:
   │      Fetch 1 page from SO API (exactly 100 questions) for that tag
   │      Bulk-enrich all 100 questions with top_answer_text using one vectorized API call
   │      Upsert into so_question_cache
   │    If all tags are healthy:
   │      Pick a random tag and refresh its top 100 questions
   │
   └─ Delete entries older than 7 days (last_fetched < now - 7 days)
```

### Difficulty Assignment

Difficulty is assigned when questions are fetched from SO based on their vote score:

| SO Score | Difficulty |
|----------|-----------|
| < 10 | `easy` |
| 10 – 99 | `medium` |
| ≥ 100 | `hard` |

*(This is derived in SO service before caching — not stored in schema as a computed column)*

### Question Selection (getNextQuestion)

1. Build Prisma `where` clause from `{ tag, difficulty, excludeIds, mode }`
2. Fetch **30 candidates** ordered by `lastFetched DESC`
3. Pick **one at random in JavaScript** (avoids `ORDER BY RANDOM()` index scan)
4. If no candidates → fallback to live SO API fetch

---

## 10. Error Handling

### AppError class

All errors are thrown as `AppError` instances:

```typescript
// Factory methods
AppError.badRequest(message, code?)         // 400
AppError.unauthorized(message, code?)       // 401
AppError.forbidden(message, code?)          // 403
AppError.notFound(message, code?)           // 404
AppError.conflict(message, code?)           // 409
AppError.tooManyRequests(message, code?)    // 429
AppError.internal(message, code?)           // 500
new AppError(message, statusCode, code?)    // custom
```

### Error Response Shape

```json
{
  "success": false,
  "error": {
    "message": "Email already registered",
    "code": "EMAIL_TAKEN",
    "statusCode": 409
  }
}
```

In `NODE_ENV=development`, 5xx errors also include `stack` in the response.

### Error Codes Reference

| Code | HTTP | Where |
|------|------|-------|
| `VALIDATION_ERROR` | 400 | Any endpoint with invalid request body |
| `EMAIL_TAKEN` | 409 | POST /auth/register |
| `USERNAME_TAKEN` | 409 | POST /auth/register |
| `INVALID_CREDENTIALS` | 401 | POST /auth/login |
| `INVALID_TOKEN` | 401 | Any protected route |
| `INVALID_REFRESH_TOKEN` | 401 | POST /auth/refresh |
| `USER_NOT_FOUND` | 401 | POST /auth/refresh |
| `SESSION_NOT_FOUND` | 404 | Any /game endpoint |
| `ROUTE_NOT_FOUND` | 404 | Any unknown route |
| `AUTH_RATE_LIMIT` | 429 | /auth/* endpoints |
| `GAME_RATE_LIMIT` | 429 | POST /game/evaluate |
| `RATE_LIMIT` | 429 | Any endpoint |
| `HF_UNAVAILABLE` | 503 | POST /game/evaluate (answer_arena) |
| `HF_RETRY_EXHAUSTED` | 503 | POST /game/evaluate (answer_arena) |

---

## 11. Rate Limiting

| Limiter | Applies To | Window | Max Requests |
|---------|-----------|--------|-------------|
| `generalLimiter` | All `/api/*` routes | 1 minute | 100 per IP |
| `authLimiter` | `/api/auth/register`, `/login`, `/guest` | 15 minutes | 10 per IP |
| `gameLimiter` | `POST /api/game/evaluate` | 1 minute | 60 per IP |

Rate limit headers returned on every response:
```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 1713512400
```

---

## 12. Quickstart

### 1. Get the Neon.tech connection string

1. Create a free project at [console.neon.tech](https://console.neon.tech)
2. Go to **Connection Details** → enable **Pooled connection** → copy the connection string

### 2. Configure `.env`

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL=postgresql://user:pass@ep-xxx.neon.tech/dbname?sslmode=require
JWT_SECRET=generate-a-32-char-random-string
JWT_REFRESH_SECRET=generate-another-32-char-random-string
HUGGINGFACE_API_KEY=hf_your_token_here
```

### 3. Push schema to Neon

```bash
npm install
npm run db:push        # creates all 6 tables in Neon
npm run db:studio      # optional: open Prisma Studio GUI
```

### 4. Start the server

```bash
npm run dev
```

On startup you'll see:
```
✅ PostgreSQL connected via Prisma + Neon
🔄 Question pool refresh starting...
╔═══════════════════════════════════════════╗
║   StackQuest API Server — v1.0.0          ║
║   http://localhost:3000                   ║
║   Swagger: http://localhost:3000/api/docs ║
╚═══════════════════════════════════════════╝
```

### 5. Test with curl

```bash
# Health check
curl http://localhost:3000/health

# Create guest user
curl -X POST http://localhost:3000/api/auth/guest

# Store the token
TOKEN="eyJhbGci..."

# Start a game session
SESSION=$(curl -s -X POST http://localhost:3000/api/game/session/start \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"judge","tag":"javascript"}' | node -e "process.stdin||(()=>{});require('fs').readFileSync('/dev/stdin','utf8');")

echo $SESSION   # shows the SessionSnapshot with session_id
```

### npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/server.js` |
| `npm run lint` | Type-check without emitting files |
| `npm run db:push` | Push Prisma schema → Neon (no migration files) |
| `npm run db:migrate` | Create + apply a named migration |
| `npm run db:studio` | Open Prisma Studio GUI |
| `npm run db:reset` | Drop + recreate DB |
| `npm run db:generate` | Regenerate Prisma client after schema change |
