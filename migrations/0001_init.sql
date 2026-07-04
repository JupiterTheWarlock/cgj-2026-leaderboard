CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  player_name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  duration_ms INTEGER NOT NULL CHECK (duration_ms >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scores_default
ON scores (score DESC, duration_ms ASC, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_scores_created_at
ON scores (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_scores_player_name
ON scores (player_name COLLATE NOCASE);
