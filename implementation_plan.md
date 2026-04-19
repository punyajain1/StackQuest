# StackQuest — Implementation Plan

> A retro arcade game that turns Stack Overflow's entire knowledge base into an addictive, skill-building experience. Real questions. Real answers. Real scores.

---

## Vision

Stack Overflow is dying as a community but sits on the world's richest developer Q&A dataset. StackQuest gamifies that data so developers *learn by playing* — not by googling. The game fetches live SO questions, lets players answer them in their own words, evaluates answers against the accepted/top-voted SO answers using semantic similarity, and rewards accuracy with points, streaks, and XP.

---

## User Review Required

> [!IMPORTANT]
> **Stack Overflow API Key**: Without a registered API key, you get only 300 req/day per IP. I strongly recommend registering on [StackApps](https://stackapps.com/) to get 10,000 req/day. Should I build the system to support an API key env variable?

> [!IMPORTANT]
> **Answer Evaluation Engine**: Checking player answers against SO answers requires either:
> - **Option A (Recommended)**: Use a free embedding model (e.g., Hugging Face `all-MiniLM-L6-v2` via their free Inference API) to compute cosine similarity between the player's answer and the accepted SO answer. No cost, ~500ms latency.
> - **Option B**: Use OpenAI `text-embedding-3-small` (~$0.02/1000 evaluations). More accurate.
> - **Option C**: Simple keyword matching (no AI at all). Fast but rough.
> Which approach do you want?

> [!WARNING]
> **Database**: For a proper backend that supports mobile + web, we need persistent storage. I propose using **PostgreSQL** (via Supabase free tier) for users, scores, and question cache. Alternatively, if you want zero infra, we can use **SQLite** for local development and migrate later. Which?

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    CLIENTS                              │
│  React Web App   ←──→   React Native Mobile App        │
└──────────────────────────┬──────────────────────────────┘
                           │ REST API / WebSocket
┌──────────────────────────▼──────────────────────────────┐
│              StackQuest Backend (Node.js/Express/TS)    │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐  │
│  │ /auth    │  │ /game    │  │ /scores  │  │ /so    │  │
│  │ routes   │  │ routes   │  │ routes   │  │ proxy  │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───┬────┘  │
│       │             │              │             │       │
│  ┌────▼─────────────▼──────────────▼─────────────▼────┐ │
│  │              Service Layer                          │ │
│  │  AuthService  GameEngine  ScoreService  SOService  │ │
│  └──────────────────────┬──────────────────────────────┘ │
│                         │                               │
│  ┌──────────────────────▼──────────────────────────────┐ │
│  │              Data Layer                             │ │
│  │  PostgreSQL (users, scores, sessions, cache)        │ │
│  │  Redis (rate limiting, session cache, SO API cache) │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
                           │
         ┌─────────────────▼─────────────────┐
         │   External Services               │
         │  Stack Overflow API v2.3          │
         │  HuggingFace Inference API        │
         └───────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Backend runtime | Node.js 20 + TypeScript | Type safety, fast ecosystem |
| Framework | Express.js v5 | Mature, flexible, huge ecosystem |
| Database | PostgreSQL (Supabase free) | Persistent, relational, free tier |
| Cache | Redis (Upstash free) | SO API response caching, rate limit |
| Answer Eval | HuggingFace Inference API | Free semantic similarity |
| Web Frontend | React 18 + Vite + Tailwind | Fast, modern |
| Mobile | React Native + Expo | Share logic with web |
| Auth | JWT + optional Google OAuth | Stateless, works for both clients |
| API Docs | Swagger/OpenAPI | Auto-generated from routes |
| Deployment | Railway / Render (free tier) | Simple Node.js deploy |

---

## Feature List (Complete)

### 🎮 Game Modes

| # | Mode | Description |
|---|---|---|
| 1 | **Judge** | Upvote or Downvote — was this question net positive? |
| 2 | **Score Guesser** | Guess the vote score range (0-10, 10-100, etc.) |
| 3 | **Answer Arena** ⭐ | Write your own answer, evaluated vs accepted SO answer |
| 4 | **Multiple Choice** | 4 options generated from real answers on the post |
| 5 | **Bug Hunt** | Given a code snippet, identify the bug category |
| 6 | **Tag Guesser** | Shown a question body, guess the primary tag |

### 🧠 Answer Evaluation (Answer Arena mode)

1. Player sees a real SO question with code context
2. Player types their answer (min 20 chars, max 500)
3. Backend sends both texts to embedding service
4. Cosine similarity score (0.0 → 1.0) maps to:
   - 0.0–0.3 → 0 pts (totally off)
   - 0.3–0.5 → 10 pts (partial)
   - 0.5–0.7 → 25 pts (good)
   - 0.7–0.85 → 40 pts (great)
   - 0.85–1.0 → 60 pts (excellent) + streak bonus
5. Show actual accepted answer after evaluation
6. Show similarity score as a "match meter"

### 📊 Scoring System

- **Base points**: vary by mode and difficulty
- **Streak multiplier**: 1x → 2x → 3x → 5x (breaks on wrong)
- **Time bonus**: faster answers earn more points
- **XP system**: separate from score, used for leveling
- **Levels**: Beginner → Stack Overflow Regular → Power User → Legendary → Jon Skeet
- **Daily challenges**: fixed set of 10 questions, resets at midnight UTC

### 🏆 Leaderboard

- Global (all time)
- Weekly (resets Mondays)
- Per-category (javascript, python, etc.)
- Friends (if using Google auth)

### 👤 User System

- **Anonymous mode**: guest play, score saved to device localStorage
- **Registered**: JWT auth, persistent scores, cross-device, leaderboard eligibility
- **Google OAuth**: one-click signup

### 🗂️ Categories

Popular tags available for selection:
`javascript`, `python`, `java`, `c#`, `c++`, `php`, `typescript`, `react`, `node.js`, `css`, `html`, `sql`, `mongodb`, `docker`, `git`, `linux`, `bash`, `regex`, `algorithms`, `data-structures`

Plus: **All Tags Mixed** (default shuffle)

### 📦 SO API Caching Strategy

- Backend caches SO API responses in Redis for 24hrs
- Pre-fetches popular tags in background every 6hrs
- Question pool of 500+ questions per tag stored in PostgreSQL
- Rate limit: 10,000 req/day with API key → ~416/hr → sufficient for all users

---

## Backend API Endpoints

### Authentication
```
POST   /api/auth/register        — email + password signup
POST   /api/auth/login           — returns JWT
POST   /api/auth/google          — Google OAuth token exchange
GET    /api/auth/me              — get current user profile
POST   /api/auth/refresh         — refresh JWT
```

### Game
```
GET    /api/game/question        — fetch next question for game session
       ?tag=javascript&mode=judge&difficulty=medium&exclude_ids=1,2,3

POST   /api/game/evaluate        — submit answer, get score
       body: { question_id, mode, answer, session_id, time_taken_ms }

GET    /api/game/session/:id     — get session summary
POST   /api/game/session/start   — start new game session
POST   /api/game/session/end     — end session, finalize score

GET    /api/game/daily           — today's daily challenge questions
POST   /api/game/daily/submit    — submit daily challenge answer
```

### Questions
```
GET    /api/questions            — paginated question pool
       ?tag=python&difficulty=hard&min_score=50
GET    /api/questions/:id        — get full question with answers
GET    /api/questions/:id/answers — get answers for question
```

### Leaderboard & Scores
```
GET    /api/leaderboard          — global leaderboard
       ?period=weekly&tag=javascript&limit=20
GET    /api/scores/me            — my score history
GET    /api/scores/stats         — my overall stats (accuracy, streak record, etc.)
POST   /api/scores               — save guest score (from localStorage sync)
```

### Categories
```
GET    /api/categories           — list all available tags with question counts
GET    /api/categories/:tag/stats — tag difficulty distribution, avg score, etc.
```

### Stack Overflow Proxy
```
GET    /api/so/questions         — proxied SO API (cached, rate-limited)
GET    /api/so/answers/:id       — get answers for a question
```

---

## Database Schema

### users
```sql
id            UUID PRIMARY KEY
username      TEXT UNIQUE
email         TEXT UNIQUE
password_hash TEXT
google_id     TEXT
xp            INTEGER DEFAULT 0
level         INTEGER DEFAULT 1
streak_record INTEGER DEFAULT 0
created_at    TIMESTAMP
last_active   TIMESTAMP
```

### game_sessions
```sql
id            UUID PRIMARY KEY
user_id       UUID REFERENCES users(id) -- nullable for guests
mode          TEXT  -- judge | score_guesser | answer_arena | etc.
tag           TEXT  -- null = all tags
score         INTEGER
accuracy      FLOAT
streak_peak   INTEGER
questions_count INTEGER
duration_secs INTEGER
created_at    TIMESTAMP
```

### question_answers (game moves)
```sql
id            UUID PRIMARY KEY
session_id    UUID REFERENCES game_sessions(id)
question_id   INTEGER  -- SO question_id
mode          TEXT
player_answer TEXT      -- raw text for answer_arena
correct       BOOLEAN
score_earned  INTEGER
similarity    FLOAT     -- for answer_arena mode
time_taken_ms INTEGER
created_at    TIMESTAMP
```

### so_question_cache
```sql
question_id   INTEGER PRIMARY KEY
title         TEXT
body          TEXT
tags          TEXT[]
score         INTEGER
answer_count  INTEGER
accepted_answer_id INTEGER
top_answer_text TEXT
difficulty    TEXT  -- easy/medium/hard (computed from score+answers)
last_fetched  TIMESTAMP
```

### leaderboard_entries
```sql
id          UUID PRIMARY KEY
user_id     UUID REFERENCES users(id)
session_id  UUID REFERENCES game_sessions(id)
score       INTEGER
mode        TEXT
tag         TEXT
period_week TEXT  -- e.g. "2024-W15"
created_at  TIMESTAMP
```

---

## Proposed Changes

### Backend

#### [NEW] `backend/` — Express.js TypeScript API

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts           # Zod-validated env vars
│   │   ├── database.ts      # PostgreSQL pool setup
│   │   └── redis.ts         # Redis client setup
│   ├── routes/
│   │   ├── auth.routes.ts
│   │   ├── game.routes.ts
│   │   ├── scores.routes.ts
│   │   ├── categories.routes.ts
│   │   └── so.routes.ts
│   ├── controllers/
│   │   ├── auth.controller.ts
│   │   ├── game.controller.ts
│   │   └── scores.controller.ts
│   ├── services/
│   │   ├── auth.service.ts        # JWT, bcrypt
│   │   ├── game.service.ts        # game logic, session mgmt
│   │   ├── score.service.ts       # score calculation, leaderboard
│   │   ├── so.service.ts          # SO API wrapper + caching
│   │   ├── evaluation.service.ts  # answer similarity scoring
│   │   └── question.service.ts    # question pool management
│   ├── middleware/
│   │   ├── auth.middleware.ts     # JWT verify
│   │   ├── rateLimit.middleware.ts
│   │   ├── error.middleware.ts    # global error handler
│   │   └── validate.middleware.ts # Zod schema validation
│   ├── models/
│   │   └── db.types.ts           # TypeScript types for DB rows
│   ├── utils/
│   │   ├── logger.ts             # pino structured logging
│   │   ├── cache.ts              # Redis cache helpers
│   │   └── similarity.ts         # cosine similarity util
│   ├── jobs/
│   │   └── questionFetcher.ts    # cron job: refresh SO question pool
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # HTTP server entry point
├── migrations/                   # SQL migration files
├── .env.example
├── package.json
├── tsconfig.json
└── Dockerfile
```

#### [NEW] `web/` — React + Vite Web App
```
web/
├── src/
│   ├── components/
│   │   ├── GameCard/         # question card with animations
│   │   ├── Timer/            # 30-second countdown
│   │   ├── StreakCounter/    # multiplier display
│   │   ├── AnswerInput/      # text input for answer arena
│   │   ├── ResultCard/       # post-answer result reveal
│   │   └── Leaderboard/      # score tables
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── Game.tsx
│   │   ├── GameOver.tsx
│   │   └── Leaderboard.tsx
│   ├── hooks/
│   │   ├── useGame.ts        # game state machine
│   │   └── useAuth.ts
│   ├── styles/
│   │   └── retro.css         # CRT effects, pixel fonts
│   └── utils/
│       └── api.ts            # typed API client
```

---

## Build Phases

### Phase 1 — Backend Foundation (Day 1–2)
- [ ] Init Node.js/TypeScript/Express project
- [ ] Set up PostgreSQL schema + migrations
- [ ] Redis cache setup
- [ ] SO API wrapper service with caching
- [ ] Question pool fetcher (background job)
- [ ] Basic auth (JWT + register/login)
- [ ] Health check + Swagger docs

### Phase 2 — Game Engine (Day 2–3)
- [ ] Game session management
- [ ] Judge mode scoring logic
- [ ] Score Guesser mode
- [ ] Answer Arena: HuggingFace embedding integration
- [ ] Answer evaluation service
- [ ] Streak + multiplier calculation
- [ ] Leaderboard service

### Phase 3 — Web Frontend (Day 3–5)
- [ ] Vite + React setup with retro theme
- [ ] Home / Category / Mode selection screen
- [ ] Game board with 30-sec timer
- [ ] Question cards with swipe animation
- [ ] Answer input (Answer Arena mode)
- [ ] Result reveal card
- [ ] Game over screen + stats
- [ ] Leaderboard page

### Phase 4 — Polish & Mobile (Day 5–7)
- [ ] React Native / Expo mobile app
- [ ] Share score card feature
- [ ] Daily challenge system
- [ ] Difficulty tiers
- [ ] Sound effects (Web Audio API for web)
- [ ] PWA manifest + offline support

---

## Verification Plan

### Automated Tests
- `npm run test` — Jest unit tests for scoring logic, similarity service
- Integration tests for all API endpoints using Supertest
- SO API mock for CI (avoid hitting rate limits in tests)

### Manual Verification
- Play all 4 game modes end-to-end
- Verify answer evaluation returns sensible similarity scores
- Check leaderboard ordering and weekly reset
- Test on mobile viewport + React Native simulator
- Verify SO API caching prevents re-fetching same questions

---

## Open Questions

> [!IMPORTANT]
> 1. **Answer evaluation**: HuggingFace (free), OpenAI (paid+accurate), or keyword matching?
> 2. **Database**: Supabase free PostgreSQL, or SQLite for simplicity?
> 3. **SO API Key**: Do you want to register one? Highly recommended.
> 4. **Deployment target**: Railway, Render, Vercel serverless, or local only for now?
> 5. **Mobile**: React Native + Expo now, or web-first and mobile later?
> 6. **Auth**: Is Google OAuth essential for v1, or email/password + guest mode enough?
