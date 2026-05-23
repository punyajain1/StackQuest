# StackQuest Backend — Optimization Agent Instructions

> **How to use this file:** Hand this document to your AI coding agent. Each section is a self-contained task with exact file targets, code to add/change, and a verification step. Tasks are ordered so that earlier ones never break later ones. Do **not** skip ahead — each task assumes the previous one is complete.

---

## Ground Rules for the Agent

- **Never delete existing Prisma models or fields** unless explicitly told to in that task.
- **Never change REST API route signatures** (method + path) or WebSocket event names.
- **Always run `npx prisma generate` after any `schema.prisma` change.**
- **Always run `npx prisma migrate dev --name <task-name>` after schema changes** in development, or `npx prisma migrate deploy` in production.
- After every task, run the existing test suite. If any test fails, roll back only that task and report which assertion broke.
- All TypeScript must compile with zero errors (`npx tsc --noEmit`).
- Treat every code block in this document as the **exact final form** — do not reformat, rename variables, or restructure unless the task explicitly says to refactor.

---

## Task 1 — Add Missing Database Indexes

**Risk level:** Zero. Indexes are additive and never change query results.  
**Files to change:** `prisma/schema.prisma`  
**Estimated time:** 15 minutes

### What & Why

Every `findMany` on `so_question_cache`, every daily-challenge check, every leaderboard read, and every duel matchmaking query is doing a full sequential table scan right now. These indexes cut those to index scans.

### Exact Changes

Open `prisma/schema.prisma`. For each model below, add the `@@index` lines shown. Do not change any existing field or relation.

#### Model: `game_sessions`

Find the model block. Add at the bottom, before the closing `}`:

```prisma
@@index([userId, mode, dailyDate])
@@index([mode, score])
```

#### Model: `so_question_cache`

```prisma
@@index([isAnswered, difficulty])
@@index([lastFetched])
```

> **Note:** The `tags` field is a `String[]` (Postgres array). To index it with GIN, add a raw SQL migration **after** running `prisma migrate`. Create the file `prisma/migrations/YYYYMMDDHHMMSS_gin_tags_index/migration.sql` with:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_so_cache_tags_gin
  ON so_question_cache USING gin(tags);
```

Run it with: `psql $DATABASE_URL -f prisma/migrations/<folder>/migration.sql`

#### Model: `leaderboard_entries`

```prisma
@@index([periodWeek, mode, score(sort: Desc)])
@@index([userId, periodWeek])
```

#### Model: `duel_matches`

```prisma
@@index([status, player1Elo])
@@index([player1Id, status])
@@index([player2Id, status])
```

#### Model: `duel_questions`

```prisma
@@index([matchId, roundNumber])
```

> This is already a unique constraint, confirm it exists as `@@unique([matchId, roundNumber])`. If it does, the index is implicit — skip the `@@index` line for this one.

#### Model: `friendships`

```prisma
@@index([receiverId, status])
```

### Run After Changes

```bash
npx prisma migrate dev --name add_performance_indexes
npx prisma generate
npx tsc --noEmit
```

### Verification

Run this query in psql and confirm each index appears:

```sql
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

---

## Task 2 — Wrap Duel Answer Submission in a Transaction

**Risk level:** Low. This is a pure refactor of existing write logic — same operations, atomic execution.  
**Files to change:** The file containing `submitDuelAnswer` (likely `src/services/duel.service.ts` or `src/controllers/duel.controller.ts`)  
**Estimated time:** 20 minutes

### What & Why

Currently, submitting a duel answer does two separate database writes:
1. `prisma.duelQuestion.update(...)` — records the player's answer
2. `prisma.duelMatch.update({ [scoreField]: { increment: 1 } })` — updates score if correct

If the server crashes between step 1 and step 2, the answer is recorded but the score is not updated. Wrap both in `prisma.$transaction`.

### Exact Changes

Find the function that handles duel answer submission. It will look like this:

```typescript
// EXISTING CODE — find and replace this entire block
await prisma.duelQuestion.update({ where: { id: duelQ.id }, data: updateData });

if (correct) {
  const scoreField = isPlayer1 ? 'player1Score' : 'player2Score';
  await prisma.duelMatch.update({
    where: { id: matchId },
    data: { [scoreField]: { increment: 1 } },
  });
}
```

Replace it with:

```typescript
// REPLACEMENT — atomic transaction
const scoreField = isPlayer1 ? 'player1Score' : 'player2Score';

await prisma.$transaction([
  prisma.duelQuestion.update({
    where: { id: duelQ.id },
    data: updateData,
  }),
  ...(correct
    ? [
        prisma.duelMatch.update({
          where: { id: matchId },
          data: { [scoreField]: { increment: 1 } },
        }),
      ]
    : []),
]);
```

### Verification

- Submit a correct answer in a duel and confirm `player1Score` or `player2Score` increments.
- Submit an incorrect answer and confirm score does not change.
- Confirm `duel_questions` row has the answer recorded in both cases.

---

## Task 3 — Replace duelQuestion Creation Loop with `createMany`

**Risk level:** Low. Same data, one round-trip instead of N.  
**Files to change:** The file containing `createDuel` or duel match creation logic.  
**Estimated time:** 20 minutes

### What & Why

When a duel is created, 5 `duelQuestion` rows are inserted one-by-one in a `for` loop. This is 5 sequential database round-trips. Replace with a single `createMany` call.

### Exact Changes

Find the loop that creates duel questions. It will look roughly like:

```typescript
// EXISTING CODE — find this loop pattern
for (let i = 0; i < questions.length; i++) {
  const question = questions[i];
  // ... qType, correctAnswer, options computation ...
  await prisma.duelQuestion.create({
    data: {
      matchId: match.id,
      roundNumber: i + 1,
      soQuestionId: questions[i].questionId,    // field name may vary
      questionType: qType,
      questionData: JSON.stringify(questions[i]),
      correctAnswer,
      options,
    },
  });
}
```

Replace the entire loop with:

```typescript
// REPLACEMENT — build the data array first, then insert once
const duelQuestionData = questions.map((question, i) => {
  const qType = pickQuestionType(question);           // keep your existing helper call
  const { correctAnswer, options } = prepareQuestion(question, qType); // keep your existing helpers
  return {
    matchId: match.id,
    roundNumber: i + 1,
    soQuestionId: question.questionId,               // match your actual field name
    questionType: qType,
    questionData: JSON.stringify(question),
    correctAnswer,
    options,
  };
});

await prisma.duelQuestion.createMany({ data: duelQuestionData });
```

> **Important:** `createMany` does not return created records in all databases. If you need the created `id` values immediately after insertion, do a `findMany({ where: { matchId: match.id } })` right after. But typically you don't need IDs at this point — the match ID is sufficient.

### Verification

- Create a new duel and confirm exactly 5 `duel_questions` rows exist for the new `matchId`.
- Confirm `roundNumber` values are 1 through 5.
- Check server logs — you should see one SQL `INSERT` statement with 5 value tuples, not 5 separate `INSERT` statements.

---

## Task 4 — Wrap ELO Settlement in a Single Transaction

**Risk level:** Medium. This touches the duel completion flow. Test carefully.  
**Files to change:** The duel resolution handler (WebSocket trigger or service method for match completion).  
**Estimated time:** 30 minutes

### What & Why

When a duel ends, the current code does these writes sequentially and independently:
1. `duelMatch.update({ status: 'completed', winnerId, ... })`
2. `user.update(player1 — elo, totalDuels, duelsWon)`
3. `user.update(player2 — elo, totalDuels, duelsWon)`
4. Query P1 stats → recalculate winRate → `user.update(player1 winRate)`
5. Query P2 stats → recalculate winRate → `user.update(player2 winRate)`

If the server crashes at step 3, Player 1 gets ELO but Player 2 doesn't. Wrap everything in one transaction.

### Exact Changes

Find the duel resolution function. Replace the sequential write block with:

```typescript
// REPLACEMENT — single atomic transaction for ELO settlement

// Compute all values BEFORE entering the transaction (pure computation, no DB calls)
const { eloChange1, eloChange2 } = calculateElo(
  match.player1.elo,
  match.player2.elo,
  outcome   // 'player1' | 'player2' | 'draw'  — keep your existing outcome variable
);

const p1Won = outcome === 'player1' ? 1 : 0;
const p2Won = outcome === 'player2' ? 1 : 0;

// Single transaction — all or nothing
await prisma.$transaction([
  // 1. Close the match
  prisma.duelMatch.update({
    where: { id: matchId },
    data: {
      status: 'completed',
      winnerId: outcome === 'draw' ? null : (outcome === 'player1' ? match.player1Id : match.player2Id),
      completedAt: new Date(),
      player1Elo: eloChange1,
      player2Elo: eloChange2,
    },
  }),

  // 2. Update Player 1
  prisma.user.update({
    where: { id: match.player1Id },
    data: {
      elo: { increment: eloChange1 },
      totalDuels: { increment: 1 },
      duelsWon: { increment: p1Won },
    },
  }),

  // 3. Update Player 2
  prisma.user.update({
    where: { id: match.player2Id },
    data: {
      elo: { increment: eloChange2 },
      totalDuels: { increment: 1 },
      duelsWon: { increment: p2Won },
    },
  }),
]);

// 4. Recalculate win rates AFTER the transaction (read fresh data)
//    Do this outside the transaction — it's a derived computation, not critical
const [p1Fresh, p2Fresh] = await Promise.all([
  prisma.user.findUnique({ where: { id: match.player1Id }, select: { totalDuels: true, duelsWon: true } }),
  prisma.user.findUnique({ where: { id: match.player2Id }, select: { totalDuels: true, duelsWon: true } }),
]);

await Promise.all([
  prisma.user.update({
    where: { id: match.player1Id },
    data: { winRate: p1Fresh.totalDuels > 0 ? p1Fresh.duelsWon / p1Fresh.totalDuels : 0 },
  }),
  prisma.user.update({
    where: { id: match.player2Id },
    data: { winRate: p2Fresh.totalDuels > 0 ? p2Fresh.duelsWon / p2Fresh.totalDuels : 0 },
  }),
]);
```

> **Note on win rate:** The two win-rate updates are intentionally outside the transaction. Win rate is a derived metric — if the server crashes here, the core ELO and match state are safe. The win rate will be slightly stale until the next duel. This is acceptable. If you want it transactional, add it inside, but it requires reading inside the transaction which means using `prisma.$transaction(async (tx) => { ... })` (interactive transaction) instead of the batch array form shown above.

### Verification

- Complete a duel and confirm the match row has `status = 'completed'`.
- Confirm both players have updated `elo`, `totalDuels`, `duelsWon`.
- Simulate a crash by throwing an error inside the transaction and confirm none of the three writes committed (check the DB directly).

---

## Task 5 — Add Answers-Submitted Counter to `duel_matches`

**Risk level:** Low. Additive schema change + small logic update.  
**Files to change:** `prisma/schema.prisma`, duel answer submission handler.  
**Estimated time:** 25 minutes

### What & Why

Currently, after every answer submission, the code queries **all** `duel_questions` for the match to check if everyone has answered every round. This is a `findMany` on every single answer. With 5 rounds and 2 players, that's 10 unnecessary queries per match.

Add an `answersSubmitted` integer counter to `duel_matches` and increment it atomically. When it reaches `rounds × 2`, trigger settlement.

### Schema Change

In `prisma/schema.prisma`, find the `duel_matches` model and add:

```prisma
answersSubmitted  Int  @default(0)
```

Then migrate:

```bash
npx prisma migrate dev --name add_answers_submitted_counter
npx prisma generate
```

### Code Change

In the answer submission handler, replace the post-answer round-complete check:

```typescript
// REMOVE THIS — the existing check that queries all questions
const allAnswered = await prisma.duelQuestion.findMany({
  where: { matchId },
});
const isComplete = allAnswered.every(
  q => q.player1Answer !== null && q.player2Answer !== null
);
```

Replace with:

```typescript
// REPLACEMENT — atomic increment + threshold check
const updatedMatch = await prisma.duelMatch.update({
  where: { id: matchId },
  data: { answersSubmitted: { increment: 1 } },
  select: { answersSubmitted: true, rounds: true },
});

const isComplete = updatedMatch.answersSubmitted >= updatedMatch.rounds * 2;
```

> The `isComplete` variable is then used the same way as before to trigger ELO settlement. No change needed downstream.

### Verification

- Play through a full 5-round duel with both players.
- Confirm `answersSubmitted` increments from 0 to 10 across the 10 answer submissions.
- Confirm ELO settlement triggers exactly once when `answersSubmitted` reaches 10.

---

## Task 6 — Replace `ORDER BY RANDOM()` with Seed-Based Daily Question Selection

**Risk level:** Low. Changes only the daily challenge question-fetching logic.  
**Files to change:** `QuestionService` — the `getDailyChallenge()` method.  
**Estimated time:** 20 minutes

### What & Why

`SELECT ... ORDER BY RANDOM()` forces Postgres to generate a random number for every row in the table before sorting. At 10,000+ cached questions, this is 10,000 random number generations + a full sort on every daily challenge start. Replace with a deterministic seed based on the current date.

### Exact Changes

Find the raw query that uses `ORDER BY RANDOM()`. It will look like:

```typescript
// EXISTING CODE
const questions = await prisma.$queryRaw`
  SELECT question_id FROM so_question_cache
  WHERE is_answered = true
  ORDER BY RANDOM()
  LIMIT 10
`;
```

Replace with:

```typescript
// REPLACEMENT — deterministic, date-seeded selection
const today = new Date().toISOString().slice(0, 10); // "2026-05-23"

const questions = await prisma.$queryRaw<{ question_id: number }[]>`
  SELECT question_id
  FROM so_question_cache
  WHERE is_answered = true
    AND top_answer_body IS NOT NULL
    AND difficulty = 'medium'
  ORDER BY md5(question_id::text || ${today})
  LIMIT 10
`;
```

> `md5(question_id::text || date_string)` produces a consistent hash per question per day. All players get the same 10 questions. The result changes each day automatically. This is index-friendly and deterministic.

If you want difficulty variety (mix of easy/medium/hard), call this query three times with `LIMIT 4`, `LIMIT 4`, `LIMIT 2` and different `difficulty` values, then merge the arrays.

### Verification

- Call `getDailyChallenge()` twice on the same day — confirm you get the same 10 `question_id` values both times.
- Call it with tomorrow's date string manually — confirm a different set of questions.
- Confirm no `ORDER BY RANDOM()` appears in Postgres slow-query log.

---

## Task 7 — Wrap Solo Session End in a Transaction

**Risk level:** Low–Medium. Touches the `endSession` flow which has 3 sequential writes.  
**Files to change:** `GameService` — the `endSession()` method.  
**Estimated time:** 20 minutes

### What & Why

At session end, the code does these writes independently:
1. `gameSession.update(score, accuracy, streakPeak, xpEarned, ...)`
2. `user.findUnique` → compute new XP/level → `user.update(...)`
3. `leaderboardEntry.create(...)`

If the server crashes between writes 1 and 3, the session is saved but the leaderboard entry is never created. Wrap in a transaction.

### Exact Changes

Find the `endSession` or equivalent function. The sequential write block looks like:

```typescript
// EXISTING — three separate writes
await prisma.gameSession.update({
  where: { id: sessionId },
  data: { score, accuracy, streakPeak, questionsCount, correctCount, durationSecs, xpEarned },
});

const user = await prisma.user.findUnique({ where: { id: userId } });
const newXp = user.xp + xpEarned;
const newLevel = calculateLevel(newXp);          // your existing helper
const newMaxStreak = Math.max(user.maxStreak, streakPeak);

await prisma.user.update({
  where: { id: userId },
  data: { xp: newXp, level: newLevel, maxStreak: newMaxStreak, totalGames: { increment: 1 } },
});

await prisma.leaderboardEntry.create({
  data: { sessionId, userId, username, score, mode, tag, periodWeek },
});
```

Replace with:

```typescript
// REPLACEMENT — fetch user first (outside transaction), then write atomically
const user = await prisma.user.findUnique({
  where: { id: userId },
  select: { xp: true, maxStreak: true, username: true },
});

const newXp = user.xp + xpEarned;
const newLevel = calculateLevel(newXp);           // your existing helper
const newMaxStreak = Math.max(user.maxStreak, streakPeak);
const league = calculateLeague(newXp);            // your existing helper

await prisma.$transaction([
  prisma.gameSession.update({
    where: { id: sessionId },
    data: { score, accuracy, streakPeak, questionsCount, correctCount, durationSecs, xpEarned },
  }),
  prisma.user.update({
    where: { id: userId },
    data: {
      xp: newXp,
      level: newLevel,
      league,
      maxStreak: newMaxStreak,
      totalGames: { increment: 1 },
      lastActive: new Date(),
    },
  }),
  prisma.leaderboardEntry.create({
    data: { sessionId, userId, username: user.username, score, mode, tag, periodWeek },
  }),
]);
```

### Verification

- End a game session and confirm all three rows are updated atomically.
- Confirm the `leaderboard_entries` row has the correct `periodWeek` format (e.g. `"2026-W21"`).
- Confirm the user's `xp`, `level`, and `league` are all updated correctly.

---

## Task 8 — Create Materialized View for Tag Statistics

**Risk level:** Zero. Additive — does not change any existing table or query path.  
**Files to change:** New SQL migration file + `QuestionService` (stats query).  
**Estimated time:** 25 minutes

### What & Why

`GET /api/questions/stats` runs `SELECT UNNEST(tags) AS tag, COUNT(*) ...` on the full `so_question_cache` table on every request. This is a full-table aggregation. Replace it with a pre-computed materialized view that refreshes every 6 hours.

### Step 1 — Create the Materialized View

Create a new file: `prisma/migrations/YYYYMMDDHHMMSS_tag_stats_materialized_view/migration.sql`

```sql
CREATE MATERIALIZED VIEW IF NOT EXISTS tag_stats AS
  SELECT
    UNNEST(tags)        AS tag,
    difficulty,
    COUNT(*)            AS question_count,
    AVG(score)          AS avg_score,
    AVG(view_count)     AS avg_views
  FROM so_question_cache
  WHERE is_answered = true
  GROUP BY tag, difficulty;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tag_stats_tag_diff ON tag_stats (tag, difficulty);
```

Run it:

```bash
psql $DATABASE_URL -f prisma/migrations/<folder>/migration.sql
```

### Step 2 — Add a Refresh Schedule

In your Express app entry point or a dedicated cron file, add a refresh job. If you are using `node-cron`:

```bash
npm install node-cron
npm install -D @types/node-cron
```

Create `src/jobs/refresh-tag-stats.ts`:

```typescript
import cron from 'node-cron';
import { prisma } from '../lib/prisma';   // adjust path to your Prisma client singleton

export function startTagStatsRefreshJob() {
  // Refresh every 6 hours: at 00:00, 06:00, 12:00, 18:00
  cron.schedule('0 0,6,12,18 * * *', async () => {
    try {
      await prisma.$executeRaw`REFRESH MATERIALIZED VIEW CONCURRENTLY tag_stats`;
      console.log('[cron] tag_stats refreshed');
    } catch (err) {
      console.error('[cron] tag_stats refresh failed', err);
    }
  });
}
```

Call `startTagStatsRefreshJob()` in your app entry point (`src/index.ts` or `src/app.ts`) after the database connection is established.

### Step 3 — Update the Stats Query

Find the existing stats query in `QuestionService`. Replace:

```typescript
// EXISTING
const stats = await prisma.$queryRaw`
  SELECT UNNEST(tags) AS tag, COUNT(*) as count
  FROM so_question_cache
  GROUP BY tag
  ORDER BY count DESC
`;
```

With:

```typescript
// REPLACEMENT — reads from pre-computed view, instant
const stats = await prisma.$queryRaw<
  { tag: string; difficulty: string; question_count: bigint; avg_score: number }[]
>`
  SELECT tag, difficulty, question_count, avg_score
  FROM tag_stats
  ORDER BY question_count DESC
`;

// Convert BigInt to number (Prisma returns COUNT as BigInt)
return stats.map(row => ({
  ...row,
  question_count: Number(row.question_count),
}));
```

### Verification

- Call `GET /api/questions/stats` and confirm it returns data.
- Check query time in logs — it should drop from hundreds of milliseconds to single digits.
- Manually run `REFRESH MATERIALIZED VIEW CONCURRENTLY tag_stats` in psql and confirm no errors.

---

## Task 9 — Add Redis Caching for Leaderboard

**Risk level:** Medium. Introduces a new dependency. The app must still work if Redis is unavailable (graceful fallback).  
**Files to change:** `src/lib/redis.ts` (new), leaderboard service/controller.  
**Estimated time:** 45 minutes

### Prerequisites

```bash
npm install ioredis
npm install -D @types/ioredis  # if not included in ioredis
```

Add to `.env`:
```
REDIS_URL=redis://localhost:6379
```

### Step 1 — Create Redis Client Singleton

Create `src/lib/redis.ts`:

```typescript
import Redis from 'ioredis';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!process.env.REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
      lazyConnect: true,
    });
    redisClient.on('error', (err) => {
      console.warn('[Redis] Connection error — falling back to DB:', err.message);
    });
  }
  return redisClient;
}
```

> Returning `null` when `REDIS_URL` is not set means the app works in dev/test without Redis. Every cache call must check for `null`.

### Step 2 — Cache Leaderboard Reads

Find your leaderboard fetch function (likely `GET /api/leaderboard` handler). Wrap the Prisma query with a cache layer:

```typescript
import { getRedis } from '../lib/redis';

async function getLeaderboard(mode: string, periodWeek: string, limit = 100) {
  const redis = getRedis();
  const cacheKey = `leaderboard:${periodWeek}:${mode}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {
      // Redis error — fall through to DB
    }
  }

  // Cache miss — query DB
  const entries = await prisma.leaderboardEntry.findMany({
    where: { periodWeek, mode: mode as GameMode },
    orderBy: { score: 'desc' },
    take: limit,
    select: { username: true, score: true, userId: true, tag: true },
  });

  // Write to cache with 5-minute TTL
  if (redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(entries), 'EX', 300);
    } catch {
      // Non-fatal — continue without cache
    }
  }

  return entries;
}
```

### Step 3 — Invalidate Cache on New Entry

In the session-end transaction (Task 7), after the `$transaction` resolves, add cache invalidation:

```typescript
// After prisma.$transaction([...]) resolves
const redis = getRedis();
if (redis) {
  try {
    await redis.del(`leaderboard:${periodWeek}:${mode}`);
  } catch {
    // Non-fatal
  }
}
```

### Verification

- Call `GET /api/leaderboard` twice. Second call should be visibly faster.
- Add `console.log('[cache] hit')` / `'miss'` temporarily and confirm the hit/miss pattern.
- Stop Redis and confirm the endpoint still returns data (from DB fallback).

---

## Task 10 — Cache User ELO and Profile for Duel Matchmaking

**Risk level:** Low. Read-through cache with short TTL. Writes still go to DB.  
**Files to change:** Any service that reads `user.elo` for matchmaking.  
**Estimated time:** 20 minutes

### What & Why

Duel matchmaking reads ELO on every match request. Under load, this is many reads per second on the `users` table. Cache user profiles with a 60-second TTL.

### Exact Changes

Create `src/lib/user-cache.ts`:

```typescript
import { getRedis } from './redis';
import { prisma } from './prisma';

const USER_TTL = 60; // seconds

export async function getCachedUser(userId: string) {
  const redis = getRedis();
  const key = `user:${userId}`;

  if (redis) {
    try {
      const cached = await redis.get(key);
      if (cached) return JSON.parse(cached);
    } catch {}
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, username: true, elo: true, level: true,
      league: true, xp: true, totalDuels: true, duelsWon: true, winRate: true,
    },
  });

  if (user && redis) {
    try {
      await redis.set(key, JSON.stringify(user), 'EX', USER_TTL);
    } catch {}
  }

  return user;
}

export async function invalidateUserCache(userId: string) {
  const redis = getRedis();
  if (redis) {
    try { await redis.del(`user:${userId}`); } catch {}
  }
}
```

Replace direct `prisma.user.findUnique` calls in the matchmaking and duel-join paths with `getCachedUser(userId)`.

Call `invalidateUserCache(userId)` immediately after any `prisma.user.update` in the ELO settlement (Task 4) so stale ELO is never served.

### Verification

- Request a duel twice in quick succession and confirm the second request hits the Redis key.
- Complete a duel and confirm the user cache key is deleted (run `redis-cli GET user:<id>` — should return nil after settlement).

---

## Task 11 — Remove Redundant `questionData` from `duel_questions`

**Risk level:** Medium. Schema change + code update. Test all duel flows thoroughly after.  
**Files to change:** `prisma/schema.prisma`, duel question creation and read logic.  
**Estimated time:** 30 minutes

### What & Why

`duel_questions.questionData` stores the entire StackOverflow question payload as a JSON blob (~2KB per row). The same data already lives in `so_question_cache`. This doubles storage and makes inserts slower.

### Schema Change

In `prisma/schema.prisma`, find `duel_questions` and remove:

```prisma
questionData  Json        // DELETE THIS LINE
```

Migrate:

```bash
npx prisma migrate dev --name remove_redundant_question_data
npx prisma generate
```

### Code Changes

**In duel question creation (Task 3's `createMany` data array):** Remove `questionData` from the data object:

```typescript
// REMOVE this field from the createMany data
// questionData: JSON.stringify(question),   ← DELETE
```

**Everywhere `duelQuestion.questionData` is read:** Replace with a join to `so_question_cache`. Find all usages of `questionData` in duel-related queries and replace:

```typescript
// BEFORE — reading from duelQuestion
const duelQ = await prisma.duelQuestion.findUnique({ where: { id } });
const questionPayload = JSON.parse(duelQ.questionData);

// AFTER — join to the cache table
const duelQ = await prisma.duelQuestion.findUnique({
  where: { id },
  include: {
    soQuestionCache: true,   // you may need to add this relation to schema — see below
  },
});
const questionPayload = duelQ.soQuestionCache;
```

#### Add Relation to Schema (if not already present)

In `duel_questions` model:

```prisma
soQuestionCache  SoQuestionCache  @relation(fields: [soQuestionId], references: [questionId])
```

In `so_question_cache` model:

```prisma
duelQuestions  DuelQuestion[]
```

Migrate again after adding the relation:

```bash
npx prisma migrate dev --name add_duel_question_cache_relation
npx prisma generate
```

### Verification

- Create a duel and confirm no `question_data` column exists in the insert statement (check logs).
- Play through a duel round and confirm question text/options render correctly for both players.
- Confirm `duel_questions` rows are smaller in `pg_relation_size`.

---

## Task 12 — Pre-Tokenize Correct Answers at Cache Time

**Risk level:** Low. Adds a background computation at cache-write time. Evaluation logic fallback ensures nothing breaks.  
**Files to change:** `so_question_cache` upsert logic, string answer evaluator.  
**Estimated time:** 25 minutes

### What & Why

The string-answer evaluator tokenizes the correct answer on every single player submission. For a popular question answered by 1,000 players, the same tokenization runs 1,000 times. Tokenize once at cache time and store the result.

### Schema Change

In `prisma/schema.prisma`, add to `so_question_cache`:

```prisma
tokenizedAnswer  String[]  @default([])
```

Migrate:

```bash
npx prisma migrate dev --name add_tokenized_answer_field
npx prisma generate
```

### Code Changes

#### At Cache Write Time

Find your `cacheQuestions()` or `upsert` logic for `so_question_cache`. Add tokenization when writing:

```typescript
// Add this helper (or import your existing tokenizer)
function tokenize(text: string): string[] {
  return [
    ...new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    ),
  ];
}

// In the upsert data:
await prisma.soQuestionCache.upsert({
  where: { questionId: q.questionId },
  create: {
    // ... existing fields ...
    tokenizedAnswer: q.topAnswerBody ? tokenize(q.topAnswerBody) : [],
  },
  update: {
    // ... existing fields ...
    tokenizedAnswer: q.topAnswerBody ? tokenize(q.topAnswerBody) : [],
  },
});
```

#### At Evaluation Time

In your string-answer evaluator (`stackquest.algorithm.ts` or equivalent), update the evaluation to use pre-tokenized data when available:

```typescript
function evaluateStringAnswer(
  playerAnswer: string,
  correctAnswer: string,
  preTokenized?: string[]   // new optional param — pass from cache if available
): { correct: boolean; similarity: number } {
  if (playerAnswer.length < 10) return { correct: false, similarity: 0 };

  const playerTokens = new Set(tokenize(playerAnswer));

  // Use pre-tokenized if available, otherwise compute on the fly (safe fallback)
  const correctTokens = new Set(
    preTokenized && preTokenized.length > 0 ? preTokenized : tokenize(correctAnswer)
  );

  let intersection = 0;
  for (const token of playerTokens) {
    if (correctTokens.has(token)) intersection++;
  }

  const overlapRatio = correctTokens.size > 0 ? intersection / correctTokens.size : 0;
  return { correct: overlapRatio >= 0.5, similarity: overlapRatio };
}
```

When calling this function, pass `question.tokenizedAnswer` from the cache row.

### Verification

- Insert a new cached question and confirm `tokenized_answer` is populated in the DB row.
- Submit a string answer and confirm evaluation works correctly.
- Confirm `tokenize()` is no longer called for the correct-answer side during evaluation when `preTokenized` is provided.

---

## Task 13 — Add PgBouncer Connection Pooling

**Risk level:** Infrastructure change. No application code changes required.  
**Files to change:** `.env`, deployment config.  
**Estimated time:** 30 minutes (infrastructure setup)

### What & Why

Prisma opens up to `connection_limit` connections per process (default: `num_cpus * 2 + 1`). PostgreSQL has a hard cap (usually 100 connections). Under load with multiple Express instances, you exhaust connections. PgBouncer sits between your app and Postgres and multiplexes connections.

### Setup

#### If using Docker (recommended for development parity):

Add to `docker-compose.yml`:

```yaml
pgbouncer:
  image: bitnami/pgbouncer:latest
  environment:
    POSTGRESQL_HOST: postgres       # your postgres service name
    POSTGRESQL_PORT: 5432
    POSTGRESQL_DATABASE: stackquest  # your DB name
    POSTGRESQL_USERNAME: stackquest_user
    POSTGRESQL_PASSWORD: your_password
    PGBOUNCER_PORT: 6432
    PGBOUNCER_POOL_MODE: transaction
    PGBOUNCER_MAX_CLIENT_CONN: 1000
    PGBOUNCER_DEFAULT_POOL_SIZE: 20
  ports:
    - "6432:6432"
  depends_on:
    - postgres
```

#### Update `.env`

```bash
# BEFORE
DATABASE_URL="postgresql://user:password@localhost:5432/stackquest"

# AFTER — point to PgBouncer port
DATABASE_URL="postgresql://user:password@localhost:6432/stackquest?pgbouncer=true&connection_limit=1"
```

> The `?pgbouncer=true` flag tells Prisma to disable prepared statements (required for transaction pooling mode). `connection_limit=1` tells Prisma's connection pool to use 1 connection per instance since PgBouncer manages the real pool.

#### Update `prisma/schema.prisma`

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_DIRECT")  // add this
}
```

Add to `.env`:

```bash
# Direct connection for migrations (bypasses PgBouncer)
DATABASE_URL_DIRECT="postgresql://user:password@localhost:5432/stackquest"
```

This ensures Prisma migrations still work (they need a direct connection, not a pooled one).

### Verification

- Run the app with PgBouncer active.
- Run `SHOW POOLS;` in the PgBouncer admin console (`psql -h localhost -p 6432 -U pgbouncer pgbouncer`) and confirm client connections are pooled.
- Confirm `SELECT count(*) FROM pg_stat_activity;` in Postgres shows a bounded number of connections regardless of load.

---

## Task 14 — Add Redis Pub/Sub for WebSocket Multi-Instance Support

**Risk level:** Medium. Only relevant when deploying more than one Express instance. Safe to add now and it will be a no-op with a single instance.  
**Files to change:** WebSocket/Socket.IO initialization file.  
**Estimated time:** 30 minutes

### Prerequisites

```bash
npm install @socket.io/redis-adapter
```

### Exact Changes

Find your Socket.IO server initialization (likely `src/socket.ts` or `src/index.ts`). It will look like:

```typescript
// EXISTING
import { Server } from 'socket.io';
const io = new Server(httpServer, { cors: { ... } });
```

Replace with:

```typescript
// REPLACEMENT — adds Redis adapter for multi-instance support
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { getRedis } from './lib/redis';

const io = new Server(httpServer, { cors: { ... } });

// Add Redis adapter only if Redis is configured
const redis = getRedis();
if (redis) {
  const pubClient = redis;
  const subClient = redis.duplicate();   // Socket.IO needs a separate subscriber connection
  io.adapter(createAdapter(pubClient, subClient));
  console.log('[Socket.IO] Redis adapter enabled');
} else {
  console.log('[Socket.IO] Running without Redis adapter (single-instance mode)');
}
```

With this in place, when Player 1 is on instance A and Player 2 is on instance B, `io.to(matchId).emit(...)` works correctly because events are routed through Redis.

### Verification

- Start two instances of the Express server on different ports.
- Connect Player 1 to instance A, Player 2 to instance B.
- Submit an answer from Player 1 and confirm Player 2 receives the socket event.

---

## Summary Checklist

Use this as your completion tracker:

| # | Task | Schema Change | Migration Needed | New Dependency |
|---|------|:---:|:---:|:---:|
| 1 | Add database indexes | ✅ | ✅ | — |
| 2 | Duel answer submission transaction | — | — | — |
| 3 | Replace question creation loop with `createMany` | — | — | — |
| 4 | ELO settlement transaction | — | — | — |
| 5 | Add `answersSubmitted` counter | ✅ | ✅ | — |
| 6 | Seed-based daily question selection | — | — | — |
| 7 | Solo session end transaction | — | — | — |
| 8 | Materialized view for tag stats | — | ✅ (raw SQL) | `node-cron` |
| 9 | Redis leaderboard cache | — | — | `ioredis` |
| 10 | Redis user/ELO cache | — | — | (uses Task 9 Redis) |
| 11 | Remove redundant `questionData` | ✅ | ✅ | — |
| 12 | Pre-tokenize answers at cache time | ✅ | ✅ | — |
| 13 | PgBouncer connection pooling | — | — | PgBouncer (infra) |
| 14 | Redis pub/sub for WebSocket | — | — | `@socket.io/redis-adapter` |

---

## Safe Execution Order

```
Task 1  →  Task 2  →  Task 3  →  Task 4  →  Task 5
    ↓
Task 6  →  Task 7  →  Task 8
    ↓
Task 9  →  Task 10
    ↓
Task 11  →  Task 12
    ↓
Task 13  →  Task 14
```

Tasks 1–5 are the highest priority — they fix correctness issues and the most frequent slow paths. Tasks 9–14 are scale-layer improvements for when you have real traffic.

---

## Environment Variables Reference

After all tasks are complete, your `.env` should include these additions:

```bash
# Existing
DATABASE_URL="postgresql://user:password@localhost:6432/stackquest?pgbouncer=true&connection_limit=1"

# New — added by this optimization work
DATABASE_URL_DIRECT="postgresql://user:password@localhost:5432/stackquest"
REDIS_URL="redis://localhost:6379"
```

All new env vars are optional — the app degrades gracefully when they are absent (no Redis = DB-only mode, no PgBouncer direct URL = use `DATABASE_URL` for migrations).
