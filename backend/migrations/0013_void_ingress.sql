CREATE TABLE gc2_ingress_limits (key text PRIMARY KEY, count integer NOT NULL, reset_at timestamptz NOT NULL);
ALTER TABLE gc2_jobs ADD COLUMN parent_id uuid REFERENCES gc2_jobs(id) ON DELETE SET NULL;
