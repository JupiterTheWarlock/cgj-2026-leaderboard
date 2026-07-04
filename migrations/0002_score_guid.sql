ALTER TABLE scores ADD COLUMN guid TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_guid
ON scores (guid);
