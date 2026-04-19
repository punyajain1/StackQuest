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
