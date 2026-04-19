-- Migration 002: Game Sessions
CREATE TYPE game_mode AS ENUM (
  'judge',
  'score_guesser',
  'answer_arena',
  'multiple_choice',
  'tag_guesser'
);

CREATE TABLE IF NOT EXISTS game_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  mode            game_mode NOT NULL,
  tag             TEXT,          -- NULL means "all tags"
  score           INTEGER NOT NULL DEFAULT 0,
  accuracy        FLOAT NOT NULL DEFAULT 0,
  streak_peak     INTEGER NOT NULL DEFAULT 0,
  questions_count INTEGER NOT NULL DEFAULT 0,
  correct_count   INTEGER NOT NULL DEFAULT 0,
  duration_secs   INTEGER NOT NULL DEFAULT 0,
  is_daily        BOOLEAN NOT NULL DEFAULT FALSE,
  daily_date      DATE,
  xp_earned       INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_mode ON game_sessions(mode);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON game_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_score ON game_sessions(score DESC);
