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
