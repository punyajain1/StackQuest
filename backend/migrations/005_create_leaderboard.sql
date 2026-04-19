-- Migration 005: Leaderboard
CREATE TABLE IF NOT EXISTS leaderboard_entries (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  session_id  UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  username    TEXT NOT NULL,
  score       INTEGER NOT NULL,
  mode        game_mode NOT NULL,
  tag         TEXT,
  period_week TEXT NOT NULL,  -- ISO week e.g. "2024-W15"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lb_score ON leaderboard_entries(score DESC);
CREATE INDEX IF NOT EXISTS idx_lb_period ON leaderboard_entries(period_week);
CREATE INDEX IF NOT EXISTS idx_lb_mode ON leaderboard_entries(mode);
CREATE INDEX IF NOT EXISTS idx_lb_tag ON leaderboard_entries(tag);
CREATE INDEX IF NOT EXISTS idx_lb_user ON leaderboard_entries(user_id);

-- View: all-time global top 100
CREATE OR REPLACE VIEW v_global_leaderboard AS
SELECT
  ROW_NUMBER() OVER (ORDER BY score DESC) AS rank,
  username,
  score,
  mode,
  tag,
  created_at::DATE AS date
FROM leaderboard_entries
ORDER BY score DESC
LIMIT 100;
