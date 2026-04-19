-- Migration 004: SO Question Cache
CREATE TYPE difficulty_level AS ENUM ('easy', 'medium', 'hard');

CREATE TABLE IF NOT EXISTS so_question_cache (
  question_id        INTEGER PRIMARY KEY,
  title              TEXT NOT NULL,
  body               TEXT NOT NULL,
  body_markdown      TEXT NOT NULL,
  tags               TEXT[] NOT NULL DEFAULT '{}',
  score              INTEGER NOT NULL DEFAULT 0,
  answer_count       INTEGER NOT NULL DEFAULT 0,
  accepted_answer_id INTEGER,
  top_answer_text    TEXT,
  top_answer_score   INTEGER,
  view_count         INTEGER NOT NULL DEFAULT 0,
  difficulty         difficulty_level NOT NULL DEFAULT 'medium',
  is_answered        BOOLEAN NOT NULL DEFAULT FALSE,
  creation_date      TIMESTAMPTZ NOT NULL,
  last_fetched       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cache_tags ON so_question_cache USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_cache_difficulty ON so_question_cache(difficulty);
CREATE INDEX IF NOT EXISTS idx_cache_score ON so_question_cache(score DESC);
CREATE INDEX IF NOT EXISTS idx_cache_last_fetched ON so_question_cache(last_fetched);

-- Daily challenge: fixed set of questions per day
CREATE TABLE IF NOT EXISTS daily_challenges (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date         DATE NOT NULL UNIQUE,
  question_ids INTEGER[] NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
