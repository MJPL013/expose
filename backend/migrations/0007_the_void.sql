CREATE TABLE gc2_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), google_sub text NOT NULL UNIQUE,
 name text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE gc2_logins (
 token_hash text PRIMARY KEY, account_id uuid NOT NULL REFERENCES gc2_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE gc2_oauth (
 state_hash text PRIMARY KEY, nonce text NOT NULL, verifier text NOT NULL, expires_at timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE gc2_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES gc2_accounts(id) ON DELETE CASCADE,
 state jsonb NOT NULL, revision integer NOT NULL DEFAULT 0, owner text, lease_until timestamptz,
 deleted_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gc2_sessions_account ON gc2_sessions(account_id, created_at);
--> statement-breakpoint
CREATE TABLE gc2_assets (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES gc2_sessions(id) ON DELETE CASCADE,
 kind text NOT NULL, key text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE gc2_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL REFERENCES gc2_sessions(id) ON DELETE CASCADE,
 kind text NOT NULL, turn_id text, status text NOT NULL DEFAULT 'queued', claimed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gc2_jobs_pending ON gc2_jobs(status, created_at);
