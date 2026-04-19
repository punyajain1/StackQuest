# StackQuest — Client-Side Implementation Guide

> Complete technical specification for building the Web App (React + Vite) and Mobile App (React Native + Expo).
> Backend API is already running at `http://localhost:3000`.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Project Structure](#project-structure)
3. [Design System — Retro Arcade Theme](#design-system)
4. [API Contract](#api-contract)
5. [State Management & Data Flow](#state-management)
6. [Screens & Components (Web)](#screens-web)
7. [Game Flow (Step-by-Step)](#game-flow)
8. [Component Library Specs](#component-library)
9. [Animations & Sound](#animations)
10. [Mobile App (React Native)](#mobile-app)
11. [Build Order](#build-order)

---

## 1. Tech Stack

### Web App
| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **React 18 + Vite** | Fast HMR, modern bundler |
| Language | **TypeScript** | Share types with backend |
| Styling | **CSS Modules + custom CSS** | Retro theme, no utility class bleed |
| Animations | **Framer Motion** | Polished card swipes, reveals |
| State | **Zustand** | Lightweight, no boilerplate |
| Data fetching | **TanStack Query (React Query)** | Cache, loading states, refetch |
| Routing | **React Router v6** | SPA routing |
| Markdown | **react-markdown + rehype-highlight** | Render SO code blocks |
| Fonts | **Press Start 2P** (pixel) + **Inter** (body) | Retro feel, readable |

### Mobile App
| Layer | Choice |
|-------|--------|
| Framework | **React Native + Expo SDK 51** |
| Navigation | **Expo Router** (file-based) |
| Animations | **React Native Reanimated 3** |
| Styling | **StyleSheet + custom theme** |
| State | Same Zustand stores (shared logic) |

### Shared
- TypeScript types copied from `backend/src/models/db.types.ts`
- API client layer abstracted to work on both platforms

---

## 2. Project Structure

```
web/
├── public/
│   ├── favicon.ico
│   └── scanlines.png          # CRT scanline overlay texture
├── src/
│   ├── api/                   # typed API client
│   │   ├── client.ts          # axios instance with JWT interceptors
│   │   ├── auth.api.ts
│   │   ├── game.api.ts
│   │   ├── scores.api.ts
│   │   └── categories.api.ts
│   ├── stores/                # Zustand global state
│   │   ├── auth.store.ts      # user, tokens, login/logout
│   │   ├── game.store.ts      # session, score, streak, timer
│   │   └── settings.store.ts  # sound on/off, difficulty preference
│   ├── hooks/                 # React Query hooks wrapping API
│   │   ├── useAuth.ts
│   │   ├── useGame.ts
│   │   ├── useLeaderboard.ts
│   │   └── useCategories.ts
│   ├── components/
│   │   ├── ui/                # reusable primitives
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Badge/
│   │   │   ├── Modal/
│   │   │   └── ProgressBar/
│   │   ├── game/              # game-specific components
│   │   │   ├── QuestionCard/
│   │   │   ├── Timer/
│   │   │   ├── StreakDisplay/
│   │   │   ├── ScoreCounter/
│   │   │   ├── ResultReveal/
│   │   │   ├── AnswerInput/
│   │   │   ├── JudgeButtons/
│   │   │   ├── ScoreRangeButtons/
│   │   │   ├── MultiChoiceGrid/
│   │   │   └── MatchMeter/
│   │   ├── layout/
│   │   │   ├── GameLayout/
│   │   │   ├── Header/
│   │   │   └── CRTOverlay/
│   │   └── leaderboard/
│   │       ├── LeaderboardTable/
│   │       └── ScoreCard/
│   ├── pages/
│   │   ├── Home.tsx           # landing + mode/category select
│   │   ├── Game.tsx           # main game loop
│   │   ├── GameOver.tsx       # results + share card
│   │   ├── Leaderboard.tsx
│   │   ├── Daily.tsx          # daily challenge
│   │   └── Auth/
│   │       ├── Login.tsx
│   │       └── Register.tsx
│   ├── styles/
│   │   ├── global.css         # CSS variables, resets
│   │   ├── retro.css          # CRT effects, pixel borders, scanlines
│   │   ├── animations.css     # keyframes
│   │   └── typography.css     # font definitions
│   ├── types/
│   │   └── api.types.ts       # copied/adapted from backend db.types.ts
│   ├── utils/
│   │   ├── formatters.ts      # score formatting, time display
│   │   ├── sound.ts           # Web Audio API beeps
│   │   └── shareCard.ts       # canvas-based share image generator
│   ├── App.tsx
│   ├── main.tsx
│   └── vite-env.d.ts
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

---

## 3. Design System — Retro Arcade Theme

### Color Palette (CSS Variables)

```css
/* src/styles/global.css */
:root {
  /* Backgrounds */
  --bg-base:        #0a0a0f;   /* near-black, main background */
  --bg-surface:     #12121e;   /* card/panel background */
  --bg-elevated:    #1a1a2e;   /* modals, dropdowns */
  --bg-scanline:    rgba(0, 255, 0, 0.015); /* CRT line color */

  /* Neon Accents */
  --neon-yellow:    #f7ff00;   /* primary action, score */
  --neon-pink:      #ff2d9b;   /* wrong answer, downvote */
  --neon-cyan:      #00f5ff;   /* streak, correct answer */
  --neon-green:     #39ff14;   /* progress bars, XP */
  --neon-purple:    #bf5fff;   /* multiplier, special */
  --neon-orange:    #ff8c00;   /* time warning */

  /* Text */
  --text-primary:   #f0f0f5;
  --text-secondary: #8888aa;
  --text-muted:     #4a4a6a;

  /* Borders */
  --border-dim:     #2a2a4a;
  --border-glow:    rgba(247, 255, 0, 0.5);

  /* Shadows / Glows */
  --glow-yellow:    0 0 10px #f7ff00, 0 0 30px rgba(247,255,0,0.3);
  --glow-cyan:      0 0 10px #00f5ff, 0 0 30px rgba(0,245,255,0.3);
  --glow-pink:      0 0 10px #ff2d9b, 0 0 30px rgba(255,45,155,0.3);

  /* Typography */
  --font-pixel:     'Press Start 2P', monospace;
  --font-body:      'Inter', system-ui, sans-serif;
  --font-code:      'JetBrains Mono', 'Fira Code', monospace;

  /* Spacing */
  --radius-sm:      4px;
  --radius-md:      8px;
  --radius-lg:      12px;
  --pixel-border:   2px solid var(--neon-yellow);
}
```

### CRT Effect (CSS)

```css
/* src/styles/retro.css */

/* Scanline overlay — applied to root element */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    var(--bg-scanline) 0px,
    transparent 1px,
    transparent 3px
  );
  pointer-events: none;
  z-index: 9999;
}

/* Pixel / arcade button style */
.btn-arcade {
  font-family: var(--font-pixel);
  font-size: 10px;
  letter-spacing: 1px;
  text-transform: uppercase;
  border: 2px solid currentColor;
  background: transparent;
  padding: 12px 24px;
  cursor: pointer;
  transition: all 0.1s ease;
  position: relative;
  clip-path: polygon(
    0 4px, 4px 0, calc(100% - 4px) 0, 100% 4px,
    100% calc(100% - 4px), calc(100% - 4px) 100%,
    4px 100%, 0 calc(100% - 4px)
  ); /* pixel corners */
}

.btn-arcade:hover {
  background: currentColor;
  color: var(--bg-base);
  box-shadow: var(--glow-yellow);
}

/* Glowing text */
.glow-text {
  text-shadow: var(--glow-yellow);
  animation: flicker 4s infinite;
}

@keyframes flicker {
  0%, 95%, 100% { opacity: 1; }
  96%            { opacity: 0.8; }
  97%            { opacity: 1; }
  98%            { opacity: 0.9; }
}

/* Pixel border card */
.pixel-card {
  background: var(--bg-surface);
  border: 2px solid var(--border-dim);
  border-image: none;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04),
              4px 4px 0px rgba(0,0,0,0.5);
}
```

### Typography Scale

```css
/* Press Start 2P — pixel headings */
h1 { font-family: var(--font-pixel); font-size: clamp(16px, 3vw, 28px); }
h2 { font-family: var(--font-pixel); font-size: clamp(12px, 2vw, 18px); }

/* Inter — body, labels, descriptions */
body { font-family: var(--font-body); font-size: 16px; }

/* JetBrains Mono — code blocks in questions */
code, pre { font-family: var(--font-code); }
```

---

## 4. API Contract

### Base URL
```
http://localhost:3000/api   (dev)
https://your-api.com/api   (prod)
```

### Standard Response Shape
```typescript
// All endpoints return this wrapper
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: {
    message: string;
    code: string;
    statusCode: number;
  };
}
```

### Auth Endpoints

```typescript
// POST /auth/guest
// → { user: UserPayload, token: string, refreshToken: string }

// POST /auth/register
// body: { email, password, username? }
// → { user: UserPayload, token: string, refreshToken: string }

// POST /auth/login
// body: { email, password }
// → { user: UserPayload, token: string, refreshToken: string }

// GET /auth/me  [JWT required]
// → User (without passwordHash)

// POST /auth/refresh
// body: { refreshToken }
// → { token: string, refreshToken: string }
```

### Game Endpoints

```typescript
// POST /game/session/start  [JWT required]
// body: { mode: GameMode, tag?: string | null, is_daily?: boolean }
// → SessionSnapshot

// GET /game/question  [JWT required]
// query: { session_id: string, difficulty?: 'easy'|'medium'|'hard' }
// → GameQuestion { question: SoQuestion, mode: GameMode, options?: string[], timeLimit: number }

// POST /game/evaluate  [JWT required]
// body: {
//   session_id: string,
//   question_id: number,
//   player_answer?: string,       // answer_arena mode
//   player_choice?: string,       // all other modes
//   time_taken_ms: number,
//   question_snapshot: SoQuestion // full question object received earlier
// }
// → { correct: boolean, scoreEarned: number, xpEarned: number,
//     evaluationResult?: EvaluationResult, snapshot: SessionSnapshot }

// POST /game/session/end  [JWT required]
// body: { session_id: string }
// → GameSession (final stats)

// GET /game/daily
// → SoQuestion[]
```

### GameMode values and player_choice expectations

| Mode | player_choice | player_answer |
|------|--------------|--------------|
| `judge` | `"upvote"` or `"downvote"` | — |
| `score_guesser` | `"0-10"` / `"10-100"` / `"100-500"` / `"500+"` | — |
| `answer_arena` | — | Free text string (min 10 chars) |
| `multiple_choice` | One of the `options[]` strings returned with question | — |
| `tag_guesser` | Any tag string | — |

### Scores & Leaderboard

```typescript
// GET /scores/leaderboard
// query: { period?: 'all_time'|'weekly', mode?: GameMode, tag?: string, limit?: number }
// → LeaderboardEntry[]

// GET /scores/me/stats  [JWT required]
// → { total_games, total_score, best_score, avg_score, accuracy,
//     streak_record, xp, level, favorite_mode, favorite_tag }

// GET /scores/me/history  [JWT required]
// query: { limit?, offset? }
// → GameSession[]

// POST /scores/guest  (save guest score without JWT)
// body: { username, score, mode, tag, session_id }
```

### Categories

```typescript
// GET /categories
// → { supported_tags: string[], stats: { tag, count, avg_score }[] }
```

---

## 5. State Management

### auth.store.ts (Zustand)

```typescript
interface AuthStore {
  user: UserPayload | null;
  token: string | null;
  refreshToken: string | null;
  isGuest: boolean;

  // Actions
  setAuth: (user: UserPayload, token: string, refreshToken: string) => void;
  logout: () => void;
  loginAsGuest: () => Promise<void>;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username?: string) => Promise<void>;
}
```

**Token persistence**: Store tokens in `localStorage`. On app init, read them back and set to store.

**JWT interceptor**: Axios request interceptor attaches `Authorization: Bearer <token>`. Response interceptor handles 401 → auto-refresh → retry.

---

### game.store.ts (Zustand)

```typescript
interface GameStore {
  // Session identity
  sessionId: string | null;
  mode: GameMode | null;
  tag: string | null;

  // Live game state
  score: number;
  streak: number;
  streakMultiplier: number;
  questionsAnswered: number;
  correctCount: number;
  xpEarned: number;

  // Current question
  currentQuestion: GameQuestion | null;
  isLoadingQuestion: boolean;
  isEvaluating: boolean;

  // Result of last answer
  lastResult: EvaluateResponse | null;
  showResult: boolean;

  // Timer (client-side countdown mirror)
  timeLeft: number;
  timerActive: boolean;

  // Actions
  startSession: (mode: GameMode, tag: string | null) => Promise<void>;
  loadNextQuestion: () => Promise<void>;
  submitAnswer: (choice: string, timeTakenMs: number) => Promise<void>;
  submitTextAnswer: (text: string, timeTakenMs: number) => Promise<void>;
  dismissResult: () => void;
  endSession: () => Promise<GameSession>;
  resetGame: () => void;

  // Timer control
  startTimer: (seconds: number) => void;
  tickTimer: () => void;
}
```

---

## 6. Screens & Components (Web)

---

### 6.1 Home Screen (`/`)

**Purpose**: Game entry point. Mode selection, tag selection, authentication status.

**Layout**:
```
┌─────────────────────────────────────┐
│  STACKQUEST          [LOGIN]  [HI:0] │  ← Header
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                     │
│    ████ STACK QUEST ████            │  ← Glowing pixel title
│    Turn SO into your dojo           │  ← Subtext
│                                     │
│  ┌──────────┐  ┌──────────┐         │
│  │ JUDGE    │  │  SCORE   │         │  ← Mode cards
│  │ (upvote/ │  │  GUESSER │         │
│  │ downvote)│  │          │         │
│  └──────────┘  └──────────┘         │
│  ┌──────────┐  ┌──────────┐         │
│  │ ANSWER   │  │ MULTIPLE │         │
│  │ ARENA ⭐  │  │  CHOICE  │         │
│  └──────────┘  └──────────┘         │
│                                     │
│  CATEGORY ──────────────────────    │
│  [All] [JS] [Python] [React] [+]    │  ← Tag chips, scrollable
│                                     │
│  DIFFICULTY ────────────────────    │
│  [Easy] [Medium] [Hard]             │
│                                     │
│  ▶ INSERT COIN TO START             │  ← CTA button (flashing)
│                                     │
│  🏆 LEADERBOARD  📅 DAILY CHALLENGE │
└─────────────────────────────────────┘
```

**Key behaviors**:
- Mode cards have hover glow + scale animation
- Selected mode gets a neon border flash
- Selecting a tag highlights it in neon yellow
- "Insert coin" button pulses with arcade animation
- High score from `localStorage` displayed in header

---

### 6.2 Game Screen (`/game`)

**Purpose**: The main game loop. Shows question, timer, score, streak, answer UI.

**Layout**:
```
┌─────────────────────────────────────┐
│  SCORE: 0240  ⚡3x  💫12  [QUIT]    │  ← HUD bar
│  ████████████████░░░░  28s         │  ← Timer bar (shrinking, colors)
├─────────────────────────────────────┤
│                                     │
│  [javascript] [react] [hooks]       │  ← Tags
│                                     │
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │  Why does useEffect fire    │    │  ← Question card
│  │  twice in React 18?         │    │  (Framer Motion: slide in)
│  │                             │    │
│  │  ┌─ Code block ──────────┐  │    │
│  │  │ useEffect(() => {     │  │    │
│  │  │   fetchData();        │  │    │
│  │  │ }, []);               │  │    │
│  │  └───────────────────────┘  │    │
│  │                             │    │
│  │  ✦ 847 votes  ✦ 12 answers  │    │
│  └─────────────────────────────┘    │
│                                     │
│  ┌─────────────┐  ┌─────────────┐   │  ← Answer buttons (mode-dependent)
│  │  ▲ UPVOTE   │  │  ▼ DOWNVOTE │   │
│  │     GEM     │  │  DISASTER   │   │
│  └─────────────┘  └─────────────┘   │
└─────────────────────────────────────┘
```

**Answer UI variants by mode**:

| Mode | Answer UI |
|------|-----------|
| `judge` | Two big buttons: UPVOTE GEM (green) / DOWNVOTE DISASTER (red) |
| `score_guesser` | 4 range buttons: `0-10` / `10-100` / `100-500` / `500+` |
| `answer_arena` | Textarea (min 10 char, max 500), Submit button, live char count |
| `multiple_choice` | 2×2 grid of tag option buttons |
| `tag_guesser` | Text input with autocomplete from known tags |

**Timer bar**:
- Full width, green at >15s
- Turns orange at 10s with pulse animation  
- Turns red + shaking at 5s
- Auto-submits wrong answer at 0s

---

### 6.3 Result Reveal (inline, after each answer)

**Appears**: After `evaluate` response arrives. Overlays the game screen as a full-card state.

```
┌─────────────────────────────────────┐
│                                     │
│   ✅ CORRECT!           +30 pts     │  ← Green flash for correct
│   ──── or ────                      │
│   ❌ WRONG!             +0 pts      │  ← Red shake for wrong
│                                     │
│   ⚡ STREAK: 5  →  MULTIPLIER 2×    │  ← Streak tick up animation
│                                     │
│   ── ACTUAL ANSWER ──               │
│   Score was: 847 votes              │
│                                     │
│   TOP ANSWER:                       │  ← Scrollable, syntax highlighted
│   ┌────────────────────────────┐    │
│   │  In React 18, StrictMode   │    │
│   │  intentionally fires...    │    │
│   └────────────────────────────┘    │
│                                     │
│   [NEXT QUESTION ▶]  (3s auto)      │  ← Auto-advance, or click skip
│                                     │
└─────────────────────────────────────┘
```

**For `answer_arena` mode specifically**:
```
│   MATCH METER ════════════════      │
│   ░░░░░░░░░░░░████████████  72%     │  ← Animated fill bar
│                                     │
│   label: GREAT 🎯           +40pts  │
│   "You captured the key concepts"   │  ← Feedback text
```

---

### 6.4 Game Over Screen (`/game-over`)

**Purpose**: Final score summary, shareable card, play again.

```
┌─────────────────────────────────────┐
│                                     │
│     ██ GAME OVER ██                 │
│                                     │
│  ┌─────────────────────────────┐    │
│  │  FINAL SCORE               │    │
│  │  ──────────────────────    │    │
│  │  💯  0420 pts              │    │
│  │  🎯  Accuracy: 73%         │    │
│  │  ⚡  Best Streak: 7        │    │
│  │  📖  Questions: 15         │    │
│  │  ✨  XP Earned: +85        │    │
│  │                            │    │
│  │  Mode: JUDGE               │    │
│  │  Tag:  javascript          │    │
│  └─────────────────────────────┘    │
│                                     │
│  🤩 FUNNIEST QUESTION:              │  ← Most extreme score Q you saw
│  "Why does [] == false?"            │
│                                     │
│  [PLAY AGAIN]   [CHANGE MODE]       │
│  [SHARE SCORE]  [LEADERBOARD]       │
│                                     │
└─────────────────────────────────────┘
```

**Share Card** (generated via `canvas`):
- Dark background, neon accents, scores
- Auto-download as PNG or copy to clipboard
- Text: "I scored 420 on StackQuest! Can you beat me? #StackQuest"

---

### 6.5 Leaderboard Screen (`/leaderboard`)

```
┌─────────────────────────────────────┐
│  🏆 HALL OF FAME                   │
│                                     │
│  [ALL TIME] [THIS WEEK]             │  ← Period toggle
│  Mode: [ALL ▾]  Tag: [ALL ▾]        │  ← Filters
│                                     │
│  ┌──┬─────────────┬───────┬──────┐  │
│  │# │ PLAYER      │ SCORE │ MODE │  │
│  ├──┼─────────────┼───────┼──────┤  │
│  │1 │ 👑 Jon Skeet│ 9999  │ ARENA│  │
│  │2 │ CuriousDev  │ 4200  │ JUDGE│  │
│  │3 │ SwiftNinja  │ 3800  │ MC   │  │
│  │…                               │  │
│  └──┴─────────────┴───────┴──────┘  │
│                                     │
│  YOUR RANK: #42  |  SCORE: 420      │  ← Shown if logged in
└─────────────────────────────────────┘
```

---

### 6.6 Authentication Screens (`/login`, `/register`)

- Minimal, retro terminal aesthetic
- Glowing input borders on focus
- Guest Play button prominent (below form)
- Error messages styled as terminal output: `ERROR: Invalid credentials`

---

## 7. Game Flow (Step-by-Step)

```
App Start
  │
  ├─ Token in localStorage?
  │    Yes → verify /auth/me → restore session
  │    No  → show Home (unauthenticated)
  │
Home Screen
  │
  ├─ User selects Mode + Tag + Difficulty
  ├─ Clicks "Insert Coin"
  │
  ├─ Not logged in?
  │    → Auto-create guest: POST /auth/guest → store JWT
  │
  ├─ POST /game/session/start → { session_id, ... }
  │   Store sessionId in game.store
  │
  ▼
Game Loop (runs until timer hits 0, user quits, or 20 questions)
  │
  ├─ GET /game/question?session_id=X
  │   → GameQuestion { question, mode, options, timeLimit }
  │   Animate question card sliding in (Framer Motion)
  │   Start client-side countdown timer
  │
  ├─ User answers (or timer expires)
  │   Record timeTakenMs = (timeLimit × 1000) - timeLeft × 1000
  │
  ├─ POST /game/evaluate → { correct, scoreEarned, evaluationResult, snapshot }
  │   Stop timer
  │   Show ResultReveal overlay
  │   Update score/streak in store + HUD animation
  │
  ├─ Wait 3s (or user clicks Next)
  │   Dismiss result
  │   Loop back to GET /game/question
  │
  ├─ Session ends when:
  │   a) User clicks QUIT
  │   b) Timer hits 0 (auto-submit → evaluate → navigate to /game-over)
  │   c) 20 questions answered
  │
  ▼
POST /game/session/end → final GameSession
Navigate to /game-over with session data
```

---

## 8. Component Library Specs

### `<QuestionCard>`

```typescript
interface QuestionCardProps {
  question: SoQuestion;
  isRevealing: boolean;          // true = dim + show result
  onAppear?: () => void;         // callback when animation finishes
}
```

**Behavior**:
- Renders `title` in pixel font (small size)
- Renders `body_markdown` with `react-markdown` + syntax highlighting
- Shows tags as neon chips
- Shows `score` and `answer_count` with icons
- Difficulty badge (🟢 Easy / 🟡 Medium / 🔴 Hard)
- Framer Motion: `initial={{ x: 300, opacity: 0 }}` → `animate={{ x: 0, opacity: 1 }}`
- When `isRevealing`: blur + scale(0.98) + darken

---

### `<Timer>`

```typescript
interface TimerProps {
  total: number;      // total seconds (from question.timeLimit)
  onTick: () => void; // called every second
  onExpire: () => void;
}
```

**Visual**:
- Horizontal progress bar fills from right to left
- Color transitions: green → orange (at 33%) → red (at 16%)
- Text shows remaining seconds in pixel font
- At <5s: bar shakes (`@keyframes shake`)
- At <5s: pulse glow animation on bar

---

### `<StreakDisplay>`

```typescript
interface StreakDisplayProps {
  streak: number;
  multiplier: number;  // 1 | 2 | 3 | 5
}
```

**Visual**:
- ⚡ icon + streak count
- Multiplier shown in neon purple: `2×`
- Animates: scale up + flash on increment
- Breaks to 0: shake + flash red momentarily

---

### `<ScoreCounter>`

```typescript
interface ScoreCounterProps {
  score: number;
  lastAdded: number;  // 0 = no flash, >0 = show +N overlay
}
```

**Visual**:
- Score ticks up via `animateNumber()` utility
- On `lastAdded > 0`: floating "+30" text rises and fades
- Font: `Press Start 2P`, neon yellow glow

---

### `<ResultReveal>`

```typescript
interface ResultRevealProps {
  correct: boolean;
  scoreEarned: number;
  evaluationResult?: EvaluationResult;   // only for answer_arena
  topAnswerText: string | null;
  actualScore: number;                   // SO question vote score
  onNext: () => void;
  autoAdvanceMs?: number;                // default 3000
}
```

**Animations**:
- Correct: screen flash green + `✅ CORRECT!` bounces in
- Wrong: screen flash red + shake + `❌ WRONG!` slides in
- Top answer: fade in with delay 400ms

---

### `<AnswerInput>` (answer_arena only)

```typescript
interface AnswerInputProps {
  onSubmit: (text: string) => void;
  isDisabled: boolean;
  minLength?: number;  // default 10
  maxLength?: number;  // default 500
}
```

**Visual**:
- Monospace textarea, styled as terminal window
- Live character count `127 / 500`
- Submit button disabled until `>= minLength`
- Framer Motion: slide up from bottom on appear

---

### `<MatchMeter>` (answer_arena result)

```typescript
interface MatchMeterProps {
  similarity: number;   // 0.0 – 1.0
  label: EvaluationResult['label'];
}
```

**Visual**:
- Horizontal bar, fills based on `similarity * 100%`
- Colors: red (<0.3) → orange → yellow → cyan → green (>0.85)
- Animated fill from 0 to target in 800ms
- Label above: `EXCELLENT 🎯` / `GREAT` / `GOOD` / `PARTIAL` / `OFF TARGET`

---

## 9. Animations & Sound

### Framer Motion Variants

```typescript
// Shared variants — import across components
export const slideInRight = {
  initial: { x: 100, opacity: 0 },
  animate: { x: 0, opacity: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
  exit:    { x: -100, opacity: 0 },
};

export const popIn = {
  initial: { scale: 0.5, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 500, damping: 25 } },
};

export const flashCorrect = {
  animate: { backgroundColor: ['#0a0a0f', '#00ff88', '#0a0a0f'],
             transition: { duration: 0.4 } },
};

export const flashWrong = {
  animate: { x: [0, -10, 10, -8, 8, 0], backgroundColor: ['#0a0a0f', '#ff2d9b', '#0a0a0f'],
             transition: { duration: 0.5 } },
};
```

### Web Audio API (Sound Effects)

```typescript
// src/utils/sound.ts — no external audio files needed!
const ctx = new AudioContext();

export function playBeep(freq: number, duration: number, type: OscillatorType = 'square') {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + duration);
}

export const sounds = {
  correct:  () => { playBeep(523, 0.1); setTimeout(() => playBeep(784, 0.15), 100); },
  wrong:    () => { playBeep(200, 0.3, 'sawtooth'); },
  tick:     () => playBeep(440, 0.05),
  streak:   () => { [523,659,784,1046].forEach((f,i) => setTimeout(() => playBeep(f,0.1), i*80)); },
  gameOver: () => { [523,494,466,440].forEach((f,i) => setTimeout(() => playBeep(f,0.2), i*200)); },
};
```

---

## 10. Mobile App (React Native + Expo)

### Shared with Web
- All Zustand stores (same files, no changes)
- All API client files
- All TypeScript types
- Game logic utilities

### Mobile-specific
- Navigation: `expo-router` (file-based)
- Animations: `react-native-reanimated` (same concepts as Framer Motion)
- Fonts: `expo-google-fonts`
- Markdown: `react-native-markdown-display` + `react-native-syntax-highlighter`
- Haptic feedback: `expo-haptics` (replaces sound on mobile)

### Screen mapping

| Web Route | Mobile Screen |
|-----------|--------------|
| `/` | `app/(tabs)/index.tsx` |
| `/game` | `app/game.tsx` |
| `/game-over` | `app/game-over.tsx` |
| `/leaderboard` | `app/(tabs)/leaderboard.tsx` |
| `/login` | `app/auth/login.tsx` |

---

## 11. Build Order

> Follow this order strictly to avoid blocking on missing dependencies.

### Week 1 — Foundation

#### Day 1
- [ ] `npm create vite@latest web -- --template react-ts`
- [ ] Install all deps: `framer-motion zustand @tanstack/react-query react-router-dom axios react-markdown rehype-highlight`
- [ ] Set up Google Fonts: Press Start 2P + Inter + JetBrains Mono
- [ ] Write `global.css` + `retro.css` + `animations.css`
- [ ] Build `CRTOverlay` component
- [ ] Build the primitive UI kit: `Button`, `Card`, `Badge`, `ProgressBar`, `Modal`

#### Day 2
- [ ] Write `src/api/client.ts` (axios instance, JWT interceptors, auto-refresh)
- [ ] Write all API modules: `auth.api.ts`, `game.api.ts`, `scores.api.ts`, `categories.api.ts`
- [ ] Write `auth.store.ts` + `game.store.ts` with Zustand
- [ ] Write all React Query hooks in `src/hooks/`

#### Day 3
- [ ] Build `Home.tsx` — mode cards, tag chips, difficulty, CTA button
- [ ] Build `Header` component with score + auth state

#### Day 4
- [ ] Build `QuestionCard` component (all rendering + animations)
- [ ] Build `Timer` component
- [ ] Build `StreakDisplay` + `ScoreCounter`
- [ ] Build `JudgeButtons` + `ScoreRangeButtons` + `MultiChoiceGrid` + `AnswerInput`
- [ ] Build `MatchMeter`

#### Day 5
- [ ] Build `Game.tsx` — wire everything together with `game.store`
- [ ] Build `ResultReveal` component
- [ ] Test full game loop end-to-end for all 5 modes

### Week 2 — Polish & Extras

#### Day 6
- [ ] Build `GameOver.tsx`
- [ ] Build `shareCard.ts` (canvas PNG generator)
- [ ] Build `Leaderboard.tsx` + `LeaderboardTable`

#### Day 7
- [ ] Build `Login.tsx` + `Register.tsx`
- [ ] Wire auth flow: register → auto-login → redirect to home
- [ ] Guest play flow (auto-create + play without registration)

#### Day 8
- [ ] Implement `sound.ts` Web Audio API
- [ ] Settings: toggle sound on/off (persisted in `settings.store`)
- [ ] Daily Challenge screen
- [ ] PWA manifest + service worker (offline question cache)

#### Day 9–10 — Mobile (Expo)
- [ ] `npx create-expo-app mobile --template expo-template-blank-typescript`
- [ ] Port all shared stores + API client
- [ ] Build mobile screens with RN components
- [ ] Add haptic feedback on correct/wrong
- [ ] Test on iOS simulator + Android emulator

---

## Environment Variables (Web)

```env
# web/.env
VITE_API_BASE_URL=http://localhost:3000/api
VITE_APP_NAME=StackQuest
```

---

## Key Implementation Notes

> [!IMPORTANT]
> **Always send `question_snapshot` on evaluate**: The backend needs the full question object back in the POST /game/evaluate request. Store the question from `/game/question` response in `game.store.currentQuestion`.

> [!TIP]
> **Prefetch next question**: While showing the ResultReveal (3 seconds), start fetching the next question in the background. This makes the transition feel instant.

> [!NOTE]
> **Timer is client-side only**: The backend records `time_taken_ms` you send — there's no server-side timer validation. The client countdown is purely UX. Start the timer when the question animates in, stop it when the answer is submitted.

> [!WARNING]
> **answer_arena evaluation takes ~500-1500ms** (HuggingFace cold start). Show a loading animation ("The AI is judging your answer...") while waiting for the evaluate response. Don't block the UI.

> [!TIP]
> **Guest → registered account flow**: After a guest game, on the GameOver screen offer "Save your score permanently — register now". Pre-fill the score so they see the value prop immediately.
