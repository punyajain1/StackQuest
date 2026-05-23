# StackQuest — App Architecture & API Specification

Welcome to the **StackQuest** Technical Specification. This document is a comprehensive guide to the frontend, backend, real-time networking, and game mechanics of StackQuest. It is designed to serve as a complete reference for developing a new client app or rebuilding the backend.

---

## 1. High-Level Architecture

StackQuest is a real-time multiplayer gamified coding arena where users solve programming puzzles derived from Stack Overflow, level up through leagues, earn achievements, and compete in synchronous 1v1 duels.

```
                  ┌────────────────────────────────────────┐
                  │                 CLIENT                 │
                  │   React Native (Expo + TypeScript)     │
                  └───────┬────────────────────────┬───────┘
                          │                        │
                 HTTPS REST API               WebSockets (WSS)
                 - Auth, Friends, Profile     - Real-time 1v1 Duels
                 - History, Leaderboard       - Real-time Dailies
                          │                        │
                          ▼                        ▼
                  ┌────────────────────────────────────────┐
                  │                BACKEND                 │
                  │      Express 5 + TypeScript + Cron     │
                  └───────────────────┬────────────────────┘
                                      │
                               Prisma ORM
                                      │
                                      ▼
                  ┌────────────────────────────────────────┐
                  │                DATABASE                │
                  │       PostgreSQL (Neon serverless)     │
                  └────────────────────────────────────────┘
```

### Core Technologies
*   **Backend**: Node.js, TypeScript, Express 5, Prisma ORM, Socket.io, Zod (validation), Pino (logging).
*   **Frontend**: React Native, Expo, Expo Router, Tailwind CSS (NativeWind), Zustand (state management), TanStack Query (`@tanstack/react-query`), Lucide Icons.
*   **Database**: PostgreSQL hosted on Neon.

---

## 2. Mobile Screen-by-Screen Breakdown

Each screen is implemented in `mobile/src/app` using Expo Router's directory-based routing.

---

### Screen 1: Onboarding Wizard (`/onboarding/index.jsx`)
*   **Feature Description**: A step-by-step introduction wizard presented to newly registered users or guests. It captures their profile customisation and technology preferences.
*   **User Interface (UI)**:
    *   **Step 1 (Codename Picker)**: A beautiful large input field where users enter their custom display username. Shows a characters count (`X/20`) and real-time validation rules. Displays a live profile card preview showing `1000 ELO` and `New Challenger` status.
    *   **Step 2 (Avatar Picker)**: A $4 \times 2$ grid displaying different portrait style options (e.g. *Adventurer*, *Avataaars*, *Bottts*, *Pixel Art*). Tapping an avatar displays a large, animated, glowing preview centered on the screen.
    *   **Step 3 (Stack Preferences)**: A fluid list of tech tags represented by tiles (e.g. `javascript ⚡`, `python 🐍`, `react ⚛️`). Tapping highlights the tag with its associated brand color and attaches a checkmark badge.
*   **What is happening under the hood?**
    1.  **State Management**: Tracks current step index (`0` to `2`), input `username`, chosen `avatar_style`, and an array of `selectedTags` in local React state.
    2.  **Navigation Transition**: When clicking "Continue", a custom React Native animation slides the current step container off-screen to the left (`-width`) using `Animated.timing()`, resets the position to the right (`width`), and slides the next step into place with an elastic spring animation.
    3.  **Avatar Generation**: Generates the avatar using the free Dicebear Vector API (`https://api.dicebear.com/7.x/{style}/svg?seed={username}`).
    4.  **Submission**: On the final step ("Enter the Arena"), it dispatches a `PATCH` request to `/api/auth/profile` with the chosen username, the Dicebear avatar URL, and a bio string dynamically compiled from the selected tech tags (e.g., `"Expert in: javascript, react"`). Upon success, it updates the local Zustand store and uses `router.replace("/(tabs)")` to transition to the Home dashboard.

---

### Screen 2: Authentication Land & Entry (`/auth/index.jsx`, `/auth/login.jsx`, `/auth/signup.jsx`, `/auth/guest.jsx`)
*   **Feature Description**: The gatekeeper window managing user registration, standard email/password authentication, and single-click anonymous guest accounts.
*   **User Interface (UI)**:
    *   **Landing Page (`index.jsx`)**: Glossy dark UI featuring premium glassmorphism buttons: "Sign In", "Create Account", and "Play as Guest ⚡".
    *   **Login & Signup Sheets (`login.jsx`, `signup.jsx`)**: Minimalist email, username, and password entry fields in matte dark blocks with active neon borders on focus.
*   **What is happening under the hood?**
    1.  **Form Actions**: Submits forms via POST requests to `/api/auth/login` or `/api/auth/register`.
    2.  **Anonymous Guest Flow**: Clicking "Play as Guest" sends a POST request to `/api/auth/guest`. The backend instantiates a temporary database entry with a random placeholder name (e.g., `CuriousCoder912`) and flags `is_guest: true`.
    3.  **Credential Persistence**: The response provides a JWT Access Token (expires in 7 days) and a Refresh Token (expires in 30 days). The client leverages Zustand's `useSQAuth` store to save these tokens using `SecureStore` (which writes directly to iOS Keychain or Android Keystore).
    4.  **Redirection**: Once the token is active, a layout listener intercepts and routes the user into `/onboarding` if the profile is unconfigured, or `/(tabs)` if they are returning users.

---

### Screen 3: Home Dashboard (`/src/app/(tabs)/index.jsx`)
*   **Feature Description**: The central hub displaying player ELO, global rank, league tier, game mode gateways, and a mini-leaderboard spotlighting the top three global players.
*   **User Interface (UI)**:
    *   **Greeting Header**: Displays user avatar next to a personalized welcome card and a gold-themed "STACK QUEST" logo.
    *   **Status Card**: A large premium white container displaying current ELO score in heavy black font (e.g., `1248 ELO`) along with an badge indicating global standing (e.g., `RANK #12`) and current league (e.g., `Gold`).
    *   **Game Modes Row**: Navigation cards for *Sprint Duels* (with a pulsing red "HOT" badge), *Daily Challenge*, and *Single-Player Puzzles*.
    *   **Global Top Players Section**: A clean vertical list showcasing the top 3 global champions with gold/silver/bronze trophies.
*   **What is happening under the hood?**
    1.  **Data Fetching**: Dispatches parallel network requests on mount using TanStack Query:
        *   `GET /api/users/me` -> Fetches ELO, Rank, League, Streaks, XP.
        *   `GET /api/scores/leaderboard?limit=3` -> Fetches top players.
    2.  **Cached Profiling**: The user's active context is read from React Query's `myProfile` key. The avatar is dynamically rendered from the database URL. If none exists, a seed avatar is loaded.
    3.  **Interactive Cards**: Pressing "Sprint Duels" routes to `/(tabs)/duels`. Pressing "Daily Challenge" routes directly to `/game/daily`.

---

### Screen 4: Sprint Duels Lobby (`/src/app/(tabs)/duels.jsx`)
*   **Feature Description**: The matchmaking lobby where players queue up for synchronized real-time 1v1 matches, view their ELO history, or quick-select active leagues.
*   **User Interface (UI)**:
    *   **Arena Header**: Displays active player count (e.g., `348 online`) with a breathing green indicator dot.
    *   **Matchmaking Button**: A massive yellow circular button containing a lightning bolt icon. When clicked, it expands and plays outward-radiating concentric ripples. The button text shifts to show an active search state: `SEARCHING ...` alongside a timer ticking in real-time (`00:04`).
    *   **League Quick Selection**: An elegant horizontally scrollable slider showing custom league cards: *Bronze* (bronze border, 0+ ELO), *Silver* (silver, 1000+ ELO), *Gold* (gold, 1200+ ELO), *Platinum* (neon blue, 1400+ ELO), and *Master* (purple, 1600+ ELO).
    *   **Recent Match History**: A list of recently completed duels with a victory (`CheckCircle` green) or defeat (`XCircle` red) indicator, showing opponent username, ELO delta (e.g., `+16` or `-14`), and date played.
*   **What is happening under the hood?**
    1.  **WebSocket Connection**: Tapping "Find Duel" connects the client to the `/duel` WebSocket namespace via a Socket.io adapter (`api.connectDuelSocket()`). It authorizes using the JWT stored in the Keychain.
    2.  **Queue Request**: The socket fires a `duel:find_match` event passing the user's current league. The server appends the player to the in-memory matchmaking queue.
    3.  **Concentric Ripple Animation**: An interval ticker toggles a `dotIndex` state to animate the search dots, while an `Animated.timing()` sequence drives three distinct scale and opacity animations sequentially to create realistic radar ripples.
    4.  **Match Resolution**: When the server pairs two players, it emits the `duel:match_found` event containing details of the opponent. The lobby halts ripples, triggers a spring-scaled card overlay declaring "MATCH FOUND!", displays the opponent's username and ELO, and after a `1.4s` countdown, replaces the screen with `/game/vs-screen`.

---

### Screen 5: Friends & Social Lobby (`/src/app/(tabs)/messages.jsx`)
*   **Feature Description**: The social management center where users can check incoming friend requests, search for users, monitor friends' online status, and invite active friends to instant duels.
*   **User Interface (UI)**:
    *   **Social Tab Panels**: Displays split views: "Pending Requests" (with green check and red cross action buttons) and "Friends List".
    *   **Add Friend Modal**: A slide-up overlay containing a clean text input to search profiles by exact codename.
    *   **Online/Offline Friend Lists**: Friends online have a pulsing bright green dot attached to their avatar, accompanied by a miniature gold sword button labeled "DUEL".
*   **What is happening under the hood?**
    1.  **Queries**: Queries `GET /api/friends/` and `GET /api/friends/pending` using React Query.
    2.  **Friend Requests**: Clicking check/cross dispatches POST to `/api/friends/:friendshipId/accept` or `/api/friends/:friendshipId/reject`. React Query automatically invalidates the keys, immediately sliding the affected rows out of view.
    3.  **Real-time Status Detection**: Compares `last_active` ISO strings with the local device clock. If the differential is `< 15 minutes`, the user is labeled "Online" and the "DUEL" action is unlocked.
    4.  **Direct Duel Invite**: Clicking "DUEL" sends a POST request to `/api/duel/create` passing the `opponentId` parameter. The backend instantly records a new match row (status: `waiting`) and provides a `match_id`. The client immediately navigates to `/game/duel` with the query parameter `matchStatus: "invited"` to render the invitation wait-screen.

---

### Screen 6: Personal Profile Dashboard (`/src/app/(tabs)/profile.jsx`)
*   **Feature Description**: An immersive view of the player's personal accomplishments, featuring a progress bar detailing the journey to the next league, detailed stats grids, and unlocked achievements.
*   **User Interface (UI)**:
    *   **Card Header**: Renders a large avatar encircled by a glowing ring corresponding to the current league's specific hex color (e.g. platinum glows light blue). Bio edit button sits on the top right.
    *   **League Progress Bar**: A horizontal bar showing total current XP in the league relative to the target threshold (e.g., `450 / 1000 XP`). An adjacent message states exactly how much XP is needed to reach the next tier.
    *   **Four-Card Stats Grid**: Four clean dark modules showing:
        1.  *Total Duels* (with a lightning symbol and active trend percentage).
        2.  *Win Rate* (calculated to nearest integer percentage, e.g. `58%`).
        3.  *Max Streak* (flaming emoji showing highest consecutive correct answers).
        4.  *Total Cumulative XP*.
    *   **Achievements Shelf**: A horizontally scrollable row of badge cards displaying custom emojis (e.g. `🔥`, `🏆`, `👑`), achievement name, and locked/unlocked state. Locked badges are greyed out with 40% opacity.
*   **What is happening under the hood?**
    1.  **Social Actions**: "Edit" launches a local Modal form. Saving the form initiates a PATCH request to `/api/auth/profile`. Upon resolution, the updated data merges directly into the local Zustand store.
    2.  **XP Progress Animation**: Taps into `Animated.timing()` to animate the width of the progress bar from `0%` to the precise computed percentage (`(currentXP / targetXP) * 100`) on screen mount.
    3.  **Sign Out**: The red sign-out action triggers `SecureStore.deleteItemAsync("sq-auth-v1")`, purges active variables in `useSQAuth`, and issues `router.replace("/auth/login")`.

---

### Screen 7: Dynamic User Profile Viewer (`/src/app/user/[id].jsx`)
*   **Feature Description**: A public profile viewer sheet that loads stats, achievements, and duel records for any player in the network.
*   **User Interface (UI)**: Identical in premium aesthetics to Screen 6, but replaces user edit controls with a standard "Back" navigation arrow. Locked achievements and stats are safely read-only.
*   **What is happening under the hood?**
    *   Utilizes the dynamic segment routing of Expo Router (`/user/[id]`). Tapping a player row on the global leaderboard or within a friend list extracts the parameter `id` and launches the route.
    *   On mounting, the screen issues parallel fetch requests:
        *   `GET /api/users/${id}/profile` -> Gathers public profile stats.
        *   `GET /api/users/${id}/achievements` -> Gathers achievement array.
    *   The screen displays all achievements owned by the user, but locks the interactive social customization features.

---

### Screen 8: VS Screen Matchup Preview (`/src/app/game/vs-screen.jsx`)
*   **Feature Description**: An extremely premium, cinematic pre-fight staging screen that displays both competitors side-by-side with heavy game-style animations, preparing them for the synchronized battle.
*   **User Interface (UI)**:
    *   **Grid Background**: A scrolling retro grid layout overlayed with subtle scanlines.
    *   **Competitor Slides**: The screen is split vertically. The left side is dark blue containing the user's codename, avatar, and ELO. The right side is crimson red containing the opponent's stats.
    *   **Collision Effect**: A glowing golden vertical dividing line splits the screen. Large dramatic yellow letters reading "VS" sit at the absolute center.
    *   **Dramatic Flash**: When the sequence concludes, an explosive red "FIGHT! First to Answer Wins" title screen pulses into view.
*   **What is happening under the hood?**
    1.  **Sequential Stage Play**: Orchestrates multiple staggered animations via `Animated.parallel` and `Animated.sequence`:
        *   *0ms*: The top STACK QUEST label falls from `-30` to `0` Y-offset.
        *   *300ms*: Player 1 slides in from the left (`-width` to `0`), and Player 2 slides in from the right (`width` to `0`) with a stiff spring friction of `7`.
        *   *900ms*: They "collide" in the center. An intense screen shake animation is fired (`shakeAnim` shifts X from `14` to `-14`, decaying back to `0`). Simultaneously, a pure white screen overlay (`bgFlash` opacity) flashes to `1` and fades to `0` over `200ms` while a series of crack overlays appear (`cracksOpacity` to `1`).
        *   *1400ms*: The central yellow "VS" scale pops from `0` to `1` with a heavy bounce.
        *   *2700ms*: The red "FIGHT!" text scales up dramatically to the screen's maximum limits.
    2.  **Navigation Transition**: Once the final "FIGHT!" animation finishes, the screen fades to black (`vsOpacity` to `0`), and immediately loads `/game/duel` passing the `matchId` along with current opponent parameters.

---

### Screen 9: Daily Challenge Arena (`/src/app/game/daily.jsx`)
*   **Feature Description**: A real-time, timer-based gameplay arena for the 10-question Daily Challenge. Questions are answered synchronously by the global community.
*   **User Interface (UI)**:
    *   **Top Info HUD**: Shows a prominent close icon `X` on the left, a heavy countdown clock module in the center (turning bright red below 10 seconds), and the active score on the right.
    *   **Progress Timeline**: A thin horizontal timeline bar that visually drains as the timer runs down.
    *   **Question Box**: A central curved black card displaying the problem title and description, accompanied by a badge stating the question format (`MULTIPLE CHOICE` or `TYPE ANSWER`) and round count (`Q 3 of 10`).
    *   **Answer Matrix**:
        *   *MCQs*: A $2 \times 2$ grid of buttons. Correct options turn green; incorrect options turn red upon submission.
        *   *Type Answer*: A clean dark text field with a highlighted green "Submit Answer" button.
*   **What is happening under the hood?**
    1.  **Active Connections**: Connects to the `/daily` socket namespace. On connecting, it issues a `daily:join` request.
    2.  **Dynamic Timer Sync**: Listens to the `daily:timer` event. Every second, the backend broadcasts the remaining time, which updates a local `timeLeft` variable. If time runs out, the client automatically blocks user input and prompts an empty submission.
    3.  **Submit Action**: Tapping an option or pressing submit tracks the time elapsed using high-resolution timestamps (`Date.now() - questionStartTime.current`) and emits a `daily:submit` event with the payload `{ question_number, answer, time_ms }`.
    4.  **Visual Evaluation**: The server evaluates the answer and emits `daily:result`. The client triggers confetti animations on correct answers using a local particle scatter function, or plays a card shake effect on incorrect answers.
    5.  **Completion Screen**: Once the 10th round is completed, the server emits `daily:complete`. The client overlays a victory modal summarizing final accuracy, earned scores, XP, and a button to return home.

---

### Screen 10: Sprint Duel Arena (`/src/app/game/duel.jsx`)
*   **Feature Description**: The live 1v1 battleground. Two players answer pre-generated Stack Overflow questions simultaneously. Every round is timed, and scores update in real-time.
*   **User Interface (UI)**:
    *   **Active Round Info HUD**: Similar to Screen 9, but features a dual player dashboard. Shows two active score bubbles ("YOU" in bright blue vs "RIVAL" in hot red) with ELO values side-by-side.
    *   **Battle Combo Meter**: A multiplier badge (e.g., `3x 🔥`) appears when players maintain an active correct answer streak.
    *   **State Wait Screens**: Renders custom overlays:
        *   *Wait State*: "Answer submitted! Waiting for rival..." with a spinning gold indicator.
        *   *Declined State*: A red alert showing a broken shield indicating the challenge was declined by the invited friend.
*   **What is happening under the hood?**
    1.  **Synchronous State Machine**: Connects to the `/duel` namespace and sends `duel:join` with the `matchId`.
    2.  **Resilient Recovery**: On joining, if the user was disconnected due to a network drop, the server transmits a full `duel:state` snapshot. The screen parses the active round, checks if the player had already submitted an answer, and loads the active question in progress to resume gameplay.
    3.  **Dual Submissions**: Answers are submitted via a `duel:answer` event. The server registers the answer but holds the result until the opponent answers or the round timer expires. During this wait state, a local loading animation is played.
    4.  **Round Progression**: When both submit, the server broadcasts `duel:round_result` detailing both scores, correctness states, and the correct answer. The UI highlights correct/incorrect answers on the card, plays audio-visual feedback, and prepares for the next round.
    5.  **Termination & Transition**: When all rounds complete, the server emits `duel:complete`. The client routes to `/game/result` passing all matchup variables in the URL.

---

### Screen 11: Match Result Screen (`/src/app/game/result.jsx`)
*   **Feature Description**: The final summary screen presented after a game (Puzzle, Daily, or Duel) concludes, displaying ELO changes, final scores, streaks, and navigation pathways.
*   **User Interface (UI)**:
    *   **Dynamic Mascot Display**: A giant shining gold trophy bounces on the screen if victorious. A crimson cracked shield appears if defeated.
    *   **Confetti Rain**: Colorful confetti fall continuously down the screen on a win.
    *   **Score Counter Cards**: Features two vertical cards comparing final scores. The values rapidly count up in real-time.
    *   **ELO Delta Widget**: Displays ELO adjustments in real-time (e.g., `+16` in glowing green or `-14` in crimson) alongside the updated total rating.
*   **What is happening under the hood?**
    1.  **Count-up Effect**: Uses a custom React hook `useCountUp(target)` that triggers a `setInterval` stepping up from `0` to the target score over exactly `1000ms` on mount.
    2.  **Confetti Particle Lifecycle**: Renders an array of 40 separate animated elements. Each particle has independent vertical travel paths (`Animated.translateY` transitioning from `-40` to `height + 60`), random horizontal drift values, and rotation multipliers.
    3.  **Re-queue Trigger**: Tapping "Find Next Opponent" instantly redirects back to `/duels` to search for a new match, while "Back to Home" routes to `/(tabs)`.

---

## 3. Backend REST API Endpoints

All REST routes are located in `backend/src/routes/` and handled by controllers in `backend/src/controllers/`.

---

### 3.1 Authentication — Path Prefix: `/api/auth`

#### Endpoint 1: Register User
*   **Path**: `POST /register`
*   **Authentication Required**: None
*   **Zod Schema Validation**:
    ```typescript
    {
      email: z.string().email(),
      password: z.string().min(8),
      username: z.string().min(3).max(20).optional()
    }
    ```
*   **Processing Flow**:
    1. Hashes user password with bcrypt using salt factor 10.
    2. If `username` is omitted, generates a random codename (e.g. `CodeSeeker402`).
    3. Creates a new `User` row in the database via Prisma.
    4. Signs a JWT access token (7-day expiry) and refresh token (30-day expiry).
*   **Success Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "user": { "id": "uuid", "username": "coder123", "email": "u@ex.com", "is_guest": false },
        "token": "eyJhbGciOi...",
        "refreshToken": "eyJhbGciOi..."
      }
    }
    ```

#### Endpoint 2: Login User
*   **Path**: `POST /login`
*   **Authentication Required**: None
*   **Zod Schema Validation**:
    ```typescript
    {
      email: z.string().email(),
      password: z.string()
    }
    ```
*   **Processing Flow**:
    1. Queries the database for a user matching the provided email.
    2. Compares the submitted password with the stored bcrypt hash.
    3. Signs fresh access and refresh tokens.
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "user": { "id": "uuid", "username": "coder123", "email": "u@ex.com", "is_guest": false },
        "token": "eyJhb...",
        "refreshToken": "eyJhb..."
      }
    }
    ```

#### Endpoint 3: Play as Guest
*   **Path**: `POST /guest`
*   **Authentication Required**: None
*   **Processing Flow**:
    1. Generates a random guest username matching the regex `^GuestCoder[0-9]{4}$`.
    2. Inserts a new user row with `is_guest` set to `true`.
    3. Generates and signs guest JWTs.
*   **Success Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "user": { "id": "uuid", "username": "GuestCoder4812", "email": null, "is_guest": true },
        "token": "eyJhbGciOi...",
        "refreshToken": "eyJhbGciOi..."
      }
    }
    ```

#### Endpoint 4: Refresh Authentication Token
*   **Path**: `POST /refresh`
*   **Authentication Required**: None
*   **Zod Schema Validation**:
    ```typescript
    {
      refreshToken: z.string()
    }
    ```
*   **Processing Flow**:
    1. Decodes and verifies the refresh token using the secret key (`JWT_REFRESH_SECRET`).
    2. Extracts the user ID and signs a fresh access token.
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "token": "newAccessJWT",
        "refreshToken": "newRefreshJWT"
      }
    }
    ```

#### Endpoint 5: Get Current User
*   **Path**: `GET /me`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Processing Flow**:
    1. Passes request through `requireAuth` middleware.
    2. Queries the database for the active user ID and returns their profile details (excluding password hash).
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": { "id": "uuid", "username": "coder123", "email": "u@ex.com", "is_guest": false }
    }
    ```

#### Endpoint 6: Update Profile
*   **Path**: `PATCH /profile`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Zod Schema Validation**:
    ```typescript
    {
      username: z.string().min(3).max(20).optional(),
      avatar_url: z.string().url().optional(),
      bio: z.string().max(160).optional()
    }
    ```
*   **Processing Flow**:
    1. Validates input properties.
    2. Updates the user row in the database.
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": { "id": "uuid", "username": "NewName", "avatar_url": "...", "bio": "..." }
    }
    ```

---

### 3.2 Game System — Path Prefix: `/api/game`

#### Endpoint 7: Start Puzzle Session
*   **Path**: `POST /puzzle/start`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Zod Schema Validation**:
    ```typescript
    {
      tag: z.string().optional(),
      difficulty: z.enum(['easy', 'medium', 'hard']).optional()
    }
    ```
*   **Processing Flow**:
    1. Creates a new game session database record with status `active`.
    2. Initializes an in-memory session object inside `GameService.activeSessions` Map to track player score, streaks, and correct answer counts.
*   **Success Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "session_id": "session-uuid",
        "score": 0,
        "streak": 0,
        "streak_multiplier": 1,
        "questions_answered": 0,
        "correct_count": 0,
        "xp_earned": 0
      }
    }
    ```

#### Endpoint 8: Start Daily Challenge Session
*   **Path**: `POST /daily/start`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Processing Flow**:
    1. Checks if the user has already played today's Daily Challenge by checking for an existing session with mode `daily` completed today.
    2. If already played, returns a `400 Bad Request` ("Daily challenge already completed today").
    3. Otherwise, initializes today's Daily Challenge session in memory and database.
*   **Success Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": { "session_id": "daily-session-uuid" }
    }
    ```

#### Endpoint 9: Get Daily Questions Pool
*   **Path**: `GET /daily/questions`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Processing Flow**:
    1. Pulls today's pre-selected set of 10 Stack Overflow questions from the database.
*   **Success Response (200 OK)**: Returns the raw array of daily questions.

#### Endpoint 10: Get Next Game Question
*   **Path**: `GET /question`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Query Parameters**:
    *   `session_id` (required): UUID
    *   `difficulty` (optional): `easy` | `medium` | `hard`
*   **Processing Flow**:
    1. Verifies the session ID in the in-memory active session map.
    2. Selects a random question matching the specified tag or difficulty from the Stack Overflow question cache (`so_question_cache`).
    3. Transforms the question payload into the formatted game format (MCQ, Fill in the Blank, or String Answer) using the question formatting utility (`questionFormatter.ts`).
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "question_id": 98217,
        "question_type": "mcq",
        "question_text": "How do you copy a list in Python?",
        "options": ["list.copy()", "list.clone()", "copy(list)", "list[:]"],
        "time_limit": 45
      }
    }
    ```

#### Endpoint 11: Submit & Evaluate Answer
*   **Path**: `POST /answer`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Zod Schema Validation**:
    ```typescript
    {
      session_id: z.string().uuid(),
      question_id: z.number(),
      question_type: z.enum(['mcq', 'fill_in_blank', 'string_answer']),
      player_answer: z.string().optional(),
      player_choice: z.string().optional(),
      time_taken_ms: z.number(),
      question_snapshot: z.any()
    }
    ```
*   **Processing Flow**:
    1. Validates the session state in memory.
    2. Runs the evaluation algorithm (`stackquest.algorithm.ts`) comparing `player_answer` or `player_choice` against the correct answer.
    3. Computes the base points, speed bonuses, and active streak multipliers.
    4. Updates the in-memory session state (adds points, increments streak, computes XP).
    5. Appends a new `QuestionAnswer` database entry containing the evaluation results.
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "correct": true,
        "scoreEarned": 45,
        "xpEarned": 10,
        "feedback": "Exactly right! Levenshtein ratio: 1.00",
        "snapshot": {
          "session_id": "uuid",
          "score": 45,
          "streak": 1,
          "streak_multiplier": 1,
          "questions_answered": 1,
          "correct_count": 1,
          "xp_earned": 10
        }
      }
    }
    ```

#### Endpoint 12: End Session
*   **Path**: `POST /end`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Zod Schema Validation**:
    ```typescript
    {
      session_id: z.string().uuid()
    }
    ```
*   **Processing Flow**:
    1. Retrieves the active session stats from memory.
    2. Updates the `game_sessions` database record, writing final score, accuracy, and total duration.
    3. Increments the user's total database ELO and XP scores. Runs XP progression formulas to check if they have advanced to a new league.
    4. Checks achievement rules (e.g. *Streak King*, *XP Collector*) and unlocks badges if thresholds are met.
    5. Purges the session record from server memory.
*   **Success Response (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "session_id": "uuid",
        "final_score": 450,
        "xp_earned": 120,
        "achievements_unlocked": ["Streak King"]
      }
    }
    ```

#### Endpoint 13: Get Specific Session Details
*   **Path**: `GET /session/:id`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Success Response (200 OK)**: Returns the complete database snapshot of the session.

#### Endpoint 14: Get Tech Categories
*   **Path**: `GET /categories`
*   **Success Response (200 OK)**: Returns a list of cached tags along with question counts: `[{ "tag": "javascript", "count": 289 }, ...]`.

---

### 3.3 Duel Matching Management — Path Prefix: `/api/duel`

*(Note: Real-time gameplay for active matches uses WebSockets. These endpoints manage lobby matching state).*

#### Endpoint 15: Create Duel Match
*   **Path**: `POST /create`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Zod Schema Validation**:
    ```typescript
    {
      tag: z.string().optional(),
      opponentId: z.string().uuid().optional()
    }
    ```
*   **Processing Flow**:
    1. Creates a new database row in `duel_matches` with status `waiting`.
    2. If `opponentId` is passed, sends a direct invitation to the specified user.
    3. Pre-generates 5 random Stack Overflow questions for this match, saving them to `duel_questions`.
*   **Success Response (201 Created)**:
    ```json
    {
      "success": true,
      "data": {
        "match_id": "match-uuid",
        "status": "waiting",
        "player1": { "user_id": "...", "username": "..." },
        "player2": null
      }
    }
    ```

#### Endpoint 16: Join Duel Match
*   **Path**: `POST /:id/join`
*   **Headers Required**: `Authorization: Bearer <JWT>`
*   **Processing Flow**:
    1. Queries the match ID to verify status is `waiting`.
    2. Updates status to `active` and assigns the requesting user as `player2`.
*   **Success Response (200 OK)**: Returns the updated `DuelState`.

#### Endpoint 17: Get Duel State
*   **Path**: `GET /:id/state`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Success Response (200 OK)**: Returns complete `DuelState` detailing player profiles, current round, and questions (excluding correct answers).

#### Endpoint 18: Get Duel Result
*   **Path**: `GET /:id/result`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Success Response (200 OK)**: Returns ELO changes and final scores (only once status is `completed`).

---

### 3.4 Friend & Social System — Path Prefix: `/api/friends`

#### Endpoint 19: Get Friends List
*   **Path**: `GET /`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Success Response (200 OK)**: Returns a list of user profiles representing accepted friends.

#### Endpoint 20: Get Pending Friend Requests
*   **Path**: `GET /pending`
*   **Success Response (200 OK)**: Returns a list of profiles that have sent incoming friend requests.

#### Endpoint 21: Send Friend Request
*   **Path**: `POST /request`
*   **Zod Schema Validation**: `{ username: z.string() }`
*   **Processing Flow**:
    1. Resolves username to target user ID.
    2. Creates a relationship record in the database with status `pending`.
*   **Success Response (210 Created)**: Success message.

#### Endpoint 22: Accept Request
*   **Path**: `POST /:id/accept` (where `:id` is the friendship record ID)
*   **Success Response (200 OK)**: Changes the friendship relationship status to `accepted`.

#### Endpoint 23: Reject Request
*   **Path**: `POST /:id/reject`
*   **Success Response (200 OK)**: Deletes the relationship row from the database.

#### Endpoint 24: Remove Friend
*   **Path**: `DELETE /:id`
*   **Success Response (200 OK)**: Deletes the friendship relationship row.

---

### 3.5 User Stats & Leaderboard — Path Prefixes: `/api/users`, `/api/scores`

#### Endpoint 25: Search Users
*   **Path**: `GET /api/users/search?q=query`
*   **Headers**: `Authorization: Bearer <JWT>`
*   **Processing Flow**: Queries the database to search user profiles by matching username.
*   **Success Response (200 OK)**: Returns an array of matching user profiles.

#### Endpoint 26: Get Public User Profile
*   **Path**: `GET /api/users/:id/profile`
*   **Success Response (200 OK)**: Returns public profile statistics (ELO, win rate, recent matches).

#### Endpoint 27: Get Leaderboard
*   **Path**: `GET /api/scores/leaderboard`
*   **Query Parameters**:
    *   `period`: `all_time` | `weekly`
    *   `mode`: `duel` | `daily_challenge` | `puzzle`
    *   `tag`: Filter by programming language tag
*   **Processing Flow**: Runs queries against `game_sessions` and `users` to generate a ranked leaderboard of active players.
*   **Success Response (200 OK)**: Returns an array of players sorted by score/ELO: `[{ "username": "topcoder", "score": 9812 }, ...]`.

#### Endpoint 28: Save Guest Score
*   **Path**: `POST /api/scores/guest`
*   **Zod Schema Validation**:
    ```typescript
    {
      username: z.string(),
      score: z.number(),
      mode: z.string(),
      session_id: z.string().uuid()
    }
    ```
*   **Processing Flow**: Creates a public score row linked to a guest's temporary session.
*   **Success Response (200 OK)**: Success message.

---

## 4. Real-time WebSockets Layer

StackQuest uses real-time WebSockets for high-performance, synchronous matchmaking and real-time multiplayer duels.

---

### 4.1 Matchmaking & 1v1 Battle System Namespace: `/duel`

```
  Client 1 (Queue Request)                  Server                     Client 2 (Match Join)
          │                                   │                                  │
          │── socket.emit("duel:find_match") ─►                                  │
          │                                   │◄─ socket.emit("duel:find_match")─│
          │                                   │                                  │
          │◄─── Emit "duel:match_found" ──────┼─────── Emit "duel:match_found" ─►│
          │                                   │                                  │
          │─ socket.emit("duel:join", {id}) ─►│◄─ socket.emit("duel:join", {id})─│
          │                                   │                                  │
          │◄─── Emit "duel:question" ─────────┼─────── Emit "duel:question" ────►│
          │                                   │                                  │
```

#### Client -> Server Socket Events
1.  **`duel:find_match`**
    *   *Payload*: `{ league: "gold" }`
    *   *Role*: Adds the socket to today's search pool.
2.  **`duel:cancel_find`**
    *   *Payload*: None
    *   *Role*: Cancels active matchmaking search.
3.  **`duel:join`**
    *   *Payload*: `{ match_id: "match-uuid" }`
    *   *Role*: Connects the client to the websocket room `duel:{match_id}`.
4.  **`duel:answer`**
    *   *Payload*: `{ round_number: 1, answer: "javascript", time_ms: 2500 }`
    *   *Role*: Submits a round answer to the active match.

#### Server -> Client Socket Events
1.  **`duel:match_found`**
    *   *Payload*: `{ match_id: "uuid", opponent: { username: "X", elo: 1200, league: "gold" } }`
    *   *Role*: Fired when matchmaking succeeds.
2.  **`duel:state`**
    *   *Payload*: Full `DuelState` object.
    *   *Role*: Emitted when a client joins a room, or to recover session state after a disconnect.
3.  **`duel:opponent_ready`**
    *   *Payload*: `{ username: "X", avatar_url: "..." }`
    *   *Role*: Fired when the opponent successfully connects to the room.
4.  **`duel:question`**
    *   *Payload*:
        ```json
        {
          "round_number": 1,
          "question_type": "mcq",
          "question_text": "What is the output of typeof null?",
          "options": ["object", "null", "undefined", "number"],
          "time_limit": 45
        }
        ```
    *   *Role*: Broadcast to both players to start a round.
5.  **`duel:timer`**
    *   *Payload*: `{ round_number: 1, seconds_remaining: 44 }`
    *   *Role*: Broadcast every second during a round.
6.  **`duel:answer_ack`**
    *   *Payload*: `{ round_number: 1, correct: true, feedback: "Correct!" }`
    *   *Role*: Confirmation emitted only to the submitting player.
7.  **`duel:round_result`**
    *   *Payload*:
        ```json
        {
          "correct_answer": "object",
          "player1_correct": true,
          "player2_correct": false,
          "player1_score": 45,
          "player2_score": 0
        }
        ```
    *   *Role*: Emitted when both players submit or when the timer expires.
8.  **`duel:complete`**
    *   *Payload*:
        ```json
        {
          "winner_id": "user-uuid-1",
          "player1": { "elo_change": 16, "new_elo": 1264 },
          "player2": { "elo_change": -16, "new_elo": 1184 }
        }
        ```
    *   *Role*: Broadcast once all 5 rounds complete.

---

### 4.2 Streamlined Daily Challenge Namespace: `/daily`

#### Client -> Server Socket Events
1.  **`daily:join`**: Joins the live daily challenge room.
2.  **`daily:submit`**: `{ question_number: 1, answer: "str", time_ms: 3200 }`

#### Server -> Client Socket Events
1.  **`daily:question`**: Sends the current active question block.
2.  **`daily:timer`**: `{ question_number: 1, seconds_remaining: X }`
3.  **`daily:result`**: Evaluates correctness, points earned, and active score updates.
4.  **`daily:complete`**: Sends total score and rank calculations.

---

## 5. Core Game Algorithms

All score calculations and answer evaluation logic are implemented in the pure utility module `backend/src/utils/stackquest.algorithm.ts`.

---

### 5.1 Answer Evaluation Engine

When an answer is submitted, the engine applies different verification strategies based on the question type:

| Question Type | Strategy | Detail |
|---|---|---|
| **Multiple Choice (`mcq`)** | Case-Insensitive Match | The user's selection must exactly match the correct option. |
| **Fill in the Blank (`fill_in_blank`)** | Levenshtein Distance & Fuzzy Match | 1. **Exact match** = `1.0` ratio.<br>2. **Substring match** = `0.80` ratio.<br>3. **Levenshtein Fuzzy Ratio**: Calculates string distance. If similarity is $\ge 0.70$, the answer is evaluated as correct. |
| **Type Answer (`string_answer`)**| Keyword Overlap (NLP Heuristic) | Compares user submission against the accepted Stack Overflow answer.<br>1. Splits both strings into sanitized word tokens (removing punctuation and casing).<br>2. Computes the overlap ratio: $\frac{|\text{Intersection Words}|}{|\text{Expected Target Words}|}$.<br>3. Overlap ratio $\ge 0.50$ = **Correct**.<br>4. Any answer containing $< 10$ characters is auto-failed. |

*Levenshtein Distance Formula:*
$$\text{Similarity}(S_1, S_2) = 1 - \frac{\text{Distance}(S_1, S_2)}{\max(|S_1|, |S_2|)}$$

---

### 5.2 Dynamic Scoring Formula

Score points earned per question are calculated using the following formula:

$$\text{Points Earned} = (\text{Base Points} + \text{Speed Bonus}) \times \text{Streak Multiplier}$$

1.  **Base Points**:
    *   `mcq` = $20$ points
    *   `fill_in_blank` = $25$ points
    *   `string_answer` = Awarded dynamically based on computed keyword overlap ratio:
        *   Overlap $\ge 85\%$ = **$60$ points**
        *   Overlap $\ge 70\%$ = **$40$ points**
        *   Overlap $\ge 50\%$ = **$25$ points**
        *   Overlap $\ge 30\%$ = **$10$ points**
2.  **Speed Bonus**:
    *   Adds up to $10$ bonus points for fast responses. Speed bonus decays linearly over the $30\text{s}$ countdown window:
        $$\text{Speed Bonus} = \text{round}\left(10 \times \max\left(0, 1 - \frac{\text{Time taken (ms)}}{30,000\text{ms}}\right)\right)$$
3.  **Streak Multiplier**:
    *   Rewarding consecutive correct answers:
        *   Streak $\ge 13$ correct answers = **$5\times$ Multiplier**
        *   Streak $\ge 10$ correct answers = **$3\times$ Multiplier**
        *   Streak $\ge 5$ correct answers = **$2\times$ Multiplier**
        *   Streak $< 5$ correct answers = **$1\times$ Multiplier**

---

### 5.3 XP & League Progression

*   **XP Earned**:
    *   Correct MCQ / Fill-in-the-Blank = **$+10$ XP**.
    *   Correct String Answer = **$\text{round}(\text{Overlap Ratio} \times 20)$ XP**.
    *   Incorrect Answers = **$0$ XP**.
    *   Starting a session gives a **$+5$ XP** participation bonus.
*   **Player Level Formula**:
    $$\text{Level} = \left\lfloor\sqrt{\frac{\text{Total Cumulative XP}}{100}}\right\rfloor + 1$$
*   **League Tiers**:
    Leagues are determined by total cumulative XP thresholds:
    *   **Bronze**: $0$ XP
    *   **Silver**: $500$ XP
    *   **Gold**: $1,500$ XP
    *   **Platinum**: $3,000$ XP
    *   **Diamond**: $5,000$ XP
    *   **Master**: $8,000$ XP
    *   **Legend**: $12,000$ XP

---

### 5.4 ELO Matchmaking Rating (1v1 Duels)

After a 1v1 duel finishes, both players' ELO ratings are updated using the standard chess ELO matchmaking rating system (K-factor = 32):

$$\text{Expected Score (Player 1)} = \frac{1}{1 + 10^{\frac{\text{ELO}_{\text{Player 2}} - \text{ELO}_{\text{Player 1}}}{400}}}$$

$$\text{New ELO (Player 1)} = \text{ELO}_{\text{Player 1}} + K \times (\text{Actual Score} - \text{Expected Score})$$

*   **Actual Score**:
    *   Player 1 Wins: `Actual Score = 1`
    *   Player 1 Loses: `Actual Score = 0`
    *   Match is a Draw: `Actual Score = 0.5`
*   This formula is zero-sum: Player 1's ELO gain is exactly equal to Player 2's ELO loss.
