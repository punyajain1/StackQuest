-- Migration 003: Question Answers (individual moves within a session)
CREATE TABLE IF NOT EXISTS question_answers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id       UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  so_question_id   INTEGER NOT NULL,
  mode             game_mode NOT NULL,
  player_answer    TEXT,                -- raw text for answer_arena
  player_choice    TEXT,                -- selected option for other modes
  correct          BOOLEAN NOT NULL DEFAULT FALSE,
  score_earned     INTEGER NOT NULL DEFAULT 0,
  xp_earned        INTEGER NOT NULL DEFAULT 0,
  similarity_score FLOAT,               -- 0.0-1.0 for answer_arena
  time_taken_ms    INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qa_session_id ON question_answers(session_id);
CREATE INDEX IF NOT EXISTS idx_qa_question_id ON question_answers(so_question_id);
