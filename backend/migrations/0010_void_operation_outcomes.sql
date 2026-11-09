ALTER TABLE gc2_jobs ADD COLUMN completed_at timestamptz, ADD COLUMN duration_ms integer, ADD COLUMN error_code text;
